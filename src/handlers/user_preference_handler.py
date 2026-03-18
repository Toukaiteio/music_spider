from core.ws_messaging import send_response
from utils.preference_manager import preference_manager

async def handle_report_listening_event(websocket, cmd_id, payload):
    """
    Handles reports of listening activity.
    """
    try:
        preference_manager.report_event(payload)
        await send_response(websocket, cmd_id, code=0, message="Preference event recorded")
    except Exception as e:
        await send_response(websocket, cmd_id, code=1, error=str(e))

async def handle_get_user_preferences(websocket, cmd_id, payload):
    """
    Returns aggregated user preference data.
    """
    try:
        data = preference_manager.get_aggregated_preferences()
        await send_response(websocket, cmd_id, code=0, data=data)
    except Exception as e:
        await send_response(websocket, cmd_id, code=1, error=str(e))
