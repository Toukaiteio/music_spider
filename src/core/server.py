import asyncio
import json
import multiprocessing
import websockets
import os
import atexit
import uuid # Required by some handlers, though not directly in this file after full refactor
import time # Required by some handlers
import shutil # Required by some handlers
import re # Required by some handlers
import base64 # Required by some handlers
# from Crypto.Cipher import AES # AES is used in helpers, not directly here.

from multiprocessing import Queue # Explicitly import Queue for clarity

# Standard library imports
import threading

# Relative imports for project modules
# Assuming utils and downloaders are in PYTHONPATH or structured to be found

from downloaders import bilibili_downloader
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
from handlers.get_music_info_handler import handle_get_music_info
from handlers.analyze_loudness_websocket_handler import (
    handle_analyze_loudness_single,
    handle_analyze_loudness_batch,
    handle_get_loudness_data
)
from handlers.source_handler import (
    handle_get_all_source_status,
    handle_get_auth_action,
    handle_poll_auth_status,
    handle_login_with_params,
    handle_logout,
    handle_enable_source,
    handle_disable_source
)
from handlers.music_claw_handler import (
    handle_music_claw_chat,
    handle_get_llm_config,
    handle_save_llm_config,
    handle_claw_auth_response
)
from handlers.playlist_handler import (
    handle_get_playlists,
    handle_get_playlist_tracks,
    handle_create_playlist,
    handle_update_playlist,
    handle_add_to_playlist,
    handle_remove_from_playlist,
    handle_delete_playlist
)
from handlers.user_preference_handler import (
    handle_report_listening_event,
    handle_get_user_preferences
)
from handlers.auth_handler import (
    handle_login,
    handle_register,
    handle_get_captcha,
    handle_get_sys_config,
    handle_set_sys_config,
    handle_get_users,
    handle_update_user
)
from handlers.crawler_handler import (
    handle_add_crawler_task,
    handle_get_crawler_status,
    handle_control_crawler_task
)
from core.auth import get_user_from_jwt, rate_limiter, current_user

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
                _tid = track_data.get("music_id") or track_data.get("bvid") or track_data.get("id", "unknown") if isinstance(track_data, dict) else "unknown"
                results_queue.put({
                    "type": "error",
                    "original_cmd_id": original_cmd_id,
                    "error": "Invalid task data in worker",
                    "track_id": _tid,
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
                    "track_id": track_data.get("music_id") or track_data.get("bvid") or track_data.get("id"),
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
                    "status": status,
                    "current": current_size,
                    "total": total_size,

                    "message": error_message,
                    "client_id": client_id
                })

            # 从 track_data 中提取唯一标识，兼容 TrackAdapter 规范化后的字段名
            track_id_for_result = track_data.get("music_id") or track_data.get("bvid") or track_data.get("id")

            try:
                print(f"Worker {os.getpid()}: Starting download for track ID {track_id_for_result} using {source}")
                # Ensure downloads_dir exists (it should, but good for workers to be robust)
                if not os.path.exists(downloads_dir):
                    os.makedirs(downloads_dir, exist_ok=True)

                # The actual download call
                music_item = asyncio.run(downloader_module.download_track(track_data, downloads_dir, progress_callback_mp))

                if music_item:
                    print(f"Worker {os.getpid()}: Download successful for track ID {track_id_for_result}")
                    results_queue.put({
                        "type": "success",
                        "original_cmd_id": original_cmd_id,
                        "track_id": track_id_for_result,
                        "music_item": music_item.data.to_dict(),
                        "client_id": client_id
                    })
                else:
                    # downloader_module likely already called progress_callback_mp with error status
                    print(f"Worker {os.getpid()}: Download failed for track ID {track_id_for_result}")
                    results_queue.put({
                        "type": "error",
                        "original_cmd_id": original_cmd_id,
                        "track_id": track_id_for_result,
                        "error": "Download failed: No accessible audio file found.",
                        "client_id": client_id
                    })

            except Exception as e:
                print(f"Worker {os.getpid()}: Error downloading track ID {track_id_for_result}: {e}")
                results_queue.put({
                    "type": "error",
                    "original_cmd_id": original_cmd_id,
                    "track_id": track_id_for_result,
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


# Commands that must run as background asyncio tasks so they don't block the
# ws_handler message loop while streaming long-running responses to the client.
_BACKGROUND_COMMANDS = {'music_claw_chat'}

async def _run_background_command(websocket, cmd_id, command, handler_func, payload):
    """Wrapper that runs a handler as a background task and surfaces unhandled exceptions."""
    try:
        await handler_func(websocket, cmd_id, payload)
    except Exception as e:
        print(f"Error in background command '{command}' (cmd_id: {cmd_id}): {e}")
        try:
            await send_response(websocket, cmd_id, code=1, error=f"Server error processing command '{command}': {str(e)}")
        except Exception:
            pass  # WebSocket may already be closed


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
    "analyze_loudness_single": handle_analyze_loudness_single,
    "analyze_loudness_batch": handle_analyze_loudness_batch,
    "get_loudness_data": handle_get_loudness_data,
    "get_all_auth_status": handle_get_all_source_status,
    "get_auth_action": handle_get_auth_action,
    "poll_auth_status": handle_poll_auth_status,
    "login_with_params": handle_login_with_params,
    "logout": handle_logout,
    "enable_source": handle_enable_source,
    "disable_source": handle_disable_source,
    "music_claw_chat": handle_music_claw_chat,
    "get_llm_config": handle_get_llm_config,
    "save_llm_config": handle_save_llm_config,
    "claw_auth_response": handle_claw_auth_response,
    "get_playlists": handle_get_playlists,
    "get_playlist_tracks": handle_get_playlist_tracks,
    "create_playlist": handle_create_playlist,
    "add_to_playlist": handle_add_to_playlist,
    "remove_from_playlist": handle_remove_from_playlist,
    "delete_playlist": handle_delete_playlist,
    "update_playlist": handle_update_playlist,
    "report_listening_event": handle_report_listening_event,
    "get_user_preferences": handle_get_user_preferences,
    "login": handle_login,
    "register": handle_register,
    "get_captcha": handle_get_captcha,
    "get_sys_config": handle_get_sys_config,
    "set_sys_config": handle_set_sys_config,
    "get_users": handle_get_users,
    "update_user": handle_update_user,
    "add_crawler_task": handle_add_crawler_task,
    "get_crawler_status": handle_get_crawler_status,
    "control_crawler_task": handle_control_crawler_task,
}

# Commands that do not require authentication
UNAUTHENTICATED_COMMANDS = {
    "login", "register", "get_captcha"
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
                    
                # Authentication and Rate Limiting
                if command not in UNAUTHENTICATED_COMMANDS:
                    token = payload.get("token") or data.get("token")
                    user = get_user_from_jwt(token) if token else None
                    if not user:
                        increment_task_execution("failedTasks")
                        await send_response(websocket, cmd_id, code=401, error="Authentication required")
                        continue
                        
                    # Apply Rate Limiting
                    if not rate_limiter.check_limit(user["user_id"]):
                        increment_task_execution("failedTasks")
                        await send_response(websocket, cmd_id, code=429, error="Rate limit exceeded")
                        continue
                        
                    # Set Context for handlers
                    current_user.set(user)

                if command_handler_func := COMMAND_HANDLERS.get(command):
                    try:
                        # Long-running streaming commands are dispatched as background tasks so
                        # the ws_handler loop is NOT blocked and can process other messages
                        # (e.g. get_llm_config) while the AI is streaming.
                        if command in _BACKGROUND_COMMANDS:
                            asyncio.create_task(
                                _run_background_command(websocket, cmd_id, command, command_handler_func, payload)
                            )
                        else:
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

            # Update Crawler Task Progress if applicable
            if original_cmd_id.startswith("crawler_task:"):
                try:
                    from core.crawler import global_crawler
                    task_id = original_cmd_id.split(":")[1]
                    task = global_crawler.tasks.get(task_id)
                    if task:
                        if message_type == "success":
                            task.completed_tracks += 1
                        elif message_type == "error":
                            task.failed_tracks += 1
                        
                        # Update status to completed if all tracks are processed
                        if task.total_tracks > 0 and task.completed_tracks + task.failed_tracks >= task.total_tracks:
                            if task.status != "completed":
                                task.status = "completed"
                                import logging
                                logger = logging.getLogger("CrawlerSystem")
                                logger.info(f"[Crawler] Task {task_id} fully completed ({task.completed_tracks} success, {task.failed_tracks} fail).")
                        
                        # Broadcast update to all clients
                        from core.state import CONNECTED_CLIENTS_MAP
                        from core.ws_messaging import send_response
                        for c in list(CONNECTED_CLIENTS_MAP.values()):
                            asyncio.create_task(send_response(c, "crawler_status_update", code=0, data={"task_id": task_id, "status": task.status}))

                except Exception as e:
                    print(f"Error updating crawler task progress: {e}")

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
                    t_id = result_message.get("track_id")
                    if not t_id and result_message.get("music_item"):
                        t_id = result_message.get("music_item", {}).get("music_id")

                    data_to_send.update({
                        "status": "completed_track",
                        "file_type": result_message.get("progress_type", "track"),
                        "track_id": t_id,
                        "current_size": result_message.get("current", 1),
                        "total_size": result_message.get("total", 1),
                        "progress_percent": 100.0,
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

        # Start Frontend Server Thread (Flask - must run in thread, not process)
        print("Starting Flask frontend server thread...")
        frontend_thread = threading.Thread(target=start_frontend_server, daemon=True)
        frontend_thread.start()
        print("Flask frontend server thread started.")
        # load_task_execution_stats()
        atexit.register(save_task_execution_stats)

        ws_server = await websockets.serve(ws_handler, HOST, WEBSOCKET_PORT) # Use config values
        print(f"WebSocket server started on ws://{HOST}:{WEBSOCKET_PORT}")

        from core.crawler import global_crawler
        await global_crawler.start()

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

        # Flask frontend runs as daemon thread - exits automatically with main process
        print("Flask frontend thread will exit with main process (daemon).")

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

# --- Frontend Server (Flask) ---
def start_frontend_server():
    """使用 Flask 提供前端静态文件服务（在线程中运行）。"""
    try:
        from core.flask_app import flask_app
        from flask import send_from_directory, request as flask_request

        frontend_dir = os.path.abspath(os.path.join(os.getcwd(), FRONTEND_DIR))
        downloads_dir = os.path.abspath(os.path.join(os.getcwd(), DOWNLOADS_DIR))

        if not os.path.isdir(frontend_dir):
            print(f"Warning: Frontend directory '{frontend_dir}' not found. Creating it.")
            os.makedirs(frontend_dir, exist_ok=True)

        print(f"Flask frontend dir: {frontend_dir}")
        print(f"Flask downloads dir: {downloads_dir}")

        # 音频文件下载支持 Range 请求（流式播放）
        @flask_app.route('/downloads/<path:filename>')
        def serve_download(filename):
            return send_from_directory(downloads_dir, filename, conditional=True)

        # SPA fallback：所有非 /api、非静态文件的路由都返回 index.html
        @flask_app.route('/', defaults={'path': ''})
        @flask_app.route('/<path:path>')
        def serve_frontend(path):
            # 如果是 /api/ 开头，不在这里处理（交给 API 蓝图）
            if path.startswith('api/'):
                from flask import abort
                abort(404)
            # 尝试直接返回静态文件
            target = os.path.join(frontend_dir, path)
            if path and os.path.isfile(target):
                return send_from_directory(frontend_dir, path)
            # 否则返回 SPA 入口
            return send_from_directory(frontend_dir, 'index.html')

        print(f"Flask frontend server starting on http://{HOST}:{FRONTEND_PORT}")
        # threaded=True 使 Flask 可以并发处理多个请求
        # use_reloader=False 避免与 asyncio 事件循环冲突
        flask_app.run(host=HOST, port=FRONTEND_PORT, threaded=True, use_reloader=False)

    except OSError as e:
        if e.errno == 98 or e.errno == 10048:  # Address already in use (Linux/Windows)
            print(f"Error: Frontend port {FRONTEND_PORT} is already in use. Flask server not started.")
        else:
            print(f"Error starting Flask frontend server: {e}")
    except Exception as e:
        import traceback
        print(f"An unexpected error occurred while starting the Flask server: {e}")
        traceback.print_exc()


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
