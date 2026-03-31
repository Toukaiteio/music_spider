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

# ── Auth State ─────────────────────────────────────────────────────────────
# Normally these would be in their own state file, mapped by session or auth_id.
# We'll use the MusicSkills class' references.
import asyncio
from llm.skills import SESSION_AUTHS, PENDING_AUTHS

async def handle_claw_auth_response(websocket, cmd_id: str, payload: dict):
    """Handle a user's response to an AI authorization request."""
    auth_id = payload.get("auth_id")
    granted = payload.get("granted", False)
    remember_session = payload.get("remember_session", False)
    action = payload.get("action")
    session_id = payload.get("session_id")
    
    if remember_session and granted and session_id and action:
        if session_id not in SESSION_AUTHS:
            SESSION_AUTHS[session_id] = set()
        SESSION_AUTHS[session_id].add(action)
        
    if auth_id in PENDING_AUTHS:
        if not PENDING_AUTHS[auth_id].done():
            PENDING_AUTHS[auth_id].set_result(granted)
            
    await send_response(websocket, cmd_id, code=0, data={"status": "received"})

# ── LLM Config Handlers ──────────────────────────────────────────────────────

async def handle_get_llm_config(websocket, cmd_id: str, payload: dict):
    """Retrieve LLM configuration from persistence."""
    try:
        from core.auth import current_user
        user = current_user.get()
        if not user or not user["is_admin"]:
            await send_response(websocket, cmd_id, code=1, error="Permission denied: Admins only")
            return
            
        config = persistence.get_module_data("llm_config") or {
            "models": [],
            "active_model_id": ""
        }
        config.pop("original_cmd_id", None)
        await send_response(websocket, cmd_id, code=0, data=config)
    except Exception as e:
        logger.error(f"Failed to get LLM config: {e}")
        await send_response(websocket, cmd_id, code=1, error=str(e))

async def handle_save_llm_config(websocket, cmd_id: str, payload: dict):
    """Save LLM configuration to persistence."""
    try:
        from core.auth import current_user
        user = current_user.get()
        if not user or not user["is_admin"]:
            await send_response(websocket, cmd_id, code=1, error="Permission denied: Admins only")
            return
            
        config = payload.get("config")
        if config is None:
            await send_response(websocket, cmd_id, code=1, error="Missing config in payload")
            return
            
        config.pop("original_cmd_id", None)    
        persistence.set_module_data("llm_config", config)
        await send_response(websocket, cmd_id, code=0, data={"message": "LLM configuration saved successfully"})
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

- **play_song**: 播放指定歌曲 
  - 参数: `{{"short_id": 1}}` (short_id 必须来自搜索结果中的 short_id)

- **search_library**: 在本地已下载的音乐库中搜索
  - 参数: `{{"query": "搜索词"}}`

- **get_lyrics**: 获取歌词
  - 参数: `{{"song_name": "歌名", "artist": "歌手(可选)"}}`

- **get_playlists**: 获取当前所有歌单及其歌曲数量
  - 参数: `{{}}`

- **download_song**: 下载指定的歌曲（需提供搜索结果中的 short_id）
  - 参数: {{"short_id": 1}}

- **add_to_playlist**: 将歌曲添加到播放列表
  - 参数: `{{"short_id": 1, "playlist_name": "Liked"}}`

- **remove_from_playlist**: 将歌曲从播放列表中移除
  - 参数: `{{"short_id": 1, "playlist_name": "Liked"}}`

- **create_playlist**: 创建新播放列表
  - 参数: `{{"name": "列表名"}}`

- **update_playlist_info**: 重命名或修改播放列表名称
  - 参数: `{{"old_name": "原列表名", "new_name": "新列表名"}}`

- **get_user_preferences**: 获取用户的听歌偏好数据（最喜爱的歌手、语言、活跃时段和最近历史）
  - 参数: `{{}}`

- **autonomous_crawl_target**: 自动且全量地爬取某个目标（如歌手的所有专辑、某个歌单的所有歌曲）到本地库。
  - 参数: `{{"task_type": "artist/album/playlist", "source": "netease/kugou", "target": "URL或ID"}}`

# 当前来源状态
{sources_status}

# 工作流示例: "播放一首夜鹿的歌"

Step 1 (AI): 好的，我来搜索夜鹿的歌曲。
[search_at_sources: {{"query": "Yorushika 夜鹿", "sources": ["netease", "kugou"]}}]

Step 2 (System): [Tool Result] search_at_sources: {{"results": [{{"title": "言って。", "artist": "ヨルシカ", "short_id": 1}}, ...]}}

Step 3 (AI): 找到了！为你随机播放《言って。》。
[play_song: {{"short_id": 1}}]

Step 4 (System): [Tool Result] play_song: {{"status": "playing"}}

Step 5 (AI): ✅ 正在为你播放《言って。》- ヨルシカ，希望你喜欢！

---
当前时间: {current_time}
请用用户使用的语言回复。
"""

_TOOLS_PLAIN_LIST = [
    "search_at_sources", "search_music", "play_song", 
    "search_library", "get_lyrics", "add_to_playlist", "create_playlist",
    "get_playlists", "remove_from_playlist", "update_playlist_info", "download_song",
    "get_user_preferences", "autonomous_crawl_target"
]

MAX_ITERATIONS = 8


def _parse_tool_call(text: str):
    """
    Parse [tool_name: {json}] from text with high robustness.
    Handles:
    1. Missing closing brackets ']'
    2. Markdown code blocks
    3. Nested JSON structures
    4. Leading/trailing whitespace
    
    Returns (tool_name, args_dict, full_match_text) or (None, None, None).
    """
    # 1. Strip thinking tags but keep original for matching later if needed
    clean_text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    
    # 2. Look for potential tool starts: [tool_name: { or tool_name: {
    # We use a generic pattern to catch ANY tool, even hallucinated ones, so we can bounce errors back
    potential_matches = []
    pattern = re.compile(r'(\\\[|\[|)([a-zA-Z0-9_]+):\s*(\{)', re.DOTALL)
    for m in pattern.finditer(clean_text):
        tool_name = m.group(2).strip()
        potential_matches.append((m, tool_name))
            
    # Sort matches by their starting position in the text
    potential_matches.sort(key=lambda x: x[0].start(1))
    
    # Process matches: take the first valid one we can parse
    # Returning the first one ensures sequential tool execution instead of dropping previous tools
    for m, tool_name in potential_matches:
        start_bracket_idx = m.start(1)
        start_brace_idx = m.start(3) # Group 3 is the opening brace '{'
        
        # Count braces to find the end of JSON, handling strings and escapes
        brace_count = 0
        in_string = False
        escape = False
        json_end_idx = -1
        
        for i in range(start_brace_idx, len(clean_text)):
            char = clean_text[i]
            if escape:
                escape = False
                continue
            if char == '\\':
                escape = True
                continue
            if char == '"':
                in_string = not in_string
                continue
            
            if not in_string:
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        json_end_idx = i
                        break
        
        if json_end_idx != -1:
            json_str = clean_text[start_brace_idx:json_end_idx+1]
            try:
                # Try parsing JSON
                args = json.loads(json_str)
                
                # Determine full match text for stripping
                # Look for optional closing ']'
                end_idx = json_end_idx + 1
                rest = clean_text[end_idx:].lstrip()
                if rest.startswith(']'):
                    # Found closing bracket, include it and any whitespace before it
                    bracket_pos = clean_text.find(']', end_idx)
                    end_idx = bracket_pos + 1
                
                full_match = clean_text[start_bracket_idx:end_idx]
                return tool_name, args, full_match
            except json.JSONDecodeError:
                # Attempt to fix common AI JSON errors (like trailing commas)
                try:
                    fixed_json = re.sub(r',\s*}', '}', json_str)
                    args = json.loads(fixed_json)
                    end_idx = json_end_idx + 1
                    rest = clean_text[end_idx:].lstrip()
                    if rest.startswith(']'):
                        bracket_pos = clean_text.find(']', end_idx)
                        end_idx = bracket_pos + 1
                    full_match = clean_text[start_bracket_idx:end_idx]
                    return tool_name, args, full_match
                except:
                    continue # Try next match
                    
    return None, None, None


async def handle_music_claw_chat(websocket, cmd_id: str, payload: dict):
    """Handle a music_claw_chat WebSocket command using ReAct agent loop."""
    user_message: str = payload.get("message", "").strip()
    session_id: str = payload.get("session_id", cmd_id)
    history: List[Dict] = payload.get("history", [])

    if not user_message:
        await send_response(websocket, cmd_id, code=1, error="Message cannot be empty.")
        return

    # Read from central persistence for global model settings
    saved_config = persistence.get_module_data("llm_config") or {}
    active_model_id = saved_config.get("active_model_id")
    models = saved_config.get("models", [])
    active_model = next((m for m in models if m.get("id") == active_model_id), None)

    saved_api_keys = None
    saved_base_url = None
    saved_model_name = None
    saved_lb_mode = "round_robin"

    if active_model:
        raw_keys = active_model.get("apiKeys", "")
        saved_api_keys = [k.strip() for k in re.split(r'[\r\n]+', raw_keys) if k.strip()]
        saved_base_url = active_model.get("baseUrl")
        saved_model_name = active_model.get("model")
        saved_lb_mode = active_model.get("lbMode", "round_robin")
    
    from core.auth import current_user
    user = current_user.get()

    if user and user.get("is_admin"):
        # Extract LLM Config from payload (Admin can override)
        llm_config = payload.get("llm_config", {})
        api_keys = llm_config.get("api_keys") or saved_api_keys
        base_url = llm_config.get("base_url") or saved_base_url
        model_name = llm_config.get("model") or saved_model_name
        lb_mode = llm_config.get("lb_mode") or saved_lb_mode
    else:
        # Non-admins must use the server's configured global model
        api_keys = saved_api_keys
        base_url = saved_base_url
        model_name = saved_model_name
        lb_mode = saved_lb_mode
    
    try:
        current_llm_client = LLMClient(api_keys=api_keys, base_url=base_url, model=model_name, lb_mode=lb_mode)
    except Exception as e:
        logger.error(f"Failed to initialize LLM Client: {e}")
        await send_response(websocket, cmd_id, code=1, error="Failed to configure language model.")
        return
        
    skills = MusicSkills(websocket=websocket, session_id=session_id)
    
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
            
            streamed_text_length = 0
            is_streaming_paused = False
            
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
                    
                    if not is_streaming_paused:
                        unstreamed = full_content[streamed_text_length:]
                        idx_bracket = unstreamed.find('[')
                        idx_tag = unstreamed.find('<')
                        
                        indices = [i for i in (idx_bracket, idx_tag) if i != -1]
                        if indices:
                            earliest_idx = min(indices)
                            safe_str = unstreamed[:earliest_idx]
                            if safe_str:
                                await send_response(websocket, cmd_id, code=0, data={
                                    "status_type": "claw_update",
                                    "update_type": "text",
                                    "session_id": session_id,
                                    "content": safe_str,
                                    "is_stream": True,
                                })
                                streamed_text_length += len(safe_str)
                            is_streaming_paused = True
                        else:
                            await send_response(websocket, cmd_id, code=0, data={
                                "status_type": "claw_update",
                                "update_type": "text",
                                "session_id": session_id,
                                "content": unstreamed,
                                "is_stream": True,
                            })
                            streamed_text_length = len(full_content)

            # Clean up thinking tags from content (GLM sometimes leaks them)
            full_content = re.sub(r'<think>.*?</think>', '', full_content, flags=re.DOTALL).strip()
            full_content = re.sub(r'<details.*?</details>', '', full_content, flags=re.DOTALL).strip()

            # Parse tool call
            tool_name, tool_args, tool_full_match = _parse_tool_call(full_content)

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

            # Truncate any text generated AFTER the first tool call to force sequential processing
            idx = full_content.find(tool_full_match)
            if idx != -1:
                truncated_content = full_content[:idx + len(tool_full_match)]
            else:
                truncated_content = full_content

            # Strip tool call from visible text using the exact match found by the parser
            visible_text = truncated_content.replace(tool_full_match, "").strip()

            # Stream the visible text part (before tool call) immediately
            if visible_text:
                await send_response(websocket, cmd_id, code=0, data={
                    "status_type": "claw_update",
                    "update_type": "text",
                    "session_id": session_id,
                    "content": visible_text,
                    "is_stream": False,
                })

            # Append assistant message to history using the TRUNCATED content
            messages.append({"role": "assistant", "content": truncated_content})

            # Notify frontend of tool call
            tc_id = f"tc_{uuid.uuid4().hex[:8]}"
            await send_response(websocket, cmd_id, code=0, data={
                "status_type": "claw_update",
                "update_type": "tool_call",
                "session_id": session_id,
                "tool_call": {"id": tc_id, "name": tool_name, "parameters": tool_args},
            })

            # Execute tool
            if tool_name not in _TOOLS_PLAIN_LIST:
                result = {
                    "error": f"Tool '{tool_name}' does NOT exist.",
                    "hint": f"You MUST strictly use ONLY tools from this list: {', '.join(_TOOLS_PLAIN_LIST)}. If you want to download, use 'download_song'."
                }
            elif hasattr(skills, tool_name):
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
