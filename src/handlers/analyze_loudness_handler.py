"""
响度分析API处理器
"""

import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
from utils.data_type import MusicItem, ResultBase
from utils.loudness_analyzer import LoudnessAnalyzer, batch_analyze_directory
from config import DOWNLOADS_DIR

def handle_analyze_loudness(path, query_params, body):
    """
    处理响度分析请求

    支持的操作：
    - GET /analyze_loudness?music_id=xxx - 分析单个音频文件
    - POST /analyze_loudness - 批量分析所有未分析的文件
    """
    try:
        if path == "/analyze_loudness":
            if "music_id" in query_params:
                # 分析单个文件
                music_id = query_params["music_id"]
                return analyze_single_track(music_id)
            else:
                # 批量分析
                return start_batch_analysis()

        return ResultBase(400, {"error": "Invalid request"}).get_json()

    except Exception as e:
        return ResultBase(500, {"error": str(e)}).get_json()

def analyze_single_track(music_id: str):
    """分析单个音频文件的响度"""
    try:
        # 加载音乐项目
        music_item = MusicItem.load_from_json(music_id)
        if not music_item:
            return ResultBase(404, {"error": "Music item not found"}).get_json()

        # 创建分析器
        analyzer = LoudnessAnalyzer()

        # 执行分析
        success = analyzer.analyze_music_item(music_item)

        if success:
            return ResultBase(200, {
                "message": "Analysis completed",
                "music_id": music_id,
                "loudness_lufs": music_item.loudness_lufs,
                "loudness_peak": music_item.loudness_peak,
                "gain_adjustment": analyzer.calculate_gain_adjustment(music_item.loudness_lufs)
            }).get_json()
        else:
            return ResultBase(500, {"error": "Analysis failed"}).get_json()

    except Exception as e:
        return ResultBase(500, {"error": str(e)}).get_json()

def start_batch_analysis():
    """启动批量分析"""
    try:
        # 在后台线程中执行批量分析
        executor = ThreadPoolExecutor(max_workers=1)
        future = executor.submit(batch_analyze_directory, DOWNLOADS_DIR)

        return ResultBase(200, {
            "message": "Batch analysis started in background",
            "status": "running"
        }).get_json()

    except Exception as e:
        return ResultBase(500, {"error": str(e)}).get_json()

def handle_get_loudness_data(path, query_params, body):
    """
    获取音频的响度数据
    GET /get_loudness_data?music_id=xxx
    """
    try:
        if "music_id" not in query_params:
            return ResultBase(400, {"error": "music_id parameter required"}).get_json()

        music_id = query_params["music_id"]
        music_item = MusicItem.load_from_json(music_id)

        if not music_item:
            return ResultBase(404, {"error": "Music item not found"}).get_json()

        if music_item.loudness_lufs is None:
            return ResultBase(200, {
                "music_id": music_id,
                "has_loudness_data": False,
                "message": "No loudness data available. Run analysis first."
            }).get_json()

        analyzer = LoudnessAnalyzer()
        gain_adjustment = analyzer.calculate_gain_adjustment(music_item.loudness_lufs)

        return ResultBase(200, {
            "music_id": music_id,
            "has_loudness_data": True,
            "loudness_lufs": music_item.loudness_lufs,
            "loudness_peak": music_item.loudness_peak,
            "gain_adjustment": gain_adjustment,
            "target_loudness": analyzer.target_loudness
        }).get_json()

    except Exception as e:
        return ResultBase(500, {"error": str(e)}).get_json()