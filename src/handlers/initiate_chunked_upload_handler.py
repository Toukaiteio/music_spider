import os
import json
import time
import uuid

from utils.data_type import ResultBase
from utils.helpers import write_session_manifest, TEMP_UPLOAD_DIR # Import helpers
from core.ws_messaging import send_response

async def handle_initiate_chunked_upload(websocket, cmd_id: str, payload: dict):
    print(f"Handling initiate_chunked_upload: cmd_id={cmd_id}, payload={payload}")

    filename = payload.get("filename")
    total_size = payload.get("total_size")
    file_type = payload.get("file_type")
    metadata = payload.get("metadata", {})
    client_chunk_size = payload.get("chunk_size", 256 * 1024)

    if not all([filename, isinstance(total_size, int), file_type]): # total_size must be int
        await send_response(websocket, cmd_id, code=1, error="Missing required fields: filename, total_size, file_type.")
        return

    if file_type not in ["audio", "cover"]:
        await send_response(websocket, cmd_id, code=1, error=f"Invalid file_type: {file_type}. Must be 'audio' or 'cover'.")
        return

    upload_session_id = str(uuid.uuid4())
    # TEMP_UPLOAD_DIR is now imported from utils.helpers
    session_path = os.path.join(TEMP_UPLOAD_DIR, upload_session_id)

    try:
        os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True) # Ensure base temp directory exists
        os.makedirs(session_path, exist_ok=True) # Create specific session directory
    except OSError as e:
        print(f"Error creating session directory {session_path}: {e}")
        await send_response(websocket, cmd_id, code=1, error="Server error: Could not create upload session directory.")
        return

    manifest_data = {
        "upload_session_id": upload_session_id,
        "filename": filename,
        "total_size": total_size,
        "file_type": file_type,
        "metadata": metadata, # Store metadata from client
        "client_chunk_size": client_chunk_size,
        "actual_chunk_size": client_chunk_size, # Server will use this for now
        "total_chunks_expected": 0, # Will be updated by client with first chunk or finalize
        "chunks_received_count": 0,
        "chunks_received_map": {}, # To track individual chunks { "0": true, "1": false, ... }
        "status": "initiated",
        "created_at": time.time()
    }

    if not write_session_manifest(upload_session_id, manifest_data): # Use imported helper
        await send_response(websocket, cmd_id, code=1, error="Server error: Could not write session manifest.")
        return

    print(f"Initiated chunked upload session: {upload_session_id} for {filename}")
    await send_response(websocket, cmd_id, code=0, data={
        "upload_session_id": upload_session_id,
        "actual_chunk_size": client_chunk_size
    })
