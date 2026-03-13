import os
import json
from utils.persistence import persistence
from core.ws_messaging import send_response

async def handle_get_playlists(websocket, cmd_id: str, payload: dict):
    """Fetch all playlists and their track counts."""
    list_names = persistence.get("playlists", "list_names", ["Liked"])
    playlists = []
    for name in list_names:
        tracks = persistence.get("playlists", name, [])
        playlists.append({
            "name": name,
            "count": len(tracks)
        })
    
    await send_response(websocket, cmd_id, code=0, data={"playlists": playlists})

async def handle_get_playlist_tracks(websocket, cmd_id: str, payload: dict):
    """Fetch tracks for a specific playlist."""
    name = payload.get("name")
    if not name:
        await send_response(websocket, cmd_id, code=1, error="Missing playlist name")
        return
    
    tracks = persistence.get("playlists", name, [])
    await send_response(websocket, cmd_id, code=0, data={"name": name, "tracks": tracks})

async def handle_create_playlist(websocket, cmd_id: str, payload: dict):
    """Create a new playlist."""
    name = payload.get("name")
    if not name:
        await send_response(websocket, cmd_id, code=1, error="Missing playlist name")
        return
    
    list_names = persistence.get("playlists", "list_names", ["Liked"])
    if name in list_names:
        await send_response(websocket, cmd_id, code=1, error=f"Playlist '{name}' already exists")
        return
    
    list_names.append(name)
    persistence.set("playlists", "list_names", list_names)
    persistence.set("playlists", name, [])
    
    await send_response(websocket, cmd_id, code=0, data={"message": f"Playlist '{name}' created"})

async def handle_add_to_playlist(websocket, cmd_id: str, payload: dict):
    """Add a track to a playlist."""
    playlist_name = payload.get("playlist_name", "Liked")
    track_data = payload.get("track_data")
    
    if not track_data:
        await send_response(websocket, cmd_id, code=1, error="Missing track data")
        return
    
    list_names = persistence.get("playlists", "list_names", ["Liked"])
    if playlist_name not in list_names:
        list_names.append(playlist_name)
        persistence.set("playlists", "list_names", list_names)
        persistence.set("playlists", playlist_name, [])
    
    current_tracks = persistence.get("playlists", playlist_name, [])
    music_id = track_data.get("music_id") or track_data.get("id")
    
    if any((t.get("music_id") or t.get("id")) == music_id for t in current_tracks):
        await send_response(websocket, cmd_id, code=0, data={"message": "Track already in playlist"})
        return
    
    current_tracks.append(track_data)
    persistence.set("playlists", playlist_name, current_tracks)
    
    await send_response(websocket, cmd_id, code=0, data={"message": f"Added to '{playlist_name}'"})

async def handle_remove_from_playlist(websocket, cmd_id: str, payload: dict):
    """Remove a track from a playlist."""
    playlist_name = payload.get("playlist_name", "Liked")
    music_id = payload.get("music_id")
    
    if not music_id:
        await send_response(websocket, cmd_id, code=1, error="Missing music_id")
        return
    
    current_tracks = persistence.get("playlists", playlist_name, [])
    new_tracks = [t for t in current_tracks if (t.get("music_id") or t.get("id")) != music_id]
    
    if len(new_tracks) == len(current_tracks):
        await send_response(websocket, cmd_id, code=1, error="Track not found in playlist")
        return
    
    persistence.set("playlists", playlist_name, new_tracks)
    await send_response(websocket, cmd_id, code=0, data={"message": f"Removed from '{playlist_name}'"})

async def handle_delete_playlist(websocket, cmd_id: str, payload: dict):
    """Delete a playlist."""
    name = payload.get("name")
    if not name or name == "Liked":
        await send_response(websocket, cmd_id, code=1, error="Invalid playlist name")
        return
    
    list_names = persistence.get("playlists", "list_names", ["Liked"])
    if name not in list_names:
        await send_response(websocket, cmd_id, code=1, error="Playlist not found")
        return
    
    list_names.remove(name)
    persistence.set("playlists", "list_names", list_names)
    persistence.delete("playlists", name)
    
    await send_response(websocket, cmd_id, code=0, data={"message": f"Playlist '{name}' deleted"})
