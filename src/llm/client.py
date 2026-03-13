import json
import logging
import re
import uuid
import asyncio
from typing import Any, Dict, List, Optional, Tuple

from .adapters.zai_adapter import ZaiAdapter
from .adapters.openai_adapter import OpenAIAdapter

logger = logging.getLogger("LLMClient")

# Tool-call text parsing (for prompt-based fallback, used by ZAI)
_TOOL_CALL_RE = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.DOTALL)

def parse_text_tool_calls(text: str) -> Tuple[str, List[Dict]]:
    """Extract <tool_call>{...}</tool_call> blocks from text.
    Returns (cleaned_text, list_of_openai_style_tool_call_dicts).
    """
    tool_calls: List[Dict] = []
    for m in _TOOL_CALL_RE.finditer(text):
        try:
            tc = json.loads(m.group(1))
            # Zai might output parameters or arguments
            args = tc.get("parameters") or tc.get("arguments") or {}
            tool_calls.append(
                {
                    "id": f"tc_{uuid.uuid4().hex[:8]}",
                    "type": "function",
                    "function": {
                        "name": tc.get("name", ""),
                        "arguments": json.dumps(args, ensure_ascii=False) if isinstance(args, dict) else args,
                    },
                    "_text_based": True,
                }
            )
        except json.JSONDecodeError:
            pass
    clean = _TOOL_CALL_RE.sub("", text).strip()
    return clean, tool_calls

class LLMClient:
    """Unified LLM Client that dispatches to adapters and handles tool execution."""

    def __init__(self):
        from config import (
            LLM_PROVIDER,
            OPENAI_API_KEY,
            OPENAI_BASE_URL,
            OPENAI_MODEL,
            ZAI_COOKIE,
            ZAI_MODEL,
            ZAI_TOKEN,
            ZAI_USER_ID,
        )
        
        self.provider = LLM_PROVIDER
        if LLM_PROVIDER == "zai":
            self._adapter = ZaiAdapter(ZAI_TOKEN, ZAI_COOKIE, ZAI_USER_ID, ZAI_MODEL)
            self.supports_native_tools = False
        else:
            self._adapter = OpenAIAdapter(OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL)
            self.supports_native_tools = True

    async def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        session_id: str = "default",
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        """Basic chat completion wrapper."""
        return await self._adapter.chat_completion(messages, session_id=session_id, **kwargs)

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
