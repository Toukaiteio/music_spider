"""
Music Claw Handler
AI-powered music assistant with advanced skills (search / playlists / lyrics / playback).
"""
import asyncio
import json
import logging
import os
import re
import uuid
from typing import Dict, List, Optional

from core.ws_messaging import send_response
from core.source_manager import get_all_source_status
from llm.llm_client import LLMClient
from llm.skills import MusicSkills
from utils.persistence import persistence

logger = logging.getLogger("MusicClawHandler")

# ── LLM Config Handlers ──────────────────────────────────────────────────────

async def handle_get_llm_config(websocket, cmd_id: str, payload: dict):
    """Retrieve LLM configuration from persistence."""
    try:
        config = persistence.get_module_data("llm_config") or {
            "models": [],
            "active_model_id": ""
        }
        await send_response(websocket, cmd_id, code=0, data=config)
    except Exception as e:
        logger.error(f"Failed to get LLM config: {e}")
        await send_response(websocket, cmd_id, code=1, error=str(e))

async def handle_save_llm_config(websocket, cmd_id: str, payload: dict):
    """Save LLM configuration to persistence."""
    try:
        config = payload.get("config")
        if config is None:
            await send_response(websocket, cmd_id, code=1, error="Missing config in payload")
            return
            
        persistence.set_module_data("llm_config", config)
        await send_response(websocket, cmd_id, code=0, message="LLM configuration saved successfully")
    except Exception as e:
        logger.error(f"Failed to save LLM config: {e}")
        await send_response(websocket, cmd_id, code=1, error=str(e))

# ── System prompts ─────────────────────────────────────────────────────────────

def _get_sources_info():
    """Get summarized source status for AI prompt."""
    try:
        statuses = get_all_source_status()
        info = []
        for s in statuses:
            st = "Enabled" if s.get("enabled") else "Disabled"
            auth = "Authorized" if s.get("is_logged_in") else "Unauthorized"
            req = " (Requires Login to Enable)" if s.get("require_auth_to_enable") else ""
            source_name = s.get("source", "unknown")
            info.append(f"- {source_name.capitalize()}: Status={st}, Auth={auth}{req}")
        return "\n".join(info)
    except Exception as e:
        return "Failed to fetch source status."

_BASE_SYSTEM_PROMPT = """你是 Music Claw，一个强大的 AI 音乐助手。
你能帮用户搜索、播放和管理来自各平台的音乐。

# 你的核心工作方式 (ReAct 循环)

当用户请求音乐操作时，你必须：
1. **Think**: 思考需要调用哪个工具
2. **Act**: 输出工具调用指令
3. **Observe**: 等待系统返回工具执行结果
4. **Repeat or Finish**: 根据结果继续或给出最终回复

# ⚠️ 工具调用格式 (关键!)

**格式**: `[tool_name: {{json_args}}]`

**严格规则**:
1. **调用工具时必须单独一行输出**，格式绝对不能变
2. **一次调用一个工具**，等待结果后才能调用下一个
3. **绝对禁止凭空编造歌曲名、歌手名**，你无法访问任何数据库，所有信息必须通过工具获取

**正确示例**:
```
好的，我来为你搜索夜鹿的歌曲。
[search_at_sources: {{"query": "Yorushika", "sources": ["netease", "kugou"]}}]
```

**错误示例** (❌ 禁止):
```
正在播放《苔》- Yorushika   ← 你根本没调用工具！
```

# 可用工具列表

- **search_at_sources**: 同时在多个平台搜索音乐
  - 参数: `{{"query": "搜索词", "sources": ["netease", "kugou", "bilibili"]}}`

- **search_music**: 在单个平台搜索音乐
  - 参数: `{{"query": "搜索词", "source": "netease"}}`

- **play_song**: 播放指定歌曲 (track_data必须来自搜索结果！)
  - 参数: `{{"track_data": {{...从搜索结果获取的完整track对象...}}}}`

- **search_library**: 在本地已下载的音乐库中搜索
  - 参数: `{{"query": "搜索词"}}`

- **get_lyrics**: 获取歌词
  - 参数: `{{"song_name": "歌名", "artist": "歌手(可选)"}}`

- **add_to_playlist**: 将歌曲添加到播放列表
  - 参数: `{{"track_data": {{...}}, "playlist_name": "Liked"}}`

- **create_playlist**: 创建新播放列表
  - 参数: `{{"name": "列表名"}}`

# 当前来源状态
{sources_status}

# 工作流示例: "播放一首夜鹿的歌"

Step 1 (AI): 好的，我来搜索夜鹿的歌曲。
[search_at_sources: {{"query": "Yorushika 夜鹿", "sources": ["netease", "kugou"]}}]

Step 2 (System): [Tool Result] search_at_sources: {{"results": [{{"title": "言って。", "artist": "ヨルシカ", "music_id": "netease_12345", ...}}, ...]}}

Step 3 (AI): 找到了！为你随机播放《言って。》。
[play_song: {{"track_data": {{"title": "言って。", "artist": "ヨルシカ", "music_id": "netease_12345", "source": "netease"}}}}]

Step 4 (System): [Tool Result] play_song: {{"status": "playing"}}

Step 5 (AI): ✅ 正在为你播放《言って。》- ヨルシカ，希望你喜欢！

---
当前时间: {current_time}
请用用户使用的语言回复。
"""

_TOOLS_PLAIN_LIST = [
    "search_at_sources", "search_music", "play_song", 
    "search_library", "get_lyrics", "add_to_playlist", "create_playlist"
]

MAX_ITERATIONS = 8


def _parse_tool_call(text: str):
    """
    Parse [tool_name: {json}] from text.
    Returns (tool_name, args_dict) or (None, None).
    Uses bracket matching to handle nested JSON correctly.
    """
    # Find last occurrence of [word_chars: { ... }]
    clean_text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    
    # Find all potential tool call start positions
    pattern = re.compile(r'\[(\w+):\s*(\{)', re.DOTALL)
    matches = list(pattern.finditer(clean_text))
    
    if not matches:
        return None, None
    
    # Process from the last match (prefer last tool call in response)
    for m in reversed(matches):
        tool_name = m.group(1)
        if tool_name.upper() in ('TOOL', 'FINISH', 'AT', 'REPLY', 'SKIP'):
            continue  # Skip special markers
        
        # Use bracket counting to find closing }]
        start_brace = m.start(2)
        brace_count = 0
        i = start_brace
        while i < len(clean_text):
            c = clean_text[i]
            if c == '{':
                brace_count += 1
            elif c == '}':
                brace_count -= 1
                if brace_count == 0:
                    # Found the closing brace, now look for ]
                    rest = clean_text[i+1:].lstrip()
                    if rest.startswith(']'):
                        json_str = clean_text[start_brace:i+1]
                        try:
                            args = json.loads(json_str)
                            return tool_name, args
                        except json.JSONDecodeError:
                            break
                    break
            i += 1
    
    return None, None


async def handle_music_claw_chat(websocket, cmd_id: str, payload: dict):
    """Handle a music_claw_chat WebSocket command using ReAct agent loop."""
    user_message: str = payload.get("message", "").strip()
    session_id: str = payload.get("session_id", cmd_id)
    history: List[Dict] = payload.get("history", [])

    if not user_message:
        await send_response(websocket, cmd_id, code=1, error="Message cannot be empty.")
        return

    # Extract LLM Config from payload
    llm_config = payload.get("llm_config", {})
    api_keys = llm_config.get("api_keys")
    base_url = llm_config.get("base_url")
    model_name = llm_config.get("model")
    lb_mode = llm_config.get("lb_mode", "round_robin")
    
    try:
        current_llm_client = LLMClient(api_keys=api_keys, base_url=base_url, model=model_name, lb_mode=lb_mode)
    except Exception as e:
        logger.error(f"Failed to initialize LLM Client: {e}")
        await send_response(websocket, cmd_id, code=1, error="Failed to configure language model.")
        return
        
    skills = MusicSkills(websocket=websocket)
    
    from datetime import datetime
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    sources_status = _get_sources_info()
    
    system_prompt = _BASE_SYSTEM_PROMPT.format(
        current_time=current_time,
        sources_status=sources_status
    )
    
    # Build messages: system + history (as user/assistant turns) + current user message
    messages: List[Dict] = [{"role": "system", "content": system_prompt}]
    
    for msg in history:
        role = msg.get("role")
        if role == "user":
            messages.append({"role": "user", "content": msg.get("content", "")})
        elif role == "assistant":
            messages.append({"role": "assistant", "content": msg.get("content", "")})
        # Skip tool/system history - it's embedded in prior assistant messages already

    messages.append({"role": "user", "content": user_message})

    # Signal thinking start
    await send_response(websocket, cmd_id, code=0, data={
        "status_type": "claw_update",
        "update_type": "thinking",
        "session_id": session_id,
    })

    # ── ReAct Agent Loop ───────────────────────────────────────────────────────
    for iteration in range(MAX_ITERATIONS):
        try:
            # Call LLM - use streaming for Zai to get thinking, non-streaming for result
            full_content = ""
            thinking_content = ""
            
            async for chunk in current_llm_client.chat_completion_stream(messages, session_id=session_id):

                if not chunk or not chunk.get("choices"):
                    continue
                choice = chunk["choices"][0]
                delta = choice.get("delta", {})
                
                # Stream thinking to frontend
                td = delta.get("thinking") or ""
                if td:
                    thinking_content += td
                    await send_response(websocket, cmd_id, code=0, data={
                        "status_type": "claw_update",
                        "update_type": "thinking",
                        "session_id": session_id,
                        "content": td,
                        "is_stream": True,
                    })
                
                cd = delta.get("content") or ""
                if cd:
                    full_content += cd

            # Clean up thinking tags from content (GLM sometimes leaks them)
            full_content = re.sub(r'<think>.*?</think>', '', full_content, flags=re.DOTALL).strip()
            full_content = re.sub(r'<details.*?</details>', '', full_content, flags=re.DOTALL).strip()

            # Parse tool call
            tool_name, tool_args = _parse_tool_call(full_content)

            if not tool_name:
                # No tool call → this is the final answer, stream it out
                clean_final = full_content.strip()
                await send_response(websocket, cmd_id, code=0, data={
                    "status_type": "claw_update",
                    "update_type": "complete",
                    "session_id": session_id,
                    "content": clean_final,
                })
                return

            # Strip tool call line from visible text
            tool_call_pattern = re.compile(r'\[' + re.escape(tool_name) + r':\s*\{.*?\}\]', re.DOTALL)
            visible_text = tool_call_pattern.sub("", full_content).strip()

            # Stream the visible text part (before tool call) immediately
            if visible_text:
                await send_response(websocket, cmd_id, code=0, data={
                    "status_type": "claw_update",
                    "update_type": "text",
                    "session_id": session_id,
                    "content": visible_text,
                    "is_stream": False,
                })

            # Append assistant message to history
            messages.append({"role": "assistant", "content": full_content})

            # Notify frontend of tool call
            tc_id = f"tc_{uuid.uuid4().hex[:8]}"
            await send_response(websocket, cmd_id, code=0, data={
                "status_type": "claw_update",
                "update_type": "tool_call",
                "session_id": session_id,
                "tool_call": {"id": tc_id, "name": tool_name, "parameters": tool_args},
            })

            # Execute tool
            if hasattr(skills, tool_name):
                try:
                    func = getattr(skills, tool_name)
                    result = await func(**tool_args)
                except TypeError as e:
                    result = {"error": f"Invalid parameters: {e}"}
                except Exception as e:
                    result = {"error": str(e)}
            else:
                result = {"error": f"Tool '{tool_name}' is not implemented."}

            # Notify frontend of tool result
            await send_response(websocket, cmd_id, code=0, data={
                "status_type": "claw_update",
                "update_type": "tool_result",
                "session_id": session_id,
                "tool_result": {"id": tc_id, "name": tool_name, "result": result},
            })

            # Feed result back to LLM as next user message (skill_agent.py style)
            result_str = json.dumps(result, ensure_ascii=False)
            messages.append({
                "role": "user",
                "content": f"[Tool Result] {tool_name}: {result_str}"
            })

        except Exception as e:
            logger.exception("Error in Music Claw agent loop")
            await send_response(websocket, cmd_id, code=1, error=str(e))
            return

    await send_response(websocket, cmd_id, code=1, error="Max iterations reached.")
