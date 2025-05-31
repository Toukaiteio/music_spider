import json

from utils.data_type import ResultBase
# from core.downloaders import DOWNLOADER_MODULES (hypothetical)
# from core.ws_messaging import send_response (hypothetical)

# Placeholder for DOWNLOADER_MODULES
DOWNLOADER_MODULES = {}

# Placeholder for send_response
async def send_response(websocket, cmd_id: str, code: int, data: dict = None, error: str = None):
    response_payload = {"original_cmd_id": cmd_id}
    if error:
        response_payload["error"] = error
    if data:
        response_payload.update(data)

    response = ResultBase(code=code, data=response_payload)
    try:
        await websocket.send(json.dumps(response.get_json()))
    except Exception as e:
        print(f"Failed to send response for cmd_id {cmd_id}: {e}")


async def handle_get_available_sources(websocket, cmd_id: str, payload: dict):
    """Returns a list of available music sources."""
    print(f"Handling get_available_sources command with cmd_id: {cmd_id}")
    # This is a temporary solution. DOWNLOADER_MODULES should be managed centrally.
    if not DOWNLOADER_MODULES:
        try:
            # Attempt to dynamically import if not already populated (example of a fallback)
            from downloaders import soundcloud_downloader, bilibili_downloader
            # This requires downloaders to be in PYTHONPATH and structured as a package.

            # Re-populate DOWNLOADER_MODULES (this is still a temporary fix)
            global DOWNLOADER_MODULES_TEMP
            DOWNLOADER_MODULES_TEMP = {
                 "soundcloud": soundcloud_downloader,
                 "bilibili": bilibili_downloader,
            }
            await send_response(websocket, cmd_id, code=0, data={"sources": list(DOWNLOADER_MODULES_TEMP.keys())})
        except ImportError as ie:
             print(f"Failed to import downloader modules dynamically: {ie}")
             await send_response(websocket, cmd_id, code=1, error=f"Server setup error: Downloader modules not available.")
             return
    else:
        await send_response(websocket, cmd_id, code=0, data={"sources": list(DOWNLOADER_MODULES.keys())})

# Define a global for temporary use if needed by the dynamic import example
DOWNLOADER_MODULES_TEMP = {}
