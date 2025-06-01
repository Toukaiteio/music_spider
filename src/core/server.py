import asyncio
import json
import multiprocessing
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

from multiprocessing import Queue # Explicitly import Queue for clarity

# Standard library imports for frontend server
import http.server
import socketserver
import threading
import functools # For functools.partial

# Relative imports for project modules
# Assuming utils and downloaders are in PYTHONPATH or structured to be found

from downloaders import soundcloud_downloader, bilibili_downloader
from .custom_request_handler import CustomRequestHandler
from core.state import (
    DOWNLOADER_MODULES,
    increment_task_execution, get_task_execution, update_task_execution, get_all_task_execution,
    add_client, remove_client, get_websocket_by_client_id,get_download_task_queue,get_download_results_queue  # Added get_websocket_by_client_id
)
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

# Queues for inter-process communication for downloads
download_task_queue = get_download_task_queue()
download_results_queue = get_download_results_queue()

# Download worker process main function
def download_worker_main(task_queue: Queue, results_queue: Queue, downloads_dir: str):

    print(f"Download worker process started: PID {os.getpid()}")
    from core.state import DOWNLOADER_MODULES
    downloader_modules = DOWNLOADER_MODULES
    while True:
        try:
            task = task_queue.get()
            if task is None: # Sentinel value to exit
                print(f"Download worker {os.getpid()} received sentinel, exiting.")
                break

            print(f"Worker {os.getpid()}: Received task: {task}")
            source = task.get("source")
            track_data = task.get("track_data")
            original_cmd_id = task.get("original_cmd_id")
            client_id = task.get("client_id") # For future use if routing responses

            if not all([source, track_data, original_cmd_id]):
                print(f"Worker {os.getpid()}: Invalid task received: {task}")
                results_queue.put({
                    "type": "error",
                    "original_cmd_id": original_cmd_id,
                    "error": "Invalid task data in worker",
                    "track_id": track_data.get("id", "unknown_track_id") if isinstance(track_data, dict) else "unknown_track_id",
                    "client_id": client_id
                })
                continue

            downloader_module = downloader_modules.get(source)
            if not downloader_module:
                print(f"Worker {os.getpid()}: No downloader module found for source: {source}")
                results_queue.put({
                    "type": "error",
                    "original_cmd_id": original_cmd_id,
                    "error": f"No downloader for source '{source}'",
                    "track_id": track_data.get("id"),
                    "client_id": client_id
                })
                continue

            def progress_callback_mp(track_id, file_type, current_size,status, total_size=None, error_message=None):
                """Multiprocessing-safe progress callback."""
                # print(f"Worker {os.getpid()} progress: {track_id}, {progress_type}, {current}, {total}, {message}")
                results_queue.put({
                    "type": "progress",
                    "original_cmd_id": original_cmd_id,
                    "track_id": track_id,
                    "progress_type":file_type,
                    "message_type": status,
                    "current": current_size,
                    "total": total_size,
                    "message": error_message,
                    "client_id": client_id
                })

            try:
                print(f"Worker {os.getpid()}: Starting download for track ID {track_data.get('id')} using {source}")
                # Ensure downloads_dir exists (it should, but good for workers to be robust)
                if not os.path.exists(downloads_dir):
                    os.makedirs(downloads_dir, exist_ok=True)

                # The actual download call
                # Note: The original download_track function in downloader modules might return a MusicItem
                # or raise an exception. We need to handle this.
                music_item =  asyncio.run(downloader_module.download_track(track_data, downloads_dir, progress_callback_mp))

                print(f"Worker {os.getpid()}: Download successful for track ID {track_data.get('id')}")
                results_queue.put({
                    "type": "success",
                    "original_cmd_id": original_cmd_id,
                    "track_id": track_data.get("id"),
                    "music_item": music_item.data.to_dict(),
                    "client_id": client_id
                })

            except Exception as e:
                print(f"Worker {os.getpid()}: Error downloading track ID {track_data.get('id')}: {e}")
                # import traceback; traceback.print_exc() # For debugging in worker
                results_queue.put({
                    "type": "error",
                    "original_cmd_id": original_cmd_id,
                    "track_id": track_data.get("id"),
                    "error": str(e),
                    "client_id": client_id
                })

        except EOFError: # Can happen if queue is closed unexpectedly
            print(f"Worker {os.getpid()}: Task queue closed (EOFError), exiting.")
            break
        except BrokenPipeError: # Can happen if queue is closed unexpectedly
            print(f"Worker {os.getpid()}: Task queue connection broken (BrokenPipeError), exiting.")
            break
        except Exception as e:
            # Catch-all for unexpected errors in the worker loop itself
            print(f"Worker {os.getpid()}: Critical error in main loop: {e}")
            # import traceback; traceback.print_exc()
            # Potentially put an error message on results_queue if possible and makes sense
            # results_queue.put({"type": "critical_worker_error", "pid": os.getpid(), "error": str(e)})
            time.sleep(1) # Avoid rapid looping on persistent error

    print(f"Download worker process {os.getpid()} finished.")


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
    # remove_client will handle checking if the client_id (attached to websocket) exists in its map
    remove_client(websocket)

# This new async function will process results from the download workers
async def process_download_results(results_queue: Queue):
    print("Download results processor started.")
    while True:
        try:
            # Use asyncio.to_thread to get items from the multiprocessing.Queue
            # without blocking the main asyncio event loop.
            result_message = await asyncio.to_thread(results_queue.get)

            if result_message is None: # Sentinel for shutting down this processor
                print("Download results processor received sentinel, exiting.")
                break

            client_id = result_message.get("client_id") # This was added in handle_download_track
            original_cmd_id = result_message.get("original_cmd_id")
            message_type = result_message.get("type") # "progress", "success", "error"

            # The actual data payload varies based on message_type
            # For progress: track_id, progress_type, current, total, message
            # For success: track_id, music_item (as dict)
            # For error: track_id, error (string)

            if not client_id or not original_cmd_id or not message_type:
                print(f"Invalid result message received (missing fields): {result_message}")
                continue

            websocket_client = get_websocket_by_client_id(client_id)
            if websocket_client:
                # response_data = result_message # The worker already formats the payload well

                # We can refine the data sent to client if needed, or pass as is
                # For example, ensuring it matches what progress_callback_ws used to send for 'progress'
                data_to_send = {
                    "original_cmd_id": original_cmd_id, # Redundant if send_response includes it, but good for clarity
                    # "status_type": "download_progress" or "download_complete" or "download_error", # Could be set based on message_type
                    # "track_id": result_message.get("track_id"),
                }
                if message_type == "progress":
                    data_to_send.update({
                        "status_type": "download_progress",
                        "track_id": result_message.get("track_id"),
                        "file_type": result_message.get("progress_type"), # Assuming progress_type maps to file_type
                        "status": result_message.get("status", "downloading"), # status from worker might be more granular
                        "current_size": result_message.get("current"),
                        "total_size": result_message.get("total"),
                        "progress_percent": round((result_message.get("current", 0) / result_message.get("total", 1)) * 100, 2) if result_message.get("total") else 0,
                        "message": result_message.get("message")
                    })
                elif message_type == "success":
                    data_to_send.update({
                        "status": "completed_track", # Matches old final_response_data
                        "file_type": result_message.get("progress_type"), # Assuming progress_type maps to file_type
                        "track_id": result_message.get("track_id"),
                        "current_size": result_message.get("current"),
                        "total_size": result_message.get("total"),
                        "progress_percent": round((result_message.get("current", 0) / result_message.get("total", 1)) * 100, 2) if result_message.get("total") else 0,
                        "status_type":"download_progress",
                        "message": f"Track '{result_message.get('music_item', {}).get('title', 'N/A')}' downloaded successfully.",
                        "track_details": result_message.get("music_item")
                    })
                elif message_type == "error":
                     data_to_send.update({
                        "status": "error",
                        "status_type":"download_progress",
                        "error_message": result_message.get("error"),
                        "track_id": result_message.get("track_id")
                    })
                else:
                    print(f"Unknown result message type: {message_type}")
                    continue

                # Use send_response to structure the message correctly
                # code=0 for progress and success, code=1 for error
                response_code = 1 if message_type == "error" else 0
                await send_response(websocket_client, original_cmd_id, code=response_code, data=data_to_send)

        except asyncio.CancelledError:
            print("Download results processor task cancelled.")
            break # Exit loop on cancellation
        except Exception as e:
            print(f"Error in process_download_results: {e}")
            # import traceback; traceback.print_exc() # For debugging
            # Avoid continuous fast loop on persistent error not related to queue.get()
            await asyncio.sleep(1)


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

    frontend_process = None
    download_workers = []
    num_download_workers = 2 # Configurable number of download workers
    results_processor_task = None # To hold the asyncio task for process_download_results

    try:
        # Start Download Worker Processes
        print(f"Starting {num_download_workers} download worker processes...")
        for i in range(num_download_workers):
            worker_process = multiprocessing.Process(
                target=download_worker_main,
                args=(download_task_queue, download_results_queue, DOWNLOADS_DIR)
            )
            worker_process.daemon = True # Optional: manage lifecycle with sentinels or explicit termination
            worker_process.start()
            download_workers.append(worker_process)
            print(f"Download worker {i+1} started with PID: {worker_process.pid}")

        # Start Frontend Server Process
        print("Starting frontend server process...")
        frontend_process = multiprocessing.Process(target=start_frontend_server)
        frontend_process.start()
        print(f"Frontend server process started with PID: {frontend_process.pid}")
        # threading.Thread(target=start_frontend_server, daemon=True).start()
        # load_task_execution_stats()
        atexit.register(save_task_execution_stats)

        ws_server = await websockets.serve(ws_handler, HOST, WEBSOCKET_PORT) # Use config values
        print(f"WebSocket server started on ws://{HOST}:{WEBSOCKET_PORT}")

        # Start the download results processor task
        print("Starting download results processor task...")
        results_processor_task = asyncio.create_task(process_download_results(download_results_queue))
        print("Download results processor task started.")

        await ws_server.wait_closed() # Keep the WebSocket server running

    except KeyboardInterrupt:
        print("Servers shutting down manually (KeyboardInterrupt)...")
        # WebSocket server is closed by wait_closed() exiting or being cancelled by the interrupt.
    finally:
        print("Server main loop ending. Initiating cleanup...")

        # Shutdown Download Results Processor Task
        if results_processor_task:
            print("Shutting down download results processor task...")
            results_processor_task.cancel()
            try:
                # Send a sentinel to the queue to potentially unblock results_queue.get()
                # This helps if the task is stuck waiting on an empty queue during shutdown.
                download_results_queue.put_nowait(None)
            except Exception as e:
                print(f"Error sending sentinel to results_queue during shutdown: {e}")
            try:
                await results_processor_task
                print("Download results processor task finished.")
            except asyncio.CancelledError:
                print("Download results processor task explicitly cancelled.")
            except Exception as e:
                print(f"Error during download results processor shutdown: {e}")

        # Shutdown Download Worker Processes
        print("Shutting down download worker processes...")
        # Option 1: Using sentinel values (if workers are designed for it)
        for _ in download_workers:
            try:
                download_task_queue.put(None, timeout=1) # Send sentinel
            except Exception as e: # Handle queue full or other issues
                 print(f"Error sending sentinel to download task queue: {e}")

        for worker in download_workers:
            try:
                worker.join(timeout=5) # Wait for worker to exit gracefully
                if worker.is_alive():
                    print(f"Download worker {worker.pid} did not exit gracefully, terminating.")
                    worker.terminate() # Force terminate if stuck
                    worker.join(timeout=2) # Wait for termination
                    if worker.is_alive():
                        print(f"Download worker {worker.pid} failed to terminate, killing.")
                        worker.kill() # Force kill
                        worker.join() # Wait for kill
            except Exception as e:
                print(f"Error during download worker {worker.pid} shutdown: {e}")
        print("All download worker processes stopped.")

        # Shutdown Frontend Server Process
        if frontend_process and frontend_process.is_alive():
            print("Terminating frontend server process...")
            frontend_process.terminate()
            frontend_process.join(timeout=5) # Wait for 5 seconds
            if frontend_process.is_alive():
                print("Frontend process did not terminate gracefully, killing.")
                frontend_process.kill() # Force kill if terminate didn't work
                frontend_process.join() # Wait for kill
            print("Frontend server process stopped.")
        else:
            print("Frontend server process was not running or already stopped.")

        # Close queues if they are still open (optional, as OS should clean up, but good practice)
        try:
            download_task_queue.close()
            download_task_queue.join_thread() # Wait for queue's internal thread to finish
        except Exception as e:
            print(f"Error closing download_task_queue: {e}")
        try:
            download_results_queue.close()
            download_results_queue.join_thread()
        except Exception as e:
            print(f"Error closing download_results_queue: {e}")

        print("Triggering final save of task execution stats.")
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

        
        httpd.serve_forever()

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
