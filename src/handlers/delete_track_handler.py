import os
import shutil
import json
import requests

from utils.data_type import ResultBase
from core.ws_messaging import send_response
from config import DOWNLOADS_DIR,IS_USING_SPRINGBOOT_BACKEND,SPRINGBOOT_BACKEND_AT

def delete_from_springboot(music_id: str) -> tuple[bool, str]:
    """
    从SpringBoot后端删除音乐记录
    
    Args:
        music_id: 要删除的音乐ID
        
    Returns:
        tuple: (是否成功, 错误信息)
    """
    try:
        response = requests.delete(f"{SPRINGBOOT_BACKEND_AT}/api/music/{music_id}")
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                return True, ""
            return False, data.get("message", "Backend returned error")
        return False, f"Backend returned status code: {response.status_code}"
    except requests.RequestException as e:
        return False, f"Failed to connect to backend: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error while deleting from backend: {str(e)}"


async def handle_delete_track(websocket, cmd_id: str, payload: dict):
    print(f"Handling delete_track command with cmd_id: {cmd_id}, payload: {payload}")
    music_id = payload.get("music_id")

    if not music_id or not isinstance(music_id, str): # Basic validation
        await send_response(websocket, cmd_id, code=1, error="Missing or invalid music_id.")
        return

    track_dir_path = os.path.join(DOWNLOADS_DIR, music_id)

    if not os.path.exists(track_dir_path) or not os.path.isdir(track_dir_path):
        print(f"Track directory {track_dir_path} not found. Assuming already deleted.")
        # 如果启用了SpringBoot后端，尝试删除后端数据
        if IS_USING_SPRINGBOOT_BACKEND:
            success, error = delete_from_springboot(music_id)
            if not success:
                print(f"Warning: Failed to delete from backend: {error}")
        await send_response(websocket, cmd_id, code=0, data={"message": f"Track {music_id} not found, assumed already deleted."})
        return

    try:
        # 删除本地文件
        shutil.rmtree(track_dir_path)
        print(f"Successfully deleted track directory: {track_dir_path}")
        
        # 如果启用了SpringBoot后端，尝试删除后端数据
        if IS_USING_SPRINGBOOT_BACKEND:
            success, error = delete_from_springboot(music_id)
            if not success:
                print(f"Warning: Failed to delete from backend: {error}")
                await send_response(websocket, cmd_id, code=0, data={
                    "message": f"Track {music_id} deleted locally but failed to delete from backend: {error}"
                })
                return
        
        await send_response(websocket, cmd_id, code=0, data={"message": f"Track {music_id} deleted successfully."})
    except OSError as e:
        print(f"Error deleting track directory {track_dir_path}: {e}")
        await send_response(websocket, cmd_id, code=1, error=f"Failed to delete track {music_id}: {str(e)}")