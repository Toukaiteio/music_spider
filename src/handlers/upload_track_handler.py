import os
import json
import time
import base64
import shutil

from utils.data_type import ResultBase, MusicItem
from utils.helpers import decrypt_path, TEMP_UPLOAD_DIR # Import helper and constants
from core.ws_messaging import send_response
from config import DOWNLOADS_DIR
async def handle_upload_track(websocket, cmd_id: str, payload: dict):
    print(f"Handling upload_track command with cmd_id: {cmd_id}")
    track_data = payload.get("track_data", {})

    required_fields = ["title", "audio_binary"] # Assuming audio_binary is still part of this simplified handler
    for field in required_fields:
        if field not in track_data:
            await send_response(websocket, cmd_id, code=1, error=f"Missing required field: {field}")
            return

    work_path = None # Define work_path to ensure it's available in finally block for cleanup
    try:
        now = time.localtime()
        timestamp = time.strftime("%Y_%m_%d_%H_%M_%S", now)

        audio_size = 0
        if isinstance(track_data["audio_binary"], str):
            audio_size = len(track_data["audio_binary"]) * 3 // 4

        music_id = f"upload_{timestamp}_{audio_size}"

        work_path = os.path.join(DOWNLOADS_DIR, music_id) # Assign here
        os.makedirs(work_path, exist_ok=True)

        # Process audio file (assuming it's base64 encoded string)
        audio_filename = "audio.mp3" # Default, consider making dynamic via payload
        audio_path_full = os.path.join(work_path, audio_filename)

        if isinstance(track_data["audio_binary"], str):
            audio_binary_data = base64.b64decode(track_data["audio_binary"])
            with open(audio_path_full, "wb") as f:
                f.write(audio_binary_data)
            print(f"Saved audio for uploaded track {music_id} to {audio_path_full}")
        else:
            # This case should ideally not happen if validation is strict or if type is enforced.
            # If audio_binary is not string, it implies a different upload mechanism (e.g. chunked directly to file path).
            # For this handler, we assume base64 string as per original structure.
            await send_response(websocket, cmd_id, code=1, error="Invalid format for audio_binary.")
            return

        relative_cover_path_for_item = None
        if "cover_binary" in track_data and track_data["cover_binary"]:
            cover_dir = os.path.join(work_path, "covers")
            os.makedirs(cover_dir, exist_ok=True)

            cover_ext_from_payload = track_data.get("cover_ext", "jpg").lower().strip(".")
            cover_filename = f"cover.{cover_ext_from_payload}"
            cover_path_full = os.path.join(cover_dir, cover_filename)

            if isinstance(track_data["cover_binary"], str):
                cover_data = base64.b64decode(track_data["cover_binary"])
                with open(cover_path_full, "wb") as f:
                    f.write(cover_data)
                relative_cover_path_for_item = cover_path_full # MusicItem expects path relative to its work_path
                print(f"Saved cover image for uploaded track {music_id} to {relative_cover_path_for_item}")
            else:
                print(f"cover_binary for uploaded track {music_id} is not a string. Skipping cover save.")

        elif "cover_local_path" in payload and payload["cover_local_path"]: # Check payload directly, not track_data
            cover_local_path_enc = payload["cover_local_path"]
            # Ensure TEMP_UPLOAD_DIR is defined, e.g. from a config or global const
            # For now, it's hardcoded at the top of this file.
            cover_local_path = decrypt_path(cover_local_path_enc) # decrypt the path
            abs_temp_upload_dir = os.path.abspath(TEMP_UPLOAD_DIR)
            abs_cover_path = os.path.abspath(cover_local_path)

            # Security check: Ensure the path is within TEMP_UPLOAD_DIR
            if os.path.commonprefix([abs_cover_path, abs_temp_upload_dir]) != abs_temp_upload_dir:
                print(f"Attempt to access path outside TEMP_UPLOAD_DIR denied: {cover_local_path}")
            elif os.path.isfile(abs_cover_path):
                cover_dir = os.path.join(work_path, "covers")
                os.makedirs(cover_dir, exist_ok=True)
                for old_cover in os.listdir(cover_dir): # Clean up old covers
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
                relative_cover_path_for_item = new_cover_path # Path relative to work_path
                print(f"Moved cover image for track {music_id} from local path: {relative_cover_path_for_item}")
            else:
                print(f"cover_local_path does not exist or is not a file: {abs_cover_path}")


        music_item = MusicItem(
            music_id=music_id,
            title=track_data["title"],
            author=track_data.get("author", ""),
            album=track_data.get("album", ""),
            description=track_data.get("description", ""),
            genre=track_data.get("genre", ""),
            tags=track_data.get("tags", []),
            lyrics=track_data.get("lyrics", ""),
            lossless=False,
            duration=0
        )

        music_item.set_audio(os.path.join("./downloads/", audio_filename)) # Path relative to work_path
        if relative_cover_path_for_item:
            music_item.set_cover(os.path.join("./downloads/", "./covers/" + new_cover_filename))

        music_item.dump_self()

        await send_response(
            websocket,
            cmd_id,
            code=0,
            data={
                "message": "Track uploaded successfully",
                "music_id": music_id,
                "track_data": music_item.data.to_dict()
            }
        )

    except Exception as e:
        print(f"Error uploading track: {e}")
        if work_path and os.path.exists(work_path): # Check if work_path was assigned
            try:
                shutil.rmtree(work_path)
            except Exception as cleanup_error:
                print(f"Error cleaning up failed upload: {cleanup_error}")

        await send_response(websocket, cmd_id, code=1, error=f"Upload failed: {str(e)}")
