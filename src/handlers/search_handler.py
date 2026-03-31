import asyncio
import inspect
import json

from utils.data_type import ResultBase

from core.ws_messaging import send_response
from core.state import DOWNLOADER_MODULES

async def handle_search(websocket, cmd_id: str, payload: dict):
    print(f"Handling search command with cmd_id: {cmd_id}, payload: {payload}")
    search_query = payload.get("query")
    source = payload.get("source", "soundcloud") # Default to soundcloud

    if not search_query:
        await send_response(websocket, cmd_id, code=1, error="Search query is missing.")
        return

    from core.source_manager import get_source_enabled_status
    if not get_source_enabled_status(source):
        await send_response(websocket, cmd_id, code=1, error=f"Source '{source}' is currently disabled.")
        return

    downloader_module = DOWNLOADER_MODULES.get(source)

    if not downloader_module:
        await send_response(websocket, cmd_id, code=1, error=f"Unsupported source or server misconfiguration for: {source}")
        return

    try:
        limit = payload.get("limit", 20)
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

