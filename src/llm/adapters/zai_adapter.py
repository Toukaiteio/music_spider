import asyncio
import base64
import hashlib
import hmac
import json
import logging
import time
import urllib.parse
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from .base import LLMAdapter

logger = logging.getLogger("ZaiAdapter")

class ZaiAdapter(LLMAdapter):
    """
    ZAI (chat.z.ai) API adapter.
    Uses custom signature and session management.
    Note: Standard tool-calling is not supported natively via this API,
    so it relies on prompt-based tool calls.
    """

    def __init__(self, token: str, cookie: str, user_id: str, model: str = "glm-5"):
        self.base_url = "https://chat.z.ai/api"
        self.token = token
        self.cookie = cookie
        self.user_id = user_id
        self.model = model
        # session_id -> chat_id (in-memory)
        self._sessions: Dict[str, str] = {}

    def _calculate_signature(self, request_id: str, timestamp: int, user_id: str, sig_prompt: str) -> str:
        input_str = f"requestId,{request_id},timestamp,{timestamp},user_id,{user_id}"
        
        # Python equivalent of JS TextEncoder.encode() -> String.fromCharCode() -> btoa()
        try:
            prompt_bytes = sig_prompt.encode("utf-8")
            latin1_str = "".join(chr(b) for b in prompt_bytes)
            b64_prompt = base64.b64encode(latin1_str.encode("latin-1")).decode("ascii")
        except Exception:
            # Fallback if there's an encoding issue
            b64_prompt = base64.b64encode(sig_prompt.encode("utf-8")).decode("ascii")

        combined = f"{input_str}|{b64_prompt}|{timestamp}"
        time_seg = timestamp // (5 * 60 * 1000)
        secret = "key-@@@@)))()((9))-xxxx&&&%%%%%"
        
        time_key = hmac.new(secret.encode(), str(time_seg).encode(), hashlib.sha256).hexdigest()
        return hmac.new(time_key.encode(), combined.encode(), hashlib.sha256).hexdigest()

    def _headers(self, rid: str = "", ts: int = 0, uid: str = "", sig_prompt: str = "") -> Dict[str, str]:
        sig = ""
        if rid and ts and uid and sig_prompt:
            sig = self._calculate_signature(rid, ts, uid, sig_prompt)
        
        return {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://chat.z.ai/",
            "Host": "chat.z.ai",
            "Origin": "https://chat.z.ai",
            "Cookie": self.cookie or "",
            "Authorization": f"Bearer {self.token}",
            "x-fe-version": "prod-fe-1.0.178",
            "x-signature": sig,
        }

    async def _get_or_create_chat(self, session_id: str) -> str:
        if session_id in self._sessions:
            return self._sessions[session_id]
        
        url = f"{self.base_url}/v1/chats/new"
        ts = int(time.time() * 1000)
        params_str = f"?token={self.token}&timestamp={ts}"
        
        body = {
            "chat": {
                "title": f"MusicClaw_{session_id[:8]}_{int(time.time())}",
                "models": [self.model],
                "params": {},
                "history": {"messages": {}, "currentId": None},
                "features": [{"type": "tool_selector", "server": "tool_selector", "status": "hidden"}],
                "enable_thinking": False,
                "auto_web_search": False,
                "timestamp": ts,
            }
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url + params_str, headers=self._headers(), json=body)
                if resp.status_code == 200:
                    data = resp.json()
                    chat_id = data.get("id")
                    if chat_id:
                        self._sessions[session_id] = chat_id
                        return chat_id
                logger.warning(f"[Zai] Failed to create chat: {resp.status_code} {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"[Zai] Could not create chat session: {e}")
        
        # Fallback: random ID
        fallback = str(uuid.uuid4())
        self._sessions[session_id] = fallback
        return fallback

    async def upload_image(self, session_id: str, image_bytes: bytes, filename: str = "image.png") -> Optional[Dict]:
        """Upload image to Z.ai for vision tasks."""
        chat_id = await self._get_or_create_chat(session_id)
        
        url = f"{self.base_url}/v1/files/"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Cookie": self.cookie or "",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "x-chat-id": chat_id,
            "x-fe-version": "prod-fe-1.0.178",
        }
        
        try:
            import mimetypes
            content_type, _ = mimetypes.guess_type(filename)
            if not content_type: content_type = "image/png"
            
            files = {'file': (filename, image_bytes, content_type)}
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, headers=headers, files=files)
                if resp.status_code in (200, 201):
                    return resp.json()
        except Exception as e:
            logger.error(f"[Zai] Image upload failed: {e}")
        return None

    async def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        session_id: str = "default",
        image_files: Optional[List[Dict]] = None,
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        chat_id = await self._get_or_create_chat(session_id)
        rid = str(uuid.uuid4())
        msg_id = str(uuid.uuid4())
        ts = int(time.time() * 1000)
        
        # Decide model
        if image_files:
            model = "glm-4.6v"
        else:
            model = kwargs.get("model", self.model)

        # Handle Vision Payload
        final_messages = messages
        files_payload = []
        
        if image_files and messages and messages[-1]['role'] == 'user':
            last_msg = messages[-1]
            content_list = [{"type": "text", "text": last_msg['content']}]
            
            for img_file in image_files:
                file_id = img_file.get('id')
                if file_id:
                    content_list.append({"type": "image_url", "image_url": {"url": file_id}})
                    files_payload.append({
                        "type": "image",
                        "file": img_file,
                        "id": file_id,
                        "url": f"/api/v1/files/{file_id}/content",
                        "name": img_file.get('filename', 'image.png'),
                        "status": "uploaded",
                        "media": "image",
                        "ref_user_msg_id": msg_id
                    })
            
            final_messages = messages[:-1] + [{"role": "user", "content": content_list}]

        # Signature prompt
        sig_prompt = "Hello"
        if messages:
            last_content = messages[-1].get("content", "")
            if isinstance(last_content, str):
                sig_prompt = last_content
            elif isinstance(last_content, list):
                for item in last_content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        sig_prompt = item.get("text", "")
                        break
        
        payload: Dict[str, Any] = {
            "stream": False,
            "model": model,
            "messages": final_messages,
            "chat_id": chat_id,
            "features": {
                "enable_thinking": kwargs.get("enable_thinking", False),
                "web_search": kwargs.get("web_search", False),
                "auto_web_search": kwargs.get("web_search", False),
                "image_generation": False,
                "preview_mode": True,
            },
            "user_id": self.user_id,
            "timestamp": ts,
            "signature_prompt": sig_prompt,
            "requestId": rid,
            "current_user_message_id": msg_id,
        }
        if files_payload:
            payload["files"] = files_payload

        now_utc = datetime.utcnow()
        now_local = datetime.now()
        
        url_params = urllib.parse.urlencode({
            "timestamp": ts, "requestId": rid, "user_id": self.user_id,
            "version": "0.0.1", "platform": "web", "token": self.token,
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "language": "zh-CN", "languages": "zh-CN,zh", "timezone": "Asia/Shanghai",
            "cookie_enabled": "true", "screen_width": "1920", "screen_height": "1080",
            "screen_resolution": "1920x1080", "viewport_height": "953",
            "viewport_width": "1430", "viewport_size": "1430x953",
            "color_depth": "24", "pixel_ratio": "1",
            "current_url": f"https://chat.z.ai/c/{chat_id}",
            "pathname": f"/c/{chat_id}", "search": "", "hash": "",
            "host": "chat.z.ai", "hostname": "chat.z.ai", "protocol": "https:",
            "referrer": "https://chat.z.ai/",
            "title": "Z.ai Chat - Free AI powered by GLM-4.6 & GLM-4.5",
            "timezone_offset": "-480",
            "local_time": now_local.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "utc_time": now_utc.strftime("%a, %d %b %Y %H:%M:%S GMT"),
            "is_mobile": "false", "is_touch": "false", "max_touch_points": "0",
            "browser_name": "Chrome", "os_name": "Windows",
            "signature_timestamp": str(ts),
        })
        url = f"{self.base_url}/v2/chat/completions?{url_params}"

        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        url,
                        headers=self._headers(rid, ts, self.user_id, sig_prompt),
                        json=payload,
                    )
                if resp.status_code == 200:
                    try:
                        return resp.json()
                    except json.JSONDecodeError:
                        # Fallback to SSE parsing
                        text = resp.text
                        if text.strip().startswith("data:"):
                            content = ""
                            for line in text.splitlines():
                                line = line.strip()
                                if line.startswith("data:") and line != "data: [DONE]":
                                    try:
                                        chunk = json.loads(line[5:].strip())
                                        d = chunk.get("data", {})
                                        if isinstance(d, dict):
                                            content += d.get("delta_content", "")
                                            content += d.get("edit_content", "")
                                    except Exception:
                                        pass
                            if content:
                                return {"choices": [{"message": {"role": "assistant", "content": content}}]}
                
                logger.warning(f"[Zai] Attempt {attempt + 1} failed: {resp.status_code}")
                await asyncio.sleep(1)
            except Exception as e:
                logger.warning(f"[Zai] Attempt {attempt + 1} error: {e}")
                await asyncio.sleep(1)
        
        return None
