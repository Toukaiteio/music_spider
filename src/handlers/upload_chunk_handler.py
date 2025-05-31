import os
import json
import os
import json
import time
import base64

from utils.data_type import ResultBase
from utils.helpers import read_session_manifest, write_session_manifest, TEMP_UPLOAD_DIR # Import helpers
from core.ws_messaging import send_response


async def handle_upload_chunk(websocket, cmd_id: str, payload: dict):
    print(f"Handling upload_chunk: cmd_id={cmd_id}")
    upload_session_id = payload.get("upload_session_id")
    chunk_index = payload.get("chunk_index")
    total_chunks = payload.get("total_chunks")
    chunk_data_base64 = payload.get("chunk_data")

    if not all([upload_session_id, isinstance(chunk_index, int), isinstance(total_chunks, int), chunk_data_base64]):
        await send_response(websocket, cmd_id, code=1, error="Missing required fields for chunk upload.")
        return

    manifest_data = read_session_manifest(upload_session_id) # Use imported helper
    if not manifest_data:
        await send_response(websocket, cmd_id, code=1, error=f"Upload session not found or manifest unreadable: {upload_session_id}")
        return

    # TEMP_UPLOAD_DIR is now imported from utils.helpers
    session_path = os.path.join(TEMP_UPLOAD_DIR, upload_session_id)
    chunk_filename = f"chunk_{chunk_index}"
    chunk_filepath = os.path.join(session_path, chunk_filename)

    try:
        binary_data = base64.b64decode(chunk_data_base64)

        with open(chunk_filepath, 'wb') as f:
            f.write(binary_data)

        if manifest_data.get("total_chunks_expected", 0) == 0:
            manifest_data["total_chunks_expected"] = total_chunks

        if manifest_data["total_chunks_expected"] != total_chunks:
            print(f"Warning: total_chunks mismatch for session {upload_session_id}. Manifest: {manifest_data['total_chunks_expected']}, Payload: {total_chunks}")

        if str(chunk_index) not in manifest_data["chunks_received_map"] or not manifest_data["chunks_received_map"][str(chunk_index)]:
            manifest_data["chunks_received_map"][str(chunk_index)] = True
            manifest_data["chunks_received_count"] = manifest_data.get("chunks_received_count", 0) + 1

        manifest_data["status"] = "uploading"
        manifest_data["last_chunk_received_at"] = time.time()

        if not write_session_manifest(upload_session_id, manifest_data): # Use imported helper
            await send_response(websocket, cmd_id, code=1, error="Server error: Could not update session manifest after chunk.")
            return

        print(f"Received chunk {chunk_index + 1}/{manifest_data['total_chunks_expected']} for session {upload_session_id}")
        await send_response(websocket, cmd_id, code=0, data={
            "message": "Chunk received successfully",
            "upload_session_id": upload_session_id,
            "chunk_index": chunk_index,
            "chunks_received_count": manifest_data["chunks_received_count"],
            "total_chunks_expected": manifest_data["total_chunks_expected"]
        })

    except base64.binascii.Error as b64_error:
        print(f"Base64 decoding error for chunk {chunk_index} in session {upload_session_id}: {b64_error}")
        await send_response(websocket, cmd_id, code=1, error="Invalid base64 data for chunk.")
    except IOError as io_error:
        print(f"IO error saving chunk {chunk_index} for session {upload_session_id}: {io_error}")
        await send_response(websocket, cmd_id, code=1, error="Server error: Could not save chunk.")
    except Exception as e:
        print(f"Unexpected error processing chunk {chunk_index} for session {upload_session_id}: {e}")
        await send_response(websocket, cmd_id, code=1, error="Server error: Unexpected error processing chunk.")
