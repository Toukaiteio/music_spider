import hashlib
import uuid
import json
from core.ws_messaging import send_response
from database.db import get_db
from core.auth import create_jwt, generate_captcha, verify_captcha
from config import AES_KEY

async def handle_login(websocket, cmd_id, payload):
    username = payload.get("username", "").strip()
    password = payload.get("password", "").strip()
    captcha_id = payload.get("captcha_id")
    captcha_text = payload.get("captcha")
    
    if not username or not password:
        await send_response(websocket, cmd_id, code=1, error="Username or Password missing")
        return
        
    if not verify_captcha(captcha_id, captcha_text):
        await send_response(websocket, cmd_id, code=1, error="Invalid CAPTCHA")
        return
        
    pwd_hash = hashlib.sha256(password.encode()).hexdigest()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, is_admin FROM users WHERE username = ? AND password_hash = ?", (username, pwd_hash))
    user = cursor.fetchone()
    
    if not user:
        await send_response(websocket, cmd_id, code=1, error="Invalid credentials")
        return
        
    token = create_jwt(user["id"], user["username"], bool(user["is_admin"]))
    await send_response(websocket, cmd_id, code=0, data={
        "token": token,
        "username": user["username"],
        "is_admin": bool(user["is_admin"])
    })

async def handle_register(websocket, cmd_id, payload):
    username = payload.get("username", "").strip()
    password = payload.get("password", "").strip()
    captcha_id = payload.get("captcha_id")
    captcha_text = payload.get("captcha")
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM sys_config WHERE key = 'registration_enabled'")
    cfg = cursor.fetchone()
    if cfg and cfg["value"] == "0":
        await send_response(websocket, cmd_id, code=1, error="Registration is currently disabled by Admin.")
        return
        
    if not verify_captcha(captcha_id, captcha_text):
        await send_response(websocket, cmd_id, code=1, error="Invalid CAPTCHA")
        return
        
    if len(username) < 3 or len(password) < 6:
        await send_response(websocket, cmd_id, code=1, error="Username (min 3 chars) or Password (min 6 chars) too short")
        return
        
    pwd_hash = hashlib.sha256(password.encode()).hexdigest()
    try:
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, pwd_hash))
        conn.commit()
    except Exception as e:
        await send_response(websocket, cmd_id, code=1, error="Username already exists")
        return
        
    await send_response(websocket, cmd_id, code=0, data={"message": "Registration successful. You can now login."})

async def handle_get_captcha(websocket, cmd_id, payload):
    captcha_id = payload.get("captcha_id") or str(uuid.uuid4())
    img_b64 = generate_captcha(captcha_id)
    await send_response(websocket, cmd_id, code=0, data={
        "captcha_id": captcha_id,
        "image": img_b64
    })
    
async def handle_get_sys_config(websocket, cmd_id, payload):
    # Only for admin? This will be guarded by Auth layer.
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM sys_config")
    items = cursor.fetchall()
    config = {k: v for k, v in items}
    await send_response(websocket, cmd_id, code=0, data=config)

async def handle_set_sys_config(websocket, cmd_id, payload):
    # Only for admin. This will be guarded by Auth layer.
    from core.auth import current_user
    user = current_user.get()
    if not user or not user["is_admin"]:
        await send_response(websocket, cmd_id, code=1, error="Permission denied")
        return
        
    key = payload.get("key")
    value = payload.get("value")
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO sys_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))
    conn.commit()
    await send_response(websocket, cmd_id, code=0, data={"message": "Config updated"})

async def handle_get_users(websocket, cmd_id, payload):
    # Admin only
    from core.auth import current_user
    user = current_user.get()
    if not user or not user["is_admin"]:
        await send_response(websocket, cmd_id, code=1, error="Permission denied")
        return
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, is_admin, created_at FROM users")
    users = cursor.fetchall()
    res = [{"id": u["id"], "username": u["username"], "is_admin": bool(u["is_admin"]), "created_at": u["created_at"]} for u in users]
    await send_response(websocket, cmd_id, code=0, data=res)

async def handle_update_user(websocket, cmd_id, payload):
    from core.auth import current_user
    user = current_user.get()
    if not user or not user["is_admin"]:
        await send_response(websocket, cmd_id, code=1, error="Permission denied")
        return
        
    target_id = payload.get("user_id")
    is_admin = payload.get("is_admin")
    password = payload.get("password")
    
    conn = get_db()
    cursor = conn.cursor()
    
    if is_admin is not None:
        cursor.execute("UPDATE users SET is_admin = ? WHERE id = ?", (1 if is_admin else 0, target_id))
        
    if password:
        pwd_hash = hashlib.sha256(password.encode()).hexdigest()
        cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (pwd_hash, target_id))
        
    conn.commit()
    await send_response(websocket, cmd_id, code=0, data={"message": "User updated"})
