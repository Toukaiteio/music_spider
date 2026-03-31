import os
import json
import logging
from utils.persistence import persistence
from core.ws_messaging import send_response

logger = logging.getLogger("PlaylistHandler")

def _get_playlist_metadata_list():
    """Helper to get the list of playlist objects (with metadata)."""
    return persistence.get("playlists", "metadata_list", [
        {"name": "Liked", "category": "System", "description": "Songs you liked", "color": "#ef4444"}
    ])

async def handle_get_playlists(websocket, cmd_id: str, payload: dict):
    """Fetch all playlists with full metadata and track counts."""
    metadata_list = _get_playlist_metadata_list()
    playlists = []
    for meta in metadata_list:
        name = meta["name"]
        tracks = persistence.get("playlists", f"tracks_{name}", [])
        playlists.append({
            **meta,
            "count": len(tracks)
        })
    
    await send_response(websocket, cmd_id, code=0, data={"playlists": playlists})

async def handle_get_playlist_tracks(websocket, cmd_id: str, payload: dict):
    """Fetch tracks for a specific playlist."""
    name = payload.get("name")
    if not name:
        await send_response(websocket, cmd_id, code=1, error="Missing playlist name")
        return
    
    tracks = persistence.get("playlists", f"tracks_{name}", [])
    await send_response(websocket, cmd_id, code=0, data={"name": name, "tracks": tracks})

async def handle_create_playlist(websocket, cmd_id: str, payload: dict):
    """Create a new playlist with metadata."""
    name = payload.get("name")
    if not name:
        await send_response(websocket, cmd_id, code=1, error="Missing playlist name")
        return
    
    metadata_list = _get_playlist_metadata_list()
    if any(m["name"] == name for m in metadata_list):
        await send_response(websocket, cmd_id, code=1, error=f"Playlist '{name}' already exists")
        return
    
    new_meta = {
        "name": name,
        "category": payload.get("category", ""),
        "description": payload.get("description", ""),
        "color": payload.get("color", "#6B7280")
    }
    
    metadata_list.append(new_meta)
    persistence.set("playlists", "metadata_list", metadata_list)
    persistence.set("playlists", f"tracks_{name}", [])
    
    await send_response(websocket, cmd_id, code=0, data={"message": f"Playlist '{name}' created", "playlist": new_meta})

async def handle_update_playlist(websocket, cmd_id: str, payload: dict):
    """Update playlist metadata (name, category, description, color)."""
    old_name = payload.get("old_name")
    new_meta = payload.get("new_metadata") # {name, category, description, color}
    
    if not old_name or not new_meta or not new_meta.get("name"):
        await send_response(websocket, cmd_id, code=1, error="Missing required update data")
        return
    
    metadata_list = _get_playlist_metadata_list()
    found_idx = -1
    for i, m in enumerate(metadata_list):
        if m["name"] == old_name:
            found_idx = i
            break
            
    if found_idx == -1:
        await send_response(websocket, cmd_id, code=1, error="Playlist not found")
        return

    new_name = new_meta["name"]
    # Check if new name conflicts with another playlist
    if new_name != old_name and any(m["name"] == new_name for m in metadata_list):
        await send_response(websocket, cmd_id, code=1, error=f"Playlist '{new_name}' already exists")
        return

    # Update metadata
    metadata_list[found_idx] = {
        "name": new_name,
        "category": new_meta.get("category", ""),
        "description": new_meta.get("description", ""),
        "color": new_meta.get("color", "#6B7280")
    }
    
    # If name changed, migrate tracks to new key
    if new_name != old_name:
        tracks = persistence.get("playlists", f"tracks_{old_name}", [])
        persistence.set("playlists", f"tracks_{new_name}", tracks)
        persistence.delete("playlists", f"tracks_{old_name}")

    persistence.set("playlists", "metadata_list", metadata_list)
    await send_response(websocket, cmd_id, code=0, data={"message": "Playlist updated successfully"})

async def handle_add_to_playlist(websocket, cmd_id: str, payload: dict):
    """Add a track to a playlist."""
    playlist_name = payload.get("playlist_name", "Liked")
    track_data = payload.get("track_data")
    
    if not track_data:
        await send_response(websocket, cmd_id, code=1, error="Missing track data")
        return
    
    metadata_list = _get_playlist_metadata_list()
    if not any(m["name"] == playlist_name for m in metadata_list):
        # Auto-create if not exists? For Liked it's usually there.
        new_meta = {"name": playlist_name, "category": "General", "description": "", "color": "#6B7280"}
        metadata_list.append(new_meta)
        persistence.set("playlists", "metadata_list", metadata_list)
    
    current_tracks = persistence.get("playlists", f"tracks_{playlist_name}", [])
    music_id = str(track_data.get("music_id") or track_data.get("id") or track_data.get("bvid"))
    
    if any(str(t.get("music_id") or t.get("id") or t.get("bvid")) == music_id for t in current_tracks):
        await send_response(websocket, cmd_id, code=0, data={"message": "Track already in playlist"})
        return
    
    current_tracks.append(track_data)
    persistence.set("playlists", f"tracks_{playlist_name}", current_tracks)
    
    await send_response(websocket, cmd_id, code=0, data={"message": f"Added to '{playlist_name}'"})

async def handle_remove_from_playlist(websocket, cmd_id: str, payload: dict):
    """Remove a track from a playlist."""
    playlist_name = payload.get("playlist_name", "Liked")
    music_id = str(payload.get("music_id"))
    
    if not music_id:
        await send_response(websocket, cmd_id, code=1, error="Missing music_id")
        return
    
    current_tracks = persistence.get("playlists", f"tracks_{playlist_name}", [])
    new_tracks = [t for t in current_tracks if str(t.get("music_id") or t.get("id") or t.get("bvid")) != music_id]
    
    if len(new_tracks) == len(current_tracks):
        await send_response(websocket, cmd_id, code=1, error="Track not found in playlist")
        return
    
    persistence.set("playlists", f"tracks_{playlist_name}", new_tracks)
    await send_response(websocket, cmd_id, code=0, data={"message": f"Removed from '{playlist_name}'"})

async def handle_delete_playlist(websocket, cmd_id: str, payload: dict):
    """Delete a playlist."""
    name = payload.get("name")
    if not name or name == "Liked":
        await send_response(websocket, cmd_id, code=1, error="Cannot delete protected playlist")
        return
    
    metadata_list = _get_playlist_metadata_list()
    new_metadata_list = [m for m in metadata_list if m["name"] != name]
    
    if len(new_metadata_list) == len(metadata_list):
        await send_response(websocket, cmd_id, code=1, error="Playlist not found")
        return
    
    persistence.set("playlists", "metadata_list", new_metadata_list)
    persistence.delete("playlists", f"tracks_{name}")
    
    await send_response(websocket, cmd_id, code=0, data={"message": f"Playlist '{name}' deleted"})
