import os
import json

from utils.data_type import ResultBase, MusicItem
# from core.ws_messaging import send_response (hypothetical)

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


async def handle_get_downloaded_music(websocket, cmd_id: str, payload: dict):
    print(f"Handling get_downloaded_music command with cmd_id: {cmd_id}")
    DOWNLOADS_DIR = "./downloads"
    downloaded_music_list = []

    try:
        if not os.path.exists(DOWNLOADS_DIR) or not os.path.isdir(DOWNLOADS_DIR):
            print("Downloads directory does not exist.")
            await send_response(websocket, cmd_id, code=0, data={"library": []})
            return

        for item_name in os.listdir(DOWNLOADS_DIR):
            item_path = os.path.join(DOWNLOADS_DIR, item_name)
            if os.path.isdir(item_path):
                music_id = item_name
                try:
                    music_item_instance = MusicItem.load_from_json(music_id=music_id)
                    if music_item_instance:
                        downloaded_music_list.append(music_item_instance.data.to_dict())
                    else:
                        print(f"Could not load MusicItem for music_id: {music_id} (load_from_json returned None).")
                except FileNotFoundError:
                    print(f"music.json not found for music_id: {music_id} (directory: {item_path})")
                except json.JSONDecodeError:
                    print(f"Invalid JSON in music.json for music_id: {music_id} (directory: {item_path})")
                except Exception as e:
                    print(f"Error loading MusicItem for music_id {music_id} from {item_path}: {e}")

        await send_response(websocket, cmd_id, code=0, data={"library": downloaded_music_list})

    except Exception as e:
        print(f"Error retrieving downloaded music library: {e}")
        await send_response(websocket, cmd_id, code=1, error=f"Failed to retrieve library: {str(e)}")
