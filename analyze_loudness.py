#!/usr/bin/env python3
"""
音频响度批量分析工具

使用方法:
1. 分析所有未分析的音频文件: python analyze_loudness.py
2. 分析特定音频文件: python analyze_loudness.py --music-id MUSIC_ID
3. 强制重新分析所有文件: python analyze_loudness.py --force
4. 安装依赖: python analyze_loudness.py --install-deps

依赖:
- pyloudnorm: pip install pyloudnorm
- librosa: pip install librosa
"""

import argparse
import os
import sys
import subprocess
import pkg_resources

# 添加src目录到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from utils.loudness_analyzer import LoudnessAnalyzer, batch_analyze_directory, PYLOUDNORM_AVAILABLE
from utils.data_type import MusicItem
from config import DOWNLOADS_DIR

def check_dependencies():
    """检查必要的依赖是否已安装"""
    required_packages = ['librosa', 'numpy']
    optional_packages = ['pyloudnorm']

    missing_required = []
    missing_optional = []

    for package in required_packages:
        try:
            pkg_resources.get_distribution(package)
        except pkg_resources.DistributionNotFound:
            missing_required.append(package)

    for package in optional_packages:
        try:
            pkg_resources.get_distribution(package)
        except pkg_resources.DistributionNotFound:
            missing_optional.append(package)

    return missing_required, missing_optional

def install_dependencies():
    """安装必要的依赖"""
    print("Installing dependencies...")
    packages = ['librosa', 'numpy', 'pyloudnorm']

    for package in packages:
        print(f"Installing {package}...")
        try:
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', package])
            print(f"✓ {package} installed successfully")
        except subprocess.CalledProcessError as e:
            print(f"✗ Failed to install {package}: {e}")
            return False

    print("\nAll dependencies installed successfully!")
    return True

def analyze_single_file(music_id):
    """分析单个音频文件"""
    print(f"Analyzing music ID: {music_id}")

    music_item = MusicItem.load_from_json(music_id)
    if not music_item:
        print(f"Error: Music item with ID '{music_id}' not found")
        return False

    if music_item.loudness_lufs is not None:
        print(f"Music '{music_item.title}' already has loudness data:")
        print(f"  LUFS: {music_item.loudness_lufs:.2f}")
        print(f"  Peak: {music_item.loudness_peak:.2f} dBFS")
        return True

    analyzer = LoudnessAnalyzer()
    success = analyzer.analyze_music_item(music_item)

    if success:
        print(f"✓ Analysis completed for '{music_item.title}'")
        print(f"  LUFS: {music_item.loudness_lufs:.2f}")
        print(f"  Peak: {music_item.loudness_peak:.2f} dBFS")
        print(f"  Gain adjustment: {analyzer.calculate_gain_adjustment(music_item.loudness_lufs):.2f}")
        return True
    else:
        print(f"✗ Analysis failed for '{music_item.title}'")
        return False

def batch_analyze(force=False):
    """批量分析所有音频文件"""
    print(f"Starting batch analysis of directory: {DOWNLOADS_DIR}")

    if not os.path.exists(DOWNLOADS_DIR):
        print(f"Error: Downloads directory not found: {DOWNLOADS_DIR}")
        return False

    analyzer = LoudnessAnalyzer()
    total_files = 0
    analyzed_files = 0
    skipped_files = 0
    failed_files = 0

    # 遍历所有子目录
    for item in os.listdir(DOWNLOADS_DIR):
        item_path = os.path.join(DOWNLOADS_DIR, item)
        if os.path.isdir(item_path):
            total_files += 1
            try:
                music_item = MusicItem.load_from_json(item)
                if not music_item:
                    print(f"Skipping {item}: Could not load music data")
                    failed_files += 1
                    continue

                if not force and music_item.loudness_lufs is not None:
                    print(f"Skipping '{music_item.title}' (already analyzed)")
                    skipped_files += 1
                    continue

                print(f"Analyzing '{music_item.title}'...")
                if analyzer.analyze_music_item(music_item):
                    analyzed_files += 1
                    print(f"  ✓ LUFS: {music_item.loudness_lufs:.2f}, Peak: {music_item.loudness_peak:.2f} dBFS")
                else:
                    failed_files += 1
                    print(f"  ✗ Analysis failed")

            except Exception as e:
                print(f"Error processing {item}: {e}")
                failed_files += 1

    print(f"\nBatch analysis completed:")
    print(f"  Total files: {total_files}")
    print(f"  Analyzed: {analyzed_files}")
    print(f"  Skipped: {skipped_files}")
    print(f"  Failed: {failed_files}")

    return analyzed_files > 0

def show_statistics():
    """显示响度统计信息"""
    if not os.path.exists(DOWNLOADS_DIR):
        print(f"Error: Downloads directory not found: {DOWNLOADS_DIR}")
        return

    loudness_values = []
    peak_values = []
    total_files = 0
    analyzed_files = 0

    for item in os.listdir(DOWNLOADS_DIR):
        item_path = os.path.join(DOWNLOADS_DIR, item)
        if os.path.isdir(item_path):
            total_files += 1
            try:
                music_item = MusicItem.load_from_json(item)
                if music_item and music_item.loudness_lufs is not None:
                    analyzed_files += 1
                    loudness_values.append(music_item.loudness_lufs)
                    peak_values.append(music_item.loudness_peak)
            except Exception as e:
                print(f"Error loading {item}: {e}")

    if analyzed_files == 0:
        print("No loudness data found. Run analysis first.")
        return

    import statistics

    print(f"\nLoudness Statistics:")
    print(f"  Total files: {total_files}")
    print(f"  Analyzed files: {analyzed_files}")
    print(f"  Coverage: {analyzed_files/total_files*100:.1f}%")
    print(f"\nLoudness (LUFS):")
    print(f"  Mean: {statistics.mean(loudness_values):.2f}")
    print(f"  Median: {statistics.median(loudness_values):.2f}")
    print(f"  Min: {min(loudness_values):.2f}")
    print(f"  Max: {max(loudness_values):.2f}")
    print(f"  Std Dev: {statistics.stdev(loudness_values):.2f}")
    print(f"\nPeak (dBFS):")
    print(f"  Mean: {statistics.mean(peak_values):.2f}")
    print(f"  Median: {statistics.median(peak_values):.2f}")
    print(f"  Min: {min(peak_values):.2f}")
    print(f"  Max: {max(peak_values):.2f}")

def main():
    parser = argparse.ArgumentParser(description='音频响度批量分析工具')
    parser.add_argument('--music-id', help='分析特定音频文件的ID')
    parser.add_argument('--force', action='store_true', help='强制重新分析所有文件')
    parser.add_argument('--install-deps', action='store_true', help='安装必要的依赖包')
    parser.add_argument('--stats', action='store_true', help='显示响度统计信息')

    args = parser.parse_args()

    if args.install_deps:
        if install_dependencies():
            print("\nYou can now run the loudness analysis.")
        return

    if args.stats:
        show_statistics()
        return

    # 检查依赖
    missing_required, missing_optional = check_dependencies()

    if missing_required:
        print(f"Error: Missing required packages: {', '.join(missing_required)}")
        print("Run: python analyze_loudness.py --install-deps")
        return

    if missing_optional:
        print(f"Warning: Missing optional packages: {', '.join(missing_optional)}")
        print("For better accuracy, install with: pip install pyloudnorm")
        print("Continuing with fallback analysis...\n")

    if not PYLOUDNORM_AVAILABLE:
        print("Warning: Using fallback RMS-based analysis. Install pyloudnorm for EBU R128 compliance.")
        print()

    if args.music_id:
        analyze_single_file(args.music_id)
    else:
        batch_analyze(force=args.force)

if __name__ == "__main__":
    main()