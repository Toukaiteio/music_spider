import os
import shutil
import json

from utils.data_type import ResultBase
from core.ws_messaging import send_response
from config import DOWNLOADS_DIR


async def handle_delete_track(websocket, cmd_id: str, payload: dict):
    print(f"Handling delete_track command with cmd_id: {cmd_id}, payload: {payload}")
    music_id = payload.get("music_id")

    if not music_id or not isinstance(music_id, str): # Basic validation
        await send_response(websocket, cmd_id, code=1, error="Missing or invalid music_id.")
        return

    track_dir_path = os.path.join(DOWNLOADS_DIR, music_id)

    if not os.path.exists(track_dir_path) or not os.path.isdir(track_dir_path):
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
