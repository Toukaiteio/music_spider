import json

from utils.data_type import ResultBase
# from core.ws_messaging import send_response (hypothetical)
# from lyrics_allocator.genius import get_song_info # This will be a key dependency

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

# Placeholder for get_song_info from lyrics_allocator.genius
# In a real setup, this import should work if the path is correct and genius.py is accessible.
# For now, define a dummy function if direct import fails during isolated testing.
try:
    from lyrics_allocator.genius import get_song_info
except ImportError:
    print("Warning: lyrics_allocator.genius not found. Using placeholder for get_song_info.")
    def get_song_info(name, artist):
        # Dummy implementation
        print(f"Placeholder get_song_info called with Name: {name}, Artist: {artist}")
        if name == "Test Song":
            return {"title": name, "artist": artist if artist else "Unknown Artist", "lyrics": "Placeholder lyrics..."}
        return None


async def handle_get_music_info(websocket, cmd_id, payload):
    music_name = payload.get("name", "")
    music_artist = payload.get("artist", None)

    if not music_name:
        await send_response(websocket, cmd_id, code=1, error="Missing required field: name")
        return

    try:
        # This relies on get_song_info being available, either imported or via placeholder.
        music_info = get_song_info(music_name, music_artist)
        if music_info:
            await send_response(websocket, cmd_id, code=0, data={"music_info": music_info})
        else:
            await send_response(websocket, cmd_id, code=1, error="No music info found")
    except Exception as e:
        print(f"Error in handle_get_music_info: {e}")
        await send_response(websocket, cmd_id, code=1, error=f"Failed to get music info: {str(e)}")
