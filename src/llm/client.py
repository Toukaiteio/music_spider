import json
import logging
import re
import uuid
import asyncio
from typing import Any, Dict, List, Optional, Tuple

from .adapters.openai_adapter import OpenAIAdapter

logger = logging.getLogger("LLMClient")

# Tool-call text parsing (for prompt-based fallback, used by ZAI)
# Removed fixed _TOOL_CALL_RE in favor of more robust regex inside parse_text_tool_calls

def parse_text_tool_calls(text: str) -> Tuple[str, List[Dict]]:
    """Extract [ACTION: name | JSON] blocks from text.
    Returns (cleaned_text, list_of_openai_style_tool_call_dicts).
    """
    tool_calls: List[Dict] = []
    
    # Updated regex for [ACTION: name | JSON]
    # Format: [ACTION: search_music | {"query": "..."}]
    raw_pattern = re.compile(r"\[ACTION: (\w+)\s*\|\s*(\{.*?\})\]", re.DOTALL)
    
    for m in raw_pattern.finditer(text):
        tool_name = m.group(1).strip()
        raw_json = m.group(2).strip()
        
        tc_args = None
        try:
            tc_args = json.loads(raw_json)
        except json.JSONDecodeError:
            # Fallback: try to find the first { and last } if json.loads failed 
            try:
                curly_match = re.search(r"(\{.*\})", raw_json, re.DOTALL)
                if curly_match:
                    tc_args = json.loads(curly_match.group(1))
            except:
                pass

        if tool_name and tc_args is not None:
            # We want to normalize this to OpenAI tool_call format
            tool_calls.append(
                {
                    "id": f"tc_{uuid.uuid4().hex[:8]}",
                    "type": "function",
                    "function": {
                        "name": tool_name,
                        "arguments": json.dumps(tc_args, ensure_ascii=False) if isinstance(tc_args, dict) else str(tc_args),
                    },
                    "_text_based": True,
                }
            )
            
    clean = raw_pattern.sub("", text).strip()
    return clean, tool_calls

class LLMClient:
    """Unified LLM Client that dispatches to adapters and handles tool execution."""

    def __init__(self, api_keys: Optional[List[str]] = None, base_url: Optional[str] = None, model: Optional[str] = None, lb_mode: str = "round_robin"):
        from config import (
            OPENAI_API_KEY,
            OPENAI_BASE_URL,
            OPENAI_MODEL,
        )
        
        self.provider = "openai"
        
        if not api_keys:
            api_keys = [OPENAI_API_KEY]
        elif isinstance(api_keys, str):
            api_keys = [api_keys]
            
        if not base_url:
            base_url = OPENAI_BASE_URL
        if not model:
            model = OPENAI_MODEL
            
        self._adapter = OpenAIAdapter(api_keys, base_url, model, lb_mode)
        self.supports_native_tools = True

    async def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        session_id: str = "default",
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        """Basic chat completion wrapper."""
        return await self._adapter.chat_completion(messages, session_id=session_id, **kwargs)

    async def chat_completion_stream(
        self,
        messages: List[Dict[str, Any]],
        session_id: str = "default",
        **kwargs
    ):
        """Streaming chat completion wrapper."""
        async for chunk in self._adapter.chat_completion_stream(messages, session_id=session_id, **kwargs):
            yield chunk

    async def agent_chat(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        skill_handler: Any, # Object that implements the tool functions
        session_id: str = "default",
        max_turns: int = 5,
        **kwargs
    ) -> Optional[str]:
        """
        Runs an agent loop:
        1. Inject tool definitions if needed (for non-native providers).
        2. Call LLM.
        3. Parse tool calls.
        4. Execute tools.
        5. Provide observations back to LLM.
        6. Repeat.
        """
        current_messages = list(messages)
        
        # If provider is ZAI, we MUST inject tool definitions into the system prompt
        if not self.supports_native_tools:
            tool_definitions_str = json.dumps(tools, ensure_ascii=False, indent=2)
            system_injection = (
                "\n\nAVAILABLE TOOLS:\n"
                f"{tool_definitions_str}\n\n"
                "To call a tool, use the following format:\n"
                "<tool_call>{\"name\": \"tool_name\", \"parameters\": {\"arg1\": \"val1\"}}</tool_call>\n"
                "You can call multiple tools if needed. Always wait for the tool output before proceeding."
            )
            
            # Find system message or add one
            system_msg = next((m for m in current_messages if m["role"] == "system"), None)
            if system_msg:
                system_msg["content"] += system_injection
            else:
                current_messages.insert(0, {"role": "system", "content": system_injection})

        for turn in range(max_turns):
            response = await self.chat_completion(current_messages, session_id=session_id, tools=tools if self.supports_native_tools else None, **kwargs)
            
            if not response or not response.get("choices"):
                return None
            
            choice = response["choices"][0]
            message = choice.get("message")
            if not message:
                return None
                
            content = message.get("content") or ""
            native_tool_calls = message.get("tool_calls", [])
            
            # Add assistant message to history
            current_messages.append(message)
            
            # Process tool calls
            all_tool_calls = []
            if native_tool_calls:
                all_tool_calls.extend(native_tool_calls)
            
            # Fallback for text-based tool calls (important for Zai)
            clean_content, text_tool_calls = parse_text_tool_calls(content)
            if text_tool_calls:
                all_tool_calls.extend(text_tool_calls)

            if not all_tool_calls:
                # No more tools to call, return final content
                return content

            # Execute tools
            for tc in all_tool_calls:
                func_name = tc["function"]["name"]
                try:
                    args = json.loads(tc["function"]["arguments"])
                except Exception:
                    args = {}
                
                logger.info(f"Executing tool: {func_name} with args: {args}")
                
                # Call the skill handler
                if hasattr(skill_handler, func_name):
                    try:
                        func = getattr(skill_handler, func_name)
                        if asyncio.iscoroutinefunction(func):
                            result = await func(**args)
                        else:
                            result = func(**args)
                    except Exception as e:
                        result = {"error": str(e)}
                else:
                    result = {"error": f"Tool {func_name} not found"}
                
                logger.info(f"Tool {func_name} result: {result}")
                
                # Add observation to history
                current_messages.append({
                    "role": "tool" if self.supports_native_tools else "user",
                    "tool_call_id": tc["id"],
                    "name": func_name,
                    "content": json.dumps(result, ensure_ascii=False) if isinstance(result, (dict, list)) else str(result)
                })
                
                # For Zai (user role based observations), we might want to add a prefix
                if not self.supports_native_tools:
                    current_messages[-1]["content"] = f"Observation from {func_name}: {current_messages[-1]['content']}"

        return "Max turns reached without final answer."

# Global singleton
llm_client = LLMClient()
