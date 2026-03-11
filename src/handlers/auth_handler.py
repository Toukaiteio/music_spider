import json
from core.ws_messaging import send_response
from core.auth_manager import (
    get_all_auth_status,
    get_auth_action,
    poll_auth_status,
    login_with_params,
    logout
)

async def handle_get_all_auth_status(websocket, cmd_id, payload):
    statuses = get_all_auth_status()
    await send_response(websocket, cmd_id, code=0, data={"statuses": statuses})

async def handle_get_auth_action(websocket, cmd_id, payload):
    source = payload.get("source")
    if not source:
        await send_response(websocket, cmd_id, code=1, error="Missing source")
        return
    result = get_auth_action(source)
    if "error" in result:
        await send_response(websocket, cmd_id, code=1, error=result["error"])
    else:
        await send_response(websocket, cmd_id, code=0, data=result)

async def handle_poll_auth_status(websocket, cmd_id, payload):
    source = payload.get("source")
    params = payload.get("params", {})
    if not source:
        await send_response(websocket, cmd_id, code=1, error="Missing source")
        return
    result = poll_auth_status(source, params)
    if "error" in result:
        await send_response(websocket, cmd_id, code=1, error=result["error"])
    else:
        await send_response(websocket, cmd_id, code=0, data=result)

async def handle_login_with_params(websocket, cmd_id, payload):
    source = payload.get("source")
    params = payload.get("params", {})
    if not source:
        await send_response(websocket, cmd_id, code=1, error="Missing source")
        return
    result = login_with_params(source, params)
    if "error" in result:
        await send_response(websocket, cmd_id, code=1, error=result["error"])
    else:
        await send_response(websocket, cmd_id, code=0, data=result)

async def handle_logout(websocket, cmd_id, payload):
    source = payload.get("source")
    if not source:
        await send_response(websocket, cmd_id, code=1, error="Missing source")
        return
    result = logout(source)
    if "error" in result:
        await send_response(websocket, cmd_id, code=1, error=result["error"])
    else:
        await send_response(websocket, cmd_id, code=0, data=result)
