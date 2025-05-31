import asyncio
import json
import websockets
import os
import atexit
import uuid # Required by some handlers, though not directly in this file after full refactor
import time # Required by some handlers
import shutil # Required by some handlers
import psutil # Required by some handlers
import platform # Required by some handlers
import subprocess # Required by some handlers
import re # Required by some handlers
import base64 # Required by some handlers
# from Crypto.Cipher import AES # AES is used in helpers, not directly here.

# Standard library imports for frontend server
import http.server
import socketserver
import threading
import functools # For functools.partial

# Relative imports for project modules
# Assuming utils and downloaders are in PYTHONPATH or structured to be found

from downloaders import soundcloud_downloader, bilibili_downloader
from .custom_request_handler import CustomRequestHandler
from .state import increment_task_execution,get_task_execution,update_task_execution,get_all_task_execution,add_client,get_connected_clients,remove_client
# Import configuration
from config import (
    AES_KEY,
    TEMP_UPLOAD_DIR,
    TASK_EXECUTION_FILE,
    HOST,
    WEBSOCKET_PORT,
    FRONTEND_PORT, # Added for the frontend server
    DOWNLOADS_DIR, # Not directly used in server.py, but in helpers and handlers
    FRONTEND_DIR
)
from core.ws_messaging import send_response # (hypothetical)
# Import handlers
from handlers.search_handler import handle_search
from handlers.download_track_handler import handle_download_track
from handlers.get_downloaded_music_handler import handle_get_downloaded_music
from handlers.search_downloaded_music_handler import handle_search_downloaded_music
from handlers.delete_track_handler import handle_delete_track
from handlers.update_track_info_handler import handle_update_track_info
from handlers.upload_track_handler import handle_upload_track
from handlers.get_available_sources_handler import handle_get_available_sources
from handlers.initiate_chunked_upload_handler import handle_initiate_chunked_upload
from handlers.upload_chunk_handler import handle_upload_chunk
from handlers.finalize_chunked_upload_handler import handle_finalize_chunked_upload
from handlers.get_music_info_handler import handle_get_music_info
from handlers.get_system_overview_handler import handle_get_system_overview

# Configuration and State Variables have been moved to src.config or remain as state below

DOWNLOADER_MODULES = { # TODO: This could also be part of config if sources are configurable
    "soundcloud": soundcloud_downloader,
    "bilibili": bilibili_downloader,
}


# Command Handlers (imports handlers from src.handlers)
COMMAND_HANDLERS = {
    "search": handle_search,
    "download_track": handle_download_track,
    "get_downloaded_music": handle_get_downloaded_music,
    "search_downloaded_music": handle_search_downloaded_music,
    "delete_track": handle_delete_track,
    "update_track_info": handle_update_track_info,
    "upload_track": handle_upload_track,
    "get_available_sources": handle_get_available_sources,
    "initiate_chunked_upload": handle_initiate_chunked_upload,
    "upload_chunk": handle_upload_chunk,
    "finalize_chunked_upload": handle_finalize_chunked_upload,
    "try_get_music_lyrics": handle_get_music_info,
    "get_system_overview": handle_get_system_overview,
}

# Main WebSocket connection handler
async def ws_handler(websocket, path = None): # Renamed from 'handler' to 'ws_handler' for clarity
    client_addr = websocket.remote_address
    print(f"Client connected from {client_addr}")
    add_client(websocket)
    try:
        async for message in websocket:
            increment_task_execution("totalTasksExecuted")
            increment_task_execution("runningTasks")

            cmd_id = "unknown_cmd_id_initial"
            try:
                data = json.loads(message)
                cmd_id = data.get("cmd_id", "unknown_cmd_id_payload")
                command = data.get("command")
                payload = data.get("payload", {})

                if not command:  # cmd_id can be optional for notifications, but command is essential
                    increment_task_execution("failedTasks")
                    await send_response(websocket, cmd_id, code=1, error="Missing command")
                    continue

                if command_handler_func := COMMAND_HANDLERS.get(command):
                    try:
                        await command_handler_func(websocket, cmd_id, payload)
                        increment_task_execution("successfulTasks")
                    except Exception as e:
                        increment_task_execution("failedTasks")
                        print(f"Error in command handler for '{command}' (cmd_id: {cmd_id}): {e}")
                        # import traceback; traceback.print_exc() # For debugging
                        await send_response(websocket, cmd_id, code=1, error=f"Server error processing command '{command}': {str(e)}")
                else:
                    increment_task_execution("failedTasks")
                    await send_response(websocket, cmd_id, code=1, error=f"Unknown command: {command}")

            except json.JSONDecodeError:
                increment_task_execution("failedTasks")
                await send_response(websocket, "unknown_json_error_cmd_id", code=1, error="Invalid JSON message")
            except Exception as e:
                increment_task_execution("failedTasks")
                print(f"Critical error processing message for cmd_id {cmd_id}: {e}")
                # import traceback; traceback.print_exc() # For debugging
                await send_response(websocket, cmd_id, code=1, error=f"Unexpected server error: {str(e)}")
            finally:
                increment_task_execution("runningTasks", -1)
                if get_task_execution("runningTasks") < 0: update_task_execution("runningTasks",0)

    except websockets.exceptions.ConnectionClosedError:
        print(f"Client {client_addr} disconnected with ConnectionClosedError.")
    except websockets.exceptions.ConnectionClosedOK:
        print(f"Client {client_addr} disconnected normally.")
    except Exception as e:
        print(f"Connection error with {client_addr}: {e}")
    finally:
        print(f"Client disconnected from {client_addr}")
        if websocket in get_connected_clients():
            remove_client(websocket)

# Task execution statistics functions
def save_task_execution_stats():
    update_task_execution("runningTasks",0)
    try:
        with open(TASK_EXECUTION_FILE, "w") as f:
            json.dump(get_all_task_execution(), f, indent=4)
        print("TASK_EXCUTION data saved.")
    except Exception as e:
        print(f"Failed to save TASK_EXCUTION: {e}")

def load_task_execution_stats():
    if os.path.exists(TASK_EXECUTION_FILE): # TASK_EXECUTION_FILE is from config
        try:
            with open(TASK_EXECUTION_FILE, "r") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    for key, value in data.items():
                        if key in get_all_task_execution():
                            update_task_execution(key,value)
                    update_task_execution("runningTasks",0)
            print("TASK_EXCUTION data loaded.")
        except json.JSONDecodeError:
            print(f"Error decoding {TASK_EXECUTION_FILE}. Initializing with default stats.")
        except Exception as e:
            print(f"Failed to load TASK_EXCUTION: {e}. Initializing with default stats.")
    else:
        print(f"{TASK_EXECUTION_FILE} not found. Initializing with default stats.")

# Server startup function
async def start_server(): # Renamed from 'main' to 'start_server' for clarity
    # TEMP_UPLOAD_DIR is now sourced from config and created there if configured to do so.
    # Re-checking directory creation logic in config.py: it does attempt to create them.
    # So, no specific os.makedirs call for TEMP_UPLOAD_DIR needed here anymore.

    # HOST and WEBSOCKET_PORT are now imported from src.config

    start_frontend_server() # Start the frontend server in a separate thread

    load_task_execution_stats()
    atexit.register(save_task_execution_stats)

    ws_server = await websockets.serve(ws_handler, HOST, WEBSOCKET_PORT) # Use config values
    print(f"WebSocket server started on ws://{HOST}:{WEBSOCKET_PORT}")

    try:
        await ws_server.wait_closed() # Keep the WebSocket server running
    except KeyboardInterrupt:
        print("Servers shutting down manually...")
        # Frontend server thread is daemon, will exit with main thread.
        # WebSocket server is closed by wait_closed() exiting or being cancelled.
    finally:
        print("Server main loop ending. Triggering final save if not already done by atexit.")
        save_task_execution_stats()

# --- Frontend HTTP Server ---
def start_frontend_server():
    """Starts a simple HTTP server for the frontend in a daemon thread."""
    try:
        frontend_dir = os.path.join(os.getcwd(), FRONTEND_DIR)
        downloads_dir = os.path.join(os.getcwd(), DOWNLOADS_DIR)
        if not os.path.isdir(frontend_dir):
            print(f"Warning: Frontend directory '{frontend_dir}' not found. Creating it.")
            os.makedirs(frontend_dir) # Create if it doesn't exist
            # A very basic index.html if it was just created
            with open(os.path.join(frontend_dir, "index.html"), "w") as f:
                f.write("<h1>Frontend Directory Created - Placeholder</h1>")

        if not os.path.isdir(downloads_dir):
                print(f"Warning: Downloads directory '{downloads_dir}' not found. Creating it.")
                os.makedirs(downloads_dir)
        # Use functools.partial to set the directory for the handler
        print(f"Frontend dir: {frontend_dir}")
        print(f"Downloads dir: {downloads_dir}")
        Handler = functools.partial(CustomRequestHandler, directory=frontend_dir)

        # Ensure HOST is correctly used. If HOST is '0.0.0.0', it's fine for TCPServer.
        # If HOST can be a hostname, TCPServer might resolve it.
        # For simplicity, assuming HOST is an IP address or resolvable hostname.
        httpd = socketserver.TCPServer((HOST, FRONTEND_PORT), Handler)

        print(f"Frontend HTTP server starting on http://{HOST}:{FRONTEND_PORT}")
        print(f"Serving files from: {frontend_dir}")

        # Start the HTTP server in a new daemon thread
        # Daemon threads automatically exit when the main program exits
        thread = threading.Thread(target=httpd.serve_forever)
        thread.daemon = True
        thread.start()
        print(f"Frontend HTTP server running in a daemon thread.")

    except OSError as e:
        if e.errno == 98: # Address already in use
            print(f"Error: Frontend port {FRONTEND_PORT} is already in use. Frontend server not started.")
        else:
            print(f"Error starting frontend server: {e}")
    except Exception as e:
        print(f"An unexpected error occurred while starting the frontend server: {e}")


if __name__ == '__main__':
    # This allows running the server directly from src/core/server.py for testing/dev
    try:
        asyncio.run(start_server())
    except OSError as e:
        print(f"Failed to start server: {e}")
    except Exception as e:
        print(f"An unexpected error occurred during server startup: {e}")
    finally:
        print("Server shutdown sequence completed.")
