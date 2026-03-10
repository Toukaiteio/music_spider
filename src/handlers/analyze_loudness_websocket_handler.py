"""
响度分析WebSocket处理器
"""

import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
from utils.data_type import MusicItem
from utils.loudness_analyzer import LoudnessAnalyzer, batch_analyze_directory
from config import DOWNLOADS_DIR

# 全局线程池用于响度分析
loudness_thread_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="loudness_analysis")

async def handle_analyze_loudness_single(websocket, cmd_id: str, payload: dict):
    """
    分析单个音频文件的响度
    命令格式: {"cmd": "analyze_loudness_single", "music_id": "xxx"}
    """
    try:
        music_id = payload.get("music_id")
        if not music_id:
            await websocket.send(json.dumps({
                "cmd_id": cmd_id,
                "code": 400,
                "data": {"error": "music_id parameter required"}
            }))
            return

        # 在后台线程中执行分析
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            loudness_thread_pool,
            analyze_single_track_sync,
            music_id
        )

        await websocket.send(json.dumps({
            "cmd_id": cmd_id,
            "code": result["code"],
            "data": result["data"]
        }))

    except Exception as e:
        await websocket.send(json.dumps({
            "cmd_id": cmd_id,
            "code": 500,
            "data": {"error": str(e)}
        }))

async def handle_analyze_loudness_batch(websocket, cmd_id: str, payload: dict):
    """
    批量分析所有音频文件的响度
    命令格式: {"cmd": "analyze_loudness_batch"}
    """
    try:
        # 在后台线程中执行批量分析
        loop = asyncio.get_event_loop()

        # 发送开始消息
        await websocket.send(json.dumps({
            "cmd_id": cmd_id,
            "code": 200,
            "data": {
                "message": "Batch analysis started",
                "status": "running"
            }
        }))

        # 执行分析
        success_count = await loop.run_in_executor(
            loudness_thread_pool,
            batch_analyze_directory,
            DOWNLOADS_DIR
        )

        # 发送完成消息
        await websocket.send(json.dumps({
            "cmd_id": f"{cmd_id}_complete",
            "code": 200,
            "data": {
                "message": "Batch analysis completed",
                "status": "completed",
                "success_count": success_count
            }
        }))

    except Exception as e:
        await websocket.send(json.dumps({
            "cmd_id": cmd_id,
            "code": 500,
            "data": {"error": str(e)}
        }))

async def handle_get_loudness_data(websocket, cmd_id: str, payload: dict):
    """
    获取音频的响度数据
    命令格式: {"cmd": "get_loudness_data", "music_id": "xxx"}
    """
    try:
        music_id = payload.get("music_id")
        if not music_id:
            await websocket.send(json.dumps({
                "cmd_id": cmd_id,
                "code": 400,
                "data": {"error": "music_id parameter required"}
            }))
            return

        music_item = MusicItem.load_from_json(music_id)
        if not music_item:
            await websocket.send(json.dumps({
                "cmd_id": cmd_id,
                "code": 404,
                "data": {"error": "Music item not found"}
            }))
            return

        if music_item.loudness_lufs is None:
            await websocket.send(json.dumps({
                "cmd_id": cmd_id,
                "code": 200,
                "data": {
                    "music_id": music_id,
                    "has_loudness_data": False,
                    "message": "No loudness data available. Run analysis first."
                }
            }))
            return

        analyzer = LoudnessAnalyzer()
        gain_adjustment = analyzer.calculate_gain_adjustment(music_item.loudness_lufs)

        await websocket.send(json.dumps({
            "cmd_id": cmd_id,
            "code": 200,
            "data": {
                "music_id": music_id,
                "has_loudness_data": True,
                "loudness_lufs": music_item.loudness_lufs,
                "loudness_peak": music_item.loudness_peak,
                "gain_adjustment": gain_adjustment,
                "target_loudness": analyzer.target_loudness
            }
        }))

    except Exception as e:
        await websocket.send(json.dumps({
            "cmd_id": cmd_id,
            "code": 500,
            "data": {"error": str(e)}
        }))

def analyze_single_track_sync(music_id: str) -> dict:
    """同步版本的单曲分析（用于线程池执行）"""
    try:
        # 加载音乐项目
        music_item = MusicItem.load_from_json(music_id)
        if not music_item:
            return {"code": 404, "data": {"error": "Music item not found"}}

        # 创建分析器
        analyzer = LoudnessAnalyzer()

        # 执行分析
        success = analyzer.analyze_music_item(music_item)

        if success:
            return {
                "code": 200,
                "data": {
                    "message": "Analysis completed",
                    "music_id": music_id,
                    "loudness_lufs": music_item.loudness_lufs,
                    "loudness_peak": music_item.loudness_peak,
                    "gain_adjustment": analyzer.calculate_gain_adjustment(music_item.loudness_lufs)
                }
            }
        else:
            return {"code": 500, "data": {"error": "Analysis failed"}}

    except Exception as e:
        return {"code": 500, "data": {"error": str(e)}}