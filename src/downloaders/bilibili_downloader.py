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
import asyncio
import functools  # Added for functools.partial
is_refreshed_cookie = False
bili_account = {
    "web_location": "333.1007",
}


general_headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "Referer": "https://www.bilibili.com/",
    "Origin": "https://www.bilibili.com",
}


def get_headers(with_cookie: bool = True):
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


def check_is_update_needed(csrf: str):
    api = "https://passport.bilibili.com/x/passport-login/web/cookie/info"

    # 将cookie字符串解析为字典

    res = requests.get(
        api,
        headers=get_headers(),
        params={"csrf": csrf, "web_location": bili_account["web_location"]},
    )
    if res.status_code == 200:
        data = res.json()
        print(data)
        return data.get("data", {}).get("refresh", False), data.get("data", {}).get(
            "timestamp", 0
        )
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


def get_login_status(qrcode_key: str):
    api = "https://passport.bilibili.com/x/passport-login/web/qrcode/poll"
    params = {"qrcode_key": qrcode_key}
    res = requests.get(api, headers=get_headers(False), params=params)
    if res.status_code == 200:
        data = res.json()
        print(data)
        return data.get("data", {}), res.headers
    else:
        print(f"Error: {res.status_code} - {res.text}")
        return None


def qrcode_login():
    qrcode_key, qrcode_url = generate_login_qrcode()
    if not qrcode_key:
        return None
    print(f"Please scan the QR code at: {qrcode_url}")
    while True:
        res, headers = get_login_status(qrcode_key)
        if res:
            if res["code"] == 0:
                print("Login successful!")
                return res, headers
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
    set_cookie_headers = headers.get("Set-Cookie") or headers.get("set-cookie")
    if not set_cookie_headers:
        # requests may combine multiple set-cookie headers into a list
        set_cookie_headers = headers.get("set-cookie", [])
    if isinstance(set_cookie_headers, str):
        set_cookie_headers = [set_cookie_headers]
    for header in set_cookie_headers:
        for cookie in header.split(","):
            parts = cookie.split(";")[0].split("=", 1)
            if len(parts) == 2:
                k, v = parts
                k = k.strip()
                v = v.strip()
                if k in [
                    "SESSDATA",
                    "bili_jct",
                    "DedeUserID",
                    "DedeUserID__ckMd5",
                    "sid",
                ]:
                    cookies[k] = v
    return cookies


from utils.persistence import persistence

def load_cookie():
    cookies = persistence.get("bilibili", "cookies")
    if cookies:
        bili_account["cookie"] = "; ".join([f"{k}={v}" for k, v in cookies.items()])
        if "bili_jct" in cookies:
            bili_account["csrf"] = cookies["bili_jct"]
        if "refresh_token" in cookies:
            bili_account["refresh_token"] = cookies["refresh_token"]
    else:
        # Check if we should auto-trigger QR code login or wait for unified auth
        # For now, keeping legacy check but ideally it should be triggered by AuthManager
        pass

def save_cookies(cookies, res_data=None):
    if res_data and "refresh_token" in res_data:
        cookies["refresh_token"] = res_data["refresh_token"]
    
    persistence.set("bilibili", "cookies", cookies)
    bili_account["cookie"] = "; ".join([f"{k}={v}" for k, v in cookies.items()])
    if "bili_jct" in cookies:
        bili_account["csrf"] = cookies["bili_jct"]
    if "refresh_token" in cookies:
        bili_account["refresh_token"] = cookies["refresh_token"]


key = RSA.importKey(
    """\
-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDLgd2OAkcGVtoE3ThUREbio0Eg
Uc/prcajMKXvkCKFCWhJYJcLkcM2DKKcSeFpD/j6Boy538YXnR6VhcuUJOhH2x71
nzPjfdTcqMz7djHum0qSZA0AyCBDABUqCrfNgCiJ00Ra7GmRj+YCK1NJEuewlb40
JNrRuoEUXpabUzGB8QIDAQAB
-----END PUBLIC KEY-----"""
)


def getCorrespondPath(ts):
    cipher = PKCS1_OAEP.new(key, SHA256)
    encrypted = cipher.encrypt(f"refresh_{ts}".encode())
    return binascii.b2a_hex(encrypted).decode()



if not is_refreshed_cookie :
    load_cookie()
    is_need_update, ts = check_is_update_needed(bili_account.get("csrf", ""))
    if is_need_update:
        correspond_path = getCorrespondPath(ts)
        data_url = f"https://www.bilibili.com/correspond/1/{correspond_path}"
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
        if refresh_csrf and refresh_token and bili_account["csrf"] and source:
            api = "https://passport.bilibili.com/x/passport-login/web/cookie/refresh"
            params = {
                "refresh_token": refresh_token,
                "refresh_csrf": refresh_csrf,
                "source": source,
                "csrf": bili_account["csrf"],
            }
            res = requests.post(api, headers=get_headers(), params=params)
            if res.status_code == 200:
                data = res.json()
                if data["code"] == 0:
                    print("Refresh successful!")
                    cookies = parse_cookies_from_headers(res.headers)
                    cookies["refresh_token"] = data["data"].get("refresh_token", "")
                    bili_account["refresh_token"] = cookies["refresh_token"]
                    if cookies:
                        save_cookies(cookies)
                        print("Cookies updated successfully.Refresh old cookies.")
                        api = "https://passport.bilibili.com/x/passport-login/web/confirm/refresh"
                        res = requests.post(
                            api,
                            headers=get_headers(),
                            params={
                                "csrf": bili_account["csrf"],
                                "refresh_token": refresh_token,
                            },
                        )
                        if res.status_code == 200:
                            data = res.json()
                            if data["code"] == 0:
                                print("Refresh confirmed successfully.")
                            else:
                                print(f"Failed to confirm refresh: {data['message']}")
                        else:
                            print(
                                f"Failed to confirm refresh: {res.status_code} - {res.text}"
                            )
                    else:
                        print("No cookies found in the response.")
                else:
                    print(f"Refresh failed: {data['message']}")
            else:
                print(f"Failed to refresh: {res.status_code} - {res.text}")
    is_refreshed_cookie = True

MIXIN_KEY_ENC_TAB = [
    46,
    47,
    18,
    2,
    53,
    8,
    23,
    32,
    15,
    50,
    10,
    31,
    58,
    3,
    45,
    35,
    27,
    43,
    5,
    49,
    33,
    9,
    42,
    19,
    29,
    28,
    14,
    39,
    12,
    38,
    41,
    13,
    37,
    48,
    7,
    16,
    24,
    55,
    40,
    61,
    26,
    17,
    0,
    1,
    60,
    51,
    30,
    4,
    22,
    25,
    54,
    21,
    56,
    59,
    6,
    63,
    57,
    62,
    11,
    36,
    20,
    34,
    44,
    52,
]


def refresh_wbi():
    api = "https://api.bilibili.com/x/web-interface/nav"
    res = requests.get(api, headers=get_headers())
    if res.status_code == 200:
        data = res.json()
        if data["code"] == 0:
            wbi_data = data.get("data", {}).get("wbi_img", {})
            if wbi_data:
                bili_account["img_url"] = os.path.splitext(
                    os.path.basename(wbi_data.get("img_url", ""))
                )[0]
                bili_account["sub_url"] = os.path.splitext(
                    os.path.basename(wbi_data.get("sub_url", ""))
                )[0]
                print("WBI refreshed successfully.")
            else:
                print("No WBI data found in the response.")
        else:
            print(f"Failed to refresh WBI: {data['message']}")
    else:
        print(f"Failed to refresh WBI: {res.status_code} - {res.text}")


def encWbi(params: dict, img_key: str, sub_key: str):
    "为请求参数进行 wbi 签名"
    mixin_key = getMixinKey(img_key + sub_key)
    curr_time = round(time.time())
    params["wts"] = curr_time  # 添加 wts 字段
    params = dict(sorted(params.items()))  # 按照 key 重排参数
    # 过滤 value 中的 "!'()*" 字符
    params = {
        k: "".join(filter(lambda chr: chr not in "!'()*", str(v)))
        for k, v in params.items()
    }
    query = urllib.parse.urlencode(params)  # 序列化参数
    wbi_sign = md5((query + mixin_key).encode()).hexdigest()  # 计算 w_rid
    params["w_rid"] = wbi_sign
    return params


def getMixinKey(orig: str):
    "对 imgKey 和 subKey 进行字符顺序打乱编码"
    return reduce(lambda s, i: s + orig[i], MIXIN_KEY_ENC_TAB, "")[:32]


def get_buvid3():
    api = "https://api.bilibili.com/x/web-frontend/getbuvid"
    res = requests.get(api, headers=get_headers())
    buvid = res.json()["data"]["buvid"]
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


async def get_buvid3_async():  # Async version
    loop = asyncio.get_event_loop()
    api = "https://api.bilibili.com/x/web-frontend/getbuvid"

    def _get_buvid():  # Synchronous part
        res = requests.get(api, headers=get_headers())
        res.raise_for_status()
        return res.json()["data"]["buvid"]

    buvid = await loop.run_in_executor(None, _get_buvid)

    if "buvid3" in bili_account:
        bili_account["cookie"] = bili_account["cookie"].replace(
            bili_account["buvid3"], buvid
        )  # Ensure cookie is a string
        bili_account["buvid3"] = buvid
    else:
        bili_account["buvid3"] = buvid
        cookie_items = [f"buvid3={buvid}"]  # Corrected list creation
        if "cookie" in bili_account and bili_account["cookie"]:
            bili_account["cookie"] += "; " + "; ".join(cookie_items)
        else:
            bili_account["cookie"] = "; ".join(cookie_items)
    return bili_account["buvid3"]


async def refresh_wbi_async():  # Async version
    loop = asyncio.get_event_loop()
    api = "https://api.bilibili.com/x/web-interface/nav"

    def _get_nav():  # Synchronous part
        res = requests.get(api, headers=get_headers())
        res.raise_for_status()
        return res.json()

    data = await loop.run_in_executor(None, _get_nav)

    if data["code"] == 0:
        wbi_data = data.get("data", {}).get("wbi_img", {})
        if wbi_data:
            bili_account["img_url"] = os.path.splitext(
                os.path.basename(wbi_data.get("img_url", ""))
            )[0]
            bili_account["sub_url"] = os.path.splitext(
                os.path.basename(wbi_data.get("sub_url", ""))
            )[0]
            print("WBI refreshed successfully (async).")
        else:
            print("No WBI data found in the response (async).")
    else:
        print(f"Failed to refresh WBI (async): {data['message']}")


def fetch_ext_from_url(url: str) -> str:  # Stays synchronous utility
    """Extracts file extension from a URL, handling query parameters."""
    path = urllib.parse.urlparse(url).path
    ext = os.path.splitext(path)[1]
    return ext.lower() if ext else ".bin"  # Default to .bin if no extension


def strip_html_tags(text: str) -> str:
    """Removes HTML tags from a string and unescapes HTML entities."""
    if not text:
        return ""
    clean = re.compile("<.*?>")
    return unescape(re.sub(clean, "", text))


def parse_duration(duration_str: str) -> int:  # Stays synchronous utility
    """Converts 'm:ss' or 'h:mm:ss' or 'mm:ss' from Bilibili to seconds as int."""
    if not duration_str:
        return 0
    parts = list(map(int, duration_str.split(":")))
    if len(parts) == 3:  # h:mm:ss
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    elif len(parts) == 2:  # mm:ss
        return parts[0] * 60 + parts[1]
    elif len(parts) == 1:  # ss (unlikely for Bilibili music context but good to handle)
        return parts[0]
    return 0


async def search_tracks_async(
    query: str, limit: int = 20
) -> list[dict]:  # Renamed to async
    """
    Asynchronously searches for tracks (videos) on Bilibili.
    Returns a list of dictionaries, each containing track metadata.
    """
    
    loop = asyncio.get_event_loop()
    api_url = "https://api.bilibili.com/x/web-interface/wbi/search/type"

    # Ensure WBI keys and buvid3 are available, using async versions
    if not bili_account.get("img_url") or not bili_account.get("sub_url"):
        await refresh_wbi_async()
    if not bili_account.get("buvid3"):
        await get_buvid3_async()

    # Check again after attempting refresh, critical for WBI signing
    if not bili_account.get("img_url") or not bili_account.get("sub_url"):
        print(
            "Error: Missing WBI keys even after async refresh attempt. Cannot proceed with search."
        )
        return []

    params = {
        "search_type": "video",
        "keyword": query,
        "page": 1,
    }

    # encWbi is CPU bound (hashing), can be run in executor if it becomes a bottleneck,
    # but it's likely fast enough for now.
    signed_params = encWbi(params, bili_account["img_url"], bili_account["sub_url"])

    try:
        # requests.get is blocking, run in executor
        res = await loop.run_in_executor(
            None,
            functools.partial(
                requests.get, api_url, headers=get_headers(), params=signed_params
            ),
        )
        res.raise_for_status()
        data = await loop.run_in_executor(
            None, res.json
        )  # res.json() can also be blocking

        if data.get("code") != 0:
            print(
                f"Bilibili API error in search_tracks_async: {data.get('message', 'Unknown error')}"
            )
            return []

        search_results = data.get("data", {}).get("result", [])
        if not isinstance(search_results, list):  # Ensure result is a list
            print(f"Unexpected search result format: {search_results}")
            return []

        processed_tracks = []
        for item in search_results:
            if item.get("type") != "video":  # Process only video results
                continue

            # Ensure essential fields are present
            bvid = item.get("bvid")
            title = strip_html_tags(item.get("title", "Unknown Title"))
            author = item.get("author", "Unknown Artist")
            cover_url = item.get("pic")
            if cover_url and not cover_url.startswith("http"):
                cover_url = "https:" + cover_url  # Ensure full URL

            duration_str = item.get(
                "duration", "0:0"
            )  # Duration like "1:23" or "12:34"
            duration_sec = parse_duration(duration_str)

            if not bvid or not title:  # Skip if essential info is missing
                continue

            processed_tracks.append(
                {
                    "music_id": bvid,
                    "bvid": bvid, # Keep bvid for compatibility if needed elsewhere
                    "aid": str(item.get("aid", "")),
                    "id": bvid, # Keep id for frontend compatibility
                    "title": title,
                    "artist": author, # Use 'artist' instead of 'author'
                    "artwork_url": cover_url, # Use 'artwork_url' instead of 'cover_url'
                    "duration": duration_sec,
                    "description": strip_html_tags(item.get("description", "")),
                    "play_count": item.get("play", 0),
                    "danmaku_count": item.get("danmaku", 0),
                    "source": "bilibili" # Add source field
                }
            )
            if len(processed_tracks) >= limit:
                break

        return processed_tracks

    except requests.exceptions.RequestException as e:
        print(f"Request failed during Bilibili search: {e}")
        return []
    except json.JSONDecodeError:
        print("Failed to decode JSON response from Bilibili search.")
        return []
    except Exception as e:  # Catch any other unexpected errors
        print(f"An unexpected error occurred during Bilibili search: {e}")
        return []


def _save_file_with_progress_bili(
    file_url: str,
    filename: str,
    track_id: str,
    progress_callback: callable,
    file_type: str,
    stream: bool = True,  # Bilibili usually allows direct download, streaming is good practice
):
    """
    Downloads a file from file_url to filename for Bilibili, reporting progress.
    This is a simplified version for direct file downloads, not m3u8.
    """
    try:
        # Use Bilibili specific headers, especially Referer
        download_headers = {
            "User-Agent": general_headers["User-Agent"],
            "Referer": (
                f"https://www.bilibili.com/video/{track_id}"
                if track_id
                else general_headers["Referer"]
            ),
            # More specific Referer if track_id (bvid) is known
            "Origin": general_headers["Origin"],
        }
        resp = requests.get(
            file_url, stream=stream, headers=download_headers, timeout=30
        )  # Added timeout
        resp.raise_for_status()

        total_size = int(resp.headers.get("content-length", 0))
        current_size = 0

        # Ensure directory for filename exists
        os.makedirs(os.path.dirname(filename), exist_ok=True)

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
                                status="downloading",
                            )
            else:  # Non-streaming download (fallback, less common for Bili direct links)
                f.write(resp.content)
                current_size = total_size

        if progress_callback:
            progress_callback(
                track_id=track_id,
                current_size=current_size,
                total_size=total_size,
                file_type=file_type,
                status="completed_file",
            )
        print(f"Bilibili file {filename} downloaded successfully.")
        return True

    except requests.exceptions.Timeout:
        print(f"Timeout error downloading {file_type} {file_url} to {filename}")
        if progress_callback:
            progress_callback(
                track_id=track_id,
                current_size=0,
                total_size=0,
                file_type=file_type,
                status="error",
                error_message="Download timed out",
            )
        return False
    except requests.exceptions.RequestException as e:
        print(f"Request error downloading {file_type} {file_url} to {filename}: {e}")
        if progress_callback:
            progress_callback(
                track_id=track_id,
                current_size=0,
                total_size=0,
                file_type=file_type,
                status="error",
                error_message=str(e),
            )
        return False
    except IOError as e:  # Catch file system errors
        print(f"File error saving {file_type} to {filename}: {e}")
        if progress_callback:
            progress_callback(
                track_id=track_id,
                current_size=0,
                total_size=0,
                file_type=file_type,
                status="error",
                error_message=f"File system error: {e.strerror}",
            )
        return False
    except Exception as e:  # Catch any other unexpected errors
        print(f"Unexpected error downloading {file_type} {file_url} to {filename}: {e}")
        if progress_callback:
            progress_callback(
                track_id=track_id,
                current_size=0,
                total_size=0,
                file_type=file_type,
                status="error",
                error_message=f"Unexpected error: {type(e).__name__}",
            )
        return False


def _get_video_details_bili(
    bvid: str = None, aid: str = None
) -> tuple[dict | None, int | None]:
    """
    Fetches detailed video information from Bilibili using bvid or aid.
    Returns a tuple: (video_data_dict, cid).
    video_data_dict contains fields like title, desc, owner, pic, duration, tags (from 'tag' key or 'tname').
    cid is the video's unique identifier for streams.
    """
    if not bvid and not aid:
        print("Error: Either bvid or aid must be provided to get video details.")
        return None, None

    api_url = "https://api.bilibili.com/x/web-interface/wbi/view"
    params = {}
    if bvid:
        params["bvid"] = bvid
    elif aid:  # aid can be used as fallback, though bvid is preferred
        params["aid"] = aid

    # Ensure WBI keys are available
    if not bili_account.get("img_url") or not bili_account.get("sub_url"):
        refresh_wbi()
    if not bili_account.get(
        "buvid3"
    ):  # buvid might also be needed by some view details aspects
        get_buvid3()

    if not bili_account.get("img_url") or not bili_account.get("sub_url"):
        print("Error: Missing WBI keys for _get_video_details_bili.")
        return None, None

    signed_params = encWbi(params, bili_account["img_url"], bili_account["sub_url"])

    try:
        res = requests.get(api_url, headers=get_headers(), params=signed_params)
        res.raise_for_status()
        data = res.json()

        if data.get("code") == 0:
            video_data = data.get("data")
            if video_data:
                cid = video_data.get("cid")
                # Extract tags: Bilibili has 'tags' list and 'tname' (type name/category)
                tags_list = video_data.get("tags", [])  # Detailed tags if available
                if not tags_list and video_data.get(
                    "tname"
                ):  # Fallback to tname if no explicit tags
                    tags_list = [video_data.get("tname")]

                # Add more fields to video_data if needed for MusicItem
                video_data["extracted_tags"] = tags_list
                return video_data, cid
            else:
                print(
                    f"No video data found in API response for bvid/aid: {bvid or aid}"
                )
                return None, None
        else:
            print(
                f"Bilibili API error in _get_video_details_bili: {data.get('message', 'Unknown error')}"
            )
            return None, None
    except requests.exceptions.RequestException as e:
        print(f"Request failed during Bilibili video details fetch: {e}")
        return None, None
    except json.JSONDecodeError:
        print("Failed to decode JSON response from Bilibili video details.")
        return None, None
    return None, None


def _get_audio_options_bili(bvid: str, cid: int) -> list[dict]:
    """
    Fetches available audio stream options for a Bilibili video.
    Returns a list of dictionaries, each representing an audio option with URL, quality, codecs, and lossless status.
    """
    api_url = "https://api.bilibili.com/x/player/wbi/playurl"
    # Quality numbers: 30280 for FLAC (if available), 30232 for 192K, 30216 for 132K.
    # fnval: 4048 for FLAC/Hi-Res, 16 for DASH generally.
    # We'll try to get highest quality, including FLAC.
    params = {
        "bvid": bvid,
        "cid": cid,
        "qn": 0,  # Request all qualities; server decides what's available. Max is 30280 for FLAC.
        "fnval": 4048,  # Request DASH format, try to include FLAC and other high quality options
        "fourk": 1,  # Typically for video, but doesn't hurt
    }

    if not bili_account.get("img_url") or not bili_account.get("sub_url"):
        refresh_wbi()
    if not bili_account.get("buvid3"):
        get_buvid3()
    if not bili_account.get("img_url") or not bili_account.get("sub_url"):
        print("Error: Missing WBI keys for _get_audio_options_bili.")
        return []

    signed_params = encWbi(params, bili_account["img_url"], bili_account["sub_url"])

    try:
        res = requests.get(api_url, headers=get_headers(), params=signed_params)
        res.raise_for_status()
        data = res.json()

        if data.get("code") == 0:
            playurl_data = data.get("data", {})
            audio_options = []

            # Check for FLAC stream
            flac_info = playurl_data.get("dash", {}).get("flac")
            if (
                flac_info
                and flac_info.get("audio")
                and flac_info["audio"].get("baseUrl")
            ):
                audio_options.append(
                    {
                        "url": flac_info["audio"]["baseUrl"],
                        "backup_urls": flac_info["audio"].get("backupUrl", []),
                        "quality_str": "FLAC",
                        "codecs": flac_info["audio"].get(
                            "codecs", "fLaC"
                        ),  # Often 'fLaC'
                        "size": flac_info["audio"].get("size", 0),
                        "is_lossless": True,
                        "id": flac_info["audio"].get("id", 30280),  # FLAC quality ID
                    }
                )

            # Check for other DASH audio streams (usually AAC)
            dash_audio_streams = playurl_data.get("dash", {}).get("audio", [])
            for stream in dash_audio_streams:
                # Avoid adding FLAC again if it was already processed via 'flac' field
                if stream.get("id") == 30280 and any(
                    opt["id"] == 30280 for opt in audio_options
                ):
                    continue

                audio_options.append(
                    {
                        "url": stream["baseUrl"],
                        "backup_urls": stream.get("backupUrl", []),
                        "quality_str": f"Audio ID {stream['id']}",  # e.g., 30232 (192k), 30216 (132k)
                        "codecs": stream.get("codecs"),  # e.g., 'mp4a.40.2'
                        "size": stream.get("size", 0),
                        "is_lossless": False,  # DASH AAC streams are not lossless
                        "id": stream.get("id"),
                    }
                )

            # Sort by quality (higher ID is generally better, FLAC is best)
            audio_options.sort(
                key=lambda x: (x["is_lossless"], x.get("id", 0)), reverse=True
            )
            return audio_options
        else:
            print(
                f"Bilibili API error in _get_audio_options_bili: {data.get('message', 'Unknown error')}"
            )
            return []
    except requests.exceptions.RequestException as e:
        print(f"Request failed during Bilibili audio options fetch: {e}")
        return []
    except json.JSONDecodeError:
        print("Failed to decode JSON response from Bilibili audio options.")
        return []
    return []


def _download_cover_bili(
    cover_url: str, music_item: MusicItem, progress_callback: callable = None
) -> str | None:
    """Downloads the cover image for a Bilibili item."""
    if not cover_url:
        print(f"No cover URL for Bilibili track: {music_item.music_id}")
        if progress_callback:
            progress_callback(
                track_id=music_item.music_id,
                current_size=0,
                total_size=0,
                file_type="cover",
                status="error",
                error_message="No cover URL",
            )
        return None

    cover_ext = fetch_ext_from_url(cover_url)
    # MusicItem constructor creates ./downloads/{music_id}, so work_path is .../{music_id}/
    # No need for os.path.join(base_download_path, music_item.music_id) here.
    cover_filename = os.path.join(music_item.work_path, f"cover{cover_ext}")

    if _save_file_with_progress_bili(
        file_url=cover_url,
        filename=cover_filename,
        track_id=music_item.music_id,
        progress_callback=progress_callback,
        file_type="cover",
    ):
        return os.path.join(music_item.read_path, f"cover{cover_ext}")
    else:
        # _save_file_with_progress_bili handles its own error callback
        print(f"Failed to download cover for Bilibili track: {music_item.music_id}")
        return None


def _download_audio_bili(
    audio_options: list[dict], music_item: MusicItem, progress_callback: callable = None
) -> tuple[str | None, bool]:
    """
    Downloads the best available audio for a Bilibili item.
    Returns (filepath, is_lossless) or (None, False) on failure.
    """
    if not audio_options:
        print(f"No audio options for Bilibili track: {music_item.music_id}")
        if progress_callback:
            progress_callback(
                track_id=music_item.music_id,
                current_size=0,
                total_size=0,
                file_type="audio",
                status="error",
                error_message="No audio options available",
            )
        return None, False

    # audio_options are already sorted by preference (_get_audio_options_bili)
    chosen_option = audio_options[0]

    file_ext = (
        ".flac" if chosen_option["is_lossless"] else ".m4a"
    )  # Standardize to .m4a for AAC from Bili DASH
    audio_filename = os.path.join(music_item.work_path, f"audio{file_ext}")

    urls_to_try = [chosen_option["url"]] + chosen_option.get("backup_urls", [])
    download_successful = False

    for i, url_to_try in enumerate(urls_to_try):
        print(
            f"Attempting Bilibili audio download ({'base' if i==0 else 'backup'}): {url_to_try[:100]}..."
        )  # Log only part of URL
        if _save_file_with_progress_bili(
            file_url=url_to_try,
            filename=audio_filename,
            track_id=music_item.music_id,
            progress_callback=progress_callback,
            file_type="audio",
        ):
            download_successful = True
            break  # Success
        # If download failed, _save_file_with_progress_bili already called callback with error

    if download_successful:
        return os.path.join(music_item.read_path, f"audio{file_ext}"), chosen_option["is_lossless"]
    else:
        print(
            f"All Bilibili audio download attempts failed for track: {music_item.music_id}"
        )
        # Error callback for overall audio download failure if not already covered by specific attempt
        if progress_callback and not chosen_option.get(
            "backup_urls"
        ):  # Only if no backups were tried or if it's the last one
            progress_callback(
                track_id=music_item.music_id,
                current_size=0,
                total_size=0,
                file_type="audio",
                status="error",
                error_message="All audio download attempts failed",
            )
        return None, False


async def download_track(
    track_info: dict,
    base_download_path: str = "./downloads",
    progress_callback: callable = None,
) -> MusicItem | None:
    """
    Asynchronously downloads a Bilibili track (video's audio and cover) based on track_info from search_tracks.
    base_download_path is handled by MusicItem's work_path logic.
    """
    
    bvid = track_info.get("bvid")
    aid = track_info.get("aid")  # Fallback if bvid somehow missing

    if not bvid and not aid:
        print("Error: track_info must contain 'bvid' or 'aid'.")
        if progress_callback:
            progress_callback(
                track_id="unknown_bili_track",
                current_size=0,
                total_size=0,
                file_type="track",
                status="error",
                error_message="Missing bvid/aid in track_info",
            )
        return None

    # 1. Get detailed video information (includes full description, cid, etc.)
    loop = asyncio.get_event_loop()
    video_details, cid = await loop.run_in_executor(
        None, _get_video_details_bili, bvid, aid
    )
    if not video_details or not cid:
        print(f"Failed to get video details for Bilibili track: {bvid or aid}")
        if progress_callback:
            progress_callback(
                track_id=bvid or aid,
                current_size=0,
                total_size=0,
                file_type="track",
                status="error",
                error_message="Failed to get video details",
            )
        return None

    # 2. Create MusicItem
    music_id_str = bvid if bvid else str(aid)
    full_description = strip_html_tags(video_details.get("desc", ""))
    lyrics_content = ""

    music_item = MusicItem(
        music_id=music_id_str,
        title=strip_html_tags(
            video_details.get("title", track_info.get("title", "Unknown Title"))
        ),
        artist=video_details.get("owner", {}).get(
            "name", track_info.get("artist", "Unknown Artist")
        ),
        description=full_description,
        album=video_details.get("tname", ""),
        tags=video_details.get("extracted_tags", []),
        duration=video_details.get("duration", track_info.get("duration", 0)),
        genre=video_details.get("tname", ""),
        artwork_url=video_details.get("pic", track_info.get("artwork_url")),
        lossless=False,
        lyrics=lyrics_content,
        source='bilibili'
    )

    # 3. Download Cover
    downloaded_cover_path = await loop.run_in_executor(
        None,
        _download_cover_bili,
        music_item.artwork_url,
        music_item,
        progress_callback,
    )
    if downloaded_cover_path:
        music_item.set_cover(downloaded_cover_path)

    # 4. Get Audio Options and Download Audio
    audio_options = await loop.run_in_executor(
        None, _get_audio_options_bili, music_id_str, cid
    )
    downloaded_audio_path, is_lossless = await loop.run_in_executor(
        None, _download_audio_bili, audio_options, music_item, progress_callback
    )

    if downloaded_audio_path:
        music_item.set_audio(downloaded_audio_path)
        music_item.lossless = is_lossless
        # 5. Save metadata (Only if audio download succeeded)
        await loop.run_in_executor(None, music_item.dump_self)
        print(f"Bilibili metadata for {music_item.music_id} saved.")

    if progress_callback:
        final_status = "completed_track" if downloaded_audio_path else "error"
        progress_callback(
            track_id=music_item.music_id,
            current_size=1,
            total_size=1,
            file_type="track",
            status=final_status,
            error_message="Audio download failed." if not downloaded_audio_path else None
        )

    if not downloaded_audio_path:
        return None

    return music_item


# --- Cleanup of old test/example code ---
# search_result = search_tracks("returns popin party") # Example call, remove later
# results = []
# if search_result:
#    for track in search_result:
#        results.append(track['bvid'])

# music_item_placeholder, video_cid_placeholder = (None, None)
# if results:
#     # Old get_video_info logic is now in _get_video_details_bili
#     pass

# audio_links_placeholder = []
# if video_cid_placeholder and results: # Ensure results is not empty for bvid
#     # Old get_audio_link logic is now in _get_audio_options_bili
#     pass

# Example calls for old download logic - remove/comment out
# if music_item_placeholder and audio_links_placeholder:
#     work_dir = os.path.join("./downloads", str(music_item_placeholder.get('bvid',''))) # Use .get for safety
#     # Old try_download_audio logic is now in _download_audio_bili
# if music_item_placeholder and music_item_placeholder.get('pic'):
#     work_dir = os.path.join("./downloads", str(music_item_placeholder.get('bvid','')))
#     # Old try_download_cover logic is now in _download_cover_bili

def get_source_info():
    return {
        "require_auth_to_enable": False,
        "auth_required_message": "你需要先提供认证才能使用 Bilibili Source。"
    }

# --- Unified Auth Interface ---
def get_auth_state():
    is_logged_in = False
    if "cookie" in bili_account and bili_account["cookie"]:
        is_logged_in = True
    return {
        "source": "bilibili",
        "is_logged_in": is_logged_in,
        "login_type": "qrcode",
        "user_info": {}
    }

def generate_auth_action():
    qrcode_key, qrcode_url = generate_login_qrcode()
    if qrcode_key:
        return {
            "type": "qrcode",
            "qrcode_key": qrcode_key,
            "qrcode_url": qrcode_url,
            "qrcode_base64": str_to_qrcode_dataurl(qrcode_url)
        }
    return {"error": "Failed to generate QR code"}

def poll_auth_status(params):
    qrcode_key = params.get("qrcode_key")
    if not qrcode_key:
        return {"error": "Missing qrcode_key"}
    res, headers = get_login_status(qrcode_key)
    if res:
        code = res.get("code")
        if code == 0:
            cookies = parse_cookies_from_headers(headers)
            save_cookies(cookies, res)
            return {"status": "success", "message": "Login successful"}
        elif code == 86038:
            return {"status": "expired", "message": "QR code expired"}
        elif code == 86101:
            return {"status": "waiting", "message": "Waiting for scan"}
        elif code == 86090:
            return {"status": "scanned", "message": "Waiting for confirmation"}
        else:
            return {"status": "failed", "message": res.get("message")}
    return {"error": "Failed to check login status"}

def login_with_params(params):
    return {"error": "Manual login not supported for Bilibili currently. Use QR code."}

def logout():
    persistence.set("bilibili", "cookies", None)
    # Clear only security-related keys and restore defaults
    bili_account.clear()
    bili_account["web_location"] = "333.1007"
    global is_refreshed_cookie
    is_refreshed_cookie = False
    return {"status": "success", "message": "Logged out successfully"}

