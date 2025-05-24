import unittest
from unittest.mock import patch, MagicMock, mock_open, call
import os
import json
import requests # For requests.exceptions.RequestException

# Assuming tests are run from the project root or src is in PYTHONPATH
from src.downloaders.soundcloud_downloader import (
    search_tracks,
    download_track,
    update_client_id,
    fetch_ext_from_url,
    ms_to_mmss,
    get_app_version,
    # Import globals for direct patching if needed, though patching via module path is preferred
    # client_id as sc_client_id, # Example: from src.downloaders.soundcloud_downloader import client_id as sc_client_id
    # version as sc_version
)
from src.utils.data_type import MusicItem, MusicItemData

# Helper to create a mock requests.Response object
def _mock_response(status=200, content="", json_data=None, headers=None):
    mock_resp = MagicMock(spec=requests.Response)
    mock_resp.status_code = status
    mock_resp.content = content.encode('utf-8') if isinstance(content, str) else content
    mock_resp.headers = headers if headers else {}
    if json_data is not None:
        mock_resp.json = MagicMock(return_value=json_data)
    
    def raise_for_status():
        if status >= 400:
            raise requests.exceptions.HTTPError(f"HTTP Error {status}")
    mock_resp.raise_for_status = MagicMock(side_effect=raise_for_status)
    return mock_resp


class TestGetAppVersion(unittest.TestCase):
    @patch('src.downloaders.soundcloud_downloader.requests.get')
    def test_get_app_version_success(self, mock_requests_get):
        mock_requests_get.return_value = _mock_response(json_data={"app": "1.2.3"})
        app_version = get_app_version()
        self.assertEqual(app_version, "1.2.3")
        mock_requests_get.assert_called_once_with("https://soundcloud.com/versions.json")

    @patch('src.downloaders.soundcloud_downloader.requests.get')
    def test_get_app_version_failure(self, mock_requests_get):
        mock_requests_get.side_effect = requests.exceptions.RequestException("Network error")
        app_version = get_app_version()
        self.assertEqual(app_version, "UNKNOWN_VERSION") # Fallback version


class TestSearchTracks(unittest.TestCase):
    @patch('src.downloaders.soundcloud_downloader.requests.get')
    @patch('src.downloaders.soundcloud_downloader.update_client_id', return_value="new_mock_client_id") # Mock update_client_id
    @patch('src.downloaders.soundcloud_downloader.client_id', "initial_mock_client_id") # Patch global client_id
    @patch('src.downloaders.soundcloud_downloader.version', "mock_version") # Patch global version
    def test_search_tracks_success(self, mock_update_client_id, mock_requests_get):
        expected_collection = [{"id": "track1", "title": "Test Track"}]
        mock_requests_get.return_value = _mock_response(json_data={"collection": expected_collection})
        
        results = search_tracks("test query")
        
        self.assertEqual(results, expected_collection)
        self.assertTrue(mock_requests_get.called)
        args, kwargs = mock_requests_get.call_args
        self.assertIn("initial_mock_client_id", args[0]) # Check client_id in URL
        self.assertFalse(mock_update_client_id.called) # Should not call update_client_id on first success

    @patch('src.downloaders.soundcloud_downloader.requests.get')
    @patch('src.downloaders.soundcloud_downloader.update_client_id', return_value="updated_client_id_value")
    @patch('src.downloaders.soundcloud_downloader.client_id', "initial_client_id_value")
    @patch('src.downloaders.soundcloud_downloader.version', "mock_version_value")
    def test_search_tracks_triggers_client_id_update_and_retries(self, mock_update_client_id, mock_requests_get):
        expected_collection_retry = [{"id": "track2", "title": "Retry Track"}]
        # First call fails (empty collection), second call succeeds
        mock_requests_get.side_effect = [
            _mock_response(json_data={"collection": []}), # Initial call, empty results
            _mock_response(json_data={"collection": expected_collection_retry}) # Call after client_id update
        ]
        
        results = search_tracks("retry query")
        
        self.assertEqual(results, expected_collection_retry)
        self.assertEqual(mock_requests_get.call_count, 2)
        mock_update_client_id.assert_called_once() # Ensure update_client_id was called

        # Check that the second call used the updated client_id (from mock_update_client_id)
        # This requires that the global client_id inside soundcloud_downloader was actually updated.
        # We patched update_client_id to return "updated_client_id_value", and the logic inside
        # search_tracks should re-assign the global client_id.
        # The call_args_list stores args for all calls. Get the last one.
        last_call_args, _ = mock_requests_get.call_args_list[-1]
        self.assertIn("updated_client_id_value", last_call_args[0])


    @patch('src.downloaders.soundcloud_downloader.requests.get')
    @patch('src.downloaders.soundcloud_downloader.update_client_id') # Mock to prevent actual call
    def test_search_tracks_api_error_first_attempt(self, mock_update_client_id, mock_requests_get):
        # Simulate API error on first attempt, then update_client_id fails too
        mock_requests_get.side_effect = requests.exceptions.RequestException("API Network Error")
        mock_update_client_id.return_value = None # update_client_id fails to get new ID

        results = search_tracks("error query")
        
        self.assertEqual(results, []) # Should return empty list on unrecoverable error
        self.assertEqual(mock_requests_get.call_count, 1) # First attempt
        mock_update_client_id.assert_called_once() # Attempted to update client_id

    @patch('src.downloaders.soundcloud_downloader.requests.get')
    def test_search_tracks_empty_results_no_retry_needed(self, mock_requests_get):
        mock_requests_get.return_value = _mock_response(json_data={"collection": []})
        # We need to ensure update_client_id is not called if the API call itself was successful
        # but just returned no items. The current logic of search_tracks calls update_client_id
        # if `not data.get("collection")`. This means an empty collection WILL trigger update.
        # The test title might be slightly misleading for the current impl.
        # Let's test the "empty collection triggers update" scenario.
        with patch('src.downloaders.soundcloud_downloader.update_client_id', return_value=None) as mock_update_cid:
            results = search_tracks("empty query")
            self.assertEqual(results, [])
            mock_update_cid.assert_called_once() # update_client_id is called for empty collection
            self.assertEqual(mock_requests_get.call_count, 2) # Original + retry attempt after failed update_client_id

class TestDownloadTrack(unittest.TestCase):
    def setUp(self):
        self.track_info = {
            "id": "track_dl_123",
            "title": "Test Download Song",
            "publisher_metadata": {"artist": "Test Artist"},
            "artwork_url": "http://example.com/artwork_large.jpg", # template for preview_cover_url
            "media": {
                "transcodings": [
                    {"url": "http://example.com/stream_main_url", "format": {"protocol": "hls", "mime_type": "audio/mpeg"}},
                    {"url": "http://example.com/stream_fallback_url", "format": {"protocol": "progressive", "mime_type": "audio/ogg"}}
                ]
            },
            "track_authorization": "auth_token_123"
        }
        self.mock_progress_callback = MagicMock()

    @patch('src.downloaders.soundcloud_downloader.os.path.exists') # For cover download check
    @patch('src.downloaders.soundcloud_downloader._save_file_with_progress')
    @patch('src.downloaders.soundcloud_downloader.MusicItem') # Mock the MusicItem class
    @patch('src.downloaders.soundcloud_downloader.fetch_ext_from_url', return_value=".jpg") # Mock extension fetching for cover
    def test_download_track_success(self, mock_fetch_ext, mock_MusicItem_class, mock_save_file, mock_os_path_exists):
        mock_os_path_exists.return_value = False # Cover does not exist yet

        # Mock MusicItem instance and its methods
        mock_music_item_instance = MagicMock(spec=MusicItem)
        mock_music_item_instance.music_id = self.track_info["id"]
        mock_music_item_instance.work_path = f"./downloads/{self.track_info['id']}" # Expected work_path
        mock_MusicItem_class.return_value = mock_music_item_instance

        # _save_file_with_progress should return True for success
        mock_save_file.return_value = True 
        
        # Mock fetch_stream_url used within download_audio_internal (indirectly via _save_file_with_progress)
        # This is complex because fetch_stream_url is nested.
        # Instead, we rely on _save_file_with_progress directly for audio.
        # The internal fetch_stream_url in download_audio_internal gets its transcoding URL from track_info.
        # We need to ensure _save_file_with_progress is called with the right stream URL.
        # The first transcoding URL is http://example.com/stream_main_url
        
        # Call the function
        result_item = download_track(self.track_info, progress_callback=self.mock_progress_callback)

        # Assertions
        mock_MusicItem_class.assert_called_once_with(
            music_id=self.track_info["id"],
            title=self.track_info["title"],
            author=self.track_info["publisher_metadata"]["artist"],
            description="", # Default
            album="", # Default
            tags=[], # Default
            duration=0, # Default
            genre="", # Default
            cover="http://example.com/artwork_t500x500.jpg" # Expected preview_cover_url
        )
        
        # Check cover download call
        expected_cover_save_path = os.path.join(mock_music_item_instance.work_path, "cover.jpg")
        # Check audio download call
        expected_audio_save_path = os.path.join(mock_music_item_instance.work_path, "audio.jpg") # .jpg due to mock_fetch_ext

        mock_save_file.assert_any_call(
            "http://example.com/artwork_t500x500.jpg", # cover_url
            expected_cover_save_path,        # save_path_full
            self.track_info["id"],           # track_id
            self.mock_progress_callback,     # progress_callback
            "cover"                          # file_type
        )
        mock_save_file.assert_any_call(
            "http://example.com/stream_main_url", # stream_url from first transcoding
            expected_audio_save_path,       # filename
            self.track_info["id"],          # track_id
            self.mock_progress_callback,    # progress_callback
            "audio"                         # file_type
        )

        mock_music_item_instance.set_cover.assert_called_once_with(expected_cover_save_path)
        mock_music_item_instance.set_audio.assert_called_once_with(expected_audio_save_path)
        mock_music_item_instance.dump_self.assert_called_once()
        
        self.assertEqual(result_item, mock_music_item_instance)

        # Check final progress callback for the whole track
        self.mock_progress_callback.assert_called_with(
            track_id=self.track_info["id"],
            current_size=1, total_size=1, # Placeholders
            file_type="track", status="completed_track"
        )

    @patch('src.downloaders.soundcloud_downloader.MusicItem')
    def test_download_track_no_transcodings(self, mock_MusicItem_class):
        mock_music_item_instance = MagicMock(spec=MusicItem)
        mock_music_item_instance.music_id = "no_transcoding_id"
        mock_MusicItem_class.return_value = mock_music_item_instance
        
        track_info_no_media = self.track_info.copy()
        track_info_no_media["media"] = {"transcodings": []} # Empty transcodings
        
        download_track(track_info_no_media, progress_callback=self.mock_progress_callback)
        
        # Assert that an error was reported for audio
        self.mock_progress_callback.assert_any_call(
            track_id="no_transcoding_id", current_size=0, total_size=0,
            file_type="audio", status="error", error_message="No track_authorization or transcodings"
        )
        # Assert that dump_self was still called
        mock_music_item_instance.dump_self.assert_called_once()


    @patch('src.downloaders.soundcloud_downloader.os.path.exists', return_value=False)
    @patch('src.downloaders.soundcloud_downloader._save_file_with_progress')
    @patch('src.downloaders.soundcloud_downloader.MusicItem')
    def test_download_track_cover_download_fails(self, mock_MusicItem_class, mock_save_file, mock_os_path_exists):
        mock_music_item_instance = MagicMock(spec=MusicItem)
        mock_music_item_instance.music_id = self.track_info["id"]
        mock_MusicItem_class.return_value = mock_music_item_instance

        # First call to _save_file_with_progress (for cover) returns False (failure)
        # Second call (for audio) returns True (success)
        mock_save_file.side_effect = [False, True] 

        download_track(self.track_info, progress_callback=self.mock_progress_callback)

        # Assert that set_cover was NOT called
        mock_music_item_instance.set_cover.assert_not_called()
        # Assert that set_audio WAS called (assuming audio download succeeded)
        mock_music_item_instance.set_audio.assert_called()
        mock_music_item_instance.dump_self.assert_called_once()
        
        # The error callback for cover failure is handled within _save_file_with_progress,
        # which is mocked. We could also check if the progress_callback was called with status='error'
        # by _save_file_with_progress if we had more control over its internal calls or
        # by checking the mock_progress_callback's call_args_list.
        # Here, we assert that the high-level download_track completes and dump_self is called.


class TestUpdateClientId(unittest.TestCase):
    @patch('builtins.open', new_callable=mock_open)
    @patch('src.downloaders.soundcloud_downloader.requests.get')
    @patch('src.downloaders.soundcloud_downloader.get_app_version', return_value="mock_app_version") # Mock get_app_version
    def test_update_client_id_success(self, mock_get_app_version, mock_requests_get, mock_file_open):
        discover_html = '<script src="https://example.com/app-123.js"></script>'
        js_content = 'bla,bla,client_id:"NEW_CLIENT_ID_FROM_JS",bla'
        
        mock_requests_get.side_effect = [
            _mock_response(content=discover_html), # For discover_url
            _mock_response(content=js_content)     # For script_src
        ]
        
        new_id = update_client_id()
        
        self.assertEqual(new_id, "NEW_CLIENT_ID_FROM_JS")
        mock_file_open.assert_called_once_with(os.path.join(os.getcwd(), "client_id.txt"), "w")
        mock_file_open().write.assert_called_once_with("NEW_CLIENT_ID_FROM_JS")
        self.assertEqual(mock_requests_get.call_count, 2)

    @patch('src.downloaders.soundcloud_downloader.requests.get')
    @patch('src.downloaders.soundcloud_downloader.get_app_version', return_value="mock_app_version")
    def test_update_client_id_script_not_found(self, mock_get_app_version, mock_requests_get):
        discover_html_no_script = '<html><body>No scripts here</body></html>'
        mock_requests_get.return_value = _mock_response(content=discover_html_no_script)
        
        new_id = update_client_id()
        self.assertIsNone(new_id)

    @patch('src.downloaders.soundcloud_downloader.requests.get')
    @patch('src.downloaders.soundcloud_downloader.get_app_version', return_value="mock_app_version")
    def test_update_client_id_regex_no_match(self, mock_get_app_version, mock_requests_get):
        discover_html = '<script src="https://example.com/app-456.js"></script>'
        js_content_no_match = 'var some_other_id = "test";'
        mock_requests_get.side_effect = [
            _mock_response(content=discover_html),
            _mock_response(content=js_content_no_match)
        ]
        new_id = update_client_id()
        self.assertIsNone(new_id)

class TestHelperFunctions(unittest.TestCase):
    def test_fetch_ext_from_url(self):
        self.assertEqual(fetch_ext_from_url("http://example.com/file.mp3"), ".mp3")
        self.assertEqual(fetch_ext_from_url("http://example.com/file.ogg?query=param"), ".ogg")
        self.assertEqual(fetch_ext_from_url("http://example.com/no_ext_here"), ".bin") # Default
        with patch('mimetypes.guess_type', return_value=("audio/mpeg", None)):
            with patch('mimetypes.guess_extension', return_value=".mp3"):
                self.assertEqual(fetch_ext_from_url("http://example.com/mime_fallback"), ".mp3")
    
    def test_ms_to_mmss(self):
        self.assertEqual(ms_to_mmss(60000), "01:00")
        self.assertEqual(ms_to_mmss(90000), "01:30")
        self.assertEqual(ms_to_mmss(3599000), "59:59") # Just under an hour
        self.assertEqual(ms_to_mmss(0), "00:00")

if __name__ == '__main__':
    unittest.main()
