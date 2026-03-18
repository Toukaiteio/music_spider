import time
from datetime import datetime
from utils.persistence import persistence

class PreferenceManager:
    def __init__(self):
        self.module_name = "user_preferences"

    def _detect_language(self, text):
        """
        Refined language detection:
        - Priority 1: Korean (Hangul)
        - Priority 2: Japanese (Hiragana/Katakana)
        - Priority 3: Chinese (CJK Ideographs without JP/KR scripts)
        - Priority 4: English/Western (Latin/ASCII)
        """
        if not text:
            return "unknown"
        
        # 1. Check for Korean Hangul ([\uac00-\ud7af])
        if any('\uac00' <= char <= '\ud7af' for char in text):
            return "kr"
            
        # 2. Check for Japanese Hiragana/Katakana ([\u3040-\u309f] and [\u30a0-\u30ff])
        if any('\u3040' <= char <= '\u309f' or '\u30a0' <= char <= '\u30ff' for char in text):
            return "jp"
            
        # 3. Check for CJK Unified Ideographs (Chinese Characters: [\u4e00-\u9fff])
        # If we are here, it means no JP/KR specific scripts were found.
        if any('\u4e00' <= char <= '\u9fff' for char in text):
            return "zh"
        
        # 4. Default to English/Western
        return "en/western"

    def report_event(self, event_data):
        """
        event_data: {
            "music_id": str,
            "action": "start" | "pause" | "end" | "heartbeat",
            "duration": float (seconds since last event),
            "track_info": dict (optional metadata: title, artist, language, lyrics, etc.)
        }
        """
        music_id = event_data.get("music_id")
        action = event_data.get("action")
        duration = event_data.get("duration", 0)
        track_info = event_data.get("track_info", {})

        if not music_id:
            return

        # Load current data
        data = persistence.get_module_data(self.module_name)
        if not data:
            data = {
                "history": [],
                "patterns": {
                    "artists": {},
                    "hourly_distribution": [0] * 24,
                    "languages": {},
                    "total_listening_time": 0
                },
                "last_update": 0
            }

        now = datetime.now()
        hour = now.hour
        timestamp = time.time()

        # Update total listening time
        if duration > 0:
            data["patterns"]["total_listening_time"] += duration
            data["patterns"]["hourly_distribution"][hour] += duration

        # Update artist patterns
        artist = track_info.get("artist") or track_info.get("singer")
        if artist and duration > 0:
            data["patterns"]["artists"][artist] = data["patterns"]["artists"].get(artist, 0) + duration

        # Update language patterns
        lang = track_info.get("language")
        if not lang:
            # 1. Try to get lyrics from track_info
            detection_text = track_info.get("lyrics", "")
            
            # 2. If no lyrics in payload, try to look up in local music library
            if not detection_text:
                library = persistence.get("music_library", "library", [])
                track_in_lib = next((t for t in library if t.get("music_id") == music_id), None)
                if track_in_lib:
                    detection_text = track_in_lib.get("lyrics", "")
            
            # 3. Combine with title and artist for a comprehensive check
            detection_text += (track_info.get("title") or "") + (artist or "")
            
            lang = self._detect_language(detection_text)
            
        if lang and duration > 0:
            data["patterns"]["languages"][lang] = data["patterns"]["languages"].get(lang, 0) + duration

        # Add to history if it's a "start" or "end" event (to keep history compact)
        if action in ["start", "end"]:
            history_entry = {
                "music_id": music_id,
                "title": track_info.get("title"),
                "artist": artist,
                "action": action,
                "timestamp": timestamp,
                "hour": hour
            }
            data["history"].append(history_entry)
            
            # Keep history to a reasonable size (e.g., last 1000 entries)
            if len(data["history"]) > 1000:
                data["history"] = data["history"][-1000:]

        data["last_update"] = timestamp
        persistence.set_module_data(self.module_name, data)

    def get_aggregated_preferences(self):
        """
        Aggregates data for daily playlist or recommendation systems.
        """
        data = persistence.get_module_data(self.module_name)
        if not data:
            return {}

        patterns = data.get("patterns", {})
        
        # Sort artists by listening time
        top_artists = sorted(patterns.get("artists", {}).items(), key=lambda x: x[1], reverse=True)[:10]
        
        # Identify preferred time slots
        hourly = patterns.get("hourly_distribution", [0]*24)
        peak_hours = sorted(range(24), key=lambda i: hourly[i], reverse=True)[:3]
        
        # Top languages
        top_langs = sorted(patterns.get("languages", {}).items(), key=lambda x: x[1], reverse=True)[:5]

        return {
            "top_artists": dict(top_artists),
            "peak_listening_hours": peak_hours,
            "top_languages": dict(top_langs),
            "total_listening_time_seconds": patterns.get("total_listening_time", 0),
            "recent_history": data.get("history", [])[-50:] # Last 50 entries
        }

preference_manager = PreferenceManager()
