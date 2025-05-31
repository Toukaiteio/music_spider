import os
import json
import time
import base64
import shutil

from utils.data_type import ResultBase, MusicItem
from utils.helpers import decrypt_path, TEMP_UPLOAD_DIR # Import helper and constants
from core.ws_messaging import send_response

async def handle_update_track_info(websocket, cmd_id: str, payload: dict):
    print(f"Handling update_track_info command with cmd_id: {cmd_id}, payload: {payload}")
    music_id = payload.get("music_id")

    if not music_id or not isinstance(music_id, str):
        await send_response(websocket, cmd_id, code=1, error="Missing or invalid music_id.")
        return

    try:
        music_item = MusicItem.load_from_json(music_id)
        if not music_item:
            await send_response(websocket, cmd_id, code=1, error=f"Track {music_id} not found.")
            return

        updatable_fields = ["title", "author", "album", "genre", "description", "lyrics"]
        updated_fields_tracker = []

        for field in updatable_fields:
            if field in payload:
                setattr(music_item, field, payload[field])
                updated_fields_tracker.append(field)

        if "cover_binary" in payload and payload["cover_binary"]:
            try:
                cover_dir = os.path.join(music_item.work_path, "covers")
                os.makedirs(cover_dir, exist_ok=True)
                old_cover_files = []
                if os.path.exists(cover_dir):
                    old_cover_files = [f for f in os.listdir(cover_dir) if os.path.isfile(os.path.join(cover_dir, f))]

                cover_ext = payload.get("cover_ext", "jpg").lower().strip(".")
                cover_filename = f"cover_{int(time.time())}.{cover_ext}"
                new_cover_path_full = os.path.join(cover_dir, cover_filename)

                if isinstance(payload["cover_binary"], str):
                    cover_data = base64.b64decode(payload["cover_binary"])
                    with open(new_cover_path_full, "wb") as f:
                        f.write(cover_data)

                    music_item.set_cover(new_cover_path_full) # Path relative to work_path is fine if MusicItem handles it
                    updated_fields_tracker.append("cover_image")
                    print(f"Updated cover image for track {music_id} to {new_cover_path_full}")

                    for old_file_name in old_cover_files:
                        if old_file_name != cover_filename:
                            try:
                                os.remove(os.path.join(cover_dir, old_file_name))
                                print(f"Deleted old cover: {old_file_name} for track {music_id}")
                            except OSError as e_remove:
                                print(f"Error deleting old cover {old_file_name}: {e_remove}")
                else:
                    print(f"cover_binary for track {music_id} is not a string, skipping cover update.")

            except Exception as e:
                print(f"Error processing cover image for track {music_id}: {e}")
        elif "cover_local_path" in payload and payload["cover_local_path"]:
            # Ensure TEMP_UPLOAD_DIR is defined, e.g. from a config or global const
            # For now, it's hardcoded at the top of this file.
            cover_local_path = decrypt_path(payload["cover_local_path"])
            abs_temp_upload_dir = os.path.abspath(TEMP_UPLOAD_DIR)
            abs_cover_path = os.path.abspath(cover_local_path)

            # Security check: Ensure the path is within TEMP_UPLOAD_DIR
            if os.path.commonprefix([abs_cover_path, abs_temp_upload_dir]) != abs_temp_upload_dir:
                print(f"Attempt to access path outside TEMP_UPLOAD_DIR denied: {cover_local_path}")
                # Optionally send error response, or just log and skip
            elif os.path.isfile(abs_cover_path):
                cover_dir = os.path.join(music_item.work_path, "covers")
                os.makedirs(cover_dir, exist_ok=True)
                for old_cover in os.listdir(cover_dir):
                    old_cover_path = os.path.join(cover_dir, old_cover)
                    if os.path.isfile(old_cover_path):
                        try:
                            os.remove(old_cover_path)
                        except Exception as e_remove:
                            print(f"Error deleting old cover {old_cover_path}: {e_remove}")

                cover_ext = os.path.splitext(abs_cover_path)[1].lstrip(".") or "jpg"
                new_cover_filename = f"cover_{int(time.time())}.{cover_ext}"
                new_cover_path = os.path.join(cover_dir, new_cover_filename)
                shutil.move(abs_cover_path, new_cover_path)
                music_item.set_cover(new_cover_path) # Path relative to work_path
                updated_fields_tracker.append("cover_image")
                print(f"Updated cover image for track {music_id} using local path: {new_cover_path}")
            else:
                print(f"cover_local_path does not exist or is not a file: {abs_cover_path}")

        music_item.dump_self()
        print(f"Track {music_id} updated successfully with provided fields: {updated_fields_tracker}")

        await send_response(
            websocket,
            cmd_id,
            code=0,
            data={
                "message": "Track updated successfully.",
                "track_data": music_item.data.to_dict(),
                "updated_fields": updated_fields_tracker
            }
        )

    except Exception as e:
        print(f"Error updating track {music_id}: {e}")
        import traceback
        traceback.print_exc()
        await send_response(websocket, cmd_id, code=1, error=f"Failed to update track: {str(e)}")
