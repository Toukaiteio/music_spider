import os
import json
import requests
from typing import List, Dict, Any

from utils.data_type import ResultBase, MusicItem
from core.ws_messaging import send_response
from config import DOWNLOADS_DIR,IS_USING_SPRINGBOOT_BACKEND,SPRINGBOOT_BACKEND_AT

def get_music_from_springboot() -> tuple[bool, List[Dict[str, Any]], str]:
    """
    从SpringBoot后端获取音乐列表
    
    Returns:
        tuple: (是否成功, 音乐列表, 错误信息)
    """
    try:
        response = requests.get(f"{SPRINGBOOT_BACKEND_AT}/api/music")
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                return True, data.get("data", []), ""
            return False, [], data.get("message", "Backend returned error")
        return False, [], f"Backend returned status code: {response.status_code}"
    except requests.RequestException as e:
        return False, [], f"Failed to connect to backend: {str(e)}"
    except Exception as e:
        return False, [], f"Unexpected error while getting music from backend: {str(e)}"
def get_music_from_local() -> tuple[bool, List[Dict[str, Any]], str]:
    """
    从本地文件系统获取音乐列表
    
    Returns:
        tuple: (是否成功, 音乐列表, 错误信息)
    """
    downloaded_music_list = []
    
    try:
        if not os.path.exists(DOWNLOADS_DIR) or not os.path.isdir(DOWNLOADS_DIR):
            print("Downloads directory does not exist.")
            return True, [], ""

        for item_name in os.listdir(DOWNLOADS_DIR):
            item_path = os.path.join(DOWNLOADS_DIR, item_name)
            if os.path.isdir(item_path):
                music_id = item_name
                try:
                    music_item_instance = MusicItem.load_from_json(music_id=music_id)
                    if music_item_instance:
                        music_data = music_item_instance.data.to_dict()
                        # Ensure data conforms to the new TrackInfo model before sending to frontend
                        if 'author' in music_data:
                            music_data['artist'] = music_data.pop('author')
                        if 'preview_cover' in music_data:
                            music_data['artwork_url'] = music_data.pop('preview_cover')
                        if 'quality' in music_data:
                            del music_data['quality'] # No longer used in the new model
                        downloaded_music_list.append(music_data)
                    else:
                        print(f"Could not load MusicItem for music_id: {music_id} (load_from_json returned None).")
                except FileNotFoundError:
                    print(f"music.json not found for music_id: {music_id} (directory: {item_path})")
                except json.JSONDecodeError:
                    print(f"Invalid JSON in music.json for music_id: {music_id} (directory: {item_path})")
                except Exception as e:
                    print(f"Error loading MusicItem for music_id {music_id} from {item_path}: {e}")
        
        return True, downloaded_music_list, ""
    except Exception as e:
        error_msg = f"Error retrieving downloaded music library: {e}"
        print(error_msg)
        return False, [], error_msg

async def handle_get_downloaded_music(websocket, cmd_id: str, payload: dict):
    """处理获取已下载音乐列表的请求"""
    print(f"Handling get_downloaded_music command with cmd_id: {cmd_id}")
    
    # 如果启用了SpringBoot后端，先尝试从后端获取
    if IS_USING_SPRINGBOOT_BACKEND:
        success, music_list, error = get_music_from_springboot()
        if success:
            await send_response(websocket, cmd_id, code=0, data={"library": music_list})
            return
        print(f"Failed to get music from SpringBoot backend: {error}, falling back to local method")
    
    # 如果后端未启用或获取失败，使用本地方法
    success, music_list, error = get_music_from_local()
    if success:
        await send_response(websocket, cmd_id, code=0, data={"library": music_list})
    else:
        await send_response(websocket, cmd_id, code=1, error=f"Failed to retrieve library: {error}")