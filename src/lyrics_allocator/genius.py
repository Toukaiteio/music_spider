import lyricsgenius
import os
import requests
from Crypto.Cipher import AES
import base64
AES_KEY = "A48BA96016DDF15AB43734480D1C84EF75F6F2CDA70627365367BC289999CC3BFDCC4C15DAE289D88B6660029018ECDE"
GENIUS_ACCESS_TOKEN = "DI_dtCNQd0ycAPKAxJx6komcQQUsPmI_Fg_ASHueTLRy-Dg7mvaiBFYeBhrbSPj-"
genius = lyricsgenius.Genius(GENIUS_ACCESS_TOKEN)
def encrypt_path(path):
    data = path.encode('utf-8')
    key_len = 64  # 32 bytes hex
    iv_len = 32   # 16 bytes hex
    aes_key_full = AES_KEY * 3  # 保证足够长

    for i in range(3):
        key_start = (i * (key_len + iv_len)) % len(aes_key_full)
        key = bytes.fromhex(aes_key_full[key_start:key_start + key_len])
        iv_start = (key_start + key_len) % len(aes_key_full)
        iv = bytes.fromhex(aes_key_full[iv_start:iv_start + iv_len])
        cipher = AES.new(key, AES.MODE_CBC, iv)
        # 只在第一次做PKCS7 padding
        if i == 0:
            pad_len = 16 - (len(data) % 16)
            data = data + bytes([pad_len] * pad_len)
        data = cipher.encrypt(data)
    return base64.urlsafe_b64encode(data).decode('utf-8')
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