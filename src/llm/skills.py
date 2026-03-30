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

SESSION_SEARCH_CACHE = {} # session_id -> dict(short_id: track_data)
SESSION_AUTHS = {} # session_id -> set(actions)
PENDING_AUTHS = {} # auth_id -> asyncio.Future

class MusicSkills:
    """Implementation of tools/skills for the Music Claw AI."""

    def __init__(self, websocket=None, session_id='default'):
        self.websocket = websocket
        self.session_id = session_id

    async def _request_auth(self, action: str, details: dict) -> bool:
        if action in SESSION_AUTHS.get(self.session_id, set()):
            return True
            
        import uuid
        auth_id = str(uuid.uuid4())
        from core.ws_messaging import send_response
        
        if not self.websocket:
            return False
            
        await send_response(self.websocket, "claw_auth_request", code=0, data={
            "auth_id": auth_id,
            "session_id": self.session_id,
            "action": action,
            "details": details
        })
        
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        PENDING_AUTHS[auth_id] = future
        
        try:
            return await asyncio.wait_for(future, timeout=120.0)
        except asyncio.TimeoutError:
            return False
        finally:
            PENDING_AUTHS.pop(auth_id, None)

    def _cache_track(self, track_data: dict) -> int:
        if self.session_id not in SESSION_SEARCH_CACHE:
            SESSION_SEARCH_CACHE[self.session_id] = {}
        cache = SESSION_SEARCH_CACHE[self.session_id]
        new_id = len(cache) + 1
        cache[str(new_id)] = track_data
        return new_id

    def _get_track(self, short_id) -> dict:
        return SESSION_SEARCH_CACHE.get(self.session_id, {}).get(str(short_id))

    async def search_music(self, query: str, source: str = "netease", limit: int = 5) -> Dict:
        """Search for music on a specific online source (bilibili, netease, kugou)."""
        from core.source_manager import get_source_enabled_status
        if not get_source_enabled_status(source):
            return {"error": f"Source '{source}' is currently disabled in settings."}

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
                    full_track = {
                        "music_id": r.get("music_id") or r.get("bvid") or r.get("id", ""),
                        "title": r.get("title", ""),
                        "artist": r.get("artist") or r.get("author", ""),
                        "album": r.get("album", ""),
                        "duration": r.get("duration", 0),
                        "artwork_url": r.get("artwork_url") or r.get("picUrl", ""),
                        "source": source,
                        "_raw": r, # Keep raw for downloader tasks
                    }
                    short_id = self._cache_track(full_track)
                    trimmed.append({
                        "short_id": short_id,
                        "title": full_track["title"],
                        "artist": full_track["artist"],
                        "album": full_track["album"],
                        "artwork_url": full_track["artwork_url"],
                        "source": source
                    })
                else:
                    trimmed.append(r)
            return {"results": trimmed, "count": len(trimmed), "source": source}
        except Exception as e:
            logger.error(f"[Skills] search_music error: {e}")
            return {"error": str(e)}

    async def search_at_sources(self, query: str, sources: List[str], limit_per_source: int = 5) -> Dict:
        """Search for music across multiple sources simultaneously."""
        from core.source_manager import get_source_enabled_status
        # Filter out disabled sources
        active_sources = [s for s in sources if get_source_enabled_status(s)]
        if not active_sources:
             return {"error": "All requested sources are currently disabled or unsupported."}
             
        tasks = [self.search_music(query, source, limit_per_source) for source in active_sources]
        results = await asyncio.gather(*tasks)
        
        combined = []
        for res in results:
            if "results" in res:
                combined.extend(res["results"])
        
        return {"results": combined, "count": len(combined)}

    async def search_library(self, query: str) -> Dict:
        """Search for music in the local downloaded library."""
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
                    
                    full_track = data.to_dict()
                    short_id = self._cache_track(full_track)
                    results.append({
                        "short_id": short_id,
                        "title": full_track.get("title", ""),
                        "artist": full_track.get("artist") or full_track.get("author", "")
                    })
            except:
                continue
        return {"results": results, "count": len(results)}

    async def get_playlists(self) -> Dict:
        """Get the current playlists and their content info."""
        list_names = persistence.get("playlists", "list_names", ["Liked"])
        result = []
        for name in list_names:
            tracks = persistence.get("playlists", name, [])
            result.append({
                "playlist_name": name,
                "track_count": len(tracks)
            })
        return {"playlists": result}

    async def create_playlist(self, name: str) -> Dict:
        """Create a new empty playlist."""
        auth = await self._request_auth("create_playlist", {"name": name})
        if not auth:
            return {"status": "error", "message": "User denied the operation."}
            
        metadata_list = persistence.get("playlists", "metadata_list", [
            {"name": "Liked", "category": "System", "description": "Songs you liked", "color": "#ef4444"}
        ])
        if any(m["name"] == name for m in metadata_list):
            return {"status": "error", "message": f"Playlist '{name}' already exists."}
        
        new_meta = {
            "name": name,
            "category": "AI Created",
            "description": "Created by Music Claw assistant",
            "color": "#6B7280"
        }
        metadata_list.append(new_meta)
        persistence.set("playlists", "metadata_list", metadata_list)
        persistence.set("playlists", f"tracks_{name}", [])
        return {"status": "success", "message": f"Playlist '{name}' created."}

    async def update_playlist_info(self, old_name: str, new_name: str) -> Dict:
        """Rename an existing playlist."""
        auth = await self._request_auth("update_playlist_info", {"old_name": old_name, "new_name": new_name})
        if not auth:
            return {"status": "error", "message": "User denied the operation."}

        list_names = persistence.get("playlists", "list_names", ["Liked"])
        if old_name not in list_names:
            return {"status": "error", "message": f"Playlist '{old_name}' not found."}
        if new_name in list_names:
            return {"status": "error", "message": f"Playlist '{new_name}' already exists."}
        
        idx = list_names.index(old_name)
        list_names[idx] = new_name
        tracks = persistence.get("playlists", old_name, [])
        persistence.set("playlists", new_name, tracks)
        # Delete old key isn't strictly necessary but good practice
        persistence.set("playlists", "list_names", list_names)
        return {"status": "success", "message": f"Playlist '{old_name}' renamed to '{new_name}'."}

    async def remove_from_playlist(self, short_id: str, playlist_name: str = "Liked") -> Dict:
        """Remove a track from a playlist using its short_id."""
        track_data = self._get_track(short_id)
        if not track_data:
            return {"status": "error", "message": f"Track with short_id {short_id} not found in current session cache."}

        auth = await self._request_auth("remove_from_playlist", {
            "track": track_data.get("title"),
            "playlist_name": playlist_name
        })
        if not auth:
            return {"status": "error", "message": "User denied the operation."}

        metadata_list = persistence.get("playlists", "metadata_list", [
            {"name": "Liked", "category": "System", "description": "Songs you liked", "color": "#ef4444"}
        ])
        if not any(m["name"] == playlist_name for m in metadata_list):
            return {"status": "error", "message": f"Playlist '{playlist_name}' not found."}

        current_tracks = persistence.get("playlists", f"tracks_{playlist_name}", [])
        music_id = str(track_data.get("music_id") or track_data.get("id"))
        
        new_tracks = [t for t in current_tracks if str(t.get("music_id") or t.get("id") or t.get("bvid")) != music_id]
        if len(new_tracks) == len(current_tracks):
            return {"status": "ignored", "message": f"Track not found in '{playlist_name}'."}
            
        persistence.set("playlists", f"tracks_{playlist_name}", new_tracks)
        return {"status": "success", "message": f"Removed from '{playlist_name}'."}

    async def add_to_playlist(self, short_id: str, playlist_name: str = "Liked") -> Dict:
        """Add a track to a playlist using its short_id."""
        track_data = self._get_track(short_id)
        if not track_data or not isinstance(track_data, dict):
            return {"status": "error", "message": "Invalid short_id provided. Run search first."}
        
        auth = await self._request_auth("add_to_playlist", {
            "track": track_data.get("title"),
            "playlist_name": playlist_name
        })
        if not auth:
            return {"status": "error", "message": "User denied the operation."}

        metadata_list = persistence.get("playlists", "metadata_list", [
            {"name": "Liked", "category": "System", "description": "Songs you liked", "color": "#ef4444"}
        ])
        if not any(m["name"] == playlist_name for m in metadata_list):
            await self.create_playlist(playlist_name)
        
        current_tracks = persistence.get("playlists", f"tracks_{playlist_name}", [])
        music_id = str(track_data.get("music_id") or track_data.get("id"))
        
        if any(str(t.get("music_id") or t.get("id") or t.get("bvid")) == music_id for t in current_tracks):
            return {"status": "ignored", "message": f"Track already in '{playlist_name}'."}
        
        current_tracks.append(track_data)
        persistence.set("playlists", f"tracks_{playlist_name}", current_tracks)
        return {"status": "success", "message": f"Added to '{playlist_name}'."}

    async def download_song(self, short_id: str) -> Dict:
        """Download a track for offline listening. Requires short_id from search."""
        track_data = self._get_track(short_id)
        if not track_data:
            return {"status": "error", "message": "Track not found. Search first."}
        
        auth = await self._request_auth("download_song", {
            "track": track_data.get("title"),
            "artist": track_data.get("artist")
        })
        if not auth:
            return {"status": "error", "message": "Download denied by user."}

        source = track_data.get("source")
        downloader = DOWNLOADER_MODULES.get(source)
        if not downloader:
            return {"status": "error", "message": f"Source '{source}' downloader not available."}
        
        # Start download in background
        asyncio.create_task(self._do_download(downloader, track_data))
        
        return {"status": "success", "message": f"Download for '{track_data['title']}' started in background."}

    async def _do_download(self, downloader, track_data):
        try:
             func = getattr(downloader, "download_track_async", None) or getattr(downloader, "download_track", None)
             if func:
                 raw = track_data.get("_raw", track_data)
                 if asyncio.iscoroutinefunction(func):
                     await func(raw)
                 else:
                     loop = asyncio.get_event_loop()
                     await loop.run_in_executor(None, func, raw)
        except Exception as e:
            logger.error(f"Download failed: {e}")

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

    async def play_song(self, short_id: str) -> Dict:
        """Trigger playback of a specific song using its short_id."""
        track_data = self._get_track(short_id)
        if not track_data or not isinstance(track_data, dict):
            return {"status": "error", "message": "Invalid short_id provided. Run search first."}

        music_id = track_data.get("music_id") or track_data.get("id")
        source = track_data.get("source")
        
        if not music_id:
            return {"status": "error", "message": "Missing music_id in track_data."}

        # Check if already downloaded
        item = MusicItem.load_from_json(music_id)
        if not item or not item.audio:
            # Need to download
            if not source and "_" in str(music_id):
                source = str(music_id).split("_")[0]
            
            if not source or source not in DOWNLOADER_MODULES:
                return {"status": "error", "message": f"Track {music_id} not found locally and no valid source info for download."}
            
            downloader = DOWNLOADER_MODULES[source]
            from config import DOWNLOADS_DIR
            try:
                # Use download_track coroutine which usually returns MusicItem
                download_func = getattr(downloader, "download_track", None)
                if not download_func:
                     return {"status": "error", "message": f"Downloader for '{source}' does not support direct download."}
                
                def progress_cb(**kwargs):
                    # Progress callback for AI triggered downloads
                    # This allows the frontend to show the download in the Task Queue
                    try:
                        from core.ws_messaging import send_response
                        # Map internal args if needed, though kwargs might already match
                        payload = {
                            "status_type": "download_progress",
                            "track_details": track_data,
                            "original_cmd_id": "ai_tool_call"
                        }
                        payload.update(kwargs)
                        if "current_size" in kwargs and "total_size" in kwargs:
                            curr = kwargs["current_size"]
                            total = kwargs["total_size"]
                            payload["progress_percent"] = round((curr / total * 100) if total > 0 else 0, 2)
                        
                        asyncio.run_coroutine_threadsafe(
                            send_response(self.websocket, "ai_trigger", code=0, data=payload),
                            asyncio.get_event_loop()
                        )
                    except Exception:
                        pass # Avoid crashing download thread on progress error

                if asyncio.iscoroutinefunction(download_func):
                    result = await download_func(track_data, DOWNLOADS_DIR, progress_callback=progress_cb)
                else:
                    loop = asyncio.get_event_loop()
                    result = await loop.run_in_executor(None, download_func, track_data, DOWNLOADS_DIR, progress_cb)
                
                if not result:
                    return {"status": "error", "message": "Failed to download the track."}
                item = result
            except Exception as e:
                logger.exception(f"play_song download error for {music_id}")
                return {"status": "error", "message": f"Download error: {str(e)}"}
        
        # At this point, item should be a MusicItem with valid audio path
        if self.websocket:
            from core.ws_messaging import send_response
            # Use the local item's data to ensure correct paths
            payload_track = item.data.to_dict()
            await send_response(self.websocket, "llm_action", code=0, data={
                "action": "play",
                "track": payload_track
            })
            return {"status": "success", "message": f"Playing {item.title}"}
        return {"status": "error", "message": "WebSocket connection not available for playback."}

    async def plan_tasks(self, task_description: str) -> Dict:
        """Break down a complex user request into steps."""
        return {
            "status": "planned",
            "message": "Plan generated.",
            "steps": [s.strip() for s in task_description.split(".") if s.strip()]
        }

    async def autonomous_crawl_target(self, task_type: str, source: str, target: str) -> Dict:
        """
        Add a target string (url or id) to the autonomous background crawler engine.
        task_type must be one of: 'artist', 'album', 'playlist'
        source must be one of: 'netease', 'kugou'
        """
        from core.crawler import global_crawler
        if not global_crawler.is_running:
             await global_crawler.start()
        global_crawler.add_task(task_type, source, target)
        return {"status": "success", "message": f"Crawler engine accepted task to autonomously pull {task_type} from {source}: {target}"}
