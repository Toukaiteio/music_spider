import os
import json
import requests
from typing import Dict, List, Any

from config import DOWNLOADS_DIR, IS_USING_SPRINGBOOT_BACKEND, SPRINGBOOT_BACKEND_AT
from utils.data_type import MusicItem

def get_local_music_list() -> Dict[str, Dict[str, Any]]:
    """
    获取本地音乐列表
    
    Returns:
        Dict[str, Dict[str, Any]]: 以music_id为键的音乐数据字典
    """
    music_dict = {}
    
    if not os.path.exists(DOWNLOADS_DIR) or not os.path.isdir(DOWNLOADS_DIR):
        return music_dict
        
    for item_name in os.listdir(DOWNLOADS_DIR):
        item_path = os.path.join(DOWNLOADS_DIR, item_name)
        if os.path.isdir(item_path):
            music_id = item_name
            try:
                music_item_instance = MusicItem.load_from_json(music_id=music_id)
                if music_item_instance:
                    music_dict[music_id] = music_item_instance.data.to_dict()
            except Exception as e:
                print(f"Error loading music item {music_id}: {e}")
                
    return music_dict

def get_backend_music_list() -> tuple[bool, Dict[str, Dict[str, Any]], str]:
    """
    从后端获取音乐列表
    
    Returns:
        tuple: (是否成功, 以music_id为键的音乐数据字典, 错误信息)
    """
    try:
        response = requests.get(f"{SPRINGBOOT_BACKEND_AT}/api/music")
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                # 将列表转换为以music_id为键的字典
                return True, {
                    item["music_id"]: item 
                    for item in data.get("data", [])
                }, ""
            return False, {}, data.get("message", "Backend returned error")
        return False, {}, f"Backend returned status code: {response.status_code}"
    except Exception as e:
        return False, {}, str(e)

def sync_music_to_backend(music_id: str, music_data: Dict[str, Any]) -> tuple[bool, str]:
    """
    同步单个音乐数据到后端
    
    Args:
        music_id: 音乐ID
        music_data: 音乐数据
        
    Returns:
        tuple: (是否成功, 错误信息)
    """
    try:
        # 检查音乐是否存在
        response = requests.get(f"{SPRINGBOOT_BACKEND_AT}/api/music/{music_id}")
        exists = response.status_code == 200 and response.json().get("success", False)
        
        # 准备请求数据
        data = {
            "music_id": music_id,
            **music_data
        }
        
        # 根据是否存在选择创建或更新
        if exists:
            response = requests.put(
                f"{SPRINGBOOT_BACKEND_AT}/api/music",
                json=data
            )
        else:
            response = requests.post(
                f"{SPRINGBOOT_BACKEND_AT}/api/music",
                json=data
            )
            
        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                return True, ""
            return False, result.get("message", "Backend operation failed")
        return False, f"Backend returned status code: {response.status_code}"
    except Exception as e:
        return False, str(e)

def delete_from_backend(music_id: str) -> tuple[bool, str]:
    """
    从后端删除音乐数据
    
    Args:
        music_id: 要删除的音乐ID
        
    Returns:
        tuple: (是否成功, 错误信息)
    """
    try:
        response = requests.delete(f"{SPRINGBOOT_BACKEND_AT}/api/music/{music_id}")
        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                return True, ""
            return False, result.get("message", "Backend deletion failed")
        return False, f"Backend returned status code: {response.status_code}"
    except Exception as e:
        return False, str(e)

def sync_with_backend() -> tuple[bool, str]:
    """
    同步本地音乐数据与后端数据库
    
    Returns:
        tuple: (是否成功, 错误/状态信息)
    """
    if not IS_USING_SPRINGBOOT_BACKEND:
        return True, "Backend sync is disabled"
        
    try:
        # 获取本地和后端的音乐列表
        local_music = get_local_music_list()
        success, backend_music, error = get_backend_music_list()
        if not success:
            return False, f"Failed to get backend music list: {error}"
            
        # 统计同步操作
        sync_stats = {
            "created": 0,
            "updated": 0,
            "deleted": 0,
            "failed": 0
        }
        
        # 同步本地到后端
        for music_id, local_data in local_music.items():
            success, error = sync_music_to_backend(music_id, local_data)
            if success:
                if music_id in backend_music:
                    sync_stats["updated"] += 1
                else:
                    sync_stats["created"] += 1
            else:
                sync_stats["failed"] += 1
                print(f"Failed to sync music {music_id} to backend: {error}")
                
        # 删除后端多余的数据
        for music_id in backend_music:
            if music_id not in local_music:
                success, error = delete_from_backend(music_id)
                if success:
                    sync_stats["deleted"] += 1
                else:
                    sync_stats["failed"] += 1
                    print(f"Failed to delete music {music_id} from backend: {error}")
                    
        # 生成同步报告
        report = (
            f"Sync completed: "
            f"Created {sync_stats['created']}, "
            f"Updated {sync_stats['updated']}, "
            f"Deleted {sync_stats['deleted']}, "
            f"Failed {sync_stats['failed']}"
        )
        
        return sync_stats["failed"] == 0, report
        
    except Exception as e:
        return False, f"Sync failed with error: {str(e)}"