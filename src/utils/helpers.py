import os
import json
import base64
from Crypto.Cipher import AES # For decrypt_path
from config import AES_KEY, TEMP_UPLOAD_DIR, DOWNLOADS_DIR # Import from config

# AES_KEY, TEMP_UPLOAD_DIR, DOWNLOADS_DIR are now imported from src.config

def format_bytes(bytes_val, precision=2):
    """Converts bytes to a human-readable string (KB, MB, GB, TB)."""
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024**2:
        return f"{round(bytes_val / 1024, precision)} KB"
    elif bytes_val < 1024**3:
        return f"{round(bytes_val / (1024**2), precision)} MB"
    elif bytes_val < 1024**4:
        return f"{round(bytes_val / (1024**3), precision)} GB"
    else:
        return f"{round(bytes_val / (1024**4), precision)} TB"

def format_speed(bits_per_second, precision=2):
    """Converts bits per second to a human-readable string (Kbps, Mbps, Gbps)."""
    if bits_per_second < 1000:
        return f"{round(bits_per_second, precision)} bps"
    elif bits_per_second < 1000**2:
        return f"{round(bits_per_second / 1000, precision)} Kbps"
    elif bits_per_second < 1000**3:
        return f"{round(bits_per_second / (1000**2), precision)} Mbps"
    else:
        return f"{round(bits_per_second / (1000**3), precision)} Gbps"

def encrypt_path(path):
    data = path.encode('utf-8')
    key_len_hex = 64   # 32 bytes -> 64 hex chars
    iv_len_hex = 32    # 16 bytes -> 32 hex chars
    total_rounds = 3
    aes_key_length = len(AES_KEY)

    # 当前读取指针起始位置
    pointer = 0

    for _ in range(total_rounds):
        # 提取 key
        key_end = pointer + key_len_hex
        if key_end > aes_key_length:
            key_str = AES_KEY[pointer:] + AES_KEY[:key_end % aes_key_length]
        else:
            key_str = AES_KEY[pointer:key_end]
        print(f"AES_KEY: {AES_KEY}")
        print(f"Extracted key_str: {key_str}")
        # 更新指针并提取 iv
        pointer = key_end % aes_key_length
        iv_end = pointer + iv_len_hex
        if iv_end > aes_key_length:
            iv_str = AES_KEY[pointer:] + AES_KEY[:iv_end % aes_key_length]
        else:
            iv_str = AES_KEY[pointer:iv_end]

        # 更新指针到下一个位置
        pointer = iv_end % aes_key_length
        print(key_str, iv_str)
        # 转换为 bytes 并创建 cipher
        key = bytes.fromhex(key_str)
        iv = bytes.fromhex(iv_str)
        cipher = AES.new(key, AES.MODE_CBC, iv)

        # 只在第一次做 PKCS7 padding
        if _ == 0:
            pad_len = 16 - (len(data) % 16)
            data = data + bytes([pad_len] * pad_len)

        data = cipher.encrypt(data)

    return base64.urlsafe_b64encode(data).decode('utf-8')

def decrypt_path(enc_path: str) -> str:
    """Decrypts a base64 encoded path encrypted with AES (reverse of encrypt_path)."""
    try:
        data = base64.urlsafe_b64decode(enc_path)
        key_len_hex = 64   # 32 bytes -> 64 hex chars
        iv_len_hex = 32    # 16 bytes -> 32 hex chars
        total_rounds = 3
        aes_key_length = len(AES_KEY)

        # We'll reconstruct the same key/iv sequence as in encrypt_path, but in reverse
        # To do this, we need to reconstruct the pointer positions for each round
        # First, build the pointer sequence for each round
        pointer = 0
        pointers = []
        for _ in range(total_rounds):
            key_end = pointer + key_len_hex
            pointer = key_end % aes_key_length
            iv_end = pointer + iv_len_hex
            pointer = iv_end % aes_key_length
            pointers.append(pointer)
        # Now, reverse the process
        pointer = pointers[-1]
        for round_idx in reversed(range(total_rounds)):
            # Calculate key/iv for this round
            # Go back to previous pointer position
            # To get key, we need to back up iv_len_hex, then key_len_hex
            iv_end = pointer
            iv_start = (iv_end - iv_len_hex) % aes_key_length
            key_end = iv_start
            key_start = (key_end - key_len_hex) % aes_key_length

            # Extract key and iv, handling wrap-around
            if key_start < key_end:
                key_str = AES_KEY[key_start:key_end]
            else:
                key_str = AES_KEY[key_start:] + AES_KEY[:key_end]
            if iv_start < iv_end:
                iv_str = AES_KEY[iv_start:iv_end]
            else:
                iv_str = AES_KEY[iv_start:] + AES_KEY[:iv_end]

            key = bytes.fromhex(key_str)
            iv = bytes.fromhex(iv_str)
            cipher = AES.new(key, AES.MODE_CBC, iv)
            data = cipher.decrypt(data)

            pointer = key_start  # Move pointer back for next round

            if round_idx == 0:
                # Remove PKCS7 padding
                pad_len = data[-1]
                if pad_len < 1 or pad_len > AES.block_size:
                    raise ValueError("Invalid PKCS7 padding length.")
                if data[-pad_len:] != bytes([pad_len] * pad_len):
                    raise ValueError("Invalid PKCS7 padding bytes.")
                data = data[:-pad_len]

        return data.decode('utf-8')
    except Exception as e:
        print(f"Error in decrypt_path: {e}")
        raise

# --- Chunked Upload Helper Functions ---
def get_session_manifest_path(session_id: str) -> str:
    """Gets the path to the manifest file for a given session ID."""
    # TEMP_UPLOAD_DIR should be accessible (e.g. global, config, or passed in)
    return os.path.join(TEMP_UPLOAD_DIR, session_id, "manifest.json")

def read_session_manifest(session_id: str) -> dict | None:
    """Reads and parses the session manifest file."""
    manifest_path = get_session_manifest_path(session_id)
    try:
        with open(manifest_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        # print(f"Manifest file not found for session {session_id}") # Less noisy
        return None
    except json.JSONDecodeError:
        print(f"Error decoding manifest for session {session_id}")
        return None
    except Exception as e:
        print(f"Error reading manifest for session {session_id}: {e}")
        return None

def write_session_manifest(session_id: str, manifest_data: dict) -> bool:
    """Writes the session manifest data to its file."""
    manifest_path = get_session_manifest_path(session_id)
    session_dir = os.path.dirname(manifest_path)
    try:
        os.makedirs(session_dir, exist_ok=True)
        with open(manifest_path, 'w') as f:
            json.dump(manifest_data, f, indent=4)
        return True
    except Exception as e:
        print(f"Error writing manifest for session {session_id}: {e}")
        return False


def _get_session_manifest_path_public(session_id: str) -> str: # Renaming for clarity during this step
    return os.path.join(TEMP_UPLOAD_DIR, session_id, "manifest.json")

def _read_session_manifest_public(session_id: str) -> dict | None: # Renaming
    manifest_path = _get_session_manifest_path_public(session_id)
    try:
        with open(manifest_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError:
        print(f"Error decoding manifest for session {session_id}")
        return None
    except Exception as e:
        print(f"Error reading manifest for session {session_id}: {e}")
        return None

def _write_session_manifest_public(session_id: str, manifest_data: dict) -> bool: # Renaming
    manifest_path = _get_session_manifest_path_public(session_id)
    session_dir = os.path.dirname(manifest_path)
    try:
        os.makedirs(session_dir, exist_ok=True)
        with open(manifest_path, 'w') as f:
            json.dump(manifest_data, f, indent=4)
        return True
    except Exception as e:
        print(f"Error writing manifest for session {session_id}: {e}")
        return False


def get_session_manifest_path(session_id: str) -> str:
    return os.path.join(TEMP_UPLOAD_DIR, session_id, "manifest.json")

def read_session_manifest(session_id: str) -> dict | None:
    manifest_path = get_session_manifest_path(session_id)
    try:
        with open(manifest_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError:
        print(f"Error decoding manifest for session {session_id}")
        return None
    except Exception as e:
        print(f"Error reading manifest for session {session_id}: {e}")
        return None

def write_session_manifest(session_id: str, manifest_data: dict) -> bool:
    manifest_path = get_session_manifest_path(session_id)
    session_dir = os.path.dirname(manifest_path)
    try:
        os.makedirs(session_dir, exist_ok=True)
        with open(manifest_path, 'w') as f:
            json.dump(manifest_data, f, indent=4)
        return True
    except Exception as e:
        print(f"Error writing manifest for session {session_id}: {e}")
        return False
