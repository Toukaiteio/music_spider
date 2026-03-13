from downloaders import bilibili_downloader, netease_downloader, kugou_downloader
from config import DISABLED_AUTH_SOURCES
from utils.persistence import persistence

SOURCE_MANAGERS = {
    "bilibili": bilibili_downloader,
    "netease": netease_downloader,
    "kugou": kugou_downloader
}

def get_source_enabled_status(source_name):
    # Default to True if not explicitly disabled in persistence
    return persistence.get("source_manager", f"{source_name}_enabled", True)

def set_source_enabled_status(source_name, enabled):
    persistence.set("source_manager", f"{source_name}_enabled", enabled)

def get_all_source_status():
    statuses = []
    for name, manager in SOURCE_MANAGERS.items():
        if name in DISABLED_AUTH_SOURCES:
            continue
        
        state = manager.get_auth_state()
        state["enabled"] = get_source_enabled_status(name)
        
        # Add source meta info
        state["source"] = name
        source_info = getattr(manager, 'get_source_info', lambda: {})()
        state["require_auth_to_enable"] = source_info.get("require_auth_to_enable", False)
        
        statuses.append(state)
    return statuses

def get_auth_action(source):
    manager = SOURCE_MANAGERS.get(source)
    if manager:
        return manager.generate_auth_action()
    return {"error": "Source not found"}

def poll_auth_status(source, params):
    manager = SOURCE_MANAGERS.get(source)
    if manager:
        return manager.poll_auth_status(params)
    return {"error": "Source not found"}

def login_with_params(source, params):
    manager = SOURCE_MANAGERS.get(source)
    if manager:
        return manager.login_with_params(params)
    return {"error": "Source not found"}

def logout(source):
    manager = SOURCE_MANAGERS.get(source)
    if manager:
        return manager.logout()
    return {"error": "Source not found"}

def enable_source(source):
    manager = SOURCE_MANAGERS.get(source)
    if not manager:
        return {"error": "Source not found"}
    
    # Check if authentication is required to enable
    source_info = getattr(manager, 'get_source_info', lambda: {})()
    require_auth = source_info.get("require_auth_to_enable", False)
    
    if require_auth:
        auth_state = manager.get_auth_state()
        if not auth_state.get("is_logged_in"):
            msg = source_info.get("auth_required_message", "你需要先提供认证才能使用这个Source")
            return {"error": msg}

    set_source_enabled_status(source, True)
    return {"status": "success", "source": source, "enabled": True}

def disable_source(source):
    if source in SOURCE_MANAGERS:
        set_source_enabled_status(source, False)
        return {"status": "success", "source": source, "enabled": False}
    return {"error": "Source not found"}
