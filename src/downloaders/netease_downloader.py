import requests
import os
import json
import time
import qrcode
import base64
import hashlib
from io import BytesIO
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
import urllib.parse
from utils.data_type import MusicItem
import asyncio
import functools

# --- NetEase Crypto Utilities ---
class NeteaseCrypto:
    AES_KEY = b'e82ckenh8dichen8'

    @staticmethod
    def aes_encrypt(text, key):
        cipher = AES.new(key, AES.MODE_ECB)
        padded_text = pad(text.encode('utf-8'), 16)
        encrypted = cipher.encrypt(padded_text)
        return encrypted.hex().upper()

    @staticmethod
    def generate_eapi_params(url_path, data):
        # Use separators=(',', ':') to match JavaScript's JSON.stringify() spacing, 
        # which is required for correct NetEase EAPI digest generation.
        text = json.dumps(data, separators=(',', ':'))
        url_path = url_path.replace('/eapi/', '/api/')
        message = f"nobody{url_path}use{text}md5forencrypt"
        digest = hashlib.md5(message.encode('utf-8')).hexdigest()
        params_data = f"{url_path}-36cd479b6b5-{text}-36cd479b6b5-{digest}"
        return NeteaseCrypto.aes_encrypt(params_data, NeteaseCrypto.AES_KEY)

# --- Global State ---
netease_account = {
    "cookie": "",
}

general_headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/2.10.2.200154",
    "Referer": "https://music.163.com/",
    "Origin": "https://music.163.com",
    "Content-Type": "application/x-www-form-urlencoded"
}

def get_headers(with_cookie: bool = True):
    result = general_headers.copy()
    if with_cookie and netease_account.get("cookie"):
        result["Cookie"] = netease_account["cookie"]
    return result

def post_eapi_request(url, data):
    url_obj = urllib.parse.urlparse(url)
    params = NeteaseCrypto.generate_eapi_params(url_obj.path, data)
    post_data = urllib.parse.urlencode({"params": params})
    
    headers = get_headers()
    headers["Content-Length"] = str(len(post_data))
    
    res = requests.post(url, data=post_data, headers=headers)
    if res.status_code == 200:
        return res.json(), res
    else:
        print(f"NetEase API Error: {res.status_code} - {res.text}")
        return None, res

# --- Auth ---
def str_to_qrcode_dataurl(data: str) -> str:
    qr = qrcode.QRCode(box_size=10, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    img_bytes = buffer.getvalue()
    base64_str = base64.b64encode(img_bytes).decode("utf-8")
    return f"data:image/png;base64,{base64_str}"

def generate_login_qrcode():
    url = "https://interface3.music.163.com/eapi/login/qrcode/unikey"
    data = {
        "type": 1,
        "header": {
            "os": "pc",
            "appver": "2.10.2.200154",
            "osver": "Microsoft Windows 10",
            "deviceId": "pyncm!"
        }
    }
    res_data, _ = post_eapi_request(url, data)
    if res_data and res_data.get("code") == 200:
        unikey = res_data["unikey"]
        qr_url = f"https://music.163.com/login?codekey={unikey}"
        return unikey, qr_url
    return None, None

def get_login_status(unikey: str):
    url = "https://interface3.music.163.com/eapi/login/qrcode/client/login"
    data = {
        "key": unikey,
        "type": 1,
        "header": {
            "os": "pc",
            "appver": "2.10.2.200154",
            "osver": "Microsoft Windows 10",
            "deviceId": "pyncm!"
        }
    }
    return post_eapi_request(url, data)


from utils.persistence import persistence

def load_cookie():
    cookies = persistence.get("netease", "cookies")
    if cookies:
        netease_account["cookie"] = "; ".join([f"{k}={v}" for k, v in cookies.items()])
    else:
        print("No NetEase cookie found. Please log in.")

def save_cookies(cookies):
    persistence.set("netease", "cookies", cookies)
    netease_account["cookie"] = "; ".join([f"{k}={v}" for k, v in cookies.items()])

# --- Search ---
async def search_tracks_async(query: str, limit: int = 20) -> list[dict]:
    load_cookie() # Ensure latest cookies in worker process
    loop = asyncio.get_event_loop()
    url = 'https://interface3.music.163.com/eapi/cloudsearch/pc'
    data = {
        "s": query,
        "type": 1, # 1 = single track
        "limit": limit,
        "offset": 0,
        "header": {
            "os": "pc",
            "appver": "2.10.2.200154",
            "osver": "Microsoft Windows 10",
            "deviceId": "pyncm!"
        }
    }
    
    res_data, _ = await loop.run_in_executor(None, post_eapi_request, url, data)
    if not res_data or res_data.get("code") != 200:
        return []
    
    songs = res_data.get("result", {}).get("songs", [])
    processed_tracks = []
    for song in songs:
        processed_tracks.append({
            "music_id": f"netease_{song['id']}",
            "id": f"netease_{song['id']}",
            "title": song.get("name", "Unknown"),
            "artist": ", ".join([a["name"] for a in song.get("ar", [])]),
            "artwork_url": song.get("al", {}).get("picUrl"),
            "album": song.get("al", {}).get("name"),
            "duration": int(song.get("dt", 0) / 1000),
            "source": "netease"
        })
    return processed_tracks

# --- Download ---
def _save_file_with_progress(url, filename, track_id, progress_callback, file_type):
    try:
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        resp = requests.get(url, stream=True, headers=get_headers(), timeout=30)
        resp.raise_for_status()
        total_size = int(resp.headers.get("content-length", 0))
        current_size = 0
        with open(filename, "wb") as f:
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
        if progress_callback:
            progress_callback(
                track_id=track_id,
                current_size=current_size,
                total_size=total_size,
                file_type=file_type,
                status="completed_file"
            )
        return True
    except Exception as e:
        print(f"Download Error: {e}")
        return False

def _get_audio_options_netease(track_id: str, level: str = "standard"):
    url = 'https://interface3.music.163.com/eapi/song/enhance/player/url/v1'
    pure_id = track_id.replace("netease_", "")
    data = {
        "ids": [int(pure_id)],
        "level": level,
        "encodeType": "flac", # PC Client eapi uses flac as default encodeType
        "header": {
            "os": "pc",
            "appver": "2.10.2.200154",
            "osver": "Microsoft Windows 10",
            "deviceId": "pyncm!"
        }
    }
    res_data, _ = post_eapi_request(url, data)
    
    if res_data and res_data.get("code") == 200:
        return res_data.get("data", [])
    return []

def _get_lyrics_netease(track_id: str):
    url = 'https://interface3.music.163.com/api/song/lyric'
    pure_id = track_id.replace("netease_", "")
    params = {
        'id': pure_id,
        'cp': 'false', 'tv': '0', 'lv': '0', 'rv': '0', 'kv': '0', 'yv': '0', 'ytv': '0', 'yrv': '0'
    }
    headers = get_headers()
    res = requests.post(url, data=params, headers=headers)
    if res.status_code == 200:
        data = res.json()
        return data.get("lrc", {}).get("lyric", "")
    return ""

async def download_track(track_info: dict, base_download_path: str = "./downloads", progress_callback: callable = None) -> MusicItem | None:
    load_cookie() # Ensure latest cookies in worker process
    track_id = track_info.get("music_id")
    if not track_id:
        return None
    
    loop = asyncio.get_event_loop()
    
    # Create MusicItem
    music_item = MusicItem(
        music_id=track_id,
        title=track_info.get("title", "Unknown"),
        artist=track_info.get("artist", "Unknown"),
        album=track_info.get("album", ""),
        artwork_url=track_info.get("artwork_url", ""),
        duration=track_info.get("duration", 0),
        source="netease"
    )
    
    # Download Cover
    if music_item.artwork_url:
        ext = os.path.splitext(urllib.parse.urlparse(music_item.artwork_url).path)[1] or ".jpg"
        cover_filename = os.path.join(music_item.work_path, f"cover{ext}")
        success = await loop.run_in_executor(None, _save_file_with_progress, music_item.artwork_url, cover_filename, track_id, progress_callback, "cover")
        if success:
            music_item.set_cover(os.path.join(music_item.read_path, f"cover{ext}"))

    # Download Audio (Try multiple qualities)
    downloaded_audio_path = None
    qualities = ["lossless", "exhigh", "higher", "standard"]
    
    for q in qualities:
        audio_options = await loop.run_in_executor(None, _get_audio_options_netease, track_id, q)
        if audio_options:
            option = audio_options[0]
            audio_url = option.get("url")
            if audio_url:
                # Better extension detection
                parsed_url = urllib.parse.urlparse(audio_url)
                ext = os.path.splitext(parsed_url.path)[1]
                if not ext:
                    ext = ".flac" if q in ["lossless", "hires"] else ".mp3"
                
                audio_filename = os.path.join(music_item.work_path, f"audio{ext}")
                success = await loop.run_in_executor(None, _save_file_with_progress, audio_url, audio_filename, track_id, progress_callback, "audio")
                if success:
                    downloaded_audio_path = os.path.join(music_item.read_path, f"audio{ext}")
                    music_item.set_audio(downloaded_audio_path)
                    music_item.lossless = option.get("level") in ["lossless", "hires"]
                    break # Success!
    
    if not downloaded_audio_path:
        # Final failure report after all quality levels failed
        print(f"Failed to download audio for NetEase track {track_id} (All quality levels failed or returned no URL).")
        if progress_callback:
            progress_callback(track_id=track_id, current_size=0, total_size=0, file_type="track", status="error", error_message="No accessible audio URL found for any quality level.")
        return None

    # Get Lyrics
    lyrics = await loop.run_in_executor(None, _get_lyrics_netease, track_id)
    if lyrics:
        music_item.lyrics = lyrics
    
    # Save Metadata (Only if audio download succeeded)
    await loop.run_in_executor(None, music_item.dump_self)
    
    if progress_callback:
        progress_callback(track_id=track_id, current_size=1, total_size=1, file_type="track", status="completed_track")
    
    return music_item

def get_source_info():
    return {
        "require_auth_to_enable": False,
        "auth_required_message": "NetEase Source 需要认证后才能启用。"
    }

# --- Auth Interface ---
def get_auth_state():
    return {
        "source": "netease",
        "is_logged_in": bool(netease_account.get("cookie")),
        "login_type": "qrcode",
        "user_info": {}
    }

def generate_auth_action():
    unikey, qr_url = generate_login_qrcode()
    if unikey:
        return {
            "type": "qrcode",
            "qrcode_key": unikey,
            "qrcode_url": qr_url,
            "qrcode_base64": str_to_qrcode_dataurl(qr_url)
        }
    return {"error": "Failed to generate QR code"}

def poll_auth_status(params):
    unikey = params.get("qrcode_key")
    if not unikey: return {"error": "Missing qrcode_key"}
    
    res_data, res = get_login_status(unikey)
    if res_data:
        code = res_data.get("code")
        if code == 803: # Success
            cookies = requests.utils.dict_from_cookiejar(res.cookies)
            save_cookies(cookies)
            return {"status": "success", "message": "Login successful"}
        elif code == 800: return {"status": "expired", "message": "QR code expired"}
        elif code == 801: return {"status": "waiting", "message": "Waiting for scan"}
        elif code == 802: return {"status": "scanned", "message": "Waiting for confirmation"}
        else: return {"status": "failed", "message": res_data.get("message")}
    return {"error": "Failed to check status"}

def login_with_params(params):
    return {"error": "Manual login not supported for NetEase currently. Use QR code."}

def logout():
    persistence.set("netease", "cookies", None)
    netease_account["cookie"] = ""
    return {"status": "success", "message": "Logged out"}

# Load cookie on start
load_cookie()
