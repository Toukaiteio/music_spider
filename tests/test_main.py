import unittest
import asyncio
import json
import os # For patching os functions
from unittest.mock import patch, AsyncMock, MagicMock, call

# Assuming tests are run from the project root or src is in PYTHONPATH
from src.main import (
    handle_search,
    handle_download_track,
    handle_get_downloaded_music,
    handle_search_downloaded_music,
    # DOWNLOADER_MODULES, # We will patch this directly in src.main
    # COMMAND_HANDLERS # Not directly tested, but handlers are
)
from src.utils.data_type import ResultBase, MusicItem, MusicItemData

class TestWebSocketHandlers(unittest.IsolatedAsyncioTestCase):

    async def test_handle_search_success(self):
        mock_ws = AsyncMock()
        expected_results = [{"id": "sc1", "title": "SoundCloud Song"}]

        # Patch DOWNLOADER_MODULES within src.main
        with patch('src.main.DOWNLOADER_MODULES') as mock_downloader_modules:
            mock_soundcloud_downloader = MagicMock()
            mock_soundcloud_downloader.search_tracks.return_value = expected_results
            mock_downloader_modules.get.return_value = mock_soundcloud_downloader

            await handle_search(mock_ws, "cmd_search_1", {"query": "test query", "source": "soundcloud"})

            mock_downloader_modules.get.assert_called_once_with("soundcloud")
            mock_soundcloud_downloader.search_tracks.assert_called_once_with(query="test query")
            
            expected_response = ResultBase(code=0, data={
                "original_cmd_id": "cmd_search_1",
                "source": "soundcloud",
                "results": expected_results
            }).get_json()
            mock_ws.send.assert_called_once_with(json.dumps(expected_response))

    async def test_handle_search_missing_query(self):
        mock_ws = AsyncMock()
        await handle_search(mock_ws, "cmd_search_2", {"source": "soundcloud"})
        expected_response = ResultBase(code=1, data={
            "original_cmd_id": "cmd_search_2",
            "error": "Search query is missing."
        }).get_json()
        mock_ws.send.assert_called_once_with(json.dumps(expected_response))

    async def test_handle_search_unsupported_source(self):
        mock_ws = AsyncMock()
        with patch('src.main.DOWNLOADER_MODULES') as mock_downloader_modules:
            mock_downloader_modules.get.return_value = None # Simulate unsupported source
            await handle_search(mock_ws, "cmd_search_3", {"query": "test", "source": "unknown_source"})
            
            mock_downloader_modules.get.assert_called_once_with("unknown_source")
            expected_response = ResultBase(code=1, data={
                "original_cmd_id": "cmd_search_3",
                "error": "Unsupported source: unknown_source"
            }).get_json()
            mock_ws.send.assert_called_once_with(json.dumps(expected_response))

    async def test_handle_search_downloader_exception(self):
        mock_ws = AsyncMock()
        with patch('src.main.DOWNLOADER_MODULES') as mock_downloader_modules:
            mock_soundcloud_downloader = MagicMock()
            mock_soundcloud_downloader.search_tracks.side_effect = Exception("Downloader network error")
            mock_downloader_modules.get.return_value = mock_soundcloud_downloader

            await handle_search(mock_ws, "cmd_search_4", {"query": "test", "source": "soundcloud"})
            
            expected_response = ResultBase(code=1, data={
                "original_cmd_id": "cmd_search_4",
                "error": "Search failed: Downloader network error"
            }).get_json()
            mock_ws.send.assert_called_once_with(json.dumps(expected_response))

    # --- Tests for handle_download_track ---

    @patch('src.main.asyncio.get_running_loop')
    @patch('src.main.DOWNLOADER_MODULES')
    async def test_handle_download_track_success(self, mock_downloader_modules, mock_get_loop):
        mock_ws = AsyncMock()
        
        # Mock the executor and its result
        mock_executor = AsyncMock() # run_in_executor itself is awaited
        mock_loop = MagicMock()
        mock_loop.run_in_executor = mock_executor # run_in_executor is a method of the loop
        mock_get_loop.return_value = mock_loop

        # Prepare mock MusicItem and its data
        mock_music_item_data = MusicItemData(music_id="track1", title="Test Song Downloaded")
        mock_music_item = MusicItem(music_id="track1", title="Test Song Downloaded") # Actual instance for type check
        mock_music_item.data = mock_music_item_data # Assign mock data
        
        # This is the function that will be called by run_in_executor
        # It needs to simulate calling the progress_callback
        def simulated_download_track(track_data, base_path, progress_callback):
            # Simulate a few progress updates
            asyncio.ensure_future(progress_callback(track_id="track1", current_size=50, total_size=100, file_type="audio", status="downloading"))
            asyncio.ensure_future(progress_callback(track_id="track1", current_size=100, total_size=100, file_type="audio", status="completed_file"))
            asyncio.ensure_future(progress_callback(track_id="track1", current_size=1, total_size=1, file_type="track", status="completed_track"))
            return mock_music_item
        
        mock_soundcloud_downloader = MagicMock()
        # The side_effect of the downloader's download_track method is our simulator
        mock_soundcloud_downloader.download_track = simulated_download_track 
        mock_downloader_modules.get.return_value = mock_soundcloud_downloader
        
        # Set the return value for the run_in_executor mock itself
        mock_executor.return_value = mock_music_item 

        payload = {"source": "soundcloud", "track_data": {"id": "track1", "title": "Test"}}
        await handle_download_track(mock_ws, "cmd_dl_1", payload)

        # Wait for callbacks fired with ensure_future to complete
        await asyncio.sleep(0.01) 

        mock_downloader_modules.get.assert_called_once_with("soundcloud")
        
        # Check that run_in_executor was called correctly
        # The first arg to run_in_executor is None (default executor)
        # The second is the function to run: mock_soundcloud_downloader.download_track
        # Then args for that function
        self.assertEqual(mock_executor.call_count, 1)
        call_args = mock_executor.call_args[0]
        self.assertIsNone(call_args[0]) # executor = None
        self.assertEqual(call_args[1], mock_soundcloud_downloader.download_track) # function
        self.assertEqual(call_args[2], {"id": "track1", "title": "Test"}) # track_data
        self.assertEqual(call_args[3], "./downloads") # base_download_path
        # call_args[4] is the progress_callback_ws, difficult to assert directly by equality

        # Assert calls to websocket.send for progress and final message
        # Progress call 1 (audio downloading)
        progress_audio_downloading_expected = ResultBase(code=0, data={
            "original_cmd_id": "cmd_dl_1", "status_type": "download_progress", "track_id": "track1",
            "file_type": "audio", "status": "downloading", "current_size": 50, "total_size": 100,
            "progress_percent": 50.0, "error_message": None
        }).get_json()
        # Progress call 2 (audio completed_file)
        progress_audio_completed_expected = ResultBase(code=0, data={
            "original_cmd_id": "cmd_dl_1", "status_type": "download_progress", "track_id": "track1",
            "file_type": "audio", "status": "completed_file", "current_size": 100, "total_size": 100,
            "progress_percent": 100.0, "error_message": None
        }).get_json()
        # Progress call 3 (track completed_track)
        progress_track_completed_expected = ResultBase(code=0, data={
            "original_cmd_id": "cmd_dl_1", "status_type": "download_progress", "track_id": "track1",
            "file_type": "track", "status": "completed_track", "current_size": 1, "total_size": 1, # Placeholders from callback
            "progress_percent": 100.0, "error_message": None
        }).get_json()

        # Final success message
        final_success_expected = ResultBase(code=0, data={
            "original_cmd_id": "cmd_dl_1", "status": "download_complete",
            "message": f"Track '{mock_music_item_data.title}' downloaded successfully.",
            "track_details": mock_music_item_data.to_dict()
        }).get_json()
        
        mock_ws.send.assert_has_calls([
            call(json.dumps(progress_audio_downloading_expected)),
            call(json.dumps(progress_audio_completed_expected)),
            call(json.dumps(progress_track_completed_expected)),
            call(json.dumps(final_success_expected))
        ], any_order=False) # Order matters for progress

    async def test_handle_download_track_missing_track_data(self):
        mock_ws = AsyncMock()
        payload = {"source": "soundcloud"} # Missing track_data
        await handle_download_track(mock_ws, "cmd_dl_2", payload)
        expected_response = ResultBase(code=1, data={
            "original_cmd_id": "cmd_dl_2",
            "error": "Missing or invalid track_data."
        }).get_json()
        mock_ws.send.assert_called_once_with(json.dumps(expected_response))

    @patch('src.main.asyncio.get_running_loop')
    @patch('src.main.DOWNLOADER_MODULES')
    async def test_handle_download_track_downloader_returns_none(self, mock_downloader_modules, mock_get_loop):
        mock_ws = AsyncMock()
        mock_executor = AsyncMock(return_value=None) # download_track returns None
        mock_loop = MagicMock()
        mock_loop.run_in_executor = mock_executor
        mock_get_loop.return_value = mock_loop

        mock_soundcloud_downloader = MagicMock()
        mock_soundcloud_downloader.download_track = MagicMock(return_value=None) # Configure the actual function mock
        mock_downloader_modules.get.return_value = mock_soundcloud_downloader
        
        payload = {"source": "soundcloud", "track_data": {"id": "track2", "title": "Test None Return"}}
        await handle_download_track(mock_ws, "cmd_dl_3", payload)
        
        # Wait for callbacks fired with ensure_future to complete (if any, though None return might not trigger all)
        await asyncio.sleep(0.01)

        expected_response = ResultBase(code=1, data={
            "original_cmd_id": "cmd_dl_3",
            "error": "Download failed. Check progress updates for specific errors."
        }).get_json()
        # The last call to mock_ws.send should be the error message
        mock_ws.send.assert_called_with(json.dumps(expected_response))


    @patch('src.main.asyncio.get_running_loop')
    @patch('src.main.DOWNLOADER_MODULES')
    async def test_handle_download_track_executor_exception(self, mock_downloader_modules, mock_get_loop):
        mock_ws = AsyncMock()
        mock_executor = AsyncMock(side_effect=Exception("Executor error"))
        mock_loop = MagicMock()
        mock_loop.run_in_executor = mock_executor
        mock_get_loop.return_value = mock_loop

        mock_soundcloud_downloader = MagicMock() # Not strictly needed as executor itself errors
        mock_downloader_modules.get.return_value = mock_soundcloud_downloader

        payload = {"source": "soundcloud", "track_data": {"id": "track3", "title": "Test Executor Fail"}}
        await handle_download_track(mock_ws, "cmd_dl_4", payload)
        
        await asyncio.sleep(0.01)

        expected_response = ResultBase(code=1, data={
            "original_cmd_id": "cmd_dl_4",
            "error": "Server error during download: Executor error"
        }).get_json()
        mock_ws.send.assert_called_with(json.dumps(expected_response))


    # --- Tests for handle_get_downloaded_music ---
    @patch('src.main.os.path.exists', return_value=True)
    @patch('src.main.os.path.isdir', return_value=True)
    @patch('src.main.os.listdir')
    @patch('src.main.MusicItem.load_from_json')
    async def test_handle_get_downloaded_music_success(self, mock_load_from_json, mock_listdir, mock_isdir, mock_exists):
        mock_ws = AsyncMock()
        mock_listdir.return_value = ["id1", "id2", "not_a_dir"]

        # Simulate isdir for items from listdir
        def isdir_side_effect(path):
            if path.endswith("id1") or path.endswith("id2"):
                return True
            return False
        mock_isdir.side_effect = isdir_side_effect
        
        # Mock MusicItem instances and their data
        item_data1 = MusicItemData(music_id="id1", title="Song One")
        item1 = MusicItem(music_id="id1", title="Song One"); item1.data = item_data1
        
        item_data2 = MusicItemData(music_id="id2", title="Song Two")
        item2 = MusicItem(music_id="id2", title="Song Two"); item2.data = item_data2

        mock_load_from_json.side_effect = lambda music_id: item1 if music_id == "id1" else (item2 if music_id == "id2" else None)

        await handle_get_downloaded_music(mock_ws, "cmd_get_all_1", {})
        
        expected_library = [item_data1.to_dict(), item_data2.to_dict()]
        expected_response = ResultBase(code=0, data={
            "original_cmd_id": "cmd_get_all_1",
            "library": expected_library
        }).get_json()
        mock_ws.send.assert_called_once_with(json.dumps(expected_response))
        self.assertEqual(mock_load_from_json.call_count, 2)


    @patch('src.main.os.path.exists', return_value=False)
    async def test_handle_get_downloaded_music_no_downloads_dir(self, mock_exists):
        mock_ws = AsyncMock()
        await handle_get_downloaded_music(mock_ws, "cmd_get_all_2", {})
        expected_response = ResultBase(code=0, data={
            "original_cmd_id": "cmd_get_all_2",
            "library": []
        }).get_json()
        mock_ws.send.assert_called_once_with(json.dumps(expected_response))

    @patch('src.main.os.path.exists', return_value=True)
    @patch('src.main.os.path.isdir', return_value=True)
    @patch('src.main.os.listdir', return_value=["id1", "id2_fail"])
    @patch('src.main.MusicItem.load_from_json')
    async def test_handle_get_downloaded_music_item_load_fails(self, mock_load_from_json, mock_listdir, mock_isdir, mock_exists):
        mock_ws = AsyncMock()
        item_data1 = MusicItemData(music_id="id1", title="Song One")
        item1 = MusicItem(music_id="id1", title="Song One"); item1.data = item_data1

        def load_side_effect(music_id):
            if music_id == "id1": return item1
            if music_id == "id2_fail": return None # Simulate load fail for id2_fail
            return None
        mock_load_from_json.side_effect = load_side_effect
        
        await handle_get_downloaded_music(mock_ws, "cmd_get_all_3", {})
        expected_library = [item_data1.to_dict()] # Only id1 should be present
        expected_response = ResultBase(code=0, data={
            "original_cmd_id": "cmd_get_all_3",
            "library": expected_library
        }).get_json()
        mock_ws.send.assert_called_once_with(json.dumps(expected_response))


    # --- Tests for handle_search_downloaded_music ---
    @patch('src.main.os.path.exists', return_value=True)
    @patch('src.main.os.path.isdir', return_value=True)
    @patch('src.main.os.listdir')
    @patch('src.main.MusicItem.load_from_json')
    async def test_handle_search_downloaded_music_success(self, mock_load_from_json, mock_listdir, mock_isdir, mock_exists):
        mock_ws = AsyncMock()
        mock_listdir.return_value = ["id1_match", "id2_no_match", "id3_match_author"]

        item_data1 = MusicItemData(music_id="id1_match", title="Test Title Match")
        item1 = MusicItem(music_id="id1_match", title="Test Title Match"); item1.data = item_data1
        
        item_data2 = MusicItemData(music_id="id2_no_match", title="No Match Here")
        item2 = MusicItem(music_id="id2_no_match", title="No Match Here"); item2.data = item_data2
        
        item_data3 = MusicItemData(music_id="id3_match_author", title="Another Song", author="Test Author Match")
        item3 = MusicItem(music_id="id3_match_author", title="Another Song", author="Test Author Match"); item3.data = item_data3

        def load_side_effect(music_id):
            if music_id == "id1_match": return item1
            if music_id == "id2_no_match": return item2
            if music_id == "id3_match_author": return item3
            return None
        mock_load_from_json.side_effect = load_side_effect
        
        await handle_search_downloaded_music(mock_ws, "cmd_search_local_1", {"query": "match"})
        
        expected_results = [item_data1.to_dict(), item_data3.to_dict()] # id1 and id3 should match
        expected_response = ResultBase(code=0, data={
            "original_cmd_id": "cmd_search_local_1",
            "results": expected_results
        }).get_json()
        mock_ws.send.assert_called_once_with(json.dumps(expected_response))

    async def test_handle_search_downloaded_music_missing_query(self):
        mock_ws = AsyncMock()
        await handle_search_downloaded_music(mock_ws, "cmd_search_local_2", {}) # Empty payload
        expected_response = ResultBase(code=1, data={
            "original_cmd_id": "cmd_search_local_2",
            "error": "Search query is missing."
        }).get_json()
        mock_ws.send.assert_called_once_with(json.dumps(expected_response))

    @patch('src.main.os.path.exists', return_value=True)
    @patch('src.main.os.path.isdir', return_value=True)
    @patch('src.main.os.listdir', return_value=["id1", "id2"])
    @patch('src.main.MusicItem.load_from_json')
    async def test_handle_search_downloaded_music_no_matches(self, mock_load_from_json, mock_listdir, mock_isdir, mock_exists):
        mock_ws = AsyncMock()
        item_data1 = MusicItemData(music_id="id1", title="Song Alpha")
        item1 = MusicItem(music_id="id1", title="Song Alpha"); item1.data = item_data1
        item_data2 = MusicItemData(music_id="id2", title="Song Beta")
        item2 = MusicItem(music_id="id2", title="Song Beta"); item2.data = item_data2
        mock_load_from_json.side_effect = lambda music_id: item1 if music_id == "id1" else item2
        
        await handle_search_downloaded_music(mock_ws, "cmd_search_local_3", {"query": "zeta"})
        expected_response = ResultBase(code=0, data={
            "original_cmd_id": "cmd_search_local_3",
            "results": [] # Empty list for no matches
        }).get_json()
        mock_ws.send.assert_called_once_with(json.dumps(expected_response))

if __name__ == '__main__':
    unittest.main()
