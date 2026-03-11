import uuid # For generating unique client IDs
from threading import Lock
import time
from downloaders import soundcloud_downloader, bilibili_downloader
from types import MappingProxyType
from multiprocessing import Queue


# 下载任务队列和结果队列的全局状态管理
_DOWNLOAD_TASK_QUEUE_LOCK = Lock()
_DOWNLOAD_RESULTS_QUEUE_LOCK = Lock()
download_task_queue = Queue()
download_results_queue = Queue()

def get_download_task_queue():
    with _DOWNLOAD_TASK_QUEUE_LOCK:
        return download_task_queue

def get_download_results_queue():
    with _DOWNLOAD_RESULTS_QUEUE_LOCK:
        return download_results_queue

_DOWNLOADER_MODULES = {
    # "soundcloud": soundcloud_downloader,
    "bilibili": bilibili_downloader,
}

DOWNLOADER_MODULES = MappingProxyType(_DOWNLOADER_MODULES)

# 任务执行状态
TASK_EXECUTION = {

    "totalTasksExecuted": 0,
    "successfulTasks": 0,
    "failedTasks": 0,
    "runningTasks": 0,
}
_TASK_EXECUTION_LOCK = Lock()


def update_task_execution(key, value):
    with _TASK_EXECUTION_LOCK:
        if key in TASK_EXECUTION:
            TASK_EXECUTION[key] = value

def increment_task_execution(key, delta=1):
    with _TASK_EXECUTION_LOCK:
        if key in TASK_EXECUTION:
            TASK_EXECUTION[key] += delta

def get_task_execution(key):
    with _TASK_EXECUTION_LOCK:
        return TASK_EXECUTION.get(key)

def get_all_task_execution():
    with _TASK_EXECUTION_LOCK:
        return TASK_EXECUTION.copy()

# 已连接客户端管理 (WebSockets)
_CONNECTED_CLIENTS_LOCK = Lock()
CONNECTED_CLIENTS_MAP = {} # Stores client_id -> websocket object

def add_client(websocket) -> str:
    """
    Adds a client to the tracking list, generates a unique ID for it,
    stores it on the websocket object, and returns the client_id.
    """
    with _CONNECTED_CLIENTS_LOCK:
        client_id = str(uuid.uuid4())
        websocket.client_id = client_id # Store client_id on the websocket object itself
        CONNECTED_CLIENTS_MAP[client_id] = websocket
        print(f"Client added with ID: {client_id}, total clients: {len(CONNECTED_CLIENTS_MAP)}")
        return client_id

def remove_client(websocket):
    """
    Removes a client from the tracking list using its stored client_id.
    """
    client_id = getattr(websocket, 'client_id', None)
    if client_id:
        with _CONNECTED_CLIENTS_LOCK:
            if client_id in CONNECTED_CLIENTS_MAP:
                del CONNECTED_CLIENTS_MAP[client_id]
                print(f"Client removed with ID: {client_id}, total clients: {len(CONNECTED_CLIENTS_MAP)}")
            else:
                print(f"Attempted to remove non-existent client ID: {client_id}")
    else:
        print("Attempted to remove a client without a client_id attribute.")


def get_websocket_by_client_id(client_id: str):
    """Retrieves a websocket object by its client_id."""
    with _CONNECTED_CLIENTS_LOCK:
        return CONNECTED_CLIENTS_MAP.get(client_id)

def get_client_number():
    """Returns the number of connected clients."""
    with _CONNECTED_CLIENTS_LOCK:
        return len(CONNECTED_CLIENTS_MAP)

# Kept for compatibility or if other parts of the code use the set of IDs,
# but CONNECTED_CLIENTS_MAP is primary for websocket object access.
def get_connected_clients_ids():
    with _CONNECTED_CLIENTS_LOCK:
        return set(CONNECTED_CLIENTS_MAP.keys())