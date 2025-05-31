import asyncio
import functools
import json
import time

from utils.data_type import ResultBase, MusicItem
# from core.downloaders import DOWNLOADER_MODULES (hypothetical)
# from core.ws_messaging import send_response (hypothetical)

# Placeholder for DOWNLOADER_MODULES
DOWNLOADER_MODULES = {}

# Placeholder for send_response
async def send_response(websocket, cmd_id: str, code: int, data: dict = None, error: str = None):
    response_payload = {"original_cmd_id": cmd_id}
    if error:
        response_payload["error"] = error
    if data:
        response_payload.update(data)

    response = ResultBase(code=code, data=response_payload)
    try:
        await websocket.send(json.dumps(response.get_json()))
    except Exception as e:
        print(f"Failed to send response for cmd_id {cmd_id}: {e}")


async def handle_download_track(websocket, cmd_id: str, payload: dict):
    source = payload.get("source", "soundcloud")
    track_data = payload.get("track_data")

    # This is a temporary solution. DOWNLOADER_MODULES should be managed centrally.
    if not DOWNLOADER_MODULES:
        try:
            # Attempt to dynamically import if not already populated (example of a fallback)
            from downloaders import soundcloud_downloader, bilibili_downloader
            # This requires downloaders to be in PYTHONPATH and structured as a package.
            # Or, if they are in the same directory for now:
            # import soundcloud_downloader
            # import bilibili_downloader

            # Re-populate DOWNLOADER_MODULES (this is still a temporary fix)
            # In a real app, this would be done at startup or via dependency injection.
            global DOWNLOADER_MODULES_TEMP # Use a temporary global to avoid modifying a potentially shared global directly if not intended
            DOWNLOADER_MODULES_TEMP = {
                 "soundcloud": soundcloud_downloader,
                 "bilibili": bilibili_downloader,
            }
            downloader_module = DOWNLOADER_MODULES_TEMP.get(source)
        except ImportError as ie:
             print(f"Failed to import downloader modules dynamically: {ie}")
             await send_response(websocket, cmd_id, code=1, error=f"Server setup error: Downloader modules not available.")
             return
    else:
        downloader_module = DOWNLOADER_MODULES.get(source)


    if not downloader_module:
        await send_response(websocket, cmd_id, code=1, error=f"Unsupported source for download: {source}")
        return

    if not track_data or not isinstance(track_data, dict):
        await send_response(websocket, cmd_id, code=1, error="Missing or invalid track_data.")
        return

    track_id_for_progress = "unknown_track"
    if source == "soundcloud":
        track_id_for_progress = str(track_data.get("id", "unknown_track"))
    elif source == "bilibili":
        track_id_for_progress = str(track_data.get("bvid", track_data.get("music_id", "unknown_track")))

    if track_id_for_progress == "unknown_track":
        track_id_for_progress = str(track_data.get("music_id", "unknown_track"))

    if track_id_for_progress == "unknown_track" and not track_data.get("title"):
        await send_response(websocket, cmd_id, code=1, error="Track ID or identifiable information missing in track_data.")
        return

    last_progress_send_time = {}
    loop = asyncio.get_running_loop()

    def progress_callback_ws(track_id: str, current_size: int, total_size: int, file_type: str, status: str, error_message: str = None, *, main_loop, current_websocket, original_cmd_id):
        progress_percent = (current_size / total_size) * 100 if total_size > 0 else 0

        if status == "downloading":
            now = time.time()
            throttle_key = (track_id, file_type)
            last_sent = last_progress_send_time.get(throttle_key, 0)
            if (now - last_sent < 0.5) and (current_size < total_size if total_size > 0 else True) :
                return
            last_progress_send_time[throttle_key] = now

        progress_update_payload = {
            "original_cmd_id": original_cmd_id,
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

        try:
            asyncio.run_coroutine_threadsafe(current_websocket.send(json_message), main_loop)
        except Exception as e:
            print(f"Failed to send progress for cmd_id {original_cmd_id}, track {track_id}: {e}")

    try:
        print(f"Starting download for track: {track_data.get('title', track_id_for_progress)} (cmd_id: {cmd_id})")

        partial_progress_callback = functools.partial(
            progress_callback_ws,
            main_loop=loop,
            current_websocket=websocket,
            original_cmd_id=cmd_id
        )

        music_item_result = await downloader_module.download_track(
            track_data,
            "./downloads",
            partial_progress_callback
        )

        if music_item_result and isinstance(music_item_result, MusicItem):
            print(f"Download complete for cmd_id {cmd_id} (source: {source}), track: {music_item_result.data.title}")
            final_response_data = {
                "original_cmd_id": cmd_id,
                "status": "download_complete",
                "message": f"Track '{music_item_result.data.title}' downloaded successfully.",
                "track_details": music_item_result.data.to_dict()
            }
            await send_response(websocket, cmd_id, code=0, data=final_response_data)
        else:
            print(f"Download process for cmd_id {cmd_id} (track: {track_data.get('title', track_id_for_progress)}) did not return a valid MusicItem or failed.")
            await send_response(websocket, cmd_id, code=1, error="Download failed. Check progress updates for specific errors.")

    except Exception as e:
        print(f"Exception during download process for cmd_id {cmd_id} (track: {track_data.get('title', track_id_for_progress)}): {e}")
        await send_response(websocket, cmd_id, code=1, error=f"Server error during download: {str(e)}")

# Define a global for temporary use if needed by the dynamic import example,
# though direct use of DOWNLOADER_MODULES is preferred if it's correctly populated.
DOWNLOADER_MODULES_TEMP = {}
