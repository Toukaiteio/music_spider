# import asyncio # No longer directly needed for async download logic here
# import functools # No longer needed for partial
# import json # No longer needed for ResultBase construction here
# import time # No longer needed for throttling progress

# from utils.data_type import ResultBase, MusicItem # MusicItem might not be needed here anymore
from core.ws_messaging import send_response
from core.state import get_download_task_queue # DOWNLOADER_MODULES check is minimal, actual download is elsewhere
# from core.server import download_task_queue # Import the task queue
async def handle_download_track(websocket, cmd_id: str, payload: dict):
    source = payload.get("source", "soundcloud")
    track_data = payload.get("track_data")
    download_task_queue = get_download_task_queue()
    # Minimal check for downloader existence, actual module is used by worker
    # from core.state import DOWNLOADER_MODULES # Re-import for this check if needed, or rely on worker
    # For now, assume worker will handle unknown source error reporting via results queue.

    if not track_data or not isinstance(track_data, dict):
        await send_response(websocket, cmd_id, code=1, error="Missing or invalid track_data.")
        return

    # Client ID should have been attached to the websocket object during connection.
    client_id = getattr(websocket, 'client_id', None)
    if not client_id:
        await send_response(websocket, cmd_id, code=1, error="Client ID not found on websocket connection. Cannot queue download.")
        # This indicates an issue with the connection setup or state management.
        print(f"Error: client_id missing from websocket object for cmd_id: {cmd_id}")
        return

    # Construct the task message for the download worker
    download_task = {
        "source": source,
        "track_data": track_data, # This should be serializable (dict)
        "original_cmd_id": cmd_id,
        "client_id": client_id
    }

    try:
        # Put the task onto the queue.
        # This is a blocking call if the queue is full and has a maxsize.
        # If queue is unbounded (default), it won't block unless system resources exhausted.
        # Consider put_nowait() or timeout if strict non-blocking is needed,
        # but workers should process tasks, making space.
        download_task_queue.put(download_task)

        print(f"Download task queued for cmd_id: {cmd_id}, client_id: {client_id}, track: {track_data.get('title', 'N/A')}")

        # Send an immediate acknowledgment to the client
        await send_response(websocket, cmd_id, code=0, data={
            "status": "download_queued",
            "message": "Download task has been queued successfully.",
            "track_title": track_data.get("title", "N/A") # Optionally include title in ack
        })

    except AttributeError as ae: # If download_task_queue is not imported correctly (e.g. None)
        print(f"Error accessing download_task_queue (AttributeError): {ae}. Ensure it's imported and initialized.")
        await send_response(websocket, cmd_id, code=1, error="Server configuration error: Download queue not available.")
    except Exception as e:
        # This could be due to various issues, e.g., if the queue is closed,
        # or if track_data is not serializable (though it should be a dict).
        print(f"Error queuing download task for cmd_id {cmd_id}: {e}")
        await send_response(websocket, cmd_id, code=1, error=f"Failed to queue download task: {str(e)}")

