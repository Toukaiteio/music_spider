import time
from datetime import datetime, timedelta
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

    def _get_empty_day_data(self):
        return {
            "history": [],
            "patterns": {
                "artists": {},
                "hourly_distribution": [0] * 24,
                "languages": {},
                "total_listening_time": 0
            },
            "last_update": 0
        }

    def _load_and_migrate_data(self):
        data = persistence.get_module_data(self.module_name)
        if not data:
            return {}
            
        # Check if it needs migration
        if "patterns" in data or "history" in data:
            # It's in the old single-object format
            new_data = {}
            yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            
            # Distribute history
            old_history = data.get("history", [])
            for entry in old_history:
                if "timestamp" in entry:
                    try:
                        date_str = datetime.fromtimestamp(entry["timestamp"]).strftime("%Y-%m-%d")
                    except:
                        date_str = yesterday_str
                else:
                    date_str = yesterday_str
                    
                if date_str not in new_data:
                    new_data[date_str] = self._get_empty_day_data()
                new_data[date_str]["history"].append(entry)
                
            # Distribute patterns to yesterday
            if yesterday_str not in new_data:
                new_data[yesterday_str] = self._get_empty_day_data()
                
            old_patterns = data.get("patterns", self._get_empty_day_data()["patterns"])
            new_data[yesterday_str]["patterns"] = old_patterns
            new_data[yesterday_str]["last_update"] = data.get("last_update", time.time())
            
            # Save the migrated data
            persistence.set_module_data(self.module_name, new_data)
            return new_data
            
        return data

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

        # Load current data (and migrate if necessary)
        data = self._load_and_migrate_data()
        
        now = datetime.now()
        today_str = now.strftime("%Y-%m-%d")
        hour = now.hour
        timestamp = time.time()
        
        if today_str not in data:
            data[today_str] = self._get_empty_day_data()
            
        day_data = data[today_str]

        # Update total listening time
        if duration > 0:
            day_data["patterns"]["total_listening_time"] += duration
            day_data["patterns"]["hourly_distribution"][hour] += duration

        # Update artist patterns
        artist = track_info.get("artist") or track_info.get("singer")
        if artist and duration > 0:
            day_data["patterns"]["artists"][artist] = day_data["patterns"]["artists"].get(artist, 0) + duration

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
            day_data["patterns"]["languages"][lang] = day_data["patterns"]["languages"].get(lang, 0) + duration

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
            day_data["history"].append(history_entry)
            
            # Keep daily history to a reasonable size
            if len(day_data["history"]) > 1000:
                day_data["history"] = day_data["history"][-1000:]

        day_data["last_update"] = timestamp
        
        # Only keep the last 365 days of data to prevent infinite growth
        if len(data) > 365:
            sorted_dates = sorted(data.keys())
            # Remove oldest entries to keep max 365 days
            for d in sorted_dates[:-365]:
                del data[d]
                
        persistence.set_module_data(self.module_name, data)

    def get_aggregated_preferences(self):
        """
        Aggregates data for daily playlist or recommendation systems.
        """
        data = self._load_and_migrate_data()
        
        combined_artists = {}
        combined_hourly = [0] * 24
        combined_languages = {}
        total_time = 0
        all_history = []
        
        for date_str, day_data in data.items():
            if not isinstance(day_data, dict) or "patterns" not in day_data:
                continue
                
            patterns = day_data.get("patterns", {})
            
            # Aggregate artists
            for artist, time in patterns.get("artists", {}).items():
                combined_artists[artist] = combined_artists.get(artist, 0) + time
                
            # Aggregate hourly
            hourly = patterns.get("hourly_distribution", [0] * 24)
            for i in range(24):
                combined_hourly[i] += hourly[i]
                
            # Aggregate languages
            for lang, time in patterns.get("languages", {}).items():
                combined_languages[lang] = combined_languages.get(lang, 0) + time
                
            # Total time
            total_time += patterns.get("total_listening_time", 0)
            
            # History
            all_history.extend(day_data.get("history", []))

        # Sort combined artists by listening time
        top_artists = sorted(combined_artists.items(), key=lambda x: x[1], reverse=True)[:10]
        
        # Identify preferred time slots
        peak_hours = sorted(range(24), key=lambda i: combined_hourly[i], reverse=True)[:3]
        
        # Top languages
        top_langs = sorted(combined_languages.items(), key=lambda x: x[1], reverse=True)[:5]
        
        # Sort history by timestamp
        all_history.sort(key=lambda x: x.get("timestamp", 0))

        return {
            "top_artists": dict(top_artists),
            "peak_listening_hours": peak_hours,
            "top_languages": dict(top_langs),
            "total_listening_time_seconds": total_time,
            "recent_history": all_history[-50:] # Last 50 entries across all dates
        }

preference_manager = PreferenceManager()
