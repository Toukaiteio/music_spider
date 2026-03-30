from core.ws_messaging import send_response
from core.crawler import global_crawler
from core.auth import current_user
from utils.persistence import persistence

async def handle_add_crawler_task(websocket, cmd_id, payload):
    user = current_user.get()
    if not user or not user["is_admin"]:
        await send_response(websocket, cmd_id, code=1, error="Permission denied")
        return
        
    task_type = payload.get("task_type")
    source = payload.get("source")
    target = payload.get("target")
    quality = payload.get("quality", "lossless")
    
    if not all([task_type, source, target]):
        await send_response(websocket, cmd_id, code=1, error="Missing parameters")
        return
        
    global_crawler.add_task(task_type, source, target, quality)
    await send_response(websocket, cmd_id, code=0, data={"message": "Crawler task dispatched successfully."})

async def handle_get_crawler_status(websocket, cmd_id, payload):
    user = current_user.get()
    if not user or not user["is_admin"]:
        await send_response(websocket, cmd_id, code=1, error="Permission denied")
        return
        
    netease_db = persistence.get("crawler_db", "netease", [])
    kugou_db = persistence.get("crawler_db", "kugou", [])
    
    tasks_data = [t.to_dict() for t in global_crawler.tasks.values()]
    data = {
        "is_running": global_crawler.is_running,
        "queue_size": len([t for t in global_crawler.tasks.values() if t.status == "pending"]),
        "crawled_netease": len(netease_db),
        "crawled_kugou": len(kugou_db),
        "tasks": tasks_data
    }
    await send_response(websocket, cmd_id, code=0, data=data)

async def handle_control_crawler_task(websocket, cmd_id, payload):
    user = current_user.get()
    if not user or not user["is_admin"]:
        await send_response(websocket, cmd_id, code=1, error="Permission denied")
        return
        
    action = payload.get("action")
    task_id = payload.get("task_id")
    if action == "pause":
        global_crawler.pause_task(task_id)
    elif action == "resume":
        global_crawler.resume_task(task_id)
        
    await send_response(websocket, cmd_id, code=0, data={"message": f"Task {action} executed."})
