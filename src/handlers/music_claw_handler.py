"""
Music Claw Handler
AI-powered music assistant with advanced skills (search / playlists / lyrics / playback).
"""
import asyncio
import json
import logging
import os
import uuid
from typing import Dict, List, Optional

from core.ws_messaging import send_response
from llm.llm_client import llm_client, parse_text_tool_calls
from llm.skills import MusicSkills

logger = logging.getLogger("MusicClawHandler")

# ── System prompts ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are Music Claw, an intelligent music assistant embedded in a music player app.
You can help users search for music, manage playlists, find lyrics, and control playback.

Be concise, friendly, and music-focused. Respond in the same language as the user."""

_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_music",
            "description": "Search for music tracks on a specific online source",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search terms"},
                    "source": {"type": "string", "enum": ["bilibili", "netease", "kugou"], "description": "Music source"},
                    "limit": {"type": "integer", "default": 5, "description": "Max results"},
                },
                "required": ["query", "source"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_at_sources",
            "description": "Search for music across multiple online sources simultaneously",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search terms"},
                    "sources": {"type": "array", "items": {"type": "string"}, "description": "List of sources"},
                    "limit_per_source": {"type": "integer", "default": 5},
                },
                "required": ["query", "sources"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_playlist",
            "description": "Create a new empty playlist",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Playlist name"}
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_to_playlist",
            "description": "Add a music track to a specified playlist (like 'Liked' or a custom one)",
            "parameters": {
                "type": "object",
                "properties": {
                    "track_data": {"type": "object", "description": "Track data object from search"},
                    "playlist_name": {"type": "string", "description": "Target playlist name", "default": "Liked"},
                },
                "required": ["track_data", "playlist_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_library",
            "description": "Search for music in the local downloaded library",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search terms for local library"}
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_lyrics",
            "description": "Search and retrieve lyrics for a song",
            "parameters": {
                "type": "object",
                "properties": {
                    "song_name": {"type": "string"},
                    "artist": {"type": "string", "description": "Artist name (optional, helps accuracy)"},
                },
                "required": ["song_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_metadata",
            "description": "Fetch high-quality metadata (covers, info) from Genius",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query for Genius (e.g. 'Song Name Artist Name')"}
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_track_metadata",
            "description": "Apply new metadata to a local track",
            "parameters": {
                "type": "object",
                "properties": {
                    "music_id": {"type": "string", "description": "The local music_id of the track to update"},
                    "metadata": {
                        "type": "object",
                        "description": "Fields to update",
                        "properties": {
                            "title": {"type": "string"},
                            "artist": {"type": "string"},
                            "album": {"type": "string"},
                            "genre": {"type": "string"},
                            "lyrics": {"type": "string"},
                            "cover_url": {"type": "string", "description": "URL of the cover image to download and apply"}
                        }
                    }
                },
                "required": ["music_id", "metadata"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "play_song",
            "description": "Start playing a specific song in the player",
            "parameters": {
                "type": "object",
                "properties": {
                    "track_data": {"type": "object", "description": "Track data from search or library"}
                },
                "required": ["track_data"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "plan_tasks",
            "description": "Break down a complex user request into steps",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_description": {"type": "string"}
                },
                "required": ["task_description"],
            },
        },
    }
]

MAX_ITERATIONS = 8

async def handle_music_claw_chat(websocket, cmd_id: str, payload: dict):
    """Handle a music_claw_chat WebSocket command using the new agent loop."""
    user_message: str = payload.get("message", "").strip()
    session_id: str = payload.get("session_id", cmd_id)
    history: List[Dict] = payload.get("history", [])

    if not user_message:
        await send_response(websocket, cmd_id, code=1, error="Message cannot be empty.")
        return

    skills = MusicSkills(websocket=websocket)
    messages: List[Dict] = [{"role": "system", "content": _SYSTEM_PROMPT}]
    
    # Add history
    for msg in history:
        if msg.get("role") in ("user", "assistant"):
            messages.append({"role": msg["role"], "content": msg["content"]})
    
    messages.append({"role": "user", "content": user_message})

    # Frontend update: thinking
    await send_response(websocket, cmd_id, code=0, data={
        "status_type": "claw_update",
        "update_type": "thinking",
        "session_id": session_id,
    })

    # Agent Loop
    is_zai = llm_client.provider == "zai"
    
    if is_zai:
        # Inject tool definitions for Zai
        tool_defs = json.dumps(_TOOLS, ensure_ascii=False, indent=2)
        messages[0]["content"] += (
            "\n\nAVAILABLE TOOLS:\n" + tool_defs +
            "\n\nTo call a tool, use: <tool_call>{\"name\": \"tool_name\", \"parameters\": {...}}</tool_call>"
        )

    for iteration in range(MAX_ITERATIONS):
        try:
            call_kwargs = {}
            if not is_zai:
                call_kwargs["tools"] = _TOOLS
                call_kwargs["tool_choice"] = "auto"
                
            response = await llm_client.chat_completion(messages, session_id=session_id, **call_kwargs)
            if not response or not response.get("choices"):
                break
                
            msg_obj = response["choices"][0]["message"]
            raw_content = msg_obj.get("content") or ""
            native_tool_calls = msg_obj.get("tool_calls") or []
            
            # Detect tool calls
            clean_content, text_tool_calls = parse_text_tool_calls(raw_content)
            all_tool_calls = native_tool_calls + text_tool_calls
            
            messages.append(msg_obj)

            if not all_tool_calls:
                # Final response
                await send_response(websocket, cmd_id, code=0, data={
                    "status_type": "claw_update",
                    "update_type": "complete",
                    "session_id": session_id,
                    "content": raw_content,
                })
                return

            # Execute tools
            for tc in all_tool_calls:
                tc_id = tc.get("id", f"tc_{uuid.uuid4().hex[:8]}")
                func_data = tc.get("function", {})
                tool_name = func_data.get("name")
                try:
                    tool_args = json.loads(func_data.get("arguments", "{}"))
                except:
                    tool_args = {}

                # Send tool_call update to frontend
                await send_response(websocket, cmd_id, code=0, data={
                    "status_type": "claw_update",
                    "update_type": "tool_call",
                    "session_id": session_id,
                    "tool_call": {"id": tc_id, "name": tool_name, "parameters": tool_args},
                })

                # Execute
                if hasattr(skills, tool_name):
                    try:
                        func = getattr(skills, tool_name)
                        result = await func(**tool_args)
                    except Exception as e:
                        result = {"error": str(e)}
                else:
                    result = {"error": f"Tool {tool_name} not found"}

                # Send tool_result update to frontend
                await send_response(websocket, cmd_id, code=0, data={
                    "status_type": "claw_update",
                    "update_type": "tool_result",
                    "session_id": session_id,
                    "tool_result": {"id": tc_id, "name": tool_name, "result": result},
                })

                # Add to history
                result_str = json.dumps(result, ensure_ascii=False)
                if not is_zai and native_tool_calls:
                     messages.append({"role": "tool", "tool_call_id": tc_id, "content": result_str})
                else:
                     messages.append({"role": "user", "content": f"<tool_result>\n{result_str}\n</tool_result>"})
            
        except Exception as e:
            logger.exception("Error in Music Claw agent loop")
            await send_response(websocket, cmd_id, code=1, error=str(e))
            return

    await send_response(websocket, cmd_id, code=1, error="Max iterations reached.")
