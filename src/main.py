import asyncio
import functools
import json
import websockets
import uuid # For generating cmd_id if needed, or client sends it
import time # For throttling progress updates
import os # For file system operations

# Relative imports for project modules
from utils.data_type import ResultBase, MusicItemData, MusicItem
from downloaders import soundcloud_downloader
# Placeholder for future: from .downloaders import other_downloader

DOWNLOADER_MODULES = {
    "soundcloud": soundcloud_downloader,
    # "other_source": other_downloader, # Example for future downloaders
}

CONNECTED_CLIENTS = set()

async def handle_search(websocket, cmd_id: str, payload: dict):
    print(f"Handling search command with cmd_id: {cmd_id}, payload: {payload}")
    search_query = payload.get("query")
    source = payload.get("source", "soundcloud") # Default to soundcloud

    if not search_query:
        error_response = ResultBase(code=1, data={"original_cmd_id": cmd_id, "error": "Search query is missing."})
        await websocket.send(json.dumps(error_response.get_json()))
        return

    downloader_module = DOWNLOADER_MODULES.get(source)
    if not downloader_module:
        error_response = ResultBase(code=1, data={"original_cmd_id": cmd_id, "error": f"Unsupported source: {source}"})
        await websocket.send(json.dumps(error_response.get_json()))
        return
    
    try:
        # Assuming search_tracks is synchronous for now for all modules
        # If any module has async search_tracks, this needs adjustment or a wrapper
        # For now, soundcloud_downloader.search_tracks only takes query.
        search_results = downloader_module.search_tracks(query=search_query) 
        
        print(f"Search for '{search_query}' from source '{source}' yielded {len(search_results)} results.")
        response_data = {"original_cmd_id": cmd_id, "source": source, "results": search_results}
        success_response = ResultBase(code=0, data=response_data)
        await websocket.send(json.dumps(success_response.get_json()))

    except Exception as e:
        print(f"Error during search for query '{search_query}': {e}")
        # Consider logging the full traceback for debugging
        # import traceback
        # traceback.print_exc()
        error_response = ResultBase(code=1, data={"original_cmd_id": cmd_id, "error": f"Search failed: {str(e)}"})
        await websocket.send(json.dumps(error_response.get_json()))

async def handle_download_track(websocket, cmd_id: str, payload: dict):
    source = payload.get("source", "soundcloud") # Default to soundcloud
    track_data = payload.get("track_data")

    downloader_module = DOWNLOADER_MODULES.get(source)
    if not downloader_module:
        error_response = ResultBase(code=1, data={"original_cmd_id": cmd_id, "error": f"Unsupported source for download: {source}"})
        await websocket.send(json.dumps(error_response.get_json()))
        return

    if not track_data or not isinstance(track_data, dict):
        error_response = ResultBase(code=1, data={"original_cmd_id": cmd_id, "error": "Missing or invalid track_data."})
        await websocket.send(json.dumps(error_response.get_json()))
        return

    # Ensure track_id is available for progress reporting.
    # Source specific track ID extraction might be needed if structure varies.
    # For SoundCloud, 'id' is the primary field.
    track_id_for_progress = str(track_data.get("id", track_data.get("music_id", "unknown_track")))
    if track_id_for_progress == "unknown_track" and not track_data.get("title"):
        error_response = ResultBase(code=1, data={"original_cmd_id": cmd_id, "error": "Track ID or identifiable information missing in track_data."})
        await websocket.send(json.dumps(error_response.get_json()))
        return
    
    # Throttling state for progress updates
    last_progress_send_time = {} # Key: (track_id, file_type), Value: timestamp
    loop = asyncio.get_running_loop()

    def progress_callback_ws(track_id: str, current_size: int, total_size: int, file_type: str, status: str, error_message: str = None, *, main_loop, current_websocket, original_cmd_id):
        # nonlocal last_progress_send_time # Access the outer scope variable - last_progress_send_time is in the outer scope of handle_download_track
        progress_percent = (current_size / total_size) * 100 if total_size > 0 else 0
        
        # Throttle "downloading" updates
        if status == "downloading":
            now = time.time()
            throttle_key = (track_id, file_type) # This key seems fine for throttling.
            last_sent = last_progress_send_time.get(throttle_key, 0)
            # Send update if it's been more than 0.5 sec OR if it's the final chunk for this file_type
            if (now - last_sent < 0.5) and (current_size < total_size if total_size > 0 else True) : # Check if not the final chunk
                return # Skip sending update
            last_progress_send_time[throttle_key] = now

        progress_update_payload = {
            "original_cmd_id": original_cmd_id, # Use the bound original_cmd_id
            "status_type": "download_progress",
            "track_id": track_id,
            "file_type": file_type,
            "status": status,
            "current_size": current_size,
            "total_size": total_size,
            "progress_percent": round(progress_percent, 2),
        }
        if error_message:
            progress_update_payload["error_message"] = error_message
        
        json_message = json.dumps(ResultBase(code=0, data=progress_update_payload).get_json())

        # Schedule the send operation on the main event loop
        if not current_websocket.closed: # Use the bound current_websocket
            asyncio.run_coroutine_threadsafe(current_websocket.send(json_message), main_loop) # Use the bound main_loop
        else:
            print(f"WebSocket connection closed for cmd_id {original_cmd_id}, cannot send progress for track {track_id}.")

    try:
        print(f"Starting download for track: {track_data.get('title', track_id_for_progress)} (cmd_id: {cmd_id})")
        
        partial_progress_callback = functools.partial(
            progress_callback_ws,
            main_loop=loop,
            current_websocket=websocket, # Pass the specific websocket instance
            original_cmd_id=cmd_id     # Pass the specific cmd_id
        )
        
        # Call the download_track method from the selected downloader_module
        music_item_result = await loop.run_in_executor(
            None,  # Uses the default ThreadPoolExecutor
            downloader_module.download_track, # Use selected module
            track_data,
            "./downloads",  # base_download_path
            partial_progress_callback # Pass the new partial callback
        )

        if music_item_result and isinstance(music_item_result, MusicItem):
            print(f"Download complete for cmd_id {cmd_id} (source: {source}), track: {music_item_result.data.title}")
            # The "completed_track" status is sent by the callback from soundcloud_downloader.
            # Send a final confirmation with track details.
            final_response_data = {
                "original_cmd_id": cmd_id, 
                "status": "download_complete", 
                "message": f"Track '{music_item_result.data.title}' downloaded successfully.",
                "track_details": music_item_result.data.to_dict()
            }
            if not websocket.closed:
                 await websocket.send(json.dumps(ResultBase(code=0, data=final_response_data).get_json()))
        else:
            # This branch is hit if download_track explicitly returns None or something not a MusicItem.
            # Most specific errors (file download, etc.) should be reported by progress_callback_ws with status="error".
            print(f"Download process for cmd_id {cmd_id} (track: {track_data.get('title', track_id_for_progress)}) did not return a valid MusicItem or failed.")
            # A specific error message should have been sent by the progress callback.
            # This is a fallback/final status if the websocket is still open.
            if not websocket.closed:
                error_response = ResultBase(code=1, data={"original_cmd_id": cmd_id, "error": "Download failed. Check progress updates for specific errors."})
                await websocket.send(json.dumps(error_response.get_json()))

    except Exception as e:
        print(f"Exception during download process for cmd_id {cmd_id} (track: {track_data.get('title', track_id_for_progress)}): {e}")
        # import traceback # For debugging
        # traceback.print_exc() # For debugging
        if not websocket.closed:
            await websocket.send(json.dumps(ResultBase(code=1, data={"original_cmd_id": cmd_id, "error": f"Server error during download: {str(e)}"}).get_json()))


async def handle_get_downloaded_music(websocket, cmd_id: str, payload: dict):
    print(f"Handling get_downloaded_music command with cmd_id: {cmd_id}")
    DOWNLOADS_DIR = "./downloads"
    downloaded_music_list = []

    try:
        if not os.path.exists(DOWNLOADS_DIR) or not os.path.isdir(DOWNLOADS_DIR):
            print("Downloads directory does not exist.")
            response_data = {"original_cmd_id": cmd_id, "library": []}
            await websocket.send(json.dumps(ResultBase(code=0, data=response_data).get_json()))
            return

        for item_name in os.listdir(DOWNLOADS_DIR):
            item_path = os.path.join(DOWNLOADS_DIR, item_name)
            if os.path.isdir(item_path):
                music_id = item_name # Assuming directory name is the music_id
                try:
                    # MusicItem.load_from_json is a class method
                    music_item_instance = MusicItem.load_from_json(music_id=music_id)
                    if music_item_instance:
                        downloaded_music_list.append(music_item_instance.data.to_dict())
                    else:
                        # This case might occur if music.json exists but is empty or malformed
                        # in a way that load_from_json handles by returning None (e.g. root not a dict)
                        print(f"Could not load MusicItem for music_id: {music_id} (load_from_json returned None).")
                except FileNotFoundError:
                    print(f"music.json not found for music_id: {music_id} (directory: {item_path})")
                except json.JSONDecodeError:
                    print(f"Invalid JSON in music.json for music_id: {music_id} (directory: {item_path})")
                except Exception as e:
                    print(f"Error loading MusicItem for music_id {music_id} from {item_path}: {e}")
                    # import traceback # For debugging
                    # traceback.print_exc() # For debugging
        
        response_data = {"original_cmd_id": cmd_id, "library": downloaded_music_list}
        success_response = ResultBase(code=0, data=response_data)
        await websocket.send(json.dumps(success_response.get_json()))

    except Exception as e:
        print(f"Error retrieving downloaded music library: {e}")
        # import traceback # For debugging
        # traceback.print_exc() # For debugging
        error_response = ResultBase(code=1, data={"original_cmd_id": cmd_id, "error": f"Failed to retrieve library: {str(e)}"})
        await websocket.send(json.dumps(error_response.get_json()))

async def handle_search_downloaded_music(websocket, cmd_id: str, payload: dict):
    print(f"Handling search_downloaded_music command with cmd_id: {cmd_id}, payload: {payload}")
    query = payload.get("query")

    if not query:
        error_response = ResultBase(code=1, data={"original_cmd_id": cmd_id, "error": "Search query is missing."})
        await websocket.send(json.dumps(error_response.get_json()))
        return

    DOWNLOADS_DIR = "./downloads"
    matching_music_list = []
    search_query_lower = query.lower()

    try:
        if not os.path.exists(DOWNLOADS_DIR) or not os.path.isdir(DOWNLOADS_DIR):
            print("Downloads directory does not exist for search.")
            response_data = {"original_cmd_id": cmd_id, "results": []}
            await websocket.send(json.dumps(ResultBase(code=0, data=response_data).get_json()))
            return

        for item_name in os.listdir(DOWNLOADS_DIR):
            item_path = os.path.join(DOWNLOADS_DIR, item_name)
            if os.path.isdir(item_path):
                music_id = item_name
                try:
                    music_item_instance = MusicItem.load_from_json(music_id=music_id)
                    if music_item_instance:
                        music_data = music_item_instance.data
                        matches = False
                        if music_data.title and search_query_lower in music_data.title.lower():
                            matches = True
                        if not matches and music_data.author and search_query_lower in music_data.author.lower():
                            matches = True
                        if not matches and music_data.album and search_query_lower in music_data.album.lower():
                            matches = True
                        if not matches and music_data.genre and search_query_lower in music_data.genre.lower():
                            matches = True
                        if not matches and music_data.tags and isinstance(music_data.tags, list):
                            for tag in music_data.tags:
                                if isinstance(tag, str) and search_query_lower in tag.lower():
                                    matches = True
                                    break
                        
                        if matches:
                            # To avoid duplicates if the same item is already added (though unlikely with current loop structure)
                            # This check is more relevant if multiple criteria could add the same item multiple times.
                            # For now, each item is processed once.
                            already_added = any(item.get("music_id") == music_data.music_id for item in matching_music_list)
                            if not already_added:
                                matching_music_list.append(music_data.to_dict())
                    else:
                        print(f"Could not load MusicItem for music_id: {music_id} during search (load_from_json returned None).")
                except FileNotFoundError:
                    print(f"music.json not found for music_id: {music_id} during search (directory: {item_path})")
                except json.JSONDecodeError:
                    print(f"Invalid JSON in music.json for music_id: {music_id} during search (directory: {item_path})")
                except Exception as e:
                    print(f"Error loading MusicItem for music_id {music_id} from {item_path} during search: {e}")
        
        response_data = {"original_cmd_id": cmd_id, "results": matching_music_list}
        success_response = ResultBase(code=0, data=response_data)
        await websocket.send(json.dumps(success_response.get_json()))

    except Exception as e:
        print(f"Error searching downloaded music library: {e}")
        error_response = ResultBase(code=1, data={"original_cmd_id": cmd_id, "error": f"Failed to search library: {str(e)}"})
        await websocket.send(json.dumps(error_response.get_json()))

COMMAND_HANDLERS = {
    "search": handle_search,
    "download_track": handle_download_track,
    "get_downloaded_music": handle_get_downloaded_music,
    "search_downloaded_music": handle_search_downloaded_music,
}

async def handler(websocket, path): # path is not used yet, but part of websockets.serve signature
    print(f"Client connected from {websocket.remote_address}")
    CONNECTED_CLIENTS.add(websocket)
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                print(f"Received message: {data}")

                cmd_id = data.get("cmd_id")
                command = data.get("command")
                payload = data.get("payload", {}) # Payload might not exist for all commands initially

                if not cmd_id or not command:
                    # If cmd_id is missing, we can't include it in the response data directly as original_cmd_id
                    error_data = {"error": "Missing cmd_id or command"}
                    if cmd_id: # if only command is missing
                        error_data["original_cmd_id"] = cmd_id
                    error_response = ResultBase(code=1, data=error_data).get_json()
                    await websocket.send(json.dumps(error_response))
                    continue

                if command_handler := COMMAND_HANDLERS.get(command):
                    await command_handler(websocket, cmd_id, payload)
                else:
                    error_response = ResultBase(code=1, data={"original_cmd_id": cmd_id, "error": f"Unknown command: {command}"}).get_json()
                    await websocket.send(json.dumps(error_response))

            except json.JSONDecodeError:
                # cmd_id is not available if JSON is invalid
                error_response = ResultBase(code=1, data={"error": "Invalid JSON message"}).get_json()
                await websocket.send(json.dumps(error_response))
            except Exception as e:
                print(f"Error processing message: {e}")
                # Try to include cmd_id if it was parsed before the error
                error_data = {"error": f"Server error: {str(e)}"}
                # This assumes 'data' variable is available and might have 'cmd_id'
                # A bit risky if 'data' itself is the cause or not a dict.
                try: 
                    parsed_cmd_id = data.get("cmd_id")
                    if parsed_cmd_id:
                         error_data["original_cmd_id"] = parsed_cmd_id
                except NameError: # data not defined
                    pass 
                except AttributeError: # data not a dict
                    pass

                error_response = ResultBase(code=1, data=error_data).get_json()
                await websocket.send(json.dumps(error_response))
    finally:
        print(f"Client disconnected from {websocket.remote_address}")
        CONNECTED_CLIENTS.remove(websocket)

async def main():
    HOST = "localhost"
    PORT = 8765
    # The websockets.serve function returns a Server object.
    # To keep the server running, you need to await its wait_closed() method
    # or keep the main coroutine running in some other way.
    server = await websockets.serve(handler, HOST, PORT)
    print(f"WebSocket server started on ws://{HOST}:{PORT}")
    await server.wait_closed() # Keep the server running until it's stopped

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Server shutting down...")
    except Exception as e:
        print(f"Server startup failed: {e}")
