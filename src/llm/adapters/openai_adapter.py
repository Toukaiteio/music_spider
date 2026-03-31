import httpx
import logging
import json
import asyncio
from typing import Any, Dict, List, Optional
from .base import LLMAdapter

logger = logging.getLogger("OpenAIAdapter")

class OpenAIAdapter(LLMAdapter):
    """Standard OpenAI-compatible API adapter with load balancing."""

    def __init__(self, api_keys: List[str], base_url: str, model: str, lb_mode: str = "round_robin"):
        if not api_keys:
            self.api_keys = [""]
        else:
            self.api_keys = list(api_keys)
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.lb_mode = lb_mode
        self._current_idx = 0

    def _get_next_key(self) -> str:
        if not self.api_keys:
            return ""
        if self.lb_mode == "round_robin":
            key = self.api_keys[self._current_idx]
            self._current_idx = (self._current_idx + 1) % len(self.api_keys)
            return key
        else:
            # fallback: keep using current until error, then advance
            return self.api_keys[self._current_idx]

    def _advance_fallback_key(self):
        if self.lb_mode == "fallback":
            self._current_idx = (self._current_idx + 1) % len(self.api_keys)

    def _is_retryable_error(self, status_code: int, text: str) -> bool:
        if status_code in (429, 401, 403, 500, 502, 503, 504):
            return True
        if "quota" in text.lower() or "insufficient" in text.lower():
            return True
        return False

    async def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        model = kwargs.get("model", self.model)
        payload: Dict[str, Any] = {"model": model, "messages": messages}
        
        if "tools" in kwargs:
            payload["tools"] = kwargs["tools"]
        if "tool_choice" in kwargs:
            payload["tool_choice"] = kwargs["tool_choice"]
        if "response_format" in kwargs:
            payload["response_format"] = kwargs["response_format"]
            
        max_attempts = len(self.api_keys)
        for attempt in range(max_attempts):
            api_key = self._get_next_key()
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=headers,
                        json=payload,
                    )
                if resp.status_code == 200:
                    return resp.json()
                    
                logger.warning(f"[OpenAI] Request failed with {resp.status_code}: {resp.text[:200]}")
                if self._is_retryable_error(resp.status_code, resp.text):
                    logger.info(f"[OpenAI] Retrying with next key... ({attempt+1}/{max_attempts})")
                    if self.lb_mode == "fallback":
                        self._advance_fallback_key()
                    continue
                else:
                    return None
            except Exception as exc:
                logger.error(f"[OpenAI] Exception: {exc}")
                if self.lb_mode == "fallback":
                    self._advance_fallback_key()
                continue
                
        logger.error("[OpenAI] All API keys exhausted or failed.")
        return None

    async def chat_completion_stream(
        self,
        messages: List[Dict[str, Any]],
        **kwargs
    ):
        model = kwargs.get("model", self.model)
        payload: Dict[str, Any] = {"model": model, "messages": messages, "stream": True}
        
        if "tools" in kwargs:
            payload["tools"] = kwargs["tools"]
        if "tool_choice" in kwargs:
            payload["tool_choice"] = kwargs["tool_choice"]
            
        max_attempts = len(self.api_keys)
        for attempt in range(max_attempts):
            api_key = self._get_next_key()
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    async with client.stream(
                        "POST",
                        f"{self.base_url}/chat/completions",
                        headers=headers,
                        json=payload,
                    ) as response:
                        if response.status_code == 200:
                            async for line in response.aiter_lines():
                                line = line.strip()
                                if line.startswith("data:") and line != "data: [DONE]":
                                    try:
                                        chunk = json.loads(line[5:])
                                        yield chunk
                                    except Exception:
                                        pass
                            return  # Success, exit generator
                            
                        # Error handling
                        error_text = await response.aread()
                        error_text = error_text.decode("utf-8")
                        logger.warning(f"[OpenAI Stream] Status {response.status_code}: {error_text[:200]}")
                        
                        if self._is_retryable_error(response.status_code, error_text):
                            logger.info(f"[OpenAI] Retrying stream with next key... ({attempt+1}/{max_attempts})")
                            if self.lb_mode == "fallback":
                                self._advance_fallback_key()
                            continue
                        else:
                            return
            except Exception as exc:
                logger.error(f"[OpenAI Stream] Exception: {exc}")
                if self.lb_mode == "fallback":
                    self._advance_fallback_key()
                continue
                
        logger.error("[OpenAI Stream] All API keys exhausted or failed.")
