import os
import json
import time
import shutil
import base64
import os
import json
import time
import shutil


from utils.data_type import ResultBase, MusicItem
from utils.helpers import (
    read_session_manifest,
    write_session_manifest,
    decrypt_path,
    TEMP_UPLOAD_DIR,
    DOWNLOADS_DIR
)
from core.ws_messaging import send_response

async def handle_finalize_chunked_upload(websocket, cmd_id: str, payload: dict):
    upload_session_id = payload.get("upload_session_id")
    client_filename = payload.get("filename")
    total_chunks_from_client = payload.get("total_chunks")

    print(f"Handling finalize_chunked_upload: session_id={upload_session_id}, filename={client_filename}, total_chunks={total_chunks_from_client}")

    if not all([upload_session_id, client_filename, isinstance(total_chunks_from_client, int)]):
        await send_response(websocket, cmd_id, code=1, error="Missing required fields for finalize: upload_session_id, filename, total_chunks.")
        return

    manifest_data = read_session_manifest(upload_session_id) # Use imported helper
    if not manifest_data:
        await send_response(websocket, cmd_id, code=1, error=f"Upload session not found or manifest unreadable: {upload_session_id}")
        return

    session_path = os.path.join(TEMP_UPLOAD_DIR, upload_session_id)
    reassembled_filepath = None # Define to ensure it's available for cleanup

    try:
        if manifest_data.get("status") == "finalized":
            await send_response(websocket, cmd_id, code=1, error=f"Upload session {upload_session_id} already finalized.")
            return

        if manifest_data["total_chunks_expected"] == 0 and total_chunks_from_client > 0 :
            manifest_data["total_chunks_expected"] = total_chunks_from_client

        if manifest_data["chunks_received_count"] != manifest_data["total_chunks_expected"] or \
           manifest_data["chunks_received_count"] != total_chunks_from_client or \
           len(manifest_data["chunks_received_map"]) != manifest_data["total_chunks_expected"]:
            print(f"Chunk verification failed for session {upload_session_id}: Expected {manifest_data['total_chunks_expected']}, Received {manifest_data['chunks_received_count']}")
            await send_response(websocket, cmd_id, code=1, error="Chunk verification failed: Mismatch in chunk counts.")
            return

        for i in range(manifest_data["total_chunks_expected"]):
            chunk_file_path = os.path.join(session_path, f"chunk_{i}")
            if not os.path.exists(chunk_file_path) or not manifest_data["chunks_received_map"].get(str(i)):
                print(f"Chunk verification failed for session {upload_session_id}: Missing chunk file or manifest entry for chunk_{i}")
                await send_response(websocket, cmd_id, code=1, error=f"Chunk verification failed: Missing chunk {i}.")
                return

        temp_reassembled_filename = f"reassembled_{upload_session_id}_{manifest_data['filename']}"
        reassembled_filepath = os.path.join(TEMP_UPLOAD_DIR, temp_reassembled_filename) # Assign here for cleanup

        print(f"Reassembling file for session {upload_session_id} to {reassembled_filepath}")
        with open(reassembled_filepath, 'wb') as outfile:
            for i in range(manifest_data["total_chunks_expected"]):
                chunk_file_path = os.path.join(session_path, f"chunk_{i}")
                with open(chunk_file_path, 'rb') as infile:
                    outfile.write(infile.read())
        print(f"File reassembled successfully for session {upload_session_id}")

        file_type = manifest_data["file_type"]
        metadata_from_init = manifest_data.get("metadata", {})

        if file_type == "audio":
            original_filename = metadata_from_init.get("original_filename", manifest_data["filename"])
            timestamp = time.strftime("%Y%m%d_%H%M%S", time.localtime(manifest_data.get("created_at", time.time())))
            unique_suffix = upload_session_id.split('-')[0]
            music_id_str = f"upload_{timestamp}_{unique_suffix}_{manifest_data['total_size']}"

            music_item_work_path = os.path.join(DOWNLOADS_DIR, music_id_str) # Use DOWNLOADS_DIR
            os.makedirs(music_item_work_path, exist_ok=True)

            audio_file_ext = os.path.splitext(original_filename)[1] if os.path.splitext(original_filename)[1] else ".mp3"
            final_audio_filename = f"audio{audio_file_ext}"
            final_audio_path = os.path.join(music_item_work_path, final_audio_filename)

            shutil.move(reassembled_filepath, final_audio_path)
            reassembled_filepath = None # Mark as moved
            print(f"Moved reassembled audio to: {final_audio_path}")

            music_item = MusicItem(
                music_id=music_id_str,
                title=metadata_from_init.get("title", "Untitled Track"),
                author=metadata_from_init.get("author", "Unknown Artist"),
                album=metadata_from_init.get("album_name", ""),
                description=metadata_from_init.get("description", ""),
                genre=metadata_from_init.get("genre", ""),
                lyrics=metadata_from_init.get("lyrics", ""),
            )
            music_item.set_audio(final_audio_path) # Path relative to work_path

            cover_local_path_enc = metadata_from_init.get("cover_local_path")
            if cover_local_path_enc:
                cover_local_path = decrypt_path(cover_local_path_enc)
                abs_cover_path = os.path.abspath(cover_local_path)
                abs_temp_upload_dir = os.path.abspath(TEMP_UPLOAD_DIR)
                if os.path.commonprefix([abs_cover_path, abs_temp_upload_dir]) == abs_temp_upload_dir and os.path.isfile(abs_cover_path):
                    covers_dir = os.path.join(music_item_work_path, "covers")
                    os.makedirs(covers_dir, exist_ok=True)
                    for old_cover in os.listdir(covers_dir): # Cleanup
                        old_cover_path = os.path.join(covers_dir, old_cover)
                        if os.path.isfile(old_cover_path): os.remove(old_cover_path)

                    cover_ext = os.path.splitext(abs_cover_path)[1].lstrip(".") or "jpg"
                    new_cover_filename = f"cover_{int(time.time())}.{cover_ext}"
                    new_cover_path = os.path.join(covers_dir, new_cover_filename)
                    shutil.move(abs_cover_path, new_cover_path)
                    music_item.set_cover(new_cover_path) # Path relative to work_path
                    print(f"Set cover for {music_id_str} using uploaded cover: {new_cover_path}")
                # else: log error or handle invalid path

            if "cover_binary_on_finalize" in metadata_from_init and "cover_ext_on_finalize" in metadata_from_init:
                # Handle small cover sent during audio finalization (as in original)
                cover_binary_b64 = metadata_from_init["cover_binary_on_finalize"]
                cover_ext = metadata_from_init["cover_ext_on_finalize"].strip(".")
                if cover_binary_b64 and cover_ext:
                    covers_dir = os.path.join(music_item_work_path, "covers")
                    os.makedirs(covers_dir, exist_ok=True) # Ensure covers dir exists
                    # Potentially clear old covers if this is meant to be the primary one
                    temp_cover_filename = f"cover.{cover_ext}" # Using a consistent name or timestamped
                    temp_cover_path = os.path.join(covers_dir, temp_cover_filename)
                    try:
                        cover_data = base64.b64decode(cover_binary_b64)
                        with open(temp_cover_path, "wb") as f_cover:
                            f_cover.write(cover_data)
                        # If music_item.data.cover_path is not already set by a cover_local_path, set this one.
                        if not music_item.data.cover_path:
                             music_item.set_cover(os.path.join("covers", temp_cover_filename)) # Relative path
                        print(f"Initial small cover saved for {music_id_str} to {temp_cover_path}")
                    except Exception as e_cover:
                        print(f"Error saving initial small cover for {music_id_str}: {e_cover}")
                        # Decide if this error is critical enough to fail the upload.

            music_item.dump_self()
            await send_response(websocket, cmd_id, code=0, data={
                "message": "Audio file uploaded and processed successfully.",
                "track_data": music_item.data.to_dict()
            })

        elif file_type == "cover":
            music_id_for_cover = payload.get("music_id", metadata_from_init.get("music_id_for_cover"))
            if not music_id_for_cover:
                await send_response(websocket, cmd_id, code=1, error="Music ID for cover association not provided.")
                # reassembled_filepath is still valid here for cleanup if necessary
                return # reassembled_filepath will be cleaned up in finally

            music_item = MusicItem.load_from_json(music_id_for_cover)
            if not music_item:
                await send_response(websocket, cmd_id, code=1, error=f"Associated track (music_id: {music_id_for_cover}) not found for cover.")
                return # reassembled_filepath will be cleaned up in finally

            cover_file_ext = os.path.splitext(manifest_data["filename"])[1].lstrip('.') or "jpg"
            covers_path = os.path.join(music_item.work_path, "covers")
            os.makedirs(covers_path, exist_ok=True)

            for old_cover in os.listdir(covers_path): # Cleanup
                if os.path.isfile(os.path.join(covers_path, old_cover)):
                    try:
                        os.remove(os.path.join(covers_path, old_cover))
                    except OSError as e_remove: print(f"Error deleting old cover {old_cover}: {e_remove}")

            new_cover_filename = f"cover_{int(time.time())}.{cover_file_ext}"
            final_cover_path = os.path.join(covers_path, new_cover_filename)

            shutil.move(reassembled_filepath, final_cover_path)
            reassembled_filepath = None # Mark as moved
            print(f"Moved reassembled cover to: {final_cover_path}")

            music_item.set_cover(final_cover_path) # Path relative to work_path
            music_item.dump_self()

            await send_response(websocket, cmd_id, code=0, data={
                "message": "Cover image uploaded and associated successfully.",
                "music_id": music_id_for_cover,
                "cover_path": music_item.data.cover_path # Send the relative path
            })
        else:
            await send_response(websocket, cmd_id, code=1, error=f"Unknown file_type for finalization: {file_type}")
            return # reassembled_filepath will be cleaned up in finally

        manifest_data["status"] = "finalized"
        manifest_data["finalized_at"] = time.time()
        _write_session_manifest(upload_session_id, manifest_data)

        shutil.rmtree(session_path) # Cleanup session directory
        print(f"Cleaned up session directory: {session_path}")

    except IOError as e_io: # More specific error for reassembly failure
        print(f"IOError during file operation for session {upload_session_id}: {e_io}")
        await send_response(websocket, cmd_id, code=1, error=f"Server error: File operation failed ({e_io.strerror}).")
    except Exception as e_process:
        print(f"Error processing finalized file for session {upload_session_id}: {e_process}")
        import traceback
        traceback.print_exc()
        await send_response(websocket, cmd_id, code=1, error=f"Server error processing file: {str(e_process)}")
    finally:
        # Cleanup reassembled file if it exists and wasn't moved (e.g. due to error before move)
        if reassembled_filepath and os.path.exists(reassembled_filepath):
            try:
                os.remove(reassembled_filepath)
                print(f"Cleaned up reassembled file due to error or incomplete processing: {reassembled_filepath}")
            except OSError as e_remove_reassembled:
                print(f"Error cleaning up reassembled file {reassembled_filepath}: {e_remove_reassembled}")
        # Session path cleanup might be needed here too if error happened before successful finalization
        # However, if an error occurs mid-process, session_path might contain valuable debug info.
        # Current logic cleans session_path only on full success. This might be acceptable.
        # If session_path should be cleaned on any error after manifest read, add it here.
        # Example:
        # if manifest_data and manifest_data.get("status") != "finalized" and os.path.exists(session_path):
        #     try:
        #         shutil.rmtree(session_path)
        #         print(f"Cleaned up session directory due to error: {session_path}")
        #     except Exception as e_cleanup_error:
        #         print(f"Error cleaning up session directory on error {session_path}: {e_cleanup_error}")
        pass
