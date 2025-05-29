import asyncio
import functools
import json
import websockets
import uuid # For generating cmd_id if needed, or client sends it
import time # For throttling progress updates
import os # For file system operations
import shutil # For file system operations like rmtree and move
import base64 # For decoding chunk data

# Relative imports for project modules
from utils.data_type import ResultBase, MusicItemData, MusicItem
from downloaders import soundcloud_downloader, bilibili_downloader # Added bilibili_downloader

DOWNLOADER_MODULES = {
    "soundcloud": soundcloud_downloader,
    "bilibili": bilibili_downloader, # Added Bilibili module
    # "other_source": other_downloader, # Example for future downloaders
}

TEMP_UPLOAD_DIR = "./temp_uploads"
# Ensure TEMP_UPLOAD_DIR exists (can also be done on first use in initiate_upload)
# For simplicity here, we'll ensure it in initiate_chunked_upload.
# A more robust approach might be to check/create it at server startup.

CONNECTED_CLIENTS = set()

# --- Chunked Upload Helper Functions ---
def _get_session_manifest_path(session_id: str) -> str:
    return os.path.join(TEMP_UPLOAD_DIR, session_id, "manifest.json")

def _read_session_manifest(session_id: str) -> dict | None:
    manifest_path = _get_session_manifest_path(session_id)
    try:
        with open(manifest_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Manifest file not found for session {session_id}")
        return None
    except json.JSONDecodeError:
        print(f"Error decoding manifest for session {session_id}")
        return None
    except Exception as e:
        print(f"Error reading manifest for session {session_id}: {e}")
        return None

def _write_session_manifest(session_id: str, manifest_data: dict) -> bool:
    manifest_path = _get_session_manifest_path(session_id)
    session_dir = os.path.dirname(manifest_path)
    try:
        os.makedirs(session_dir, exist_ok=True) # Ensure session directory exists
        with open(manifest_path, 'w') as f:
            json.dump(manifest_data, f, indent=4)
        return True
    except Exception as e:
        print(f"Error writing manifest for session {session_id}: {e}")
        return False
# --- End Chunked Upload Helper Functions ---

async def handle_initiate_chunked_upload(websocket, cmd_id: str, payload: dict):
    print(f"Handling initiate_chunked_upload: cmd_id={cmd_id}, payload={payload}")

    filename = payload.get("filename")
    total_size = payload.get("total_size")
    file_type = payload.get("file_type") # "audio" or "cover"
    metadata = payload.get("metadata", {}) # For audio: {title, artist, etc.}, for cover: {music_id_for_cover}
    client_chunk_size = payload.get("chunk_size", 256 * 1024) # Default to 256KB if not specified

    if not all([filename, isinstance(total_size, int), file_type]):
        await send_response(websocket, cmd_id, code=1, error="Missing required fields: filename, total_size, file_type.")
        return
    
    if file_type not in ["audio", "cover"]:
        await send_response(websocket, cmd_id, code=1, error=f"Invalid file_type: {file_type}. Must be 'audio' or 'cover'.")
        return

    upload_session_id = str(uuid.uuid4())
    session_path = os.path.join(TEMP_UPLOAD_DIR, upload_session_id)

    try:
        os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True) # Ensure base temp directory exists
        os.makedirs(session_path, exist_ok=True) # Create specific session directory
    except OSError as e:
        print(f"Error creating session directory {session_path}: {e}")
        await send_response(websocket, cmd_id, code=1, error="Server error: Could not create upload session directory.")
        return

    manifest_data = {
        "upload_session_id": upload_session_id,
        "filename": filename,
        "total_size": total_size,
        "file_type": file_type,
        "metadata": metadata, # Store metadata from client
        "client_chunk_size": client_chunk_size,
        "actual_chunk_size": client_chunk_size, # Server will use this for now
        "total_chunks_expected": 0, # Will be updated by client with first chunk or finalize
        "chunks_received_count": 0,
        "chunks_received_map": {}, # To track individual chunks { "0": true, "1": false, ... }
        "status": "initiated",
        "created_at": time.time()
    }

    if not _write_session_manifest(upload_session_id, manifest_data):
        await send_response(websocket, cmd_id, code=1, error="Server error: Could not write session manifest.")
        return

    print(f"Initiated chunked upload session: {upload_session_id} for {filename}")
    await send_response(websocket, cmd_id, code=0, data={
        "upload_session_id": upload_session_id,
        "actual_chunk_size": client_chunk_size # Server acknowledges and will use this chunk size
    })

async def handle_initiate_chunked_upload(websocket, cmd_id: str, payload: dict):
    print(f"Handling initiate_chunked_upload: cmd_id={cmd_id}, payload={payload}")

    filename = payload.get("filename")
    total_size = payload.get("total_size")
    file_type = payload.get("file_type") # "audio" or "cover"
    metadata = payload.get("metadata", {}) # For audio: {title, artist, etc.}, for cover: {music_id_for_cover}
    client_chunk_size = payload.get("chunk_size", 256 * 1024) # Default to 256KB if not specified

    if not all([filename, isinstance(total_size, int), file_type]):
        await send_response(websocket, cmd_id, code=1, error="Missing required fields: filename, total_size, file_type.")
        return
    
    if file_type not in ["audio", "cover"]:
        await send_response(websocket, cmd_id, code=1, error=f"Invalid file_type: {file_type}. Must be 'audio' or 'cover'.")
        return

    upload_session_id = str(uuid.uuid4())
    session_path = os.path.join(TEMP_UPLOAD_DIR, upload_session_id)

    try:
        os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True) # Ensure base temp directory exists
        os.makedirs(session_path, exist_ok=True) # Create specific session directory
    except OSError as e:
        print(f"Error creating session directory {session_path}: {e}")
        await send_response(websocket, cmd_id, code=1, error="Server error: Could not create upload session directory.")
        return

    manifest_data = {
        "upload_session_id": upload_session_id,
        "filename": filename,
        "total_size": total_size,
        "file_type": file_type,
        "metadata": metadata, # Store metadata from client
        "client_chunk_size": client_chunk_size,
        "actual_chunk_size": client_chunk_size, # Server will use this for now
        "total_chunks_expected": 0, # Will be updated by client with first chunk or finalize
        "chunks_received_count": 0,
        "chunks_received_map": {}, # To track individual chunks { "0": true, "1": false, ... }
        "status": "initiated",
        "created_at": time.time()
    }

    if not _write_session_manifest(upload_session_id, manifest_data):
        await send_response(websocket, cmd_id, code=1, error="Server error: Could not write session manifest.")
        return

    print(f"Initiated chunked upload session: {upload_session_id} for {filename}")
    await send_response(websocket, cmd_id, code=0, data={
        "upload_session_id": upload_session_id,
        "actual_chunk_size": client_chunk_size # Server acknowledges and will use this chunk size
    })

async def handle_upload_chunk(websocket, cmd_id: str, payload: dict):
    print(f"Handling upload_chunk: cmd_id={cmd_id}")
    upload_session_id = payload.get("upload_session_id")
    chunk_index = payload.get("chunk_index") # Should be int
    total_chunks = payload.get("total_chunks") # Should be int
    chunk_data_base64 = payload.get("chunk_data") # Base64 encoded string

    if not all([upload_session_id, isinstance(chunk_index, int), isinstance(total_chunks, int), chunk_data_base64]):
        await send_response(websocket, cmd_id, code=1, error="Missing required fields for chunk upload.")
        return

    manifest_data = _read_session_manifest(upload_session_id)
    if not manifest_data:
        await send_response(websocket, cmd_id, code=1, error=f"Upload session not found or manifest unreadable: {upload_session_id}")
        return

    session_path = os.path.join(TEMP_UPLOAD_DIR, upload_session_id)
    chunk_filename = f"chunk_{chunk_index}"
    chunk_filepath = os.path.join(session_path, chunk_filename)

    try:
        # Decode chunk data (frontend sends only the data part)
        binary_data = base64.b64decode(chunk_data_base64)
        
        with open(chunk_filepath, 'wb') as f:
            f.write(binary_data)

        # Update manifest
        if manifest_data.get("total_chunks_expected", 0) == 0:
            manifest_data["total_chunks_expected"] = total_chunks
        
        # Ensure consistency if total_chunks is sent with every chunk
        if manifest_data["total_chunks_expected"] != total_chunks:
            print(f"Warning: total_chunks mismatch for session {upload_session_id}. Manifest: {manifest_data['total_chunks_expected']}, Payload: {total_chunks}")
            # Optionally, handle this as an error or update if appropriate
            # For now, we'll trust the first total_chunks value received or what's in manifest.

        if str(chunk_index) not in manifest_data["chunks_received_map"] or not manifest_data["chunks_received_map"][str(chunk_index)]:
            manifest_data["chunks_received_map"][str(chunk_index)] = True
            manifest_data["chunks_received_count"] = manifest_data.get("chunks_received_count", 0) + 1
        
        manifest_data["status"] = "uploading"
        manifest_data["last_chunk_received_at"] = time.time()

        if not _write_session_manifest(upload_session_id, manifest_data):
            await send_response(websocket, cmd_id, code=1, error="Server error: Could not update session manifest after chunk.")
            # Potentially try to remove the saved chunk if manifest write fails?
            return
            
        print(f"Received chunk {chunk_index + 1}/{manifest_data['total_chunks_expected']} for session {upload_session_id}")
        await send_response(websocket, cmd_id, code=0, data={
            "message": "Chunk received successfully",
            "upload_session_id": upload_session_id,
            "chunk_index": chunk_index,
            "chunks_received_count": manifest_data["chunks_received_count"],
            "total_chunks_expected": manifest_data["total_chunks_expected"]
        })

    except base64.binascii.Error as b64_error:
        print(f"Base64 decoding error for chunk {chunk_index} in session {upload_session_id}: {b64_error}")
        await send_response(websocket, cmd_id, code=1, error="Invalid base64 data for chunk.")
    except IOError as io_error:
        print(f"IO error saving chunk {chunk_index} for session {upload_session_id}: {io_error}")
        await send_response(websocket, cmd_id, code=1, error="Server error: Could not save chunk.")
    except Exception as e:
        print(f"Unexpected error processing chunk {chunk_index} for session {upload_session_id}: {e}")
        await send_response(websocket, cmd_id, code=1, error="Server error: Unexpected error processing chunk.")

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
        try:
            asyncio.run_coroutine_threadsafe(current_websocket.send(json_message), main_loop)
        except Exception as e:
            print(f"Failed to send progress for cmd_id {original_cmd_id}, track {track_id}: {e}")

    try:
        print(f"Starting download for track: {track_data.get('title', track_id_for_progress)} (cmd_id: {cmd_id})")
        
        partial_progress_callback = functools.partial(
            progress_callback_ws,
            main_loop=loop,
            current_websocket=websocket, # Pass the specific websocket instance
            original_cmd_id=cmd_id     # Pass the specific cmd_id
        )
        
        # Call the download_track method from the selected downloader_module
        # music_item_result = await loop.run_in_executor(
        #     None,  # Uses the default ThreadPoolExecutor
        #     downloader_module.download_track, # Use selected module
        #     track_data,
        #     "./downloads",  # base_download_path
        #     partial_progress_callback # Pass the new partial callback
        # )

        music_item_result = await downloader_module.download_track(
            track_data,
            "./downloads",
            partial_progress_callback
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
    print(f"Handling update_track_info command with cmd_id: {cmd_id}, payload: {payload}")
    music_id = payload.get("music_id")

    if not music_id or not isinstance(music_id, str):
        await send_response(websocket, cmd_id, code=1, error="Missing or invalid music_id.")
        return

    try:
        music_item = MusicItem.load_from_json(music_id)
        if not music_item:
            await send_response(websocket, cmd_id, code=1, error=f"Track {music_id} not found.")
            return

        # List of fields that can be directly updated from the payload
        updatable_fields = ["title", "author", "album", "genre", "description", "lyrics"] # "year" removed
        updated_fields_tracker = []

        # Update only the fields that were provided in the payload
        for field in updatable_fields:
            if field in payload: # Check directly in payload
                setattr(music_item, field, payload[field])
                updated_fields_tracker.append(field)

        # Handle cover binary data if provided (directly in payload)
        if "cover_binary" in payload and payload["cover_binary"]:
            try:
                cover_dir = os.path.join(music_item.work_path, "covers")
                os.makedirs(cover_dir, exist_ok=True)

                # List existing files before saving new one for cleanup
                old_cover_files = []
                if os.path.exists(cover_dir):
                    old_cover_files = [f for f in os.listdir(cover_dir) if os.path.isfile(os.path.join(cover_dir, f))]

                # Use provided extension or default to 'jpg'
                cover_ext = payload.get("cover_ext", "jpg").lower().strip(".") # Ensure no dot and lowercase
                cover_filename = f"cover_{int(time.time())}.{cover_ext}"
                new_cover_path_full = os.path.join(cover_dir, cover_filename)
                
                if isinstance(payload["cover_binary"], str):
                    import base64
                    # Frontend sends only the data part, no need to split(",")[-1]
                    cover_data = base64.b64decode(payload["cover_binary"]) 
                    with open(new_cover_path_full, "wb") as f:
                        f.write(cover_data)
                    
                    relative_new_cover_path = os.path.join("covers", cover_filename)
                    music_item.set_cover(relative_new_cover_path)
                    updated_fields_tracker.append("cover_image") # Use a generic name for tracking
                    print(f"Updated cover image for track {music_id} to {relative_new_cover_path}")

                    # Delete old cover files
                    for old_file_name in old_cover_files:
                        if old_file_name != cover_filename: # Don't delete the new cover
                            try:
                                os.remove(os.path.join(cover_dir, old_file_name))
                                print(f"Deleted old cover: {old_file_name} for track {music_id}")
                            except OSError as e_remove:
                                print(f"Error deleting old cover {old_file_name}: {e_remove}")
                else:
                    print(f"cover_binary for track {music_id} is not a string, skipping cover update.")
                
            except Exception as e:
                print(f"Error processing cover image for track {music_id}: {e}")
                # Continue with other updates even if cover fails

        music_item.dump_self() # Save all changes to music.json
        print(f"Track {music_id} updated successfully with provided fields: {updated_fields_tracker}")
        
        await send_response(
            websocket, 
            cmd_id, 
            code=0, 
            data={
                "message": "Track updated successfully.", 
                "track_data": music_item.data.to_dict(), # Send back the full updated track data
                "updated_fields": updated_fields_tracker # List of fields that were actually updated
            }
        )

    except Exception as e:
        print(f"Error updating track {music_id}: {e}")
        import traceback
        traceback.print_exc()
        await send_response(websocket, cmd_id, code=1, error=f"Failed to update track: {str(e)}")

async def handle_upload_track(websocket, cmd_id: str, payload: dict):
    print(f"Handling upload_track command with cmd_id: {cmd_id}")
    track_data = payload.get("track_data", {})
    
    # Validate required fields
    required_fields = ["title", "audio_binary"]
    for field in required_fields:
        if field not in track_data:
            await send_response(websocket, cmd_id, code=1, error=f"Missing required field: {field}")
            return

    try:
        # Generate music_id with the specified format
        now = time.localtime()
        timestamp = time.strftime("%Y_%m_%d_%H_%M_%S", now)
        
        # Get audio file size (estimate from base64 if needed)
        audio_size = 0
        if isinstance(track_data["audio_binary"], str):  # Assuming base64
            audio_size = len(track_data["audio_binary"]) * 3 // 4  # Approximate base64->binary size
            
        music_id = f"upload_{timestamp}_{audio_size}"
        
        # Create working directory
        work_path = os.path.join("./downloads", music_id)
        os.makedirs(work_path, exist_ok=True)
        
        # Process audio file
        audio_filename = "audio.mp3" # Default filename, could be made dynamic if audio_ext is provided
        audio_path_full = os.path.join(work_path, audio_filename)
        if isinstance(track_data.get("audio_binary"), str):  # Base64 encoded
            import base64
            # Frontend sends only the data part, no need to split(",")[-1]
            audio_data = base64.b64decode(track_data["audio_binary"])
            with open(audio_path_full, "wb") as f:
                f.write(audio_data)
        # else: # If raw binary were supported, it would be handled here
            # print("Warning: audio_binary was not a string. Assuming raw bytes.")
            # with open(audio_path_full, "wb") as f:
                # f.write(track_data["audio_binary"])
        
        # Process cover image if provided
        relative_cover_path_for_item = None
        if "cover_binary" in track_data and track_data["cover_binary"]:
            cover_dir = os.path.join(work_path, "covers")
            os.makedirs(cover_dir, exist_ok=True)
            
            cover_ext_from_payload = track_data.get("cover_ext", "").lower().strip(".")
            
            if not cover_ext_from_payload: # If client doesn't provide extension
                print(f"cover_ext not provided by client for uploaded track {music_id}. Defaulting to 'jpg'.")
                cover_ext_from_payload = "jpg" # Default extension

            cover_filename = f"cover.{cover_ext_from_payload}"
            cover_path_full = os.path.join(cover_dir, cover_filename)
            
            if isinstance(track_data["cover_binary"], str):
                import base64
                # Frontend sends only the data part
                cover_data = base64.b64decode(track_data["cover_binary"])
                with open(cover_path_full, "wb") as f:
                    f.write(cover_data)
                relative_cover_path_for_item = os.path.join("covers", cover_filename)
                print(f"Saved cover image for uploaded track {music_id} to {relative_cover_path_for_item}")
            else:
                print(f"cover_binary for uploaded track {music_id} is not a string. Skipping cover save.")
        
        # Create MusicItem
        music_item = MusicItem(
            music_id=music_id,
            title=track_data["title"],
            author=track_data.get("author", ""),
            album=track_data.get("album", ""),
            description=track_data.get("description", ""),
            genre=track_data.get("genre", ""),
            tags=[],  # Can be populated from track_data if needed
            lyrics=track_data.get("lyrics", ""),
            lossless=False,  # Can be determined from audio if needed
            duration=0  # Should be calculated from audio file
        )
        
        # Set file paths (relative to the music_id directory)
        music_item.set_audio(audio_filename) # e.g., "audio.mp3"
        if relative_cover_path_for_item:
            music_item.set_cover(relative_cover_path_for_item) # e.g., "covers/cover.jpg"
        
        # Save metadata
        music_item.dump_self()
        
        # TODO: Calculate actual duration from audio file
        # TODO: Set lossless flag based on audio format
        
        # Return success response
        await send_response(
            websocket,
            cmd_id,
            code=0,
            data={
                "message": "Track uploaded successfully",
                "music_id": music_id,
                "track_data": music_item.data.to_dict()
            }
        )
        
    except Exception as e:
        print(f"Error uploading track: {e}")
        # Clean up if directory was created
        if 'work_path' in locals() and os.path.exists(work_path):
            try:
                shutil.rmtree(work_path)
            except Exception as cleanup_error:
                print(f"Error cleaning up failed upload: {cleanup_error}")
        
        await send_response(websocket, cmd_id, code=1, error=f"Upload failed: {str(e)}")
async def handle_get_available_sources(websocket, cmd_id: str, payload: dict):
    """Returns a list of available music sources."""
    print(f"Handling get_available_sources command with cmd_id: {cmd_id}")
    await send_response(websocket, cmd_id, code=0, data={"sources": list(DOWNLOADER_MODULES.keys())})
async def handle_finalize_chunked_upload(websocket, cmd_id: str, payload: dict):
    upload_session_id = payload.get("upload_session_id")
    client_filename = payload.get("filename") # Original filename from client
    total_chunks_from_client = payload.get("total_chunks") # Total chunks client claims to have sent

    print(f"Handling finalize_chunked_upload: session_id={upload_session_id}, filename={client_filename}, total_chunks={total_chunks_from_client}")

    if not all([upload_session_id, client_filename, isinstance(total_chunks_from_client, int)]):
        await send_response(websocket, cmd_id, code=1, error="Missing required fields for finalize: upload_session_id, filename, total_chunks.")
        return

    manifest_data = _read_session_manifest(upload_session_id)
    if not manifest_data:
        await send_response(websocket, cmd_id, code=1, error=f"Upload session not found or manifest unreadable: {upload_session_id}")
        return

    session_path = os.path.join(TEMP_UPLOAD_DIR, upload_session_id)

    # Verification
    if manifest_data.get("status") == "finalized":
        await send_response(websocket, cmd_id, code=1, error=f"Upload session {upload_session_id} already finalized.")
        return
        
    if manifest_data["total_chunks_expected"] == 0 and total_chunks_from_client > 0 : # If total_chunks_expected was not set by first chunk
        manifest_data["total_chunks_expected"] = total_chunks_from_client
        # No need to write manifest here, will be updated to finalized later or cleaned up on error

    if manifest_data["chunks_received_count"] != manifest_data["total_chunks_expected"] or \
       manifest_data["chunks_received_count"] != total_chunks_from_client or \
       len(manifest_data["chunks_received_map"]) != manifest_data["total_chunks_expected"]:
        print(f"Chunk verification failed for session {upload_session_id}: Expected {manifest_data['total_chunks_expected']}, Received {manifest_data['chunks_received_count']}")
        await send_response(websocket, cmd_id, code=1, error="Chunk verification failed: Mismatch in chunk counts.")
        return

    # Verify all individual chunk files exist
    for i in range(manifest_data["total_chunks_expected"]):
        chunk_file_path = os.path.join(session_path, f"chunk_{i}")
        if not os.path.exists(chunk_file_path) or not manifest_data["chunks_received_map"].get(str(i)):
            print(f"Chunk verification failed for session {upload_session_id}: Missing chunk file or manifest entry for chunk_{i}")
            await send_response(websocket, cmd_id, code=1, error=f"Chunk verification failed: Missing chunk {i}.")
            return
    
    # Reassemble file
    # Use a unique name for the reassembled file in TEMP_UPLOAD_DIR to avoid conflicts before moving
    temp_reassembled_filename = f"reassembled_{upload_session_id}_{manifest_data['filename']}"
    reassembled_filepath = os.path.join(TEMP_UPLOAD_DIR, temp_reassembled_filename)

    print(f"Reassembling file for session {upload_session_id} to {reassembled_filepath}")
    try:
        with open(reassembled_filepath, 'wb') as outfile:
            for i in range(manifest_data["total_chunks_expected"]):
                chunk_file_path = os.path.join(session_path, f"chunk_{i}")
                with open(chunk_file_path, 'rb') as infile:
                    outfile.write(infile.read())
        print(f"File reassembled successfully for session {upload_session_id}")
    except IOError as e:
        print(f"IOError during file reassembly for session {upload_session_id}: {e}")
        await send_response(websocket, cmd_id, code=1, error="Server error: Could not reassemble file.")
        if os.path.exists(reassembled_filepath): # Clean up partially reassembled file
            os.remove(reassembled_filepath)
        return

    # Process file based on file_type
    file_type = manifest_data["file_type"]
    metadata_from_init = manifest_data.get("metadata", {})

    try:
        if file_type == "audio":
            # Generate music_id (ensure it's unique enough, consider original_filename from metadata_from_init)
            original_filename = metadata_from_init.get("original_filename", manifest_data["filename"])
            timestamp = time.strftime("%Y%m%d_%H%M%S", time.localtime(manifest_data.get("created_at", time.time())))
            # Using a part of session_id for more uniqueness than just timestamp and size
            unique_suffix = upload_session_id.split('-')[0] 
            music_id_str = f"upload_{timestamp}_{unique_suffix}_{manifest_data['total_size']}"
            
            music_item_work_path = os.path.join("./downloads", music_id_str)
            os.makedirs(music_item_work_path, exist_ok=True)

            # Determine audio filename (e.g., audio.mp3, audio.wav)
            # For now, using "audio" + original extension, or "audio.mp3" as default
            audio_file_ext = os.path.splitext(original_filename)[1] if os.path.splitext(original_filename)[1] else ".mp3"
            final_audio_filename = f"audio{audio_file_ext}"
            final_audio_path = os.path.join(music_item_work_path, final_audio_filename)
            
            shutil.move(reassembled_filepath, final_audio_path)
            print(f"Moved reassembled audio to: {final_audio_path}")

            music_item = MusicItem(
                music_id=music_id_str,
                title=metadata_from_init.get("title", "Untitled Track"),
                author=metadata_from_init.get("author", "Unknown Artist"),
                album=metadata_from_init.get("album_name", ""), # from frontend upload form
                description=metadata_from_init.get("description", ""),
                genre=metadata_from_init.get("genre", ""),
                lyrics=metadata_from_init.get("lyrics", ""),
                # TODO: Add duration, lossless after implementing analysis
            )
            music_item.set_audio(final_audio_path) # Relative to work_path

            # Handle potential small cover sent during audio finalization
            if "cover_binary_on_finalize" in metadata_from_init and "cover_ext_on_finalize" in metadata_from_init:
                cover_binary_b64 = metadata_from_init["cover_binary_on_finalize"]
                cover_ext = metadata_from_init["cover_ext_on_finalize"].strip(".")
                if cover_binary_b64 and cover_ext:
                    covers_dir = os.path.join(music_item_work_path, "covers")
                    os.makedirs(covers_dir, exist_ok=True)
                    temp_cover_filename = f"cover.{cover_ext}"
                    temp_cover_path = os.path.join(covers_dir, temp_cover_filename)
                    try:
                        cover_data = base64.b64decode(cover_binary_b64)
                        with open(temp_cover_path, "wb") as f_cover:
                            f_cover.write(cover_data)
                        music_item.set_cover(os.path.join("covers", temp_cover_filename))
                        print(f"Initial small cover saved for {music_id_str} to {temp_cover_path}")
                    except Exception as e_cover:
                        print(f"Error saving initial small cover for {music_id_str}: {e_cover}")


            music_item.dump_self()
            await send_response(websocket, cmd_id, code=0, data={
                "message": "Audio file uploaded and processed successfully.",
                "track_data": music_item.data.to_dict()
            })

        elif file_type == "cover":
            # music_id for the cover should be in payload.get("music_id") as per frontend
            # or fallback to metadata stored during init (if any)
            music_id_for_cover = payload.get("music_id", manifest_data.get("metadata", {}).get("music_id_for_cover"))

            if not music_id_for_cover:
                await send_response(websocket, cmd_id, code=1, error="Music ID for cover association not provided.")
                if os.path.exists(reassembled_filepath): os.remove(reassembled_filepath) # Clean up reassembled file
                return

            music_item = MusicItem.load_from_json(music_id_for_cover)
            if not music_item:
                await send_response(websocket, cmd_id, code=1, error=f"Associated track (music_id: {music_id_for_cover}) not found for cover.")
                if os.path.exists(reassembled_filepath): os.remove(reassembled_filepath)
                return

            cover_file_ext = os.path.splitext(manifest_data["filename"])[1].lstrip('.')
            if not cover_file_ext: cover_file_ext = "jpg" # Default if no extension

            covers_path = os.path.join(music_item.work_path, "covers")
            os.makedirs(covers_path, exist_ok=True)

            # Delete old covers
            for old_cover in os.listdir(covers_path):
                if os.path.isfile(os.path.join(covers_path, old_cover)):
                    try:
                        os.remove(os.path.join(covers_path, old_cover))
                        print(f"Deleted old cover {old_cover} for music_id {music_id_for_cover}")
                    except OSError as e_remove:
                        print(f"Error deleting old cover {old_cover}: {e_remove}")
            
            new_cover_filename = f"cover_{int(time.time())}.{cover_file_ext}"
            final_cover_path = os.path.join(covers_path, new_cover_filename)
            
            shutil.move(reassembled_filepath, final_cover_path)
            print(f"Moved reassembled cover to: {final_cover_path}")
            
            music_item.set_cover(final_cover_path)
            music_item.dump_self()
            
            await send_response(websocket, cmd_id, code=0, data={
                "message": "Cover image uploaded and associated successfully.",
                "music_id": music_id_for_cover,
                "cover_path": music_item.data.cover_path
            })
        else:
            await send_response(websocket, cmd_id, code=1, error=f"Unknown file_type for finalization: {file_type}")
            if os.path.exists(reassembled_filepath): os.remove(reassembled_filepath) # Clean up
            return

        # Final success actions
        manifest_data["status"] = "finalized"
        manifest_data["finalized_at"] = time.time()
        _write_session_manifest(upload_session_id, manifest_data) # Update manifest to finalized
        
        # Cleanup session directory after successful processing and moving the file
        try:
            shutil.rmtree(session_path)
            print(f"Cleaned up session directory: {session_path}")
        except Exception as e_cleanup:
            print(f"Error cleaning up session directory {session_path}: {e_cleanup}")

    except Exception as e_process:
        print(f"Error processing finalized file for session {upload_session_id}: {e_process}")
        import traceback
        traceback.print_exc()
        await send_response(websocket, cmd_id, code=1, error=f"Server error processing file: {str(e_process)}")
        # Clean up reassembled file if it exists and an error occurred during processing
        if os.path.exists(reassembled_filepath) and 'final_audio_path' not in locals() and 'final_cover_path' not in locals():
             # Only remove if it wasn't successfully moved
            try:
                os.remove(reassembled_filepath)
                print(f"Cleaned up reassembled file due to processing error: {reassembled_filepath}")
            except OSError as e_remove_reassembled:
                print(f"Error cleaning up reassembled file {reassembled_filepath}: {e_remove_reassembled}")


COMMAND_HANDLERS = {
    "search": handle_search,
    "download_track": handle_download_track,
    "get_downloaded_music": handle_get_downloaded_music,
    "search_downloaded_music": handle_search_downloaded_music,
    "delete_track": handle_delete_track,
    "update_track_info": handle_update_track_info,
    "upload_track": handle_upload_track, # This will be replaced or heavily modified by chunked uploads for tracks.
    "get_available_sources":  handle_get_available_sources,
    "initiate_chunked_upload": handle_initiate_chunked_upload,
    "upload_chunk": handle_upload_chunk, # Implemented in previous turn
    "finalize_chunked_upload": handle_finalize_chunked_upload, # To be implemented now
}


async def send_response(websocket, cmd_id: str, code: int, data: dict = None, error: str = None):
    """Helper function to send a consistent response structure."""
    response_payload = {"original_cmd_id": cmd_id}
    if error:
        response_payload["error"] = error
    if data:
        response_payload.update(data) # Merge additional data
    
    response = ResultBase(code=code, data=response_payload)
    try:
        await websocket.send(json.dumps(response.get_json()))
    except Exception as e:  # Catch any send errors
        print(f"Failed to send response for cmd_id {cmd_id}: {e}")


async def handler(websocket, path = None): # path is not used yet, but part of websockets.serve signature
    print(f"Client connected from {websocket.remote_address}")
    CONNECTED_CLIENTS.add(websocket)
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                # print(f"Received message: {data}")

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
