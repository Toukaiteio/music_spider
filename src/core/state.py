from threading import Lock
import psutil
import time
from downloaders import soundcloud_downloader,bilibili_downloader
from types import MappingProxyType


_DOWNLOADER_MODULES = {
    "soundcloud": soundcloud_downloader,
    "bilibili": bilibili_downloader,
}

DOWNLOADER_MODULES = MappingProxyType(_DOWNLOADER_MODULES)
# 全局网络IO状态
_NET_IO_LOCK = Lock()
previous_net_io_global = psutil.net_io_counters(pernic=True)
time_of_previous_net_io_global = time.time()

def update_net_io_global():
    global previous_net_io_global, time_of_previous_net_io_global
    with _NET_IO_LOCK:
        previous_net_io_global = psutil.net_io_counters(pernic=True)
        time_of_previous_net_io_global = time.time()
    return previous_net_io_global,time_of_previous_net_io_global

def get_net_io_global():
    with _NET_IO_LOCK:
        return previous_net_io_global.copy(), time_of_previous_net_io_global
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

# 已连接客户端管理
CONNECTED_CLIENTS = set()
_CONNECTED_CLIENTS_LOCK = Lock()

def add_client(client_id):
    with _CONNECTED_CLIENTS_LOCK:
        CONNECTED_CLIENTS.add(client_id)

def remove_client(client_id):
    with _CONNECTED_CLIENTS_LOCK:
        CONNECTED_CLIENTS.discard(client_id)

def get_client_number():
    return len(CONNECTED_CLIENTS)

def get_connected_clients():
    with _CONNECTED_CLIENTS_LOCK:
        return set(CONNECTED_CLIENTS)