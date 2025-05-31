import json

from utils.data_type import ResultBase
# from core.downloaders import DOWNLOADER_MODULES (hypothetical)
from core.ws_messaging import send_response
from core.state import DOWNLOADER_MODULES

async def handle_get_available_sources(websocket, cmd_id: str, payload: dict):
    """Returns a list of available music sources."""
    print(f"Handling get_available_sources command with cmd_id: {cmd_id}")
    await send_response(websocket, cmd_id, code=0, data={"sources": list(DOWNLOADER_MODULES.keys())})