import asyncio
import json
import logging
import os
import inspect
import base64
import time
from typing import Dict, List, Optional, Any

from core.state import DOWNLOADER_MODULES
from utils.persistence import persistence
from utils.data_type import MusicItem
from config import GENIUS_ACCESS_TOKEN
import httpx

logger = logging.getLogger("MusicSkills")

class MusicSkills:
    """Implementation of tools/skills for the Music Claw AI."""

    def __init__(self, websocket=None):
        self.websocket = websocket

    async def search_music(self, query: str, source: str = "netease", limit: int = 5) -> Dict:
        """Search for music on a specific online source (bilibili, netease, kugou)."""
        downloader = DOWNLOADER_MODULES.get(source)
        if not downloader:
            return {"error": f"Unsupported source: {source}"}
        
        try:
            func_name = "search_tracks_async" if hasattr(downloader, "search_tracks_async") else "search_tracks"
            func = getattr(downloader, func_name)
            sig = inspect.signature(func)
            
            if asyncio.iscoroutinefunction(func):
                results = await func(query=query, limit=limit) if "limit" in sig.parameters else await func(query=query)
            else:
                loop = asyncio.get_event_loop()
                results = await loop.run_in_executor(None, func, query, limit) if "limit" in sig.parameters else await loop.run_in_executor(None, func, query)

            trimmed = []
            for r in (results or [])[:limit]:
                if isinstance(r, dict):
                    trimmed.append({
                        "music_id": r.get("music_id") or r.get("bvid") or r.get("id", ""),
                        "title": r.get("title", ""),
                        "artist": r.get("artist") or r.get("author", ""),
                        "album": r.get("album", ""),
                        "duration": r.get("duration", 0),
                        "artwork_url": r.get("artwork_url") or r.get("picUrl", ""),
                        "source": source,
                        "_raw": r, # Keep raw for downloader tasks
                    })
                else:
                    trimmed.append(r)
            return {"results": trimmed, "count": len(trimmed), "source": source}
        except Exception as e:
            logger.error(f"[Skills] search_music error: {e}")
            return {"error": str(e)}

    async def search_at_sources(self, query: str, sources: List[str], limit_per_source: int = 5) -> Dict:
        """Search for music across multiple sources simultaneously."""
        tasks = [self.search_music(query, source, limit_per_source) for source in sources]
        results = await asyncio.gather(*tasks)
        
        combined = []
        for res in results:
            if "results" in res:
                combined.extend(res["results"])
        
        return {"results": combined, "count": len(combined)}

    async def search_library(self, query: str) -> Dict:
        """Search for music in the local downloaded library."""
        from handlers.search_downloaded_music_handler import handle_search_downloaded_music
        # We'll simulate the handler logic
        from config import DOWNLOADS_DIR
        results = []
        query_lower = query.lower()
        
        if not os.path.exists(DOWNLOADS_DIR):
            return {"results": [], "count": 0}
            
        for music_id in os.listdir(DOWNLOADS_DIR):
            try:
                item = MusicItem.load_from_json(music_id)
                if not item: continue
                data = item.data
                if (query_lower in (data.title or "").lower() or 
                    query_lower in (data.author or "").lower() or 
                    query_lower in (data.album or "").lower()):
                    results.append(data.to_dict())
            except:
                continue
        return {"results": results, "count": len(results)}

    async def create_playlist(self, name: str) -> Dict:
        """Create a new empty playlist."""
        list_names = persistence.get("playlists", "list_names", ["Liked"])
        if name in list_names:
            return {"status": "error", "message": f"Playlist '{name}' already exists."}
        
        list_names.append(name)
        persistence.set("playlists", "list_names", list_names)
        persistence.set("playlists", name, [])
        return {"status": "success", "message": f"Playlist '{name}' created."}

    async def add_to_playlist(self, track_data: Dict, playlist_name: str = "Liked") -> Dict:
        """Add a track to a specified playlist."""
        list_names = persistence.get("playlists", "list_names", ["Liked"])
        if playlist_name not in list_names:
            await self.create_playlist(playlist_name)
        
        current_tracks = persistence.get("playlists", playlist_name, [])
        music_id = track_data.get("music_id") or track_data.get("id")
        
        if any((t.get("music_id") or t.get("id")) == music_id for t in current_tracks):
            return {"status": "ignored", "message": f"Track already in '{playlist_name}'."}
        
        current_tracks.append(track_data)
        persistence.set("playlists", playlist_name, current_tracks)
        return {"status": "success", "message": f"Added to '{playlist_name}'."}

    async def get_lyrics(self, song_name: str, artist: str = "") -> Dict:
        """Search for lyrics for a song (tries Netease/Kugou)."""
        query = f"{song_name} {artist}".strip()
        # Try Netease first
        search_res = await self.search_music(query, "netease", 1)
        if search_res.get("results"):
            track = search_res["results"][0]
            from downloaders.netease_downloader import _get_lyrics_netease
            lyrics = await asyncio.get_event_loop().run_in_executor(None, _get_lyrics_netease, track["music_id"])
            if lyrics:
                return {"lyrics": lyrics, "source": "netease", "track": track}
        
        # Try Kugou
        search_res = await self.search_music(query, "kugou", 1)
        if search_res.get("results"):
            track = search_res["results"][0]
            # Assuming kugou downloader has access to lyrics via search raw data or separate call
            # For now, if no explicit function, we check if raw has it
            raw = track.get("_raw", {})
            if raw.get("lyrics"):
                return {"lyrics": raw["lyrics"], "source": "kugou", "track": track}

        return {"status": "error", "message": "No lyrics found for this song."}

    async def get_metadata(self, query: str) -> Dict:
        """Fetch accurate metadata (artist info, album, cover) from Genius."""
        if not GENIUS_ACCESS_TOKEN or "YOUR" in GENIUS_ACCESS_TOKEN:
            return {"error": "Genius API token not configured."}
        
        url = f"https://api.genius.com/search?q={query}"
        headers = {"Authorization": f"Bearer {GENIUS_ACCESS_TOKEN}"}
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    hits = data.get("response", {}).get("hits", [])
                    if hits:
                        best = hits[0]["result"]
                        return {
                            "title": best.get("title"),
                            "artist": best.get("primary_artist", {}).get("name"),
                            "artwork_url": best.get("song_art_image_thumbnail_url"),
                            "genius_url": best.get("url"),
                            "album": best.get("album", {}).get("name") if best.get("album") else "Unknown"
                        }
            return {"error": "No metadata found on Genius."}
        except Exception as e:
            return {"error": str(e)}

    async def update_track_metadata(self, music_id: str, metadata: Dict) -> Dict:
        """Apply metadata (title, artist, album, genre, lyrics, cover_url) to a local track."""
        try:
            item = MusicItem.load_from_json(music_id)
            if not item:
                return {"error": f"Track {music_id} not found in library."}
            
            updatable = ["title", "author", "album", "genre", "lyrics"]
            changed = []
            for field in updatable:
                # Skill uses 'artist', MusicItem uses 'author'
                val = metadata.get(field)
                if field == "author" and not val:
                    val = metadata.get("artist")
                
                if val:
                    setattr(item, field, val)
                    changed.append(field)
            
            # Handle cover if cover_url is provided
            cover_url = metadata.get("cover_url") or metadata.get("artwork_url")
            if cover_url:
                try:
                    async with httpx.AsyncClient() as client:
                        resp = await client.get(cover_url)
                        if resp.status_code == 200:
                            cover_dir = os.path.join(item.work_path, "covers")
                            os.makedirs(cover_dir, exist_ok=True)
                            filename = f"cover_{int(time.time())}.jpg"
                            filepath = os.path.join(cover_dir, filename)
                            with open(filepath, "wb") as f:
                                f.write(resp.content)
                            item.set_cover(os.path.join(item.read_path, "./covers/"+filename))
                            changed.append("cover_image")
                except Exception as ce:
                    logger.error(f"Failed to download cover from {cover_url}: {ce}")

            item.dump_self()
            return {"status": "success", "updated_fields": changed}
        except Exception as e:
            return {"error": str(e)}

    async def play_song(self, track_data: Dict) -> Dict:
        """Trigger playback of a specific song in the player."""
        if self.websocket:
            from core.ws_messaging import send_response
            # This triggers the push handler we registered in frontend
            await send_response(self.websocket, "llm_action", code=0, data={
                "action": "play",
                "track": track_data
            })
            return {"status": "success", "message": f"Playing {track_data.get('title')}"}
        return {"status": "error", "message": "WebSocket connection not available for playback."}

    async def plan_tasks(self, task_description: str) -> Dict:
        """Break down a complex user request into steps."""
        return {
            "status": "planned",
            "message": "Plan generated.",
            "steps": [s.strip() for s in task_description.split(".") if s.strip()]
        }
