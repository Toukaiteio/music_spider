import requests
from datetime import datetime
import os
from urllib.parse import quote
import mimetypes
import json
from pyquery import PyQuery as pq
import re
from utils.data_type import *

user_id = "77130-7014-3319-567702"
oauth_token = "2-303884-1556525673-bal84X32zv4Kw"
client_id_path = os.path.join(os.getcwd(), "client_id.txt")
if os.path.exists(client_id_path):
    with open(client_id_path, "r") as f:
        client_id = f.read().strip()
else:
    client_id = "cWww6yL0wMOcwhn4GEYjHVAg3mwMPBis"


def fetch_ext_from_url(url):
    # 获取?前的路径部分
    path = url.split("?", 1)[0]
    ext = os.path.splitext(path)[1]
    if ext:
        return ext
    # fallback: 尝试用mimetypes
    mime, _ = mimetypes.guess_type(path)
    if mime:
        return mimetypes.guess_extension(mime)
    return ".bin"


def get_app_version():
    url = "https://soundcloud.com/versions.json"
    resp = requests.get(url)
    resp.raise_for_status()
    data = resp.json()
    return data.get("app")


version = get_app_version()


def update_client_id():
    global client_id, version
    version = get_app_version()
    discover_url = "https://soundcloud.com/discover"
    resp = requests.get(discover_url)
    resp.raise_for_status()
    doc = pq(resp.text)
    scripts = doc("script[src]")
    if not scripts:
        print("未找到script标签")
        return
    last_script = scripts[-1]
    script_src = pq(last_script).attr("src")
    if not script_src:
        print("未找到script的src属性")
        return
    js_resp = requests.get(script_src)
    js_resp.raise_for_status()
    match = re.search(r',client_id:"([a-zA-Z0-9]+)",', js_resp.text)
    if match:
        new_client_id = match.group(1)
        client_id = new_client_id
        client_id_path = os.path.join(os.getcwd(), "client_id.txt")
        with open(client_id_path, "w") as f:
            f.write(new_client_id)
        print(f"client_id已更新: {new_client_id}")
        return new_client_id
    else:
        print("未找到client_id")
        return None


def ms_to_mmss(ms):
    seconds = ms // 1000
    minutes = seconds // 60
    seconds = seconds % 60
    return f"{minutes:02}:{seconds:02}"


def download_audio(track_authorization, transcodings, save_path):
    global version, client_id, user_id

    def fetch_stream_url(transcoding_url, client_id, track_authorization):
        params = {"client_id": client_id, "track_authorization": track_authorization}
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

    def save_file(file_url, filename):
        try:
            resp = requests.get(
                file_url,
                stream=True,
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
            with open(filename, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
        except Exception as e:
            # fallback: 非流式传输
            resp = requests.get(
                file_url,
                stream=False,
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
            with open(filename, "wb") as f:
                f.write(resp.content)

    if not transcodings:
        print("没有可用的音频流。")
        return

    for idx, transcoding in enumerate(transcodings):
        url = transcoding.get("url")
        format_info = transcoding.get("format", {})
        if not url:
            continue
        try:
            stream_url = fetch_stream_url(url, client_id, track_authorization)
            ext = fetch_ext_from_url(stream_url)
            if idx == 0:
                filename = os.path.join(save_path, f"audio_main{ext}")
            else:
                filename = os.path.join(save_path, f"audio_backup_{idx}{ext}")
            save_file(stream_url, filename)
            print(f"音频流已下载为 {filename}")
        except Exception as e:
            if idx == 0:
                print(f"主音频流下载失败: {e}")
            else:
                print(f"备用音频流{idx}下载失败: {e}")


def download_cover(cover, save_path):
    if os.path.exists(save_path):
        print(f"封面图片已存在: {save_path}")
        return save_path
    # download cover image
    try:
        response = requests.get(cover, stream=True)
        if response.status_code == 200:
            with open(save_path, "wb") as file:
                for chunk in response.iter_content(chunk_size=8192):
                    file.write(chunk)
            return save_path
        else:
            print(f"Failed to download cover image: {response.status_code}")
    except Exception as e:
        print(f"Error downloading cover image: {e}")
    return None


def main():
    query = input("请输入搜索内容: ")
    query = quote(query)
    url = (
        f"https://api-v2.soundcloud.com/search"
        f"?q={query}&facet=model&user_id={user_id}"
        f"&client_id={client_id}&limit=20&offset=0"
        f"&linked_partitioning=1&app_version={version}&app_locale=en"
    )
    print(f"请求URL: {url}")
    resp = requests.get(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Authorization": f"OAuth {oauth_token}",
            "Origin": "https://soundcloud.com",
            "Referer": "https://soundcloud.com/",
        },
    )
    data = resp.json()
    # 检查data是否为空字典，如果是则尝试更新client_id并重试一次
    if not data:
        print(data)
        print("未获取到数据，尝试更新client_id后重试...")
        new_client_id = update_client_id()
        if new_client_id:
            url = (
                f"https://api-v2.soundcloud.com/search"
                f"?q={query}&facet=model&user_id={user_id}"
                f"&client_id={new_client_id}&limit=20&offset=0"
                f"&linked_partitioning=1&app_version={version}&app_locale=en"
            )
            print(f"重试请求URL: {url}")
            resp = requests.get(url)
            data = resp.json()
        if not data:
            print("重试后仍未获取到数据，中断任务。")
            return
    collection = data.get("collection", [])
    for idx, item in enumerate(collection, 1):
        if item is None:
            continue
        artwork_url = item.get("artwork_url")
        if artwork_url:
            artwork_url = artwork_url.replace("large", "t300x300")

        duration = item.get("duration", 0)
        publisher_metadata = item.get("publisher_metadata", {}) or {}
        album_title = publisher_metadata.get("album_title", "")
        artist = publisher_metadata.get("artist", "")
        title = item.get("title", "")
        # 展示
        print(f"{idx}.")
        print(f"  封面: {artwork_url}")
        print(f"  所属专辑: {album_title}")
        print(f"  歌手: {artist}")
        print(f"  标题: {title}")
        print()

    selected_idx = input("请输入要下载的音频编号(idx): ")
    try:
        idx = int(selected_idx)
        if 1 <= idx <= len(collection):
            item = collection[idx - 1]
            artwork_url = item.get("artwork_url")
            if artwork_url:
                artwork_url = artwork_url.replace("large", "t300x300")
            duration = item.get("duration", 0)
            publisher_metadata = item.get("publisher_metadata", {}) or {}
            album_title = publisher_metadata.get("album_title", "")
            artist = publisher_metadata.get("artist", "")
            track_authorization = item.get("track_authorization")
            transcodings = item.get("media", {}).get("transcodings", [])
            description = item.get("description", "")
            music_id = str(item.get("id"))
            tags = item.get("tag_list", "").split(" ")
            genre = item.get("genre", "")
            title = item.get("title", "")
            music_item = MusicItem(
                music_id,
                title,
                author=artist,
                description=description,
                quality="",
                album=album_title,
                tags=tags,
                duration=duration,
                genre=genre,
                cover=artwork_url,
            )
            cover_ext = fetch_ext_from_url(artwork_url)
            cover_path = os.path.join(music_item.work_path, f"cover{cover_ext}")
            cover = download_cover(artwork_url, cover_path)
            if cover:
                music_item.set_cover(cover)
            audio = download_audio(
                track_authorization, transcodings, music_item.work_path
            )
            if audio:
                music_item.set_audio(audio)
            music_item.dump_self()
            print(f"音频下载完成: {music_item.work_path}")
        else:
            print("编号超出范围。")
    except ValueError:
        print("请输入有效的数字编号。")


if __name__ == "__main__":
    main()
