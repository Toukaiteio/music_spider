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


async def handle_search_downloaded_music(websocket, cmd_id: str, payload: dict):
    print(f"Handling search_downloaded_music command with cmd_id: {cmd_id}, payload: {payload}")
    query = payload.get("query")

    if not query:
        await send_response(websocket, cmd_id, code=1, error="Search query is missing.")
        return

    DOWNLOADS_DIR = "./downloads"
    matching_music_list = []
    search_query_lower = query.lower()

    try:
        if not os.path.exists(DOWNLOADS_DIR) or not os.path.isdir(DOWNLOADS_DIR):
            print("Downloads directory does not exist for search.")
            await send_response(websocket, cmd_id, code=0, data={"results": []})
            return

        for item_name in os.listdir(DOWNLOADS_DIR):
            item_path = os.path.join(DOWNLOADS_DIR, item_name)
            if os.path.isdir(item_path):
                music_id = item_name
                try:
                    music_item_instance = MusicItem.load_from_json(music_id=music_id)
                    if music_item_instance:
                        music_data = music_item_instance.data
                        matches = False
                        if music_data.title and search_query_lower in music_data.title.lower():
                            matches = True
                        if not matches and music_data.author and search_query_lower in music_data.author.lower():
                            matches = True
                        if not matches and music_data.album and search_query_lower in music_data.album.lower():
                            matches = True
                        if not matches and music_data.genre and search_query_lower in music_data.genre.lower():
                            matches = True
                        if not matches and music_data.tags and isinstance(music_data.tags, list):
                            for tag in music_data.tags:
                                if isinstance(tag, str) and search_query_lower in tag.lower():
                                    matches = True
                                    break

                        if matches:
                            already_added = any(item.get("music_id") == music_data.music_id for item in matching_music_list)
                            if not already_added:
                                matching_music_list.append(music_data.to_dict())
                    else:
                        print(f"Could not load MusicItem for music_id: {music_id} during search (load_from_json returned None).")
                except FileNotFoundError:
                    print(f"music.json not found for music_id: {music_id} during search (directory: {item_path})")
                except json.JSONDecodeError:
                    print(f"Invalid JSON in music.json for music_id: {music_id} during search (directory: {item_path})")
                except Exception as e:
                    print(f"Error loading MusicItem for music_id {music_id} from {item_path} during search: {e}")

        await send_response(websocket, cmd_id, code=0, data={"results": matching_music_list})

    except Exception as e:
        print(f"Error searching downloaded music library: {e}")
        await send_response(websocket, cmd_id, code=1, error=f"Failed to search library: {str(e)}")
