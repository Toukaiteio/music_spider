from downloaders import bilibili_downloader, soundcloud_downloader
from config import DISABLED_AUTH_SOURCES

AUTH_MANAGERS = {
    "bilibili": bilibili_downloader,
    "soundcloud": soundcloud_downloader
}

def get_all_auth_status():
    return [
        manager.get_auth_state() 
        for name, manager in AUTH_MANAGERS.items() 
        if name not in DISABLED_AUTH_SOURCES
    ]

def get_auth_action(source):
    manager = AUTH_MANAGERS.get(source)
    if manager:
        return manager.generate_auth_action()
    return {"error": "Source not found"}

def poll_auth_status(source, params):
    manager = AUTH_MANAGERS.get(source)
    if manager:
        return manager.poll_auth_status(params)
    return {"error": "Source not found"}

def login_with_params(source, params):
    manager = AUTH_MANAGERS.get(source)
    if manager:
        return manager.login_with_params(params)
    return {"error": "Source not found"}

def logout(source):
    manager = AUTH_MANAGERS.get(source)
    if manager:
        return manager.logout()
    return {"error": "Source not found"}
