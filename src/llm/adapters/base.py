from typing import Any, Dict, List, Optional
from abc import ABC, abstractmethod

class LLMAdapter(ABC):
    """Base class for LLM adapters."""
    
    @abstractmethod
    async def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        """Send a chat completion request to the LLM."""
        pass

    @abstractmethod
    async def chat_completion_stream(
        self,
        messages: List[Dict[str, Any]],
        **kwargs
    ):
        """Send a streaming chat completion request to the LLM."""
        pass
