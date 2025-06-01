import lyricsgenius
import os
import requests
from config import GENIUS_ACCESS_TOKEN
from utils.helpers import encrypt_path
genius = lyricsgenius.Genius(GENIUS_ACCESS_TOKEN)
def get_song_info(title, artist=None):
    """
    根据曲名和可选的歌手名搜索歌曲，并返回歌曲元信息字典。
    返回值示例:
    {
        "title": 歌曲标题,
        "artist": 歌手名,
        "album": 专辑名,
        "description": 歌曲描述,
        "lyrics": 歌词,
        "song_url": 歌曲页面URL
    }
    """
    if artist:
        song = genius.search_song(title, artist)
    else:
        song = genius.search_song(title)
    if song is None:
        return None
    song = song.to_dict()
    header_image_url = song.get("header_image_url", "")
    preview_cover = song.get("header_image_thumbnail_url", "")
    if not preview_cover:
        preview_cover = header_image_url
    if header_image_url:
        filename = os.path.basename(header_image_url)
        temp_uploads_dir = "./temp_uploads"
        os.makedirs(temp_uploads_dir, exist_ok=True)
        file_path = os.path.join(temp_uploads_dir, filename)
        try:
            response = requests.get(header_image_url, timeout=10)
            if response.status_code == 200:
                with open(file_path, "wb") as f:
                    f.write(response.content)
        except Exception:
            pass
    return {
        "title": song.get("title", ""),              # 歌曲标题
        "artist": song.get("artist", ""),            # 歌手名
        "album": song.get("album", ""),              # 专辑名
        "description": song.get("description", ""),  # 歌曲描述
        "lyrics": song.get("lyrics", ""),            # 歌词
          # 歌曲页面URL
        "artwork": encrypt_path(os.path.join(temp_uploads_dir, filename)) if header_image_url else None,  # 封面图片路径（加密）
        "online_artwork": preview_cover if preview_cover else None  # 在线封面图片URL
    }