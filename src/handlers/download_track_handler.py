import asyncio
import functools
import json
import time

from utils.data_type import ResultBase, MusicItem
# from core.downloaders import DOWNLOADER_MODULES (hypothetical)
from core.ws_messaging import send_response
from core.state import DOWNLOADER_MODULES
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

