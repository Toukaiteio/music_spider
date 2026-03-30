import time
import hmac
import hashlib
import base64
import json
import random
import string
from contextvars import ContextVar
from database.db import get_db
from config import AES_KEY
from PIL import Image, ImageDraw, ImageFont
import io

# Context variable for dependency injection into handlers implicitly
current_user = ContextVar('current_user', default=None)

# Simple in-memory CAPTCHA store for demonstration (in production, use Redis or SQLite with expiry)
captcha_store = {}

def get_user_from_jwt(token):
    try:
        parts = token.split('.')
        if len(parts) != 3: return None
        b64_header, b64_payload, b64_sig = parts
        
        # Verify signature
        expected_sig = hmac.new(AES_KEY.encode(), f"{b64_header}.{b64_payload}".encode(), hashlib.sha256).digest()
        expected_b64_sig = base64.urlsafe_b64encode(expected_sig).decode().rstrip('=')
        
        if not hmac.compare_digest(b64_sig, expected_b64_sig):
            return None
            
        # Add padding back if necessary
        pad_len = 4 - len(b64_payload) % 4
        payload_json = base64.urlsafe_b64decode(b64_payload + '=' * pad_len).decode()
        payload = json.loads(payload_json)
        
        if payload.get("exp", 0) < time.time():
            return None # Expired
            
        return payload
    except Exception as e:
        return None

def create_jwt(user_id, username, is_admin):
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "user_id": user_id,
        "username": username,
        "is_admin": is_admin,
        "exp": int(time.time()) + 86400 * 30 # 30 days
    }
    
    b64_header = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip('=')
    b64_payload = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')
    signature = hmac.new(AES_KEY.encode(), f"{b64_header}.{b64_payload}".encode(), hashlib.sha256).digest()
    b64_sig = base64.urlsafe_b64encode(signature).decode().rstrip('=')
    
    return f"{b64_header}.{b64_payload}.{b64_sig}"

def generate_captcha(captcha_id):
    # A simple captcha generator
    text = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    captcha_store[captcha_id] = {"text": text, "exp": time.time() + 300} # 5 min expiry
    
    # Generate an image using PIL
    width, height = 100, 38
    image = Image.new('RGB', (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(image)
    
    # Add some noise
    for _ in range(50):
        x1 = random.randint(0, width)
        y1 = random.randint(0, height)
        draw.point((x1, y1), fill=(0, 0, 0))
        
    for _ in range(3):
        x1 = random.randint(0, width)
        y1 = random.randint(0, height)
        x2 = random.randint(0, width)
        y2 = random.randint(0, height)
        draw.line((x1, y1, x2, y2), fill=(0, 0, 0), width=1)
        
    # simple text drawing - relies on default PIL font
    # To use a better font: font = ImageFont.truetype("arial.ttf", 20)
    # Since we can't guarantee a font path, we use the default
    try:
        font = ImageFont.load_default()
        # center text roughly
        bb = draw.textbbox((0, 0), text, font=font)
        w = bb[2] - bb[0]
        h = bb[3] - bb[1]
        draw.text(((width-w)/2, (height-h)/2), text, font=font, fill=(50, 50, 50))
    except:
        draw.text((20, 10), text, fill=(0,0,0))
    
    buffered = io.BytesIO()
    image.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return f"data:image/png;base64,{img_str}"

def verify_captcha(captcha_id, answer):
    captcha = captcha_store.get(captcha_id)
    if not captcha: return False
    
    if time.time() > captcha["exp"]:
        del captcha_store[captcha_id]
        return False
        
    correct = captcha["text"].upper() == str(answer).upper()
    del captcha_store[captcha_id] # Clean up
    return correct

# Rate Limiter
class RateLimiter:
    def __init__(self):
        self.limits = {} # user_id -> { "last_reset": time, "count": int }
        self.MAX_REQS = 300 # 300 requests
        self.WINDOW = 60 # per 60 seconds
        
    def check_limit(self, user_id):
        now = time.time()
        if user_id not in self.limits:
            self.limits[user_id] = {"last_reset": now, "count": 1}
            return True
            
        record = self.limits[user_id]
        if now - record["last_reset"] > self.WINDOW:
            record["last_reset"] = now
            record["count"] = 1
            return True
            
        if record["count"] >= self.MAX_REQS:
            return False
            
        record["count"] += 1
        return True

rate_limiter = RateLimiter()
