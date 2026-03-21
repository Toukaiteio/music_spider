import unittest
import os
import json
import time
from datetime import datetime
from src.utils.persistence import PersistenceStore
from src.utils.preference_manager import PreferenceManager

class TestUserPreference(unittest.TestCase):
    def setUp(self):
        self.test_file = "data/test_persistence.json"
        if os.path.exists(self.test_file):
            os.remove(self.test_file)
        
        # Patch the global persistence instance for testing
        import src.utils.preference_manager
        self.original_persistence = src.utils.preference_manager.persistence
        self.test_persistence = PersistenceStore(self.test_file)
        src.utils.preference_manager.persistence = self.test_persistence
        
        self.manager = PreferenceManager()

    def tearDown(self):
        import src.utils.preference_manager
        src.utils.preference_manager.persistence = self.original_persistence
        if os.path.exists(self.test_file):
            os.remove(self.test_file)

    def test_report_event(self):
        track_info = {
            "title": "Test Song",
            "artist": "Test Artist",
            "language": "zh"
        }
        
        # Start event
        self.manager.report_event({
            "music_id": "test_1",
            "action": "start",
            "duration": 0,
            "track_info": track_info
        })
        
        # Heartbeat event after 30 seconds
        self.manager.report_event({
            "music_id": "test_1",
            "action": "heartbeat",
            "duration": 30,
            "track_info": track_info
        })
        
        data = self.test_persistence.get_module_data("user_preferences")
        today_str = datetime.now().strftime("%Y-%m-%d")
        
        day_data = data[today_str]
        self.assertEqual(day_data["patterns"]["total_listening_time"], 30)
        self.assertEqual(day_data["patterns"]["artists"]["Test Artist"], 30)
        self.assertEqual(day_data["patterns"]["languages"]["zh"], 30)
        self.assertEqual(len(day_data["history"]), 1)
        self.assertEqual(day_data["history"][0]["action"], "start")

    def test_aggregation(self):
        # Report some events
        self.manager.report_event({
            "music_id": "test_1",
            "action": "start",
            "duration": 0,
            "track_info": {"artist": "Artist A", "language": "en"}
        })
        self.manager.report_event({
            "music_id": "test_1",
            "action": "heartbeat",
            "duration": 100,
            "track_info": {"artist": "Artist A", "language": "en"}
        })
        self.manager.report_event({
            "music_id": "test_2",
            "action": "heartbeat",
            "duration": 50,
            "track_info": {"artist": "Artist B", "language": "zh"}
        })
        
        prefs = self.manager.get_aggregated_preferences()
        self.assertEqual(prefs["top_artists"]["Artist A"], 100)
        self.assertEqual(prefs["top_artists"]["Artist B"], 50)
        self.assertEqual(prefs["top_languages"]["en"], 100)
        self.assertEqual(prefs["top_languages"]["zh"], 50)
        self.assertTrue(len(prefs["peak_listening_hours"]) > 0)

if __name__ == '__main__':
    unittest.main()
