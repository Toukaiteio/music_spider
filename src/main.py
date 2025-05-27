import asyncio
import functools
import json
import websockets
import uuid # For generating cmd_id if needed, or client sends it
import time # For throttling progress updates
import os # For file system operations
import shutil # For file system operations like rmtree and move

# Relative imports for project modules
from utils.data_type import ResultBase, MusicItemData, MusicItem
from downloaders import soundcloud_downloader, bilibili_downloader # Added bilibili_downloader

DOWNLOADER_MODULES = {
    "soundcloud": soundcloud_downloader,
    "bilibili": bilibili_downloader, # Added Bilibili module
    # "other_source": other_downloader, # Example for future downloaders
}

CONNECTED_CLIENTS = set()

async def handle_search(websocket, cmd_id: str, payload: dict):
    print(f"Handling search command with cmd_id: {cmd_id}, payload: {payload}")
    search_query = payload.get("query")
    source = payload.get("source", "soundcloud") # Default to soundcloud

    if not search_query:
        await send_response(websocket, cmd_id, code=1, error="Search query is missing.")
        return

    downloader_module = DOWNLOADER_MODULES.get(source)
    if not downloader_module:
        await send_response(websocket, cmd_id, code=1, error=f"Unsupported source: {source}")
        return
    
    try:
        # Pass limit to search_tracks if the module supports it.
        # Get the 'limit' from payload, default to a reasonable number if not provided by client.
        limit = payload.get("limit", 20) # Default search limit to 20
        
        import inspect
        sig = inspect.signature(downloader_module.search_tracks)
        if 'limit' in sig.parameters:
            search_results = downloader_module.search_tracks(query=search_query, limit=limit)
        else:
            search_results = downloader_module.search_tracks(query=search_query)
        
        print(f"Search for '{search_query}' from source '{source}' (limit: {limit}) yielded {len(search_results)} results.")
        response_data = {"original_cmd_id": cmd_id, "source": source, "results": search_results}
        await send_response(websocket, cmd_id, code=0, data=response_data)

    except Exception as e:
        print(f"Error during search for query '{search_query}': {e}")
        # import traceback; traceback.print_exc() # For debugging
        await send_response(websocket, cmd_id, code=1, error=f"Search failed: {str(e)}")

async def handle_download_track(websocket, cmd_id: str, payload: dict):
    source = payload.get("source", "soundcloud") 
    track_data = payload.get("track_data")

    downloader_module = DOWNLOADER_MODULES.get(source)
    if not downloader_module:
        await send_response(websocket, cmd_id, code=1, error=f"Unsupported source for download: {source}")
        return

    if not track_data or not isinstance(track_data, dict):
        await send_response(websocket, cmd_id, code=1, error="Missing or invalid track_data.")
        return

    # Ensure track_id is available for progress reporting.
    # Source specific track ID extraction is needed.
    track_id_for_progress = "unknown_track"
    if source == "soundcloud":
        track_id_for_progress = str(track_data.get("id", "unknown_track"))
    elif source == "bilibili":
        # Bilibili search results use 'bvid'. MusicItem uses 'music_id' (which is bvid after download).
        track_id_for_progress = str(track_data.get("bvid", track_data.get("music_id", "unknown_track")))
    
    # Fallback if specific ID not found, or if track_data might already be a MusicItem.data dict (e.g. from local library)
    if track_id_for_progress == "unknown_track": # Check if still unknown after source-specific attempts
        track_id_for_progress = str(track_data.get("music_id", "unknown_track"))


    if track_id_for_progress == "unknown_track" and not track_data.get("title"): # Final check
        await send_response(websocket, cmd_id, code=1, error="Track ID or identifiable information missing in track_data.")
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
            await send_response(websocket, cmd_id, code=0, data=final_response_data)
        else:
            # This branch is hit if download_track explicitly returns None or something not a MusicItem.
            # Most specific errors (file download, etc.) should be reported by progress_callback_ws with status="error".
            print(f"Download process for cmd_id {cmd_id} (track: {track_data.get('title', track_id_for_progress)}) did not return a valid MusicItem or failed.")
            # A specific error message should have been sent by the progress callback.
            # This is a fallback/final status if the websocket is still open.
            # Ensure a response is sent if no other error message was.
            if not websocket.closed: # Check if websocket is still open
                 await send_response(websocket, cmd_id, code=1, error="Download failed. Check progress updates for specific errors.")

    except Exception as e:
        print(f"Exception during download process for cmd_id {cmd_id} (track: {track_data.get('title', track_id_for_progress)}): {e}")
        # import traceback; traceback.print_exc() # For debugging
        await send_response(websocket, cmd_id, code=1, error=f"Server error during download: {str(e)}")


async def handle_get_downloaded_music(websocket, cmd_id: str, payload: dict):
    print(f"Handling get_downloaded_music command with cmd_id: {cmd_id}")
    DOWNLOADS_DIR = "./downloads"
    downloaded_music_list = []

    try:
        if not os.path.exists(DOWNLOADS_DIR) or not os.path.isdir(DOWNLOADS_DIR):
            print("Downloads directory does not exist.")
            await send_response(websocket, cmd_id, code=0, data={"library": []}) # Use helper
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
                    # import traceback; traceback.print_exc() # For debugging
        
        await send_response(websocket, cmd_id, code=0, data={"library": downloaded_music_list}) # Use helper

    except Exception as e:
        print(f"Error retrieving downloaded music library: {e}")
        # import traceback; traceback.print_exc() # For debugging
        await send_response(websocket, cmd_id, code=1, error=f"Failed to retrieve library: {str(e)}") # Use helper

async def handle_search_downloaded_music(websocket, cmd_id: str, payload: dict):
    print(f"Handling search_downloaded_music command with cmd_id: {cmd_id}, payload: {payload}")
    query = payload.get("query")

    if not query:
        await send_response(websocket, cmd_id, code=1, error="Search query is missing.") # Use helper
        return

    DOWNLOADS_DIR = "./downloads"
    matching_music_list = []
    search_query_lower = query.lower()

    try:
        if not os.path.exists(DOWNLOADS_DIR) or not os.path.isdir(DOWNLOADS_DIR):
            print("Downloads directory does not exist for search.")
            await send_response(websocket, cmd_id, code=0, data={"results": []}) # Use helper
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
        
        await send_response(websocket, cmd_id, code=0, data={"results": matching_music_list}) # Use helper

    except Exception as e:
        print(f"Error searching downloaded music library: {e}")
        await send_response(websocket, cmd_id, code=1, error=f"Failed to search library: {str(e)}") # Use helper

COMMAND_HANDLERS = {
    "search": handle_search,
    "download_track": handle_download_track,
    "get_downloaded_music": handle_get_downloaded_music,
    "search_downloaded_music": handle_search_downloaded_music,
    "delete_track": handle_delete_track,
    "update_track_info": handle_update_track_info,
    "upload_track": handle_upload_track,
}

async def send_response(websocket, cmd_id: str, code: int, data: dict = None, error: str = None):
    """Helper function to send a consistent response structure."""
    response_payload = {"original_cmd_id": cmd_id}
    if error:
        response_payload["error"] = error
    if data:
        response_payload.update(data) # Merge additional data
    
    response = ResultBase(code=code, data=response_payload)
    if not websocket.closed:
        await websocket.send(json.dumps(response.get_json()))
    else:
        print(f"WebSocket connection closed for cmd_id {cmd_id}, cannot send response.")

async def handle_delete_track(websocket, cmd_id: str, payload: dict):
    print(f"Handling delete_track command with cmd_id: {cmd_id}, payload: {payload}")
    music_id = payload.get("music_id")

    if not music_id or not isinstance(music_id, str): # Basic validation
        await send_response(websocket, cmd_id, code=1, error="Missing or invalid music_id.")
        return

    track_dir_path = os.path.join("./downloads", music_id)

    if not os.path.exists(track_dir_path) or not os.path.isdir(track_dir_path):
        # Consider it a success if the directory is already gone or never existed
        print(f"Track directory {track_dir_path} not found. Assuming already deleted.")
        await send_response(websocket, cmd_id, code=0, data={"message": f"Track {music_id} not found, assumed already deleted."})
        return
    
    try:
        shutil.rmtree(track_dir_path)
        print(f"Successfully deleted track directory: {track_dir_path}")
        await send_response(websocket, cmd_id, code=0, data={"message": f"Track {music_id} deleted successfully."})
    except OSError as e:
        print(f"Error deleting track directory {track_dir_path}: {e}")
        await send_response(websocket, cmd_id, code=1, error=f"Failed to delete track {music_id}: {str(e)}")


async def handle_update_track_info(websocket, cmd_id: str, payload: dict):
    print(f"Handling update_track_info command with cmd_id: {cmd_id}")
    music_id = payload.get("music_id")
    track_data_update = payload.get("track_data", {})

    if not music_id or not isinstance(music_id, str):
        await send_response(websocket, cmd_id, code=1, error="Missing or invalid music_id.")
        return

    try:
        music_item = MusicItem.load_from_json(music_id)
        if not music_item:
            await send_response(websocket, cmd_id, code=1, error=f"Track {music_id} not found.")
            return

        # Update metadata attributes
        allowed_metadata_fields = ["title", "author", "album", "description", "genre", "tags", "lyrics"]
        for field in allowed_metadata_fields:
            if field in track_data_update:
                setattr(music_item, field, track_data_update[field]) # Uses setters if available in MusicItem

        # Conceptual file handling for cover:
        # 'cover_filename' from payload is the new final relative path.
        new_cover_final_relative_path = track_data_update.get("cover_filename")
        if new_cover_final_relative_path and isinstance(new_cover_final_relative_path, str):
            # For conceptual update, we directly set this path.
            # No actual file move or deletion of old file in this handler.
            music_item.set_cover(new_cover_final_relative_path)
            print(f"Updated cover path for {music_id} to conceptual path: {new_cover_final_relative_path}")

        # Conceptual file handling for audio:
        # 'audio_filename' from payload is the new final relative path.
        new_audio_final_relative_path = track_data_update.get("audio_filename")
        if new_audio_final_relative_path and isinstance(new_audio_final_relative_path, str):
            music_item.set_audio(new_audio_final_relative_path)
            print(f"Updated audio path for {music_id} to conceptual path: {new_audio_final_relative_path}")
            
            # Update lossless status if 'lossless' is explicitly provided in the update.
            if 'lossless' in track_data_update:
                music_item.lossless = bool(track_data_update['lossless'])
        
        music_item.dump_self()
        print(f"Track {music_id} updated successfully.")
        await send_response(websocket, cmd_id, code=0, data={"message": "Track updated successfully.", "track_data": music_item.data.to_dict()})

    except Exception as e:
        print(f"Error updating track {music_id}: {e}")
        # import traceback; traceback.print_exc() # For debugging
        await send_response(websocket, cmd_id, code=1, error=f"Failed to update track: {str(e)}")


async def handle_upload_track(websocket, cmd_id: str, payload: dict):
    print(f"Handling upload_track command with cmd_id: {cmd_id}")
    track_data = payload.get("track_data", {})
    # These are final relative paths, e.g., "downloads/new_id/cover.jpg"
    # The server is assumed to have already placed the files here if they are provided.
    cover_final_relative_path = payload.get("cover_filename") 
    audio_final_relative_path = payload.get("audio_filename")

    required_metadata_fields = ["title", "author"]
    for field in required_fields:
        if field not in track_data:
            await send_response(websocket, cmd_id, code=1, error=f"Missing required field in track_data: {field}.")
            return
    
    # Validate required file paths (conceptually)
    if not cover_temp_path or not isinstance(cover_temp_path, str):
        await send_response(websocket, cmd_id, code=1, error="Missing or invalid cover_filename.")
        return
    if not audio_temp_path or not isinstance(audio_temp_path, str):
        await send_response(websocket, cmd_id, code=1, error="Missing or invalid audio_filename.")
        return

    # For this conceptual handler, we don't check os.path.exists for cover_final_relative_path
    # or audio_final_relative_path because the files are *conceptually* already in their 
    # final place by an external process if these paths are provided.
    # We just trust the provided paths if they are not None/empty.
    # Client/server is responsible for ensuring these files exist at these paths before calling.

    new_music_id = str(uuid.uuid4())
    
    try:
        # MusicItem constructor creates the work_path directory
        music_item = MusicItem(
            music_id=new_music_id,
            title=track_data.get("title"),
            author=track_data.get("author"),
            album=track_data.get("album", ""),
            description=track_data.get("description", ""),
            genre=track_data.get("genre", ""),
            tags=track_data.get("tags", []),
            lyrics=track_data.get("lyrics", ""),
            lossless=bool(track_data.get("lossless", False)),
            # Duration would ideally come from the audio file itself after processing,
            # but for this conceptual upload, we might take it from track_data if provided, or set to 0.
            duration=int(track_data.get("duration", 0)), 
            # cover and audio paths will be set below using the provided final relative paths
        )

        # Set cover and audio paths using the provided final relative paths
        # These paths are relative to the project root, e.g., "downloads/new_music_id/cover.jpg"
        if cover_final_relative_path and isinstance(cover_final_relative_path, str):
            # Conceptual: We assume cover_final_relative_path IS the correct final path.
            music_item.set_cover(cover_final_relative_path)
            print(f"Set cover for {new_music_id} to conceptual path: {cover_final_relative_path}")
        
        if audio_final_relative_path and isinstance(audio_final_relative_path, str):
            music_item.set_audio(audio_final_relative_path)
            print(f"Set audio for {new_music_id} to conceptual path: {audio_final_relative_path}")

        music_item.dump_self() # Creates music.json in ./downloads/{new_music_id}/
        print(f"Track {new_music_id} uploaded and metadata saved successfully.")
        await send_response(websocket, cmd_id, code=0, data={
            "message": "Track uploaded successfully.",
            "music_id": new_music_id,
            "track_data": music_item.data.to_dict()
        })

    except Exception as e:
        print(f"Error uploading track: {e}")
        # import traceback; traceback.print_exc() # For debugging
        # Attempt to clean up created directory if upload fails mid-way
        if 'music_item' in locals() and os.path.exists(music_item.work_path):
            try:
                shutil.rmtree(music_item.work_path)
                print(f"Cleaned up directory {music_item.work_path} after upload failure.")
            except OSError as cleanup_e:
                print(f"Error cleaning up directory {music_item.work_path}: {cleanup_e}")
        
        await send_response(websocket, cmd_id, code=1, error=f"Failed to upload track: {str(e)}")


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
                    # error_data already includes original_cmd_id if cmd_id was present
                    await send_response(websocket, cmd_id, code=1, error="Missing cmd_id or command") # Use helper
                    continue

                if command_handler := COMMAND_HANDLERS.get(command):
                    await command_handler(websocket, cmd_id, payload)
                else:
                    await send_response(websocket, cmd_id, code=1, error=f"Unknown command: {command}") # Use helper
            
            except json.JSONDecodeError:
                # cmd_id is not available if JSON is invalid, so pass None or a placeholder
                # The send_response helper expects a cmd_id, so provide a placeholder.
                await send_response(websocket, cmd_id="unknown_json_error_cmd_id", code=1, error="Invalid JSON message")
            except Exception as e:
                print(f"Error processing message for cmd_id {cmd_id if 'cmd_id' in locals() else 'unknown'}: {e}")
                # import traceback; traceback.print_exc() # For debugging
                # Use cmd_id if available, otherwise use a placeholder.
                current_cmd_id = locals().get("cmd_id", "unknown_error_cmd_id")
                await send_response(websocket, current_cmd_id, code=1, error=f"Server error: {str(e)}")
    finally:
        print(f"Client disconnected from {websocket.remote_address}")
        CONNECTED_CLIENTS.remove(websocket)

async def main():
    HOST = "0.0.0.0"
    PORT = 8765
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
