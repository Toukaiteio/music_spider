"""
Get Available Sources Handler
Returns only the sources that are currently enabled in the SourceManager.
"""
from core.ws_messaging import send_response
from core.source_manager import get_source_enabled_status, SOURCE_MANAGERS

async def handle_get_available_sources(websocket, cmd_id: str, payload: dict):
    """Returns a list of available music sources that are enabled."""
    print(f"Handling get_available_sources command with cmd_id: {cmd_id}")
    
    # Filter sources based on their enabled status
    enabled_sources = [
        name for name in SOURCE_MANAGERS.keys() 
        if get_source_enabled_status(name)
    ]
    
    await send_response(websocket, cmd_id, code=0, data={"sources": enabled_sources})