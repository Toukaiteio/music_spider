from utils.data_type import ResultBase, MusicItem # MusicItem needed by finalize_chunked_upload
import websockets
import json
# Helper function to send responses (remains in server.py as it's core to WebSocket interaction)
async def send_response(websocket, cmd_id: str, code: int, data: dict = None, error: str = None):
    """Helper function to send a consistent response structure."""
    response_payload = {"original_cmd_id": cmd_id}
    if error:
        response_payload["error"] = error
    if data:
        response_payload.update(data)

    response = ResultBase(code=code, data=response_payload)
    try:
        await websocket.send(json.dumps(response.get_json()))
    except websockets.exceptions.ConnectionClosed:
        print(f"Attempted to send to a closed connection for cmd_id {cmd_id}.")
    except Exception as e:
        print(f"Failed to send response for cmd_id {cmd_id}: {e}")