"""
响度分析工具
使用 pyloudnorm 库进行符合 EBU R128 标准的响度分析
"""

import os
import librosa
import numpy as np
from typing import Optional, Tuple
from .data_type import MusicItem

try:
    import pyloudnorm as pyln
    PYLOUDNORM_AVAILABLE = True
except ImportError:
    PYLOUDNORM_AVAILABLE = False

class LoudnessAnalyzer:
    def __init__(self):
        self.target_loudness = -23.0  # EBU R128 standard

    def analyze_file(self, audio_path: str) -> Optional[Tuple[float, float]]:
        """
        分析音频文件的响度

        Args:
            audio_path: 音频文件路径

        Returns:
            Tuple[loudness_lufs, peak_dbfs] 或 None（如果分析失败）
        """
        if not PYLOUDNORM_AVAILABLE:
            return self._fallback_analyze(audio_path)

        try:
            # 加载音频文件
            audio, sr = librosa.load(audio_path, sr=None, mono=False)

            # 如果是单声道，转换为双声道格式（pyloudnorm要求）
            if audio.ndim == 1:
                audio = np.array([audio, audio]).T
            elif audio.ndim == 2 and audio.shape[0] != audio.shape[1]:
                # 转置以确保正确的形状 (samples, channels)
                if audio.shape[0] < audio.shape[1]:
                    audio = audio.T

            # 创建响度测量器
            meter = pyln.Meter(sr)

            # 测量集成响度 (LUFS)
            loudness_lufs = meter.integrated_loudness(audio)

            # 计算真峰值 (dBFS)
            peak_dbfs = 20 * np.log10(np.max(np.abs(audio)))

            return loudness_lufs, peak_dbfs

        except Exception as e:
            print(f"Error analyzing {audio_path}: {e}")
            return self._fallback_analyze(audio_path)

    def _fallback_analyze(self, audio_path: str) -> Optional[Tuple[float, float]]:
        """
        后备分析方法（当pyloudnorm不可用时）
        使用RMS作为响度的近似值
        """
        try:
            # 加载音频文件
            audio, sr = librosa.load(audio_path, sr=None)

            # 计算RMS值并转换为近似LUFS
            rms = np.sqrt(np.mean(audio**2))
            loudness_lufs = 20 * np.log10(rms) - 23 if rms > 0 else -float('inf')

            # 计算峰值
            peak_dbfs = 20 * np.log10(np.max(np.abs(audio))) if np.max(np.abs(audio)) > 0 else -float('inf')

            return loudness_lufs, peak_dbfs

        except Exception as e:
            print(f"Error in fallback analysis for {audio_path}: {e}")
            return None

    def calculate_gain_adjustment(self, current_loudness: float) -> float:
        """
        计算增益调整值

        Args:
            current_loudness: 当前音频的响度（LUFS）

        Returns:
            增益调整值（线性倍数）
        """
        if current_loudness == -float('inf') or current_loudness is None:
            return 1.0

        # 计算需要的增益调整（dB）
        gain_db = self.target_loudness - current_loudness

        # 限制增益范围（避免过度放大或衰减）
        gain_db = max(-12, min(12, gain_db))  # ±12dB限制

        # 转换为线性增益
        gain_linear = 10 ** (gain_db / 20)

        return gain_linear

    def analyze_music_item(self, music_item: MusicItem) -> bool:
        """
        分析MusicItem并更新其响度信息

        Args:
            music_item: 要分析的MusicItem

        Returns:
            是否成功分析
        """
        if not music_item.audio or not os.path.exists(music_item.audio):
            print(f"Audio file not found for {music_item.music_id}")
            return False

        result = self.analyze_file(music_item.audio)
        if result:
            loudness_lufs, peak_dbfs = result
            music_item.loudness_lufs = loudness_lufs
            music_item.loudness_peak = peak_dbfs
            music_item.dump_self()  # 保存更新后的数据
            print(f"Analyzed {music_item.title}: LUFS={loudness_lufs:.2f}, Peak={peak_dbfs:.2f}dBFS")
            return True
        else:
            print(f"Failed to analyze {music_item.title}")
            return False

def batch_analyze_directory(downloads_dir: str) -> int:
    """
    批量分析下载目录中的所有音频文件

    Args:
        downloads_dir: 下载目录路径

    Returns:
        成功分析的文件数量
    """
    analyzer = LoudnessAnalyzer()
    success_count = 0

    if not os.path.exists(downloads_dir):
        print(f"Downloads directory not found: {downloads_dir}")
        return 0

    # 遍历所有子目录
    for item in os.listdir(downloads_dir):
        item_path = os.path.join(downloads_dir, item)
        if os.path.isdir(item_path):
            try:
                # 尝试加载MusicItem
                music_item = MusicItem.load_from_json(item)
                if music_item and music_item.loudness_lufs is None:
                    # 如果还没有响度数据，进行分析
                    if analyzer.analyze_music_item(music_item):
                        success_count += 1
                elif music_item:
                    print(f"Skipping {music_item.title} (already analyzed)")
            except Exception as e:
                print(f"Error processing {item}: {e}")

    print(f"Batch analysis completed. Successfully analyzed {success_count} files.")
    return success_count

if __name__ == "__main__":
    # 检查依赖
    if not PYLOUDNORM_AVAILABLE:
        print("Warning: pyloudnorm not available. Install with: pip install pyloudnorm")
        print("Using fallback RMS-based analysis.")

    # 示例用法
    from config import DOWNLOADS_DIR
    batch_analyze_directory(DOWNLOADS_DIR)