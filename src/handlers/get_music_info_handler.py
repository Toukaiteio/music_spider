import json

from utils.data_type import ResultBase
from core.ws_messaging import send_response
from lyrics_allocator.genius import get_song_info

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
