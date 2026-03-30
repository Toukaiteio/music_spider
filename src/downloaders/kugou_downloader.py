import requests
import os
import json
import time
import qrcode
import base64
import hashlib
from io import BytesIO
import urllib.parse
from utils.data_type import MusicItem
import asyncio
import functools
import zlib

# --- Kugou Crypto Utilities ---
class KugouCrypto:
    ANDROID_SALT = "OIlwieks28dk2k092lksi2UIkp"
    TRACKER_SALT = "57ae12eb6890223e355ccfcb74edf70d"
    WEB_SALT = "NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt"

    @staticmethod
    def signature_android_params(params, data=""):
        sorted_keys = sorted(params.keys())
        params_str = "".join([f"{k}={json.dumps(params[k], separators=(',', ':')) if isinstance(params[k], (dict, list)) else params[k]}" for k in sorted_keys])
        message = f"{KugouCrypto.ANDROID_SALT}{params_str}{data}{KugouCrypto.ANDROID_SALT}"
        return hashlib.md5(message.encode('utf-8')).hexdigest().upper()

    @staticmethod
    def signature_web_params(params):
        params_list = [f"{k}={v}" for k, v in params.items()]
        params_list.sort()
        params_str = "".join(params_list)
        message = f"{KugouCrypto.WEB_SALT}{params_str}{KugouCrypto.WEB_SALT}"
        return hashlib.md5(message.encode('utf-8')).hexdigest()

    @staticmethod
    def sign_key(hash_val, mid, userid, appid):
        message = f"{hash_val.lower()}{KugouCrypto.TRACKER_SALT}{appid}{mid}{userid}"
        return hashlib.md5(message.encode('utf-8')).hexdigest()

# --- Global State ---
kugou_account = {
    "cookie": "",
    "dfid": "-",
    "mid": "dfid_mid_placeholder", # Will be md5 of dfid
    "userid": 0,
    "token": ""
}

def init_kugou_state():
    dfid = kugou_account.get("dfid", "-")
    kugou_account["mid"] = hashlib.md5(dfid.encode()).hexdigest()
    kugou_account["uuid"] = hashlib.md5((dfid + kugou_account["mid"]).encode()).hexdigest()

general_headers = {
    "User-Agent": "Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi",
    "Referer": "https://www.kugou.com/",
}

def get_headers():
    headers = general_headers.copy()
    headers.update({
        "dfid": kugou_account["dfid"],
        "mid": kugou_account["mid"],
        "clienttime": str(int(time.time()))
    })
    if kugou_account.get("cookie"):
        headers["Cookie"] = kugou_account["cookie"]
    return headers

def create_kugou_request(url, params=None, data=None, method="GET", encrypt_type="android", baseURL=None):
    init_kugou_state()
    full_params = {
        "dfid": kugou_account["dfid"],
        "mid": kugou_account["mid"],
        "uuid": kugou_account.get("uuid", ""),
        "appid": 1005,
        "clientver": 12029,
        "userid": kugou_account.get("userid", 0),
        "clienttime": int(time.time())
    }
    if kugou_account.get("token"):
        full_params["token"] = kugou_account["token"]
    
    if params:
        full_params.update(params)
    
    if not full_params.get("signature"):
        if encrypt_type == "web":
            full_params["signature"] = KugouCrypto.signature_web_params(full_params)
        elif encrypt_type == "android":
            data_str = json.dumps(data, separators=(',', ':')) if data else ""
            full_params["signature"] = KugouCrypto.signature_android_params(full_params, data_str)
    
    headers = get_headers()
    headers["clienttime"] = str(full_params["clienttime"])
    
    if not baseURL:
        baseURL = "https://gateway.kugou.com"
    
    full_url = urllib.parse.urljoin(baseURL, url)

    if method.upper() == "GET":
        res = requests.get(full_url, params=full_params, headers=headers)
    else:
        res = requests.post(full_url, params=full_params, data=data, headers=headers)
    
    if res.status_code == 200:
        try:
            return res.json(), res
        except:
            return res.text, res
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
    url = "/v2/qrcode"
    params = {
        "appid": 1001,
        "type": 1,
        "plat": 4,
        "qrcode_txt": f"https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=1005&",
        "srcappid": 2919
    }
    res_data, _ = create_kugou_request(url, params=params, baseURL="https://login-user.kugou.com", encrypt_type="web")
    if res_data and res_data.get("status") == 1:
        qrcode_key = res_data["data"]["qrcode"]
        qr_url = f"https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode={qrcode_key}"
        return qrcode_key, qr_url
    return None, None

def get_login_status(qrcode_key: str):
    url = "/v2/get_userinfo_qrcode"
    params = {
        "plat": 4,
        "appid": 1005,
        "srcappid": 2919,
        "qrcode": qrcode_key
    }
    return create_kugou_request(url, params=params, baseURL="https://login-user.kugou.com", encrypt_type="web")

from utils.persistence import persistence

def load_cookie():
    data = persistence.get("kugou", "auth_info")
    if data:
        kugou_account["cookie"] = data.get("cookie", "")
        kugou_account["userid"] = data.get("userid", 0)
        kugou_account["token"] = data.get("token", "")
        if data.get("dfid"):
            kugou_account["dfid"] = data["dfid"]
    init_kugou_state()

def save_cookies(auth_info):
    persistence.set("kugou", "auth_info", auth_info)
    kugou_account.update(auth_info)

# --- Search ---
async def search_tracks_async(query: str, limit: int = 20) -> list[dict]:
    load_cookie()
    loop = asyncio.get_event_loop()
    url = 'https://complexsearch.kugou.com/v3/search/song'
    params = {
        "keyword": query,
        "page": 1,
        "pagesize": limit,
        "platform": "AndroidFilter",
        "iscorrection": 1,
        "albumhide": 0,
        "nocollect": 0
    }
    
    res_data, _ = await loop.run_in_executor(None, create_kugou_request, url, params)
    if not res_data or res_data.get("status") != 1:
        return []
    
    songs = res_data.get("data", {}).get("info", []) or res_data.get("data", {}).get("lists", [])
    processed_tracks = []
    for song in songs:
        hash_val = song.get("FileHash") or song.get("hash")
        if not hash_val: continue
        
        artwork_url = song.get("Image") or song.get("album_img") or song.get("trans_param", {}).get("union_cover")
        if artwork_url and "{size}" in artwork_url:
            artwork_url = artwork_url.replace("{size}", "400")
            
        processed_tracks.append({
            "music_id": f"kugou_{hash_val}",
            "id": f"kugou_{hash_val}",
            "title": song.get("SongName") or song.get("songname") or song.get("filename"),
            "artist": song.get("SingerName") or song.get("singername"),
            "artwork_url": artwork_url,
            "album": song.get("AlbumName") or song.get("album_name"),
            "duration": int(song.get("duration") or 0),
            "source": "kugou",
            "_hash": hash_val,
            "_album_id": song.get("AlbumID") or song.get("album_id")
        })
    return processed_tracks

# --- Download ---
def _get_audio_options_kugou(hash_val, album_id=0):
    url = 'https://trackercdn.kugou.com/v5/url'
    mid = kugou_account["mid"]
    userid = kugou_account["userid"]
    appid = 1005
    
    params = {
        "album_id": int(album_id or 0),
        "area_code": 1,
        "hash": hash_val.lower(),
        "ssa_flag": "is_fromtrack",
        "version": 11040,
        "page_id": 151369488,
        "quality": 128,
        "behavior": "play",
        "pid": 2,
        "cmd": 26,
        "pidversion": 3001,
        "IsFreePart": 0,
        "ppage_id": '463467626,350369493,788954147',
        "cdnBackup": 1,
    }
    # Some Kugou APIs need a 'key' param which is sign_key
    params["key"] = KugouCrypto.sign_key(hash_val, mid, userid, appid)
    
    # This request usually doesn't need full signature if notSign is true in JS
    res_data, _ = create_kugou_request(url, params)
    if res_data and res_data.get("status") == 1:
        urls = res_data.get("url", [])
        if urls:
            return [{"url": urls[0], "backup_url": res_data.get("backupUrl", [None])[0]}]
    return []

def decode_krc(val):
    if not val: return ""
    try:
        data = base64.b64decode(val)
        en_key = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105]
        krc_bytes = bytearray(data[4:])
        for i in range(len(krc_bytes)):
            krc_bytes[i] ^= en_key[i % len(en_key)]
        return zlib.decompress(krc_bytes).decode('utf-8')
    except Exception as e:
        print(f"KRC Decode Error: {e}")
        return ""

def _get_lyrics_kugou(hash_val, title):
    url = 'https://lyrics.kugou.com/v1/search'
    params = {
        "hash": hash_val,
        "keyword": title,
        "lrctxt": 1
    }
    res_data, _ = create_kugou_request(url, params, baseURL="https://lyrics.kugou.com")
    if res_data and res_data.get("status") == 1:
        candidates = res_data.get("candidates", [])
        if candidates:
            best = candidates[0]
            dl_url = "https://lyrics.kugou.com/download"
            dl_params = {
                "ver": 1,
                "client": "android",
                "id": best["id"],
                "accesskey": best["accesskey"],
                "fmt": "lrc",
                "charset": "utf8"
            }
            lyrics_data, _ = create_kugou_request(dl_url, dl_params, baseURL="https://lyrics.kugou.com")
            if lyrics_data and lyrics_data.get("content"):
                return base64.b64decode(lyrics_data["content"]).decode('utf-8')
    return ""

# --- Crawler Parsers ---
async def parse_playlist(target: str) -> tuple[str, list[dict]]:
    import httpx, re
    gid = None
    if "t1.kugou.com" in target or "zlist.html" in target or "songlist" in target:
        async with httpx.AsyncClient(follow_redirects=False) as client:
            resp = await client.get(target)
            loc = resp.headers.get("location") or target
            match = re.search(r'global_collection_id=([^&?#/]+)', loc)
            if match:
                gid = match.group(1)
            else:
                match = re.search(r'gcid_([a-zA-Z0-9]+)', loc)
                if match: gid = match.group(1)
    gid = gid or target
    
    params = {"area_code": 1, "begin_idx": 0, "plat": 1, "mode": 1, "pagesize": 300, "global_collection_id": gid}
    loop = asyncio.get_event_loop()
    res, _ = await loop.run_in_executor(None, create_kugou_request, "/pubsongs/v2/get_other_list_file_nofilt", params, None, "GET", "android", "https://mobilecdnbj.kugou.com")
    
    if not res or res.get('status') != 1: raise Exception("Kugou playlist API returned error")
        
    songs = res.get('data', {}).get('info', [])
    playlist_name = "Kugou Playlist" # Endpoint does not directly return playlist name
    results = []
    for song in songs:
        hash_val = song.get("hash")
        if not hash_val: continue
        title_full = song.get("filename", "")
        artist = "Unknown"
        title = title_full
        if " - " in title_full:
            parts = title_full.split(" - ", 1)
            artist = parts[0]
            title = parts[1]
        results.append({
            "music_id": f"kugou_{hash_val}",
            "title": title,
            "artist": artist,
            "duration": song.get("duration", 0),
            "_hash": hash_val,
            "_album_id": song.get("album_id") or song.get("AlbumID")
        })
    return playlist_name, results

async def parse_artist(target: str) -> tuple[str, list[dict]]:
    raise Exception("Kugou artist crawler not implemented")

async def parse_album(target: str) -> tuple[str, list[dict]]:
    raise Exception("Kugou album crawler not implemented")

async def download_track(track_info: dict, base_download_path: str = "./downloads", progress_callback: callable = None) -> MusicItem | None:
    load_cookie()
    track_id = track_info.get("music_id")
    hash_val = track_info.get("_hash")
    album_id = track_info.get("_album_id", 0)
    
    if not hash_val: return None
    
    loop = asyncio.get_event_loop()
    music_item = MusicItem(
        music_id=track_id,
        title=track_info.get("title", "Unknown"),
        artist=track_info.get("artist", "Unknown"),
        album=track_info.get("album", ""),
        artwork_url=track_info.get("artwork_url", ""),
        duration=track_info.get("duration", 0),
        source="kugou"
    )
    
    # Download Cover
    if music_item.artwork_url:
        ext = ".jpg"
        cover_filename = os.path.join(music_item.work_path, f"cover{ext}")
        from netease_downloader import _save_file_with_progress # Reuse this
        success = await loop.run_in_executor(None, _save_file_with_progress, music_item.artwork_url, cover_filename, track_id, progress_callback, "cover")
        if success:
            music_item.set_cover(os.path.join(music_item.read_path, f"cover{ext}"))

    # Download Audio
    downloaded_audio_path = None
    
    desired_quality = track_info.get("desired_quality", "high")
    existing_item = MusicItem.load_from_json(track_id)
    if existing_item and existing_item.lossless and desired_quality != "lossless":
        print(f"Already have lossless quality for {track_id}, skipping redundant lower quality download.")
        return existing_item

    audio_options = await loop.run_in_executor(None, _get_audio_options_kugou, hash_val, album_id)
    if audio_options:
        audio_url = audio_options[0].get("url")
        if audio_url:
            parsed_url = urllib.parse.urlparse(audio_url)
            ext = os.path.splitext(parsed_url.path)[1] or ".mp3"
            audio_filename = os.path.join(music_item.work_path, f"audio{ext}")
            from netease_downloader import _save_file_with_progress
            success = await loop.run_in_executor(None, _save_file_with_progress, audio_url, audio_filename, track_id, progress_callback, "audio")
            if success:
                downloaded_audio_path = os.path.join(music_item.read_path, f"audio{ext}")
                is_lossless = ext == ".flac"
                
                if existing_item and existing_item.audio and existing_item.audio != downloaded_audio_path:
                    if not existing_item.lossless and is_lossless:
                        music_item.set_audio(downloaded_audio_path)
                        music_item.set_audio(existing_item.audio, is_backup=True)
                        music_item.lossless = True
                    else:
                        music_item.set_audio(downloaded_audio_path)
                        music_item.lossless = is_lossless
                else:
                    music_item.set_audio(downloaded_audio_path)
                    music_item.lossless = is_lossless
                    if existing_item and existing_item.backup_audio:
                        music_item.set_audio(existing_item.backup_audio, is_backup=True)
    
    if not downloaded_audio_path:
        print(f"Failed to download audio for Kugou track: {track_id}")
        if progress_callback:
            progress_callback(track_id=track_id, current_size=0, total_size=0, file_type="track", status="error", error_message="No accessible audio URL found.")
        return None

    # Get Lyrics
    lyrics = await loop.run_in_executor(None, _get_lyrics_kugou, hash_val, music_item.title)
    if lyrics:
        music_item.lyrics = lyrics
        
    await loop.run_in_executor(None, music_item.dump_self)
    
    if progress_callback:
        progress_callback(track_id=track_id, current_size=1, total_size=1, file_type="track", status="completed_track")
    
    return music_item

def get_source_info():
    return {
        "require_auth_to_enable": True,
        "auth_required_message": "Kugou Source 需要认证后才能启用。"
    }

# --- Auth Interface ---
def get_auth_state():
    return {
        "source": "kugou",
        "is_logged_in": bool(kugou_account.get("cookie")),
        "login_type": "qrcode",
        "user_info": {}
    }

def generate_auth_action():
    qrcode_key, qr_url = generate_login_qrcode()
    if qrcode_key:
        return {
            "type": "qrcode",
            "qrcode_key": qrcode_key,
            "qrcode_url": qr_url,
            "qrcode_base64": str_to_qrcode_dataurl(qr_url)
        }
    return {"error": "Failed to generate QR code"}

def poll_auth_status(params):
    qrcode_key = params.get("qrcode_key")
    if not qrcode_key: return {"error": "Missing qrcode_key"}
    
    res_data, res = get_login_status(qrcode_key)
    if res_data:
        data = res_data.get("data", {})
        status = data.get("status")
        if status == 4: # Success
            # Get all cookies from requests Response
            cookies_dict = requests.utils.dict_from_cookiejar(res.cookies)
            cookie_str = "; ".join([f"{k}={v}" for k, v in cookies_dict.items()])
            
            auth_info = {
                "cookie": cookie_str,
                "userid": data.get("userid", 0),
                "token": data.get("token", ""),
                "dfid": kugou_account["dfid"]
            }
            save_cookies(auth_info)
            return {"status": "success", "message": "Login successful"}
        elif status == 0: return {"status": "expired", "message": "QR code expired"}
        elif status == 2: return {"status": "scanned", "message": "Waiting for confirmation"}
        else: return {"status": "waiting", "message": "Waiting for scan"}
    return {"error": "Failed to check status"}

def login_with_params(params):
    return {"error": "Manual login not supported for Kugou currently. Use QR code."}

def logout():
    persistence.set("kugou", "auth_info", None)
    kugou_account["cookie"] = ""
    kugou_account["token"] = ""
    kugou_account["userid"] = 0
    return {"status": "success", "message": "Logged out"}

# Load cookie on start
load_cookie()
