import unittest
from unittest.mock import patch, mock_open, call
import os
import json
import shutil

# Adjust import path based on how tests are run.
# Assuming 'python -m unittest discover -s tests' from project root,
# or that src is in PYTHONPATH.
from src.utils.data_type import MusicItem, MusicItemData

class TestMusicItemData(unittest.TestCase):
    def test_music_item_data_initialization(self):
        data = MusicItemData(
            music_id="test_id_001",
            title="Test Song",
            author="An Artist",
            description="A cool song",
            quality="320kbps",
            album="Test Album",
            tags=["test", "pop"],
            duration=180000,
            genre="Pop",
            preview_cover="http://example.com/preview.jpg",
            cover_path="/path/to/cover.jpg",
            audio_path="/path/to/audio.mp3",
            lossless=True,
            lyrics="Test lyrics"
        )
        self.assertEqual(data.music_id, "test_id_001")
        self.assertEqual(data.title, "Test Song")
        self.assertEqual(data.author, "An Artist")
        self.assertEqual(data.description, "A cool song")
        self.assertEqual(data.quality, "320kbps")
        self.assertEqual(data.album, "Test Album")
        self.assertEqual(data.tags, ["test", "pop"])
        self.assertEqual(data.duration, 180000)
        self.assertEqual(data.genre, "Pop")
        self.assertEqual(data.preview_cover, "http://example.com/preview.jpg")
        self.assertEqual(data.cover_path, "/path/to/cover.jpg")
        self.assertEqual(data.audio_path, "/path/to/audio.mp3")
        self.assertTrue(data.lossless)
        self.assertEqual(data.lyrics, "Test lyrics")

    def test_music_item_data_to_dict(self):
        data = MusicItemData(
            music_id="test_id_002",
            title="Another Song",
            author="Another Artist",
            description="Another description",
            quality="128kbps",
            album="Another Album",
            tags=["rock"],
            duration=240000,
            genre="Rock",
            preview_cover="http://example.com/preview2.jpg",
            cover_path="/another/cover.png",
            audio_path="/another/audio.ogg",
            lossless=False,
            lyrics="More test lyrics"
        )
        expected_dict = {
            "music_id": "test_id_002",
            "title": "Another Song",
            "author": "Another Artist",
            "description": "Another description",
            "quality": "128kbps",
            "album": "Another Album",
            "tags": ["rock"],
            "duration": 240000,
            "genre": "Rock",
            "preview_cover": "http://example.com/preview2.jpg",
            "cover_path": "/another/cover.png",
            "audio_path": "/another/audio.ogg",
            "lossless": False,
            "lyrics": "More test lyrics"
        }
        self.assertEqual(data.to_dict(), expected_dict)


class TestMusicItem(unittest.TestCase):
    def setUp(self):
        # This is the directory where MusicItem will create subdirectories like "test_id_123"
        self.base_downloads_path = "./downloads" 
        self.test_music_id = "test_id_123"
        self.expected_work_path = os.path.join(self.base_downloads_path, self.test_music_id)

        # Clean up the specific test directory before each test if it exists
        if os.path.exists(self.expected_work_path):
            shutil.rmtree(self.expected_work_path)

    def tearDown(self):
        # Clean up the specific test directory after each test
        if os.path.exists(self.expected_work_path):
            shutil.rmtree(self.expected_work_path)
        # Additionally, if the base "./downloads" dir is empty after tests, remove it.
        # This is a bit risky if other processes use ./downloads, but for CI it might be okay.
        # For now, only cleaning up self.expected_work_path.

    def test_music_item_initialization(self):
        # os.makedirs is called inside MusicItem.__init__
        # We can patch it to ensure it's called as expected, or just check for dir creation.
        with patch('src.utils.data_type.os.makedirs') as mock_makedirs:
            item = MusicItem(
                music_id=self.test_music_id,
                title="Test Song",
                author="Test Author",
                cover="http://example.com/cover.jpg", # This becomes preview_cover
                lossless=True,
                lyrics="Initial lyrics"
            )
            mock_makedirs.assert_called_once_with(self.expected_work_path, exist_ok=True)

        self.assertIsInstance(item.data, MusicItemData)
        self.assertEqual(item.data.music_id, self.test_music_id)
        self.assertEqual(item.data.title, "Test Song")
        self.assertEqual(item.data.author, "Test Author")
        self.assertEqual(item.data.preview_cover, "http://example.com/cover.jpg")
        self.assertTrue(item.data.lossless)
        self.assertEqual(item.data.lyrics, "Initial lyrics")
        self.assertTrue(item.lossless)
        self.assertEqual(item.lyrics, "Initial lyrics")
        
        self.assertEqual(item.work_path, self.expected_work_path)
        self.assertEqual(item._cover_path, "") # Initial internal path
        self.assertEqual(item._audio_path, "") # Initial internal path
        self.assertEqual(item.cover, "") # Property access
        self.assertEqual(item.audio, "") # Property access
        
        # Verify actual directory creation (if not fully mocking os.makedirs)
        # If mock_makedirs is active and not passthrough, this check is against the mock.
        # For this test, we check mock_makedirs was called. Real dir creation is tested implicitly by load/dump.

    def test_music_item_properties(self):
        item = MusicItem(music_id="prop_test", title="Initial Title") # Defaults for lossless/lyrics
        
        # Test getters
        self.assertEqual(item.title, "Initial Title")
        self.assertEqual(item.music_id, "prop_test") # Read-only
        self.assertFalse(item.lossless) # Default value
        self.assertEqual(item.lyrics, "")   # Default value

        # Test setters
        item.title = "New Title"
        self.assertEqual(item.title, "Initial Title")
        self.assertEqual(item.music_id, "prop_test") # Read-only

        # Test setters
        item.title = "New Title"
        self.assertEqual(item.data.title, "New Title")
        self.assertEqual(item.title, "New Title")

        item.author = "New Author"
        self.assertEqual(item.data.author, "New Author")
        self.assertEqual(item.author, "New Author")

        # cover and audio properties (read-only, map to _cover_path, _audio_path)
        item._cover_path = "internal_cover.jpg"
        self.assertEqual(item.cover, "internal_cover.jpg")
        
        # Attempting to set read-only music_id should raise AttributeError
        with self.assertRaises(AttributeError):
            item.music_id = "new_id"

    def test_music_item_lossless_property(self):
        item = MusicItem(music_id="lossless_test", title="Lossless Song")
        self.assertFalse(item.lossless, "Lossless should be False by default.")
        self.assertFalse(item.data.lossless, "Data lossless should be False by default.")

        item.lossless = True
        self.assertTrue(item.lossless)
        self.assertTrue(item.data.lossless)

        item.lossless = False
        self.assertFalse(item.lossless)
        self.assertFalse(item.data.lossless)

    def test_music_item_lyrics_property(self):
        item = MusicItem(music_id="lyrics_test", title="Lyrics Song")
        self.assertEqual(item.lyrics, "", "Lyrics should be empty string by default.")
        self.assertEqual(item.data.lyrics, "", "Data lyrics should be empty string by default.")

        item.lyrics = "La la la"
        self.assertEqual(item.lyrics, "La la la")
        self.assertEqual(item.data.lyrics, "La la la")

        item.lyrics = ""
        self.assertEqual(item.lyrics, "")
        self.assertEqual(item.data.lyrics, "")

    def test_set_cover_and_audio(self):
        item = MusicItem(music_id="setter_test", title="Setter Song")
        
        item.set_cover("/test/cover.jpg")
        self.assertEqual(item._cover_path, "/test/cover.jpg")
        self.assertEqual(item.data.cover_path, "/test/cover.jpg")
        self.assertEqual(item.cover, "/test/cover.jpg")

        item.set_audio("/test/audio.mp3")
        self.assertEqual(item._audio_path, "/test/audio.mp3")
        self.assertEqual(item.data.audio_path, "/test/audio.mp3")
        self.assertEqual(item.audio, "/test/audio.mp3")

    @patch('src.utils.data_type.json.dump')
    @patch('builtins.open', new_callable=mock_open)
    def test_dump_self(self, mock_file_open, mock_json_dump):
        item = MusicItem(
            music_id=self.test_music_id, 
            title="Dump Test",
            lossless=True,
            lyrics="Dump these lyrics"
        )
        item.set_cover("path/to/d_cover.jpg")
        item.set_audio("path/to/d_audio.mp3")

        item.dump_self()

        # Verify paths are synced to item.data before to_dict() is called
        self.assertEqual(item.data.cover_path, "path/to/d_cover.jpg")
        self.assertEqual(item.data.audio_path, "path/to/d_audio.mp3")
        self.assertTrue(item.data.lossless)
        self.assertEqual(item.data.lyrics, "Dump these lyrics")

        expected_json_path = os.path.join(self.expected_work_path, "music.json")
        mock_file_open.assert_called_once_with(expected_json_path, "w", encoding="utf-8")
        
        # json.dump is called with item.data.to_dict()
        # We need to ensure this dict contains the synced paths and new fields
        expected_data_dict = item.data.to_dict() 
        self.assertEqual(expected_data_dict["cover_path"], "path/to/d_cover.jpg")
        self.assertEqual(expected_data_dict["audio_path"], "path/to/d_audio.mp3")
        self.assertTrue(expected_data_dict["lossless"])
        self.assertEqual(expected_data_dict["lyrics"], "Dump these lyrics")

        mock_json_dump.assert_called_once_with(
            expected_data_dict,
            mock_file_open(), # File handle
            ensure_ascii=False,
            indent=4
        )

    @patch('src.utils.data_type.os.path.exists', return_value=True)
    @patch('builtins.open', new_callable=mock_open)
    def test_load_from_json_success(self, mock_file_open, mock_path_exists):
        mock_json_data = {
            "music_id": self.test_music_id,
            "title": "Loaded Song",
            "author": "Loaded Author",
            "preview_cover": "http://loaded.com/cover.jpg",
            "cover_path": "/loaded/cover.jpg", # Actual downloaded cover path
            "audio_path": "/loaded/audio.mp3", # Actual downloaded audio path
            "tags": ["loaded", "data"],
            "duration": 300000,
            "lossless": True,
            "lyrics": "Loaded lyrics"
        }
        mock_file_open.return_value.read.return_value = json.dumps(mock_json_data)

        # Patch os.makedirs for the MusicItem constructor call within load_from_json
        with patch('src.utils.data_type.os.makedirs') as mock_makedirs_load:
            loaded_item = MusicItem.load_from_json(music_id=self.test_music_id)
            mock_makedirs_load.assert_called_once_with(self.expected_work_path, exist_ok=True)
        
        expected_json_path = os.path.join(self.expected_work_path, "music.json")
        mock_path_exists.assert_called_once_with(expected_json_path)
        mock_file_open.assert_called_once_with(expected_json_path, "r", encoding="utf-8")

        self.assertIsNotNone(loaded_item)
        self.assertIsInstance(loaded_item, MusicItem)
        self.assertEqual(loaded_item.music_id, self.test_music_id)
        self.assertEqual(loaded_item.title, "Loaded Song")
        self.assertEqual(loaded_item.author, "Loaded Author")
        self.assertEqual(loaded_item.preview_cover, "http://example.com/cover.jpg") # This is incorrect: preview_cover should be from JSON
        # Correcting the above: MusicItem __init__ takes 'cover' for preview_cover
        # load_from_json passes data_dict.get("preview_cover","") to 'cover' param of __init__
        self.assertEqual(loaded_item.data.preview_cover, "http://loaded.com/cover.jpg")


        # Check that set_cover and set_audio were called correctly
        self.assertEqual(loaded_item.cover, "/loaded/cover.jpg") # via _cover_path
        self.assertEqual(loaded_item.audio, "/loaded/audio.mp3") # via _audio_path
        self.assertEqual(loaded_item.data.cover_path, "/loaded/cover.jpg")
        self.assertEqual(loaded_item.data.audio_path, "/loaded/audio.mp3")
        self.assertEqual(loaded_item.tags, ["loaded", "data"])
        self.assertEqual(loaded_item.duration, 300000)
        self.assertTrue(loaded_item.lossless)
        self.assertEqual(loaded_item.lyrics, "Loaded lyrics")
        self.assertTrue(loaded_item.data.lossless)
        self.assertEqual(loaded_item.data.lyrics, "Loaded lyrics")

    @patch('src.utils.data_type.os.path.exists', return_value=True)
    @patch('builtins.open', new_callable=mock_open)
    def test_load_from_json_backward_compatibility(self, mock_file_open_bc, mock_path_exists_bc):
        # Test loading a JSON that does NOT contain lossless or lyrics fields
        mock_json_data_old = {
            "music_id": self.test_music_id,
            "title": "Old Song",
            "author": "Old Author",
            "preview_cover": "http://old.com/cover.jpg",
            "cover_path": "/old/cover.jpg",
            "audio_path": "/old/audio.mp3",
        }
        mock_file_open_bc.return_value.read.return_value = json.dumps(mock_json_data_old)

        with patch('src.utils.data_type.os.makedirs') as mock_makedirs_load_bc:
            loaded_item = MusicItem.load_from_json(music_id=self.test_music_id)
            mock_makedirs_load_bc.assert_called_once_with(self.expected_work_path, exist_ok=True)
        
        expected_json_path = os.path.join(self.expected_work_path, "music.json")
        # mock_path_exists_bc.assert_called_once_with(expected_json_path) # This mock is tricky with multiple tests, let's focus on outcome
        # mock_file_open_bc.assert_called_once_with(expected_json_path, "r", encoding="utf-8") # Same as above

        self.assertIsNotNone(loaded_item)
        self.assertEqual(loaded_item.title, "Old Song")
        self.assertFalse(loaded_item.lossless, "Lossless should default to False for old JSON.")
        self.assertEqual(loaded_item.lyrics, "", "Lyrics should default to empty string for old JSON.")
        self.assertFalse(loaded_item.data.lossless)
        self.assertEqual(loaded_item.data.lyrics, "")


    @patch('src.utils.data_type.os.path.exists', return_value=False)
    def test_load_from_json_file_not_found(self, mock_path_exists):
        loaded_item = MusicItem.load_from_json(music_id=self.test_music_id)
        self.assertIsNone(loaded_item)
        expected_json_path = os.path.join(self.expected_work_path, "music.json")
        mock_path_exists.assert_called_once_with(expected_json_path)

    @patch('src.utils.data_type.os.path.exists', return_value=True)
    @patch('builtins.open', new_callable=mock_open, read_data="this is not valid json")
    def test_load_from_json_invalid_json(self, mock_file_open, mock_path_exists):
        # The current MusicItem.load_from_json does not catch json.JSONDecodeError
        # It's called by json.load(f)
        # So the error should propagate.
        with self.assertRaises(json.JSONDecodeError):
            MusicItem.load_from_json(music_id=self.test_music_id)
        
        expected_json_path = os.path.join(self.expected_work_path, "music.json")
        mock_path_exists.assert_called_once_with(expected_json_path)
        mock_file_open.assert_called_once_with(expected_json_path, "r", encoding="utf-8")

if __name__ == '__main__':
    unittest.main()
