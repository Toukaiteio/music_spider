import asyncio
import inspect
import json

from utils.data_type import ResultBase
# Assuming DOWNLOADER_MODULES and send_response will be refactored or passed
# For now, this is a placeholder for where they would be imported from
# from core.downloaders import DOWNLOADER_MODULES (hypothetical) # This should be provided by the server environment
# from core.ws_messaging import send_response (hypothetical)

# DOWNLOADER_MODULES should be available from the server's context (e.g., global in server.py)
# No local DOWNLOADER_MODULES = {} definition here.

# Placeholder for send_response - this will also need to be resolved.
# TODO: This will be moved to src.core.server and imported from there.
async def send_response(websocket, cmd_id: str, code: int, data: dict = None, error: str = None):
    """Helper function to send a consistent response structure."""
    response_payload = {"original_cmd_id": cmd_id}
    if error:
        response_payload["error"] = error
    if data:
        response_payload.update(data) # Merge additional data

    response = ResultBase(code=code, data=response_payload)
    try:
        await websocket.send(json.dumps(response.get_json()))
    except Exception as e:  # Catch any send errors
        print(f"Failed to send response for cmd_id {cmd_id}: {e}")


async def handle_search(websocket, cmd_id: str, payload: dict):
    print(f"Handling search command with cmd_id: {cmd_id}, payload: {payload}")
    search_query = payload.get("query")
    source = payload.get("source", "soundcloud") # Default to soundcloud

    if not search_query:
        await send_response(websocket, cmd_id, code=1, error="Search query is missing.")
        return

    # Assuming DOWNLOADER_MODULES is globally available from core.server context
    from core.server import DOWNLOADER_MODULES # This makes the assumption explicit for clarity

    downloader_module = DOWNLOADER_MODULES.get(source)

    if not downloader_module:
        await send_response(websocket, cmd_id, code=1, error=f"Unsupported source or server misconfiguration for: {source}")
        return

    try:
        limit = payload.get("limit", 20)

        # Determine if the search function is async (e.g. "search_tracks_async")
        # or sync ("search_tracks"). This is a temporary measure for mixed-type modules.
        # Ideally, all modules adhere to a consistent async/sync interface for search.
        search_func_name = "search_tracks_async" if hasattr(downloader_module, "search_tracks_async") else "search_tracks"
        search_func = getattr(downloader_module, search_func_name)

        import inspect
        sig = inspect.signature(search_func)

        if asyncio.iscoroutinefunction(search_func):
            if 'limit' in sig.parameters:
                search_results = await search_func(query=search_query, limit=limit)
            else:
                search_results = await search_func(query=search_query)
        else: # Synchronous function, run in executor
            loop = asyncio.get_event_loop()
            if 'limit' in sig.parameters:
                search_results = await loop.run_in_executor(None, search_func, search_query, limit)
            else:
                search_results = await loop.run_in_executor(None, search_func, search_query)

        print(f"Search for '{search_query}' from source '{source}' (limit: {limit}) yielded {len(search_results)} results.")
        response_data = {"original_cmd_id": cmd_id, "source": source, "results": search_results}
        await send_response(websocket, cmd_id, code=0, data=response_data)

    except Exception as e:
        print(f"Error during search for query '{search_query}': {e}")
        # import traceback; traceback.print_exc() # For debugging
        await send_response(websocket, cmd_id, code=1, error=f"Search failed: {str(e)}")

# DOWNLOADER_MODULES_TEMP = {} # Removed, rely on centrally defined DOWNLOADER_MODULES
