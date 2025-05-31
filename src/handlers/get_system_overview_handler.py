import json
import time
import psutil
import platform
import subprocess
import os # For AMD GPU info on Linux
import re # For parsing WMIC output

from utils.data_type import ResultBase
from utils.helpers import format_bytes, format_speed # Import helpers

# from core.ws_messaging import send_response (hypothetical)
# from core.state import CONNECTED_CLIENTS, TASK_EXCUTION (hypothetical)

# Globals that were in main.py, specific to this handler's needs.
# These should ideally be managed by a central state module if accessed by multiple handlers.
# For now, they are handler-specific or passed in if necessary.
# TODO: Move previous_net_io_global and time_of_previous_net_io_global to core state or pass them appropriately
previous_net_io_global = psutil.net_io_counters(pernic=True)
time_of_previous_net_io_global = time.time()

# Placeholder for CONNECTED_CLIENTS and TASK_EXECUTION
# These would typically be imported from a shared state module (e.g., src/core/state.py)
# TODO: Import CONNECTED_CLIENTS and TASK_EXECUTION from src.core.state when it's created
CONNECTED_CLIENTS = set() # Example: In a real app, this would be the actual shared set.
TASK_EXCUTION = { # Example: Simulating the shared task execution dict.
    "totalTasksExecuted": 0,
    "successfulTasks": 0,
    "failedTasks": 0,
    "runningTasks": 0,
}


# Placeholder for send_response
# TODO: This will be moved to src.core.server and imported from there.
async def send_response(websocket, cmd_id: str, code: int, data: dict = None, error: str = None):
    response_payload = {"original_cmd_id": cmd_id}
    if error:
        response_payload["error"] = error
    if data:
        response_payload.update(data)

    response = ResultBase(code=code, data=response_payload)
    try:
        await websocket.send(json.dumps(response.get_json()))
    except Exception as e:
        print(f"Failed to send response for cmd_id {cmd_id}: {e}")


async def handle_get_system_overview(websocket, cmd_id: str, payload: dict):
    # Use the global variables for network I/O calculation
    # TODO: Refactor how these global states are accessed. They should ideally be part of a class or passed in.
    global previous_net_io_global, time_of_previous_net_io_global
    overview_data = {}

    # System Info
    try:
        boot_time_timestamp = psutil.boot_time()
        uptime_seconds = time.time() - boot_time_timestamp
        uptime_days = int(uptime_seconds // (24 * 3600))
        uptime_hours = int((uptime_seconds % (24 * 3600)) // 3600)
        uptime_minutes = int((uptime_seconds % 3600) // 60)
        uptime_str = f"{uptime_days}d {uptime_hours}h {uptime_minutes}m"
        overview_data["systemInfo"] = {
            "os": platform.system(),
            "hostname": platform.node(),
            "uptime": uptime_str,
        }
    except Exception as e:
        print(f"Error getting system info: {e}")
        overview_data["systemInfo"] = {"os": "N/A", "hostname": "N/A", "uptime": "N/A"}

    # Disk Usage
    disk_usage_data = []
    try:
        partitions = psutil.disk_partitions()
        for p in partitions:
            try:
                usage = psutil.disk_usage(p.mountpoint)
                disk_usage_data.append({
                    "filesystem": p.device,
                    "total": format_bytes(usage.total),
                    "used": format_bytes(usage.used),
                    "free": format_bytes(usage.free),
                    "mountPoint": p.mountpoint,
                })
            except Exception as e_disk:
                print(f"Error getting disk usage for {p.mountpoint}: {e_disk}")
                disk_usage_data.append({
                    "filesystem": p.device, "total": "N/A", "used": "N/A",
                    "free": "N/A", "mountPoint": p.mountpoint, "error": str(e_disk)
                })
        overview_data["diskUsage"] = disk_usage_data
    except Exception as e:
        print(f"Error getting disk partitions: {e}")
        overview_data["diskUsage"] = []

    # CPU Usage
    try:
        overall_cpu_load = psutil.cpu_percent(interval=0.5)
        per_core_load_floats = psutil.cpu_percent(interval=None, percpu=True)
        per_core_load = [{"core": i + 1, "load": load} for i, load in enumerate(per_core_load_floats)]
        overview_data["cpuUsage"] = {
            "currentLoad": overall_cpu_load,
            "cores": per_core_load,
            "logicalCores": psutil.cpu_count(logical=True),
            "physicalCores": psutil.cpu_count(logical=False),
        }
    except Exception as e:
        print(f"Error getting CPU usage: {e}")
        overview_data["cpuUsage"] = {"currentLoad": "N/A", "cores": [], "logicalCores": "N/A", "physicalCores": "N/A"}

    # GPU Usage (Copied and adapted from main.py)
    gpu_info_list = []
    system = platform.system()
    try:
        if system == "Windows":
            try: # nvidia-smi
                result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=name,utilization.gpu,memory.total,memory.used,temperature.gpu,power.draw", "--format=csv,noheader,nounits"],
                    capture_output=True, text=True, check=True, timeout=5
                )
                gpus_output = result.stdout.strip().split('\n')
                for i, line in enumerate(gpus_output):
                    if not line.strip(): continue
                    parts = [p.strip() for p in line.split(',')]
                    if len(parts) == 6:
                        gpu_info_list.append({
                            "id": f"NVIDIA GPU {i}", "name": parts[0],
                            "utilization": float(parts[1]) if parts[1] != "[Not Supported]" else "N/A",
                            "memoryTotal": f"{parts[2]} MiB", "memoryUsed": f"{parts[3]} MiB",
                            "temperature": float(parts[4]) if parts[4] != "[Not Supported]" else "N/A",
                            "powerDraw": float(parts[5]) if parts[5] != "[Not Supported]" else "N/A",
                        })
            except Exception as e_nvidia_win:
                print(f"Nvidia-smi error on Windows: {e_nvidia_win}. Trying WMIC.")
                if not gpu_info_list: # Try WMIC if nvidia-smi failed or no GPUs
                    try:
                        wmic_result = subprocess.run(
                            ["wmic", "path", "Win32_VideoController", "get", "Name,AdapterRAM"], # DriverVersion removed for simplicity
                            capture_output=True, text=True, check=True, timeout=5, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                        output_lines = wmic_result.stdout.strip().split('\n')
                        if len(output_lines) > 1:
                            header_line = output_lines[0]
                            # Robustly find column indices
                            ram_idx = header_line.find("AdapterRAM")
                            name_idx = header_line.find("Name")
                            # Ensure indices are found and determine order for slicing/splitting
                            if ram_idx != -1 and name_idx != -1:
                                for i, line_content in enumerate(output_lines[1:]):
                                    line_content = line_content.strip()
                                    if not line_content: continue
                                    # This parsing is fragile; assumes fixed width or specific multi-space delimiters.
                                    # A regex split might be more robust if format varies.
                                    # For now, trying a split based on typical WMIC output structure.
                                    parts = re.split(r'\s{2,}', line_content) # Split by 2 or more spaces

                                    # Attempt to extract Name and AdapterRAM based on likely positions if indices are complex
                                    # This part needs careful testing on a Windows machine with WMIC output.
                                    # Assuming Name is often last or second to last if AdapterRAM is first.
                                    # This is a simplified extraction.
                                    extracted_name = "Unknown GPU (WMIC)"
                                    extracted_ram = "N/A"
                                    if len(parts) >= 2: # At least two columns expected
                                        # Heuristic: AdapterRAM is often digits, Name is text.
                                        # This is highly dependent on actual WMIC output format.
                                        # A safer method would be fixed-width parsing if columns are aligned,
                                        # or more sophisticated regex if they are not.
                                        # Example: if AdapterRAM is first:
                                        if parts[0].isdigit():
                                            extracted_ram = format_bytes(int(parts[0])) if parts[0].isdigit() else "N/A"
                                            extracted_name = " ".join(parts[1:]) if len(parts) > 1 else "Unknown GPU Name"
                                        else: # Assume Name is first or covers multiple "words"
                                            # Search for a numeric part that could be RAM
                                            for part_idx, p_val in enumerate(parts):
                                                if p_val.isdigit() and (len(parts) -1 > part_idx): # if current is digit and there is a part after it (name)
                                                    extracted_ram = format_bytes(int(p_val))
                                                    extracted_name = " ".join(parts[:part_idx] + parts[part_idx+1:]) # Combine other parts for name
                                                    break
                                                elif p_val.isdigit() and part_idx == (len(parts) -1): # if current is digit and it is the last part (name must be before it)
                                                    extracted_ram = format_bytes(int(p_val))
                                                    extracted_name = " ".join(parts[:part_idx])
                                                    break
                                            if extracted_name == "Unknown GPU (WMIC)" and extracted_ram == "N/A": # fallback if logic above fails
                                                extracted_name = parts[0] if parts else "Unknown GPU"


                                    gpu_info_list.append({
                                        "id": f"GPU {i} (WMIC)", "name": extracted_name,
                                        "utilization": "N/A",
                                        "memoryTotal": extracted_ram,
                                        "memoryUsed": "N/A", "temperature": "N/A", "powerDraw": "N/A",
                                    })
                    except Exception as e_wmic:
                        print(f"WMIC error on Windows: {e_wmic}")


        elif system == "Linux":
            try: # nvidia-smi
                result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=name,utilization.gpu,memory.total,memory.used,temperature.gpu,power.draw", "--format=csv,noheader,nounits"],
                    capture_output=True, text=True, check=True, timeout=5
                )
                gpus_output = result.stdout.strip().split('\n')
                for i, line in enumerate(gpus_output):
                    if not line.strip(): continue
                    parts = [p.strip() for p in line.split(',')]
                    if len(parts) == 6:
                        gpu_info_list.append({
                            "id": f"NVIDIA GPU {i}", "name": parts[0],
                            "utilization": float(parts[1]) if parts[1] != "[Not Supported]" else "N/A",
                            "memoryTotal": f"{parts[2]} MiB", "memoryUsed": f"{parts[3]} MiB",
                            "temperature": float(parts[4]) if parts[4] != "[Not Supported]" else "N/A",
                            "powerDraw": float(parts[5]) if parts[5] != "[Not Supported]" else "N/A",
                        })
            except Exception as e_nvidia_linux:
                print(f"Nvidia-smi error on Linux: {e_nvidia_linux}. Checking for AMD.")

            if not gpu_info_list: # AMD GPU (Simplified from original)
                try:
                    drm_path = "/sys/class/drm/"
                    gpu_idx_amd = 0
                    if os.path.exists(drm_path):
                        for card_dir in os.listdir(drm_path):
                            if card_dir.startswith("card"):
                                device_path = os.path.join(drm_path, card_dir, "device")
                                vendor_path = os.path.join(device_path, "vendor")
                                if os.path.exists(vendor_path):
                                    with open(vendor_path, 'r') as f:
                                        if f.read().strip() != "0x1002": continue # Skip non-AMD

                                amd_gpu_data = {"id": f"AMD GPU {gpu_idx_amd}", "name": f"AMD GPU {gpu_idx_amd}", "utilization": "N/A", "memoryTotal": "N/A", "memoryUsed": "N/A", "temperature": "N/A", "powerDraw": "N/A"}
                                # Populate with data from sysfs files (gpu_busy_percent, mem_info_vram_total, etc.)
                                # This is a simplified version. The original code had more detailed paths.
                                util_path = os.path.join(device_path, "gpu_busy_percent")
                                if os.path.exists(util_path):
                                    with open(util_path, 'r') as f_util: amd_gpu_data["utilization"] = float(f_util.read().strip())

                                mem_total_path = os.path.join(device_path, "mem_info_vram_total")
                                if os.path.exists(mem_total_path):
                                    with open(mem_total_path, 'r') as f_mem_total: amd_gpu_data["memoryTotal"] = format_bytes(int(f_mem_total.read().strip()))

                                mem_used_path = os.path.join(device_path, "mem_info_vram_used")
                                if os.path.exists(mem_used_path):
                                    with open(mem_used_path, 'r') as f_mem_used: amd_gpu_data["memoryUsed"] = format_bytes(int(f_mem_used.read().strip()))

                                # Temperature and Power (hwmon) - simplified
                                hwmon_base = os.path.join(device_path, "hwmon")
                                if os.path.exists(hwmon_base):
                                    for hwmon_dir in os.listdir(hwmon_base):
                                        # temp1_input
                                        temp_input_path = os.path.join(hwmon_base, hwmon_dir, "temp1_input")
                                        if os.path.exists(temp_input_path):
                                            with open(temp_input_path, 'r') as f_temp: amd_gpu_data["temperature"] = float(f_temp.read().strip()) / 1000.0
                                        # power1_average
                                        power_avg_path = os.path.join(hwmon_base, hwmon_dir, "power1_average")
                                        if os.path.exists(power_avg_path):
                                            with open(power_avg_path, 'r') as f_power: amd_gpu_data["powerDraw"] = float(f_power.read().strip()) / 1000000.0
                                        if amd_gpu_data["temperature"] != "N/A": break # Found one hwmon with temp

                                gpu_info_list.append(amd_gpu_data)
                                gpu_idx_amd += 1
                except Exception as e_amd:
                    print(f"Error getting AMD GPU info on Linux: {e_amd}")

            if not gpu_info_list: # Intel GPU (psutil sensors as fallback)
                try:
                    temps = psutil.sensors_temperatures()
                    for name, entries in temps.items():
                        if 'i915' in name or 'intel' in name.lower():
                             for entry in entries:
                                if 'temp' in entry.label.lower() or entry.label == '':
                                    gpu_info_list.append({
                                        "id": f"Intel GPU {len(gpu_info_list)}", "name": f"Intel GPU ({name})",
                                        "utilization": "N/A", "memoryTotal": "N/A", "memoryUsed": "N/A",
                                        "temperature": entry.current, "powerDraw": "N/A",
                                    })
                                    break
                             break
                except Exception as e_intel:
                    print(f"Error getting Intel GPU info on Linux: {e_intel}")
    except Exception as e_gpu_main:
        print(f"Overall error in GPU data collection: {e_gpu_main}")
    overview_data["gpuUsage"] = gpu_info_list

    # Network Usage
    try:
        current_net_io = psutil.net_io_counters(pernic=True)
        current_time = time.time()
        time_delta = current_time - time_of_previous_net_io_global # Use global

        total_upload_bits_ps = 0
        total_download_bits_ps = 0
        interface_details = []

        for if_name, current_stats in current_net_io.items():
            prev_stats = previous_net_io_global.get(if_name) # Use global
            upload_bps = 0
            download_bps = 0

            if prev_stats and time_delta > 0:
                upload_diff = max(0, current_stats.bytes_sent - prev_stats.bytes_sent)
                download_diff = max(0, current_stats.bytes_recv - prev_stats.bytes_recv)
                upload_bps = (upload_diff * 8) / time_delta
                download_bps = (download_diff * 8) / time_delta

            total_upload_bits_ps += upload_bps
            total_download_bits_ps += download_bps
            interface_details.append({
                "name": if_name,
                "uploadSpeed": format_speed(upload_bps),
                "downloadSpeed": format_speed(download_bps),
                "dataSent": format_bytes(current_stats.bytes_sent),
                "dataReceived": format_bytes(current_stats.bytes_recv)
            })

        previous_net_io_global = current_net_io # Update global
        time_of_previous_net_io_global = current_time # Update global

        overview_data["networkUsage"] = {
            "uploadSpeed": round(total_upload_bits_ps / (1000**2), 2),
            "downloadSpeed": round(total_download_bits_ps / (1000**2), 2),
            "interfaces": interface_details
        }
    except Exception as e:
        print(f"Error getting network usage: {e}")
        overview_data["networkUsage"] = {"uploadSpeed": "N/A", "downloadSpeed": "N/A", "interfaces": []}

    # User & Task Stats (using placeholder globals)
    try:
        overview_data["userAndTaskStats"] = {
            "onlineUsers": len(CONNECTED_CLIENTS), # Use placeholder
            "totalTasksExecuted": TASK_EXCUTION.get("totalTasksExecuted", 0), # Use placeholder
            "successfulTasks": TASK_EXCUTION.get("successfulTasks", 0),
            "failedTasks": TASK_EXCUTION.get("failedTasks", 0),
            "runningTasks": TASK_EXCUTION.get("runningTasks", 0),
        }
    except Exception as e:
        print(f"Error getting user/task stats: {e}")
        overview_data["userAndTaskStats"] = {"onlineUsers": 0, "totalTasksExecuted": 0, "successfulTasks": 0, "failedTasks": 0, "runningTasks": 0}

    overview_data["downloadTaskHistory"] = [] # Placeholder

    await send_response(websocket, cmd_id, code=0, data=overview_data)

# Note: The globals previous_net_io_global and time_of_previous_net_io_global
# are defined at the module level of this handler. If multiple instances of this handler
# were created (which is not typical for function-based handlers like this), they would share state.
# For a class-based handler, these would be instance variables.
# For true global state shared across different handlers or server instances, a dedicated state
# management module (e.g., in src/core/state.py) would be necessary.
# The CONNECTED_CLIENTS and TASK_EXCUTION are placeholders for such shared state.
# Their actual implementation would involve importing them from the shared state module.
