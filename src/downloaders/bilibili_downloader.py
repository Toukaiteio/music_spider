import requests
import os
import json
import time
import qrcode
import base64
from io import BytesIO
from Crypto.Cipher import PKCS1_OAEP
from Crypto.PublicKey import RSA
from Crypto.Hash import SHA256
import binascii
import pyquery
from functools import reduce
from hashlib import md5
import urllib.parse
from utils.data_type import MusicItem
from html import unescape
import re
bili_account = {
    "web_location":"333.1007",
}


general_headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "Referer": "https://www.bilibili.com/",
    "Origin": "https://www.bilibili.com",
}
def get_headers(with_cookie:bool = True):
    """
    Returns the headers for Bilibili API requests.
    """
    result = {
        "User-Agent": general_headers["User-Agent"],
        "Referer": general_headers["Referer"],
        "Origin": general_headers["Origin"],
    }
    if with_cookie:
        result["Cookie"] = bili_account["cookie"]
    return result
def check_is_update_needed(csrf:str):
    api = "https://passport.bilibili.com/x/passport-login/web/cookie/info"

    # 将cookie字符串解析为字典

    res = requests.get(api,headers=get_headers(),params={"csrf": csrf,"web_location": bili_account["web_location"]})
    if res.status_code == 200:
        data = res.json()
        print(data)
        return data.get("data", {}).get("refresh", False),data.get("data", {}).get("timestamp", 0)
    else:
        print(f"Error: {res.status_code} - {res.text}")

def try_get_login_qrcode():
    api = "https://passport.bilibili.com/x/passport-login/web/qrcode/generate"
    res = requests.get(api, headers=get_headers(False))
    if res.status_code == 200:
        data = res.json()
        print(data)
        return data
def str_to_qrcode_dataurl(data: str) -> str:
    """
    Converts a string to a QR code and returns it as a data:image/png;base64 URL.
    """
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
    """
    Generates a login QR code for Bilibili.
    """
    data = try_get_login_qrcode()
    if data and "qrcode_key" in data.get("data", {}):
        qrcode_key = data["data"]["qrcode_key"]
        qrcode_url = data["data"]["url"]
        # print(f"QR Code Key: {qrcode_key}")
        # print(f"QR Code URL: {qrcode_url}")
        print(f"QR Code: {str_to_qrcode_dataurl(qrcode_url)}")
        return qrcode_key, qrcode_url
    else:
        print("Failed to generate QR code.")
        return None, None

def get_login_status(qrcode_key:str):
    api = "https://passport.bilibili.com/x/passport-login/web/qrcode/poll"
    params = {"qrcode_key": qrcode_key}
    res = requests.get(api, headers=get_headers(False), params=params)
    if res.status_code == 200:
        data = res.json()
        print(data)
        return data.get("data", {}) , res.headers
    else:
        print(f"Error: {res.status_code} - {res.text}")
        return None
def qrcode_login():
    qrcode_key, qrcode_url = generate_login_qrcode()
    if not qrcode_key:
        return None
    print(f"Please scan the QR code at: {qrcode_url}")
    while True:
        res,headers = get_login_status(qrcode_key)
        if res:
            if res["code"] == 0:
                print("Login successful!")
                return res,headers
            elif res["code"] == 86038:
                print("QR code expired. Please scan again.")
                break
            else:
                print(f"Login failed. Code: {res['code']}, Message: {res['message']}")
                time.sleep(5)
        else:
            print("Failed to check login status. Please try again later.")
            time.sleep(5)
def parse_cookies_from_headers(headers):
    # headers: dict from requests, keys are lower-case
    cookies = {}
    set_cookie_headers = headers.get('Set-Cookie') or headers.get('set-cookie')
    if not set_cookie_headers:
        # requests may combine multiple set-cookie headers into a list
        set_cookie_headers = headers.get('set-cookie', [])
    if isinstance(set_cookie_headers, str):
        set_cookie_headers = [set_cookie_headers]
    for header in set_cookie_headers:
        for cookie in header.split(','):
            parts = cookie.split(';')[0].split('=', 1)
            if len(parts) == 2:
                k, v = parts
                k = k.strip()
                v = v.strip()
                if k in ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid']:
                    cookies[k] = v
    return cookies

def load_cookie():

    cookie_path = os.path.join(os.path.dirname(__file__), "cookie.json")
    if os.path.exists(cookie_path):
        with open(cookie_path, "r", encoding="utf-8") as f:
            cookies = json.load(f)
            bili_account["cookie"] = "; ".join([f"{k}={v}" for k, v in cookies.items()])
            if "bili_jct" in cookies:
                bili_account["csrf"] = cookies["bili_jct"]
            if "refresh_token" in cookies:
                bili_account["refresh_token"] = cookies["refresh_token"]
    else:
        res, headers = qrcode_login()
        if res and headers:
            cookies = parse_cookies_from_headers(headers)
            cookies["refresh_token"] = res.get("refresh_token","")
            if cookies:
                with open(cookie_path, "w", encoding="utf-8") as f:
                    json.dump(cookies, f, ensure_ascii=False, indent=2)
                bili_account["cookie"] = "; ".join([f"{k}={v}" for k, v in cookies.items()])
                if "bili_jct" in cookies:
                    bili_account["csrf"] = cookies["bili_jct"]
                if "refresh_token" in cookies:
                    bili_account["refresh_token"] = cookies["refresh_token"]
            else:
                print("Failed to extract cookies from headers.")
        else:
            print("QR code login failed.")
key = RSA.importKey('''\
-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDLgd2OAkcGVtoE3ThUREbio0Eg
Uc/prcajMKXvkCKFCWhJYJcLkcM2DKKcSeFpD/j6Boy538YXnR6VhcuUJOhH2x71
nzPjfdTcqMz7djHum0qSZA0AyCBDABUqCrfNgCiJ00Ra7GmRj+YCK1NJEuewlb40
JNrRuoEUXpabUzGB8QIDAQAB
-----END PUBLIC KEY-----''')
def getCorrespondPath(ts):
    cipher = PKCS1_OAEP.new(key, SHA256)
    encrypted = cipher.encrypt(f'refresh_{ts}'.encode())
    return binascii.b2a_hex(encrypted).decode()
load_cookie()
is_need_update, ts = check_is_update_needed(bili_account.get("csrf", ""))
if(is_need_update):
    correspond_path = getCorrespondPath(ts)
    data_url = f'https://www.bilibili.com/correspond/1/{correspond_path}'
    res = requests.get(data_url, headers=get_headers())
    refresh_token = bili_account.get("refresh_token", "")
    source = "main_web"
    if not refresh_token:
        print("No refresh token found. Please log in again.")

    if res.status_code == 200:
        doc = pyquery.PyQuery(res.text)
        refresh_csrf = doc("#1-name").text()
        print(f"Extracted name: {refresh_csrf}")
    else:
        print(f"Failed to fetch data_url: {res.status_code}")
        
    print(f"Refresh CSRF: {refresh_csrf}")
    print(f"Refresh Token: {refresh_token}")
    print(f"Source: {source}")
    print(f"CSRF: {bili_account.get('csrf', '')}")
    if(refresh_csrf and refresh_token and bili_account["csrf"] and source):
        api = "https://passport.bilibili.com/x/passport-login/web/cookie/refresh"
        params = {
            "refresh_token": refresh_token,
            "refresh_csrf": refresh_csrf,
            "source": source,
            "csrf": bili_account["csrf"]
        }
        res = requests.post(api, headers=get_headers(), params=params)
        if(res.status_code == 200):
            data = res.json()
            if(data["code"] == 0):
                print("Refresh successful!")
                cookies = parse_cookies_from_headers(res.headers)
                cookies["refresh_token"] = data["data"].get("refresh_token", "")
                bili_account["refresh_token"] = cookies["refresh_token"]
                if cookies:
                    with open(os.path.join(os.path.dirname(__file__), "cookie.json"), "w", encoding="utf-8") as f:
                        json.dump(cookies, f, ensure_ascii=False, indent=2)
                    bili_account["cookie"] = "; ".join([f"{k}={v}" for k, v in cookies.items()])
                    if "bili_jct" in cookies:
                        bili_account["csrf"] = cookies["bili_jct"]
                        bili_account["bili_jct"] = cookies["bili_jct"]
                    print("Cookies updated successfully.Refresh old cookies.")
                    api = "https://passport.bilibili.com/x/passport-login/web/confirm/refresh"
                    res = requests.post(api, headers=get_headers(),params={"csrf": bili_account["csrf"],"refresh_token":refresh_token})
                    if res.status_code == 200:
                        data = res.json()
                        if data["code"] == 0:
                            print("Refresh confirmed successfully.")
                        else:
                            print(f"Failed to confirm refresh: {data['message']}")
                    else:
                        print(f"Failed to confirm refresh: {res.status_code} - {res.text}")
                else:
                    print("No cookies found in the response.")
            else:
                print(f"Refresh failed: {data['message']}")
        else:
            print(f"Failed to refresh: {res.status_code} - {res.text}")

MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
]
def refresh_wbi():
    api = "https://api.bilibili.com/x/web-interface/nav"
    res = requests.get(api, headers=get_headers())
    if res.status_code == 200:
        data = res.json()
        if data["code"] == 0:
            wbi_data = data.get("data", {}).get("wbi_img", {})
            if wbi_data:
                bili_account["img_url"] = os.path.splitext(os.path.basename(wbi_data.get("img_url", "")))[0]
                bili_account["sub_url"] = os.path.splitext(os.path.basename(wbi_data.get("sub_url", "")))[0]
                print("WBI refreshed successfully.")
            else:
                print("No WBI data found in the response.")
        else:
            print(f"Failed to refresh WBI: {data['message']}")
    else:
        print(f"Failed to refresh WBI: {res.status_code} - {res.text}")

def encWbi(params: dict, img_key: str, sub_key: str):
    '为请求参数进行 wbi 签名'
    mixin_key = getMixinKey(img_key + sub_key)
    curr_time = round(time.time())
    params['wts'] = curr_time                                   # 添加 wts 字段
    params = dict(sorted(params.items()))                       # 按照 key 重排参数
    # 过滤 value 中的 "!'()*" 字符
    params = {
        k : ''.join(filter(lambda chr: chr not in "!'()*", str(v)))
        for k, v 
        in params.items()
    }
    query = urllib.parse.urlencode(params)                      # 序列化参数
    wbi_sign = md5((query + mixin_key).encode()).hexdigest()    # 计算 w_rid
    params['w_rid'] = wbi_sign
    return params
def getMixinKey(orig: str):
    '对 imgKey 和 subKey 进行字符顺序打乱编码'
    return reduce(lambda s, i: s + orig[i], MIXIN_KEY_ENC_TAB, '')[:32]
def get_buvid3():
    api = "https://api.bilibili.com/x/web-frontend/getbuvid"
    res = requests.get(api, headers=get_headers())
    buvid = res.json()['data']['buvid']
    if "buvid3" in bili_account:
        bili_account["cookie"].replace(bili_account["buvid3"], buvid)
        bili_account["buvid3"] = buvid
    else:
        bili_account["buvid3"] = buvid
        # 将 buvid3 放入 cookie 字符串
        cookie_items = [f"{k}={v}" for k, v in bili_account.items() if k in ["buvid3"]]
        if "cookie" in bili_account:
            bili_account["cookie"] += "; " + "; ".join(cookie_items)
        else:
            bili_account["cookie"] = "; ".join(cookie_items)
    return bili_account["buvid3"]
def search_tracks(query: str, limit: int = 20) -> list[dict]:
    api = "https://api.bilibili.com/x/web-interface/wbi/search/type"
    if (not bili_account.get("img_url") or not bili_account.get("sub_url")):
        refresh_wbi()
    if (not bili_account.get("buvid3")):
        get_buvid3()
    param = {
        "search_type": "video",
        "keyword": query,
    }
    param = encWbi(param, bili_account["img_url"], bili_account["sub_url"])
    res = requests.get(api, headers=get_headers(), params=param)
    if  res.status_code == 200:
        result =res.json()["data"]["result"]
        # print(result)
        return result
    else:
        return []
search_result = search_tracks("returns popin party")

def strip_html_tags(text):
    clean = re.compile('<.*?>')
    return unescape(re.sub(clean, '', text or ""))
def parse_duration(duration_str):
    """Convert 'm:ss' or 'h:mm:ss' to seconds as int."""
    parts = duration_str.split(':')
    parts = [int(p) for p in parts]
    if len(parts) == 3:
        h, m, s = parts
        return h * 3600 + m * 60 + s
    elif len(parts) == 2:
        m, s = parts
        return m * 60 + s
    elif len(parts) == 1:
        return parts[0]
    return 0



def get_video_info(aid:str = None,bvid:str = None, tags:list = []):
    api = "https://api.bilibili.com/x/web-interface/wbi/view"
    if(aid):
        params = {aid : aid}
    if(bvid):
        params = {"bvid": bvid}
    params = encWbi(params, bili_account["img_url"], bili_account["sub_url"])
    res = requests.get(api, headers=get_headers(), params=params)
    if  res.status_code == 200:
        data = res.json()
        if(data["code"] == 0):
            track = data["data"]
            if track:
                music_item = MusicItem(
                    music_id = str(track.get("bvid")) if track.get("bvid") else str(track.get("aid")),
                    title = track.get("title", ""),
                    author = track.get("owner",{}).get("name", ""),
                    description = track.get("desc", ""),
                    album = track.get("typename", ""),
                    tags = tags,
                    duration = track.get("duration", 0),
                    genre=track.get("typename", ""),
                    cover = track.get("pic", "")
                )
                cid = track.get("cid",0)
                # print(res.text)
                return music_item,cid
            else:
                print("No video data found.")
                return None

results = []
for track in search_result:
    # print(f"Title: {track['title']}, BVID: {track['bvid']}, Author: {track['author']}")
    results.append(track['bvid'])

def get_audio_link(bvid:str,cid:str):
    api = "https://api.bilibili.com/x/player/wbi/playurl"
    params = {
        # "bvid": bvid,
        "bvid":"BV1agzJYLEP6",
        # "cid": cid,
        "cid": "27104051642",
        "qn": 112,
        "fnval": "272",
    }
    params = encWbi(params, bili_account["img_url"], bili_account["sub_url"])
    res = requests.get(api, headers=get_headers(), params=params)
    data = res.json()
    if data["code"] == 0:
        audio_links = [data["data"]["dash"].get("flac",{}).get("audio",{})] if data["data"]["dash"].get("flac",{}) else data["data"]["dash"].get("audio", [])
        print(f"Audio URL: {audio_links}")
        return audio_links
    else:
        print(f"Failed to get audio link: {data['message']}")
        return None

music_item,video_cid = get_video_info(bvid=results[0])
# print(video_cid)
audio_links = get_audio_link(results[0],video_cid)
def try_download_audio(audio_links):
    for audio in audio_links:
        base_url = audio.get("baseUrl", "")
        backup_url = audio.get("backupUrl", [])
        file_type = "flac" if audio.get("codecs","") == "fLaC" else "mp4"
        if base_url:
            print(f"Downloading from base URL: {base_url}")
            response = requests.get(base_url, headers=get_headers())
            if response.status_code == 200:
                with open(f"{music_item.music_id}.{file_type}", "wb") as f:
                    f.write(response.content)
                print("Download successful!")
                return True
            else:
                print(f"Failed to download from base URL: {response.status_code}")
        if backup_url:
            for url in backup_url:
                print(f"Downloading from backup URL: {url}")
                response = requests.get(url, headers=get_headers())
                if response.status_code == 200:
                    with open(f"{music_item.music_id}.{file_type}", "wb") as f:
                        f.write(response.content)
                    print("Download successful!")
                    return True
                else:
                    print(f"Failed to download from backup URL: {response.status_code}")
def fetch_ext_from_url(url):
    path = url.split("?", 1)[0]
    ext = os.path.splitext(path)[1]
    if ext:
        return ext.lower()
    else:
        return ".bin"

def try_download_cover(cover_url:str):
    if cover_url:
        response = requests.get(cover_url, headers=get_headers())
        if response.status_code == 200:
            with open(f"{music_item.music_id}_cover.{fetch_ext_from_url(cover_url)}", "wb") as f:
                f.write(response.content)
            print("Cover download successful!")
            return True
        else:
            print(f"Failed to download cover: {response.status_code}")
    return False
try_download_cover(music_item.data.preview_cover)