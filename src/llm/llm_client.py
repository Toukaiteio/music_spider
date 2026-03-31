"""
Unified LLM Client Wrapper (Refactored)
This file now serves as a bridge to the modularized adapter system.
"""
from .client import llm_client, LLMClient, parse_text_tool_calls
from .adapters.openai_adapter import OpenAIAdapter as OpenAIClient

# For compatibility with legacy imports
LLMClient = LLMClient
llm_client = llm_client
parse_text_tool_calls = parse_text_tool_calls
OpenAIClient = OpenAIClient
