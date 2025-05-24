import requests
from datetime import datetime # Not strictly used in the moved logic, but kept for now
import os
from urllib.parse import quote
import mimetypes
import json # Not strictly used in the moved logic, but kept for now
from pyquery import PyQuery as pq
import re
from utils.data_type import MusicItem # Relative import
import subprocess
import shlex
import tempfile
import glob
import concurrent.futures
# Global variables from main.py
user_id = "77130-7014-3319-567702"
oauth_token = "2-303884-1556525673-bal84X32zv4Kw"
client_id_path = os.path.join(os.getcwd(), "client_id.txt") # os.getcwd() will resolve to project root

if os.path.exists(client_id_path):
    with open(client_id_path, "r") as f:
        client_id = f.read().strip()
else:
    client_id = "cWww6yL0wMOcwhn4GEYjHVAg3mwMPBis"

version = None # Will be initialized by get_app_version

def get_app_version():

    url = "https://soundcloud.com/versions.json"
    try:
        resp = requests.get(url)
        resp.raise_for_status()
        data = resp.json()
        return data.get("app")
    except Exception as e:
        print(f"Error fetching app version: {e}")
        # Fallback or default version if needed
        return "UNKNOWN_VERSION"

# Initialize version right after defining get_app_version
version = get_app_version()


def fetch_ext_from_url(url):
    path = url.split("?", 1)[0]
    ext = os.path.splitext(path)[1]
    if ext:
        return ext
    mime, _ = mimetypes.guess_type(path)
    if mime:
        return mimetypes.guess_extension(mime)
    return ".bin"

    """
    使用FFmpeg将M3U8转换为MP3
    :param m3u8_url: M3U8文件路径或URL
    :param output_file: 输出MP3文件路径
    """
    command = [
        'ffmpeg',
        '-i', m3u8_url,  # 输入文件/URL
        '-c', 'copy',    # 直接复制流不重新编码
        output_file      # 输出文件
    ]
    subprocess.run(command, check=True)
def update_client_id():
    global client_id, version
    new_version = get_app_version() # Fetch latest version
    if new_version: # if get_app_version succeeded
        version = new_version
    
    discover_url = "https://soundcloud.com/discover"
    try:
        resp = requests.get(discover_url)
        resp.raise_for_status()
        doc = pq(resp.text)
        scripts = doc("script[src]")
        if not scripts:
            print("未找到script标签")
            return None # Return None on failure
        
        # Iterate through script tags to find the one containing client_id
        # The original code just took the last one, which might be fragile.
        # A more robust way would be to check content or a pattern.
        # For now, sticking to the last script for direct porting.
        last_script = scripts[-1]
        script_src = pq(last_script).attr("src")
        
        if not script_src:
            print("未找到script的src属性")
            return None

        js_resp = requests.get(script_src)
        js_resp.raise_for_status()
        match = re.search(r',client_id:"([a-zA-Z0-9]+)",', js_resp.text)
        if match:
            new_client_id = match.group(1)
            client_id = new_client_id
            # client_id_path is defined globally
            with open(client_id_path, "w") as f:
                f.write(new_client_id)
            print(f"client_id已更新: {new_client_id}")
            return new_client_id
        else:
            print("未找到client_id")
            return None
    except Exception as e:
        print(f"Error updating client_id: {e}")
        return None


def ms_to_mmss(ms):
    seconds = ms // 1000
    minutes = seconds // 60
    seconds = seconds % 60
    return f"{minutes:02}:{seconds:02}"

def convert_m3u8_to_mp3(m3u8_path, output_file, track_id=None, progress_callback=None, file_type="audio"):
    """
    先下载M3U8中的所有片段到本地，再用FFmpeg合并为MP3，合并后删除切片
    :param m3u8_path: 本地M3U8文件路径
    :param output_file: 输出MP3文件路径
    :param track_id: 用于进度回调的track_id
    :param progress_callback: 进度回调函数
    :param file_type: 文件类型（用于回调）
    """
    # Keep track of completed segments for progress reporting
    completed_segment_count = 0
    total_segments_for_progress = 0 # Will be updated after reading m3u8

    def download_segment(segment_url, segment_path, segment_index, total_segments_local, current_track_id, current_file_type, current_progress_callback):
        nonlocal completed_segment_count # To update the count in the outer scope
        try:
            r = requests.get(segment_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
                "Origin": "https://soundcloud.com",
                'Referer': 'https://soundcloud.com/'
            }, timeout=10) # Added timeout
            r.raise_for_status() # Raise an exception for bad status codes
            with open(segment_path, 'wb') as f_seg:
                f_seg.write(r.content)
            
            completed_segment_count += 1
            if current_progress_callback:
                current_progress_callback(
                    track_id=current_track_id,
                    current_size=completed_segment_count, # Use the thread-safe counter
                    total_size=total_segments_local, # Total segments in this specific m3u8
                    file_type=current_file_type,
                    status="downloading_segments" # New status
                )
            return segment_path
        except requests.exceptions.RequestException as e:
            print(f"下载失败 {segment_url}: {e}")
            # Optionally, call progress_callback with an error for this specific segment if needed
            # For now, just returning None, and overall download might fail if too many segments are missing
            return None
        except Exception as e: # Catch other potential errors like file write errors
            print(f"处理片段 {segment_url} 时发生错误: {e}")
            return None

    def download_m3u8_segments_concurrent(m3u8_file_path, output_dir, current_track_id, current_file_type, current_progress_callback):
        nonlocal total_segments_for_progress # To assign the total number of segments
        os.makedirs(output_dir, exist_ok=True)
        segment_urls = []
        with open(m3u8_file_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith('http'): # Assuming direct URLs to segments
                    segment_urls.append(line)
        
        total_segments_local = len(segment_urls)
        total_segments_for_progress = total_segments_local # Update for outer scope progress
        
        if not segment_urls:
            print("M3U8文件中未找到任何片段URL。")
            return []

        # Pre-allocate list to store segment paths in order
        ordered_segment_files = [None] * total_segments_local
        futures = []
        # Using up to 10 workers, can be adjusted
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            for i, url in enumerate(segment_urls):
                seg_path = os.path.join(output_dir, f'segment_{i:03d}.ts')
                futures.append(executor.submit(download_segment, url, seg_path, i, total_segments_local, current_track_id, current_file_type, current_progress_callback))

            for i, future in enumerate(futures):
                try:
                    # Result is the segment_path or None
                    segment_file_path = future.result() 
                    if segment_file_path:
                        # Store in the correct position based on submission order
                        ordered_segment_files[i] = segment_file_path
                except Exception as e:
                    # This catches errors from the future.result() call itself, though download_segment should handle its own.
                    print(f"等待片段 {i} 下载结果时发生错误: {e}")
                    # ordered_segment_files[i] will remain None

        # Filter out None values from segments that failed to download
        successful_segment_files = [path for path in ordered_segment_files if path is not None]
        
        if len(successful_segment_files) < total_segments_local:
            print(f"警告: 成功下载 {len(successful_segment_files)} 个片段中的 {total_segments_local} 个。")
            # Depending on strictness, one might raise an error here if too few segments downloaded.

        return successful_segment_files


    # 1. 下载所有片段
    with tempfile.TemporaryDirectory() as tmpdir:
        # Pass progress_callback, track_id, and file_type to the new concurrent downloader
        segment_files = download_m3u8_segments_concurrent(m3u8_path, tmpdir, track_id, file_type, progress_callback)
        
        if not segment_files:
            # Call progress_callback with error status before raising RuntimeError
            if progress_callback:
                progress_callback(
                    track_id=track_id,
                    current_size=0, # Or completed_segment_count if it's meaningful here
                    total_size=total_segments_for_progress if total_segments_for_progress > 0 else 1, # Avoid division by zero
                    file_type=file_type,
                    status="error",
                    error_message="未能下载任何m3u8片段"
                )
            raise RuntimeError("未能下载任何m3u8片段")
        
        # Optional: Callback after all segments are downloaded successfully (or partially)
        # This provides a clear step before concatenation starts.
        if progress_callback:
            progress_callback(
                track_id=track_id,
                current_size=completed_segment_count,
                total_size=total_segments_for_progress,
                file_type=file_type,
                status="all_segments_downloaded" # New status
            )
        # 2. 生成FFmpeg合并用的文件列表
        concat_file = os.path.join(tmpdir, "segments.txt")
        with open(concat_file, "w", encoding="utf-8") as f:
            for seg in segment_files:
                f.write(f"file '{os.path.abspath(seg)}'\n")

        # 3. 用FFmpeg合并为MP3
        command = [
            'ffmpeg',
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_file,
            '-vn',
            '-acodec', 'libmp3lame',
            output_file
        ]
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )
        # 简单进度：合并时直接回调100% - Consider a more specific status like "concatenating"
        if progress_callback:
            progress_callback(
                track_id=track_id,
                current_size=completed_segment_count, # Reflects actual downloaded segments
                total_size=total_segments_for_progress,
                file_type=file_type,
                status="concatenating_segments" 
            )

        for line in process.stdout: # Process ffmpeg output (can be used for more detailed progress if needed)
            pass
        process.wait()
        if process.returncode != 0:
            # FFmpeg failure - report error via progress_callback
            ffmpeg_error_message = "FFmpeg failed to merge segments to mp3."
            # Try to capture more detailed error from ffmpeg if possible (stderr reading would be needed)
            # For now, a generic message.
            if progress_callback:
                progress_callback(
                    track_id=track_id,
                    current_size=completed_segment_count,
                    total_size=total_segments_for_progress,
                    file_type=file_type,
                    status="error",
                    error_message=ffmpeg_error_message
                )
            raise RuntimeError(ffmpeg_error_message)
        
        # FFmpeg success - report final completion for this file_type
        if progress_callback:
            progress_callback(
                track_id=track_id,
                current_size=total_segments_for_progress, # Assuming all segments contributed to the final file
                total_size=total_segments_for_progress,
                file_type=file_type,
                status="completed_file" # This status indicates the mp3 is ready
            )
        # 4. 删除所有切片
        for seg in segment_files:
            try:
                os.remove(seg)
            except Exception:
                pass

def _save_file_with_progress(file_url: str, filename: str, track_id: str, progress_callback: callable, file_type: str, stream: bool = True):
    """
    Downloads a file from file_url to filename, reporting progress.
    Attempts streaming download first if stream=True. Falls back to non-streaming if stream fails or if stream=False.
    如果是m3u8文件，下载后自动转为mp3，并追踪转换进度。
    """
    try:
        resp = requests.get(
            file_url,
            stream=stream,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
                "Accept": "*/*",  # More generic accept for various file types
                "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6",
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Origin": "https://soundcloud.com",
                "Referer": "https://soundcloud.com/",
            }
        )
        resp.raise_for_status()

        total_size = int(resp.headers.get('content-length', 0))
        current_size = 0

        # 判断是否为m3u8文件
        ext = os.path.splitext(filename)[1].lower()
        is_m3u8 = ext == ".m3u8" or resp.headers.get("Content-Type", "").startswith("application/vnd.apple.mpegurl") or resp.headers.get("Content-Type", "").startswith("audio/mpegurl")

        if is_m3u8:
            # 先保存m3u8文件
            with open(filename, "wb") as f:
                if stream:
                    for chunk in resp.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            current_size += len(chunk)
                            if progress_callback:
                                progress_callback(
                                    track_id=track_id,
                                    current_size=current_size,
                                    total_size=total_size,
                                    file_type=file_type,
                                    status="downloading"
                                )
                else:
                    f.write(resp.content)
                    current_size = total_size

            if progress_callback:
                progress_callback(
                    track_id=track_id,
                    current_size=current_size,
                    total_size=total_size,
                    file_type=file_type,
                    status="completed_file"
                )
            # 转换为mp3
            mp3_file = os.path.splitext(filename)[0] + ".mp3"
            try:
                convert_m3u8_to_mp3(filename, mp3_file, track_id=track_id, progress_callback=progress_callback, file_type=file_type)
                # 删除原m3u8文件
                os.remove(filename)
                print(f"File {mp3_file} (converted from m3u8) downloaded and converted successfully.")
                return True
            except Exception as e:
                print(f"Error converting m3u8 to mp3: {e}")
                if progress_callback:
                    progress_callback(
                        track_id=track_id,
                        current_size=0,
                        total_size=0,
                        file_type=file_type,
                        status="error",
                        error_message=str(e)
                    )
                return False

        # 普通文件下载
        with open(filename, "wb") as f:
            if stream:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        current_size += len(chunk)
                        if progress_callback:
                            progress_callback(
                                track_id=track_id,
                                current_size=current_size,
                                total_size=total_size,
                                file_type=file_type,
                                status="downloading"
                            )
            else:  # Non-streaming download
                f.write(resp.content)
                current_size = total_size  # Assume full download if non-streaming and no error

        if progress_callback:  # Final progress update after loop or non-stream download
            progress_callback(
                track_id=track_id,
                current_size=current_size,  # current_size should be total_size if download was successful
                total_size=total_size,
                file_type=file_type,
                status="completed_file"
            )
        print(f"File {filename} downloaded successfully.")
        return True

    except Exception as e:
        print(f"Error downloading {file_type} {file_url} to {filename}: {e}")
        if progress_callback:
            progress_callback(
                track_id=track_id,
                current_size=0,  # Or current_size before error if known and meaningful
                total_size=0,  # Or total_size if known
                file_type=file_type,
                status="error",
                error_message=str(e)
            )
        # If streaming attempt failed, and stream was True, try non-streaming as fallback
        if stream:
            print(f"Attempting non-streaming fallback for {filename}")
            return _save_file_with_progress(file_url, filename, track_id, progress_callback, file_type, stream=False)
        return False



def download_audio_internal(track_authorization, transcodings, save_path_dir, track_id: str, progress_callback: callable = None):
    global version, client_id

    def fetch_stream_url(transcoding_url, current_client_id, current_track_authorization):
        params = {"client_id": current_client_id, "track_authorization": current_track_authorization}
        resp = requests.get(
            transcoding_url,
            params=params,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6",
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Origin": "https://soundcloud.com",
                "Referer": "https://soundcloud.com/",
            },
        )
        resp.raise_for_status()
        return resp.json().get("url")

    if not transcodings:
        print("没有可用的音频流。")
        return None # Return path of downloaded file or None

    downloaded_audio_path = None
    for idx, transcoding in enumerate(transcodings):
        url = transcoding.get("url")
        # format_info = transcoding.get("format", {}) # Not used
        if not url:
            continue
        try:
            stream_url = fetch_stream_url(url, client_id, track_authorization)
            ext = fetch_ext_from_url(stream_url)
            # Use a consistent name for the primary audio file
            filename_base = "audio" 
            # For backup streams, ensure a different name if primary fails and we try another
            if idx > 0 :
                 filename_base = f"audio_backup_{idx}" # This logic might need refinement based on how we want to handle multiple streams

            filename = os.path.join(save_path_dir, f"{filename_base}{ext}")

            if _save_file_with_progress(stream_url, filename, track_id, progress_callback, "audio"):
                print(f"Audio stream downloaded successfully as {filename}")
                if idx == 0: # Prioritize the first stream if successful
                    downloaded_audio_path = filename
                    break # Stop after the first successful download of the primary stream type
                # If it's a backup stream that succeeded, we can also consider it done.
                # The current logic will take the first successful download (main or backup).
                if not downloaded_audio_path: # if main failed, take backup
                    downloaded_audio_path = filename
                    break 
            else:
                print(f"Failed to download audio stream {idx} to {filename}")
                if idx == 0: # If primary stream fails
                    if progress_callback:
                        progress_callback(track_id=track_id, current_size=0, total_size=0, file_type="audio", status="error", error_message="Primary audio stream failed")
        except Exception as e:
            print(f"Error processing audio stream {idx}: {e}")
            if progress_callback:
                 progress_callback(track_id=track_id, current_size=0, total_size=0, file_type="audio", status="error", error_message=str(e))
    
    return downloaded_audio_path


def download_cover_internal(cover_url: str, save_path_full: str, track_id: str, progress_callback: callable = None):
    if not cover_url:
        print("No cover URL provided.")
        if progress_callback:
            progress_callback(track_id=track_id, current_size=0, total_size=0, file_type="cover", status="error", error_message="No cover URL")
        return None
    if os.path.exists(save_path_full):
        print(f"Cover image already exists: {save_path_full}")
        if progress_callback: # Still report completion if file exists
             try:
                # Attempt to get file size for accurate reporting
                existing_size = os.path.getsize(save_path_full)
                progress_callback(track_id=track_id, current_size=existing_size, total_size=existing_size, file_type="cover", status="completed_file")
             except OSError: # Handle cases where getsize might fail
                progress_callback(track_id=track_id, current_size=0, total_size=0, file_type="cover", status="completed_file", error_message="File exists but size unknown")
        return save_path_full

    if _save_file_with_progress(cover_url, save_path_full, track_id, progress_callback, "cover"):
        return save_path_full
    else: # _save_file_with_progress handles its own error callback
        print(f"Failed to download cover {cover_url}")
        return None


def search_tracks(query: str, limit: int = 20) -> list[dict]:
    global client_id, version, user_id, oauth_token,version # Ensure globals are accessible
    
    quoted_query = quote(query)
    api_url = (
        f"https://api-v2.soundcloud.com/search"
        f"?q={quoted_query}&facet=model&user_id={user_id}"
        f"&client_id={client_id}&limit={limit}&offset=0"
        f"&linked_partitioning=1&app_version={version}&app_locale=en"
    )
    print(f"Requesting URL: {api_url}")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Authorization": f"OAuth {oauth_token}",
        "Origin": "https://soundcloud.com",
        "Referer": "https://soundcloud.com/",
    }

    try:
        resp = requests.get(api_url, headers=headers)
        resp.raise_for_status() # Raise HTTPError for bad responses (4XX or 5XX)
        data = resp.json()
    except requests.exceptions.RequestException as e:
        print(f"API request failed: {e}")
        data = {} # Ensure data is an empty dict on failure

    if not data.get("collection"):
        print("No data from API or collection is empty. Attempting to update client_id and retry...")
        new_client_id = update_client_id()
        if new_client_id:
            client_id = new_client_id # Update global client_id for the retry
            # Update version as well, as update_client_id might have fetched a new one
            version = get_app_version() if version == "UNKNOWN_VERSION" or not version else version

            api_url = (
                f"https://api-v2.soundcloud.com/search"
                f"?q={quoted_query}&facet=model&user_id={user_id}"
                f"&client_id={client_id}&limit={limit}&offset=0"
                f"&linked_partitioning=1&app_version={version}&app_locale=en"
            )
            print(f"Retrying with new client_id. Requesting URL: {api_url}")
            try:
                resp = requests.get(api_url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
            except requests.exceptions.RequestException as e_retry:
                print(f"API retry request failed: {e_retry}")
                data = {} # Ensure data is an empty dict on retry failure
        else:
            print("Failed to update client_id. Cannot retry.")

    return data.get("collection", [])


def download_track(track_info: dict, base_download_path: str = "./downloads", progress_callback: callable = None) -> MusicItem | None:
    if not track_info:
        print("Error: track_info is empty or None.")
        if progress_callback:
            # Need a track_id here, but it's not available if track_info is None.
            # This case should ideally be caught before calling download_track or
            # a dummy track_id used for error reporting if structure demands it.
            # For now, just print, as the caller (main.py) will handle response.
            pass 
        return None

    music_id = str(track_info.get("id"))
    if not music_id:
        print("Error: track_info does not contain an 'id'.")
        return None

    title = track_info.get("title", "Unknown Title")
    artist = track_info.get("publisher_metadata", {}).get("artist", "") or track_info.get("user", {}).get("username", "Unknown Artist")
    album_title = track_info.get("publisher_metadata", {}).get("album_title", "")
    description = track_info.get("description", "")
    tags_str = track_info.get("tag_list", "")
    tags = [tag.strip() for tag in tags_str.split("\"") if tag.strip()] if tags_str else []
    genre = track_info.get("genre", "")
    duration = track_info.get("duration", 0)
    artwork_url_template = track_info.get("artwork_url")
    
    preview_cover_url = None
    if artwork_url_template:
        preview_cover_url = artwork_url_template.replace("large", "t500x500") # Higher resolution for preview

    music_item = MusicItem(
        music_id=music_id,
        title=title,
        author=artist,
        description=description,
        album=album_title,
        tags=tags,
        duration=duration,
        genre=genre,
        cover=preview_cover_url # This is preview_cover for MusicItemData
    )

    # Ensure the work_path (download directory for this item) exists
    # MusicItem constructor already creates ./downloads/{music_id}
    # os.makedirs(music_item.work_path, exist_ok=True) # Already done by MusicItem

    # Download Cover
    if preview_cover_url: # Use the same URL for download, or a higher quality one if available
        cover_ext = fetch_ext_from_url(preview_cover_url)
        # music_item.work_path is ./downloads/{music_id}/
        cover_filename = f"cover{cover_ext}"
        full_cover_path = os.path.join(music_item.work_path, cover_filename)
        
        downloaded_cover_path = download_cover_internal(
            cover_url=preview_cover_url, 
            save_path_full=full_cover_path,
            track_id=music_item.music_id, # Pass track_id
            progress_callback=progress_callback # Pass callback
        )
        if downloaded_cover_path:
            music_item.set_cover(downloaded_cover_path)
            print(f"Cover downloaded to: {downloaded_cover_path}")
        else:
            print(f"Failed to download cover for {music_id}")
            # Callback for cover download failure is handled within download_cover_internal
    else:
        print(f"No artwork_url found for {music_id}")
        if progress_callback:
            progress_callback(track_id=music_id, current_size=0,total_size=0,file_type="cover",status="error", error_message="No artwork_url")


    # Download Audio
    track_authorization = track_info.get("track_authorization")
    transcodings = track_info.get("media", {}).get("transcodings", [])
    
    if track_authorization and transcodings:
        downloaded_audio_file_path = download_audio_internal(
            track_authorization=track_authorization,
            transcodings=transcodings,
            save_path_dir=music_item.work_path,
            track_id=music_item.music_id, # Pass track_id
            progress_callback=progress_callback # Pass callback
        )
        if downloaded_audio_file_path:
            music_item.set_audio(downloaded_audio_file_path)
            print(f"Audio downloaded to: {downloaded_audio_file_path}")
        else:
            print(f"Failed to download audio for {music_id}")
            # Callback for audio download failure is handled within download_audio_internal
    else:
        print(f"No track_authorization or transcodings found for {music_id}. Cannot download audio.")
        if progress_callback:
            progress_callback(track_id=music_id, current_size=0,total_size=0,file_type="audio",status="error", error_message="No track_authorization or transcodings")

    music_item.dump_self() # Save music.json
    print(f"Metadata for {music_id} saved to {os.path.join(music_item.work_path, 'music.json')}")
    
    # Final callback for the whole track download process
    if progress_callback:
        progress_callback(
            track_id=music_id,
            # current_size and total_size might be tricky here unless we sum them up
            # For now, send a generic "completed_track" status
            current_size=1, # Placeholder
            total_size=1, # Placeholder
            file_type="track", # Special type for overall track
            status="completed_track"
        )
    
    return music_item

# Example usage (optional, for testing this module directly)
async def _soundcloud_module_test():
    print("Testing SoundCloud Downloader Module...")
    
    # Test 1: Update client_id (optional, as it's called by search_tracks if needed)
    # print("Attempting to update client_id...")
    # updated_id = update_client_id()
    # print(f"Updated client_id: {updated_id}" if updated_id else "client_id update failed or not needed.")

    # Test 2: Search for tracks
    search_query = "NCS Alan Walker" # Replace with a test query
    print(f"\nSearching for tracks with query: '{search_query}'")
    tracks = search_tracks(search_query, limit=1) # Limit to 1 for quicker test download

    if tracks:
        print(f"Found {len(tracks)} tracks.")
        for i, track_data in enumerate(tracks):
            print(f"  {i+1}. Title: {track_data.get('title')}, Artist: {track_data.get('user', {}).get('username')}")
        
        # Test 3: Download the first track from search results
        first_track_info = tracks[0]
        print(f"\nAttempting to download first track: {first_track_info.get('title')}")

        def test_progress_callback(track_id, current_size, total_size, file_type, status, error_message=None):
            if total_size > 0 and status == "downloading":
                progress_percentage = (current_size / total_size) * 100
                print(f"  [PROGRESS] Track ID: {track_id}, Type: {file_type}, {current_size}/{total_size} bytes ({progress_percentage:.2f}%) - Status: {status}")
            else:
                print(f"  [PROGRESS] Track ID: {track_id}, Type: {file_type}, {current_size} bytes - Status: {status}" + (f" Error: {error_message}" if error_message else ""))

        downloaded_item = await download_track(
            track_info=first_track_info,
            progress_callback=test_progress_callback
        )
        
        if downloaded_item:
            print(f"\nSuccessfully downloaded track:")
            print(f"  Music ID: {downloaded_item.music_id}")
            print(f"  Title: {downloaded_item.title}")
            print(f"  Author: {downloaded_item.author}")
            print(f"  Cover Path: {downloaded_item.cover}") # This is _cover_path
            print(f"  Audio Path: {downloaded_item.audio}") # This is _audio_path
            print(f"  JSON Path: {os.path.join(downloaded_item.work_path, 'music.json')}")
            
            # Verify content of MusicItem.data
            print(f"  MusicItemData Preview Cover: {downloaded_item.data.preview_cover}")
            print(f"  MusicItemData Cover Path: {downloaded_item.data.cover_path}")
            print(f"  MusicItemData Audio Path: {downloaded_item.data.audio_path}")

            # Example of loading it back
            loaded_item = MusicItem.load_from_json(downloaded_item.music_id)
            if loaded_item:
                 print(f"\nSuccessfully reloaded MusicItem from JSON:")
                 print(f"  Loaded Cover Path: {loaded_item.cover}")
                 print(f"  Loaded Audio Path: {loaded_item.audio}")
                 print(f"  Loaded Preview Cover URL: {loaded_item.preview_cover}")

        else:
            print("Failed to download the track.")
    else:
        print("No tracks found for the query.")

if __name__ == '__main__':
    # This allows testing the module directly.
    # Note: asyncio.run might be needed if any part becomes async in future.
    # For now, assuming all testable functions are synchronous.    
    # Since _soundcloud_module_test is async due to its name, but content is sync
    # we can call it directly if not using await inside it.
    # However, the main module might run an event loop, so direct print is fine.
    _soundcloud_module_test() # No asyncio.run needed if it's not truly async.
                              # The function itself is defined as `async def` but doesn't use `await`.
                              # For consistency, let's make it a sync function if it doesn't need to be async.

# If _soundcloud_module_test was truly async:
# if __name__ == '__main__':
#     import asyncio
#     asyncio.run(_soundcloud_module_test())
#
# Correcting _soundcloud_module_test to be synchronous as it contains no await calls
async def _soundcloud_module_test_sync(): # Renamed to avoid confusion with async def
    print("Testing SoundCloud Downloader Module (Synchronous Test)...")
    search_query = "NCS Alan Walker" 
    print(f"\nSearching for tracks with query: '{search_query}'")
    tracks = search_tracks(search_query, limit=1)

    if tracks:
        print(f"Found {len(tracks)} tracks.")
        first_track_info = tracks[0]
        print(f"\nAttempting to download first track: {first_track_info.get('title')}")

        def test_progress_callback(track_id, current_size, total_size, file_type, status, error_message=None):
            if total_size > 0 and status == "downloading":
                progress_percentage = (current_size / total_size) * 100
                print(f"  [PROGRESS] Track ID: {track_id}, Type: {file_type}, {current_size}/{total_size} bytes ({progress_percentage:.2f}%) - Status: {status}")
            else:
                print(f"  [PROGRESS] Track ID: {track_id}, Type: {file_type}, {current_size} bytes - Status: {status}" + (f" Error: {error_message}" if error_message else ""))

        downloaded_item = await download_track(
            track_info=first_track_info,
            progress_callback=test_progress_callback
        )
        
        if downloaded_item:
            print(f"\nSuccessfully downloaded track:")
            print(f"  Music ID: {downloaded_item.music_id}")
            # ... (rest of the print statements from original test)
            print(f"  Cover Path: {downloaded_item.cover}") 
            print(f"  Audio Path: {downloaded_item.audio}")
            loaded_item = MusicItem.load_from_json(downloaded_item.music_id)
            if loaded_item:
                 print(f"\nSuccessfully reloaded MusicItem from JSON:")
                 print(f"  Loaded Cover Path: {loaded_item.cover}")
                 print(f"  Loaded Audio Path: {loaded_item.audio}")
        else:
            print("Failed to download the track.")
    else:
        print("No tracks found for the query.")

if __name__ == '__main__':
    _soundcloud_module_test_sync()
