import unittest
from unittest.mock import patch, MagicMock, mock_open
import json
import os

# Assuming 'python -m unittest discover -s tests' from project root,
# or that src is in PYTHONPATH.
from src.downloaders import bilibili_downloader
from src.utils.data_type import MusicItem # MusicItem might be needed for some mock type hints or instantiation if not fully mocked

# Store original WBI and Buvid functions to restore them if needed, or mock them per test.
# original_refresh_wbi = bilibili_downloader.refresh_wbi
# original_get_buvid3 = bilibili_downloader.get_buvid3

class TestBilibiliSearchTracks(unittest.TestCase):

    def setUp(self):
        # Mock the global bili_account dictionary that holds cookies, csrf, wbi keys etc.
        # This prevents actual file I/O or network calls during login/refresh logic.
        self.patcher_bili_account = patch.dict(bilibili_downloader.bili_account, {
            "cookie": "test_cookie",
            "csrf": "test_csrf",
            "img_url": "mock_img_key", # Pre-fill WBI keys
            "sub_url": "mock_sub_key", # Pre-fill WBI keys
            "buvid3": "test_buvid3",   # Pre-fill buvid3
            # Add other necessary keys if load_cookie or refresh logic expects them
        }, clear=True) # clear=True ensures only our mock values are present
        self.mock_bili_account = self.patcher_bili_account.start()

        # Also explicitly mock functions that might try to change these or make network calls
        # if not already covered by patching bili_account.
        self.patcher_refresh_wbi = patch('src.downloaders.bilibili_downloader.refresh_wbi')
        self.mock_refresh_wbi = self.patcher_refresh_wbi.start()
        
        self.patcher_get_buvid3 = patch('src.downloaders.bilibili_downloader.get_buvid3')
        self.mock_get_buvid3 = self.patcher_get_buvid3.start()

        self.patcher_load_cookie = patch('src.downloaders.bilibili_downloader.load_cookie')
        self.mock_load_cookie = self.patcher_load_cookie.start()


    def tearDown(self):
        self.patcher_bili_account.stop()
        self.patcher_refresh_wbi.stop()
        self.patcher_get_buvid3.stop()
        self.patcher_load_cookie.stop()

    @patch('src.downloaders.bilibili_downloader.requests.get')
    def test_search_tracks_success(self, mock_requests_get):
        # Setup mock response for successful search
        mock_response_data = {
            "code": 0,
            "data": {
                "result": [
                    {
                        "type": "video",
                        "bvid": "BV1test1",
                        "aid": "12345",
                        "title": "Test Video 1 <tag>",
                        "author": "Artist1",
                        "pic": "//i0.hdslb.com/bfs/cover/test1.jpg",
                        "duration": "1:23", # mm:ss
                        "description": "Desc1",
                        "play": 1000,
                        "danmaku": 10
                    },
                    {
                        "type": "video",
                        "bvid": "BV1test2",
                        "aid": "67890",
                        "title": "Test Video 2",
                        "author": "Artist2",
                        "pic": "https://i0.hdslb.com/bfs/cover/test2.jpg", # With https
                        "duration": "10:05", # mm:ss
                        "description": "Desc2",
                        "play": 2000,
                        "danmaku": 20
                    },
                    {
                        "type": "article", # Should be skipped
                        "title": "Not a video"
                    }
                ]
            }
        }
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_response_data
        mock_requests_get.return_value = mock_response

        results = bilibili_downloader.search_tracks(query="test query", limit=2)

        self.assertEqual(len(results), 2) # Limited by limit parameter
        
        self.assertEqual(results[0]["bvid"], "BV1test1")
        self.assertEqual(results[0]["title"], "Test Video 1 ") # HTML tags stripped
        self.assertEqual(results[0]["author"], "Artist1")
        self.assertEqual(results[0]["cover_url"], "https://i0.hdslb.com/bfs/cover/test1.jpg") # https added
        self.assertEqual(results[0]["duration"], 83) # 1*60 + 23

        self.assertEqual(results[1]["bvid"], "BV1test2")
        self.assertEqual(results[1]["title"], "Test Video 2")
        self.assertEqual(results[1]["duration"], 605) # 10*60 + 5
        
        # Check if requests.get was called with WBI signed params
        mock_requests_get.assert_called_once()
        args, kwargs = mock_requests_get.call_args
        self.assertIn("w_rid", kwargs["params"])
        self.assertIn("wts", kwargs["params"])

    @patch('src.downloaders.bilibili_downloader.requests.get')
    def test_search_tracks_api_error(self, mock_requests_get):
        mock_response_data = {"code": -412, "message": "Request blocked"}
        mock_response = MagicMock()
        mock_response.status_code = 200 # API returns 200 but with error code in JSON
        mock_response.json.return_value = mock_response_data
        mock_requests_get.return_value = mock_response

        results = bilibili_downloader.search_tracks(query="blocked query")
        self.assertEqual(len(results), 0)

    @patch('src.downloaders.bilibili_downloader.requests.get')
    def test_search_tracks_request_exception(self, mock_requests_get):
        mock_requests_get.side_effect = bilibili_downloader.requests.exceptions.RequestException("Network error")
        results = bilibili_downloader.search_tracks(query="network error query")
        self.assertEqual(len(results), 0)

    @patch('src.downloaders.bilibili_downloader.requests.get')
    def test_search_tracks_missing_wbi_keys_initially_then_fail_refresh(self, mock_requests_get):
        # Ensure WBI keys are initially missing in the mock_bili_account
        self.mock_bili_account["img_url"] = None # Simulate missing key
        self.mock_bili_account["sub_url"] = None

        # Make refresh_wbi effectively do nothing or indicate failure (by not setting keys)
        self.mock_refresh_wbi.side_effect = lambda: None 

        results = bilibili_downloader.search_tracks(query="test query")
        
        self.mock_refresh_wbi.assert_called_once() # refresh_wbi should be called
        self.assertEqual(len(results), 0) # Search should fail if WBI keys remain unset
        # mock_requests_get should not be called if WBI keys are missing and refresh fails
        mock_requests_get.assert_not_called()


class TestBilibiliDownloadTrack(unittest.TestCase):
    def setUp(self):
        self.mock_track_info = {
            "bvid": "BV1testDownload",
            "aid": "98765",
            "title": "Download Test Video",
            "author": "DownloaderArtist",
            "cover_url": "http://example.com/search_cover.jpg",
            "duration": 120,
        }
        self.mock_progress_callback = MagicMock()

        # Patch helper functions within bilibili_downloader
        self.patcher_get_details = patch('src.downloaders.bilibili_downloader._get_video_details_bili')
        self.mock_get_details = self.patcher_get_details.start()

        self.patcher_get_audio_options = patch('src.downloaders.bilibili_downloader._get_audio_options_bili')
        self.mock_get_audio_options = self.patcher_get_audio_options.start()

        self.patcher_download_cover = patch('src.downloaders.bilibili_downloader._download_cover_bili')
        self.mock_download_cover = self.patcher_download_cover.start()

        self.patcher_download_audio = patch('src.downloaders.bilibili_downloader._download_audio_bili')
        self.mock_download_audio = self.patcher_download_audio.start()

        # Patch MusicItem to control its instantiation and methods
        self.patcher_music_item = patch('src.downloaders.bilibili_downloader.MusicItem')
        self.MockMusicItemClass = self.patcher_music_item.start()
        self.mock_music_item_instance = MagicMock(spec=MusicItem)
        self.mock_music_item_instance.music_id = self.mock_track_info["bvid"] # Ensure it has music_id
        self.mock_music_item_instance.work_path = os.path.join("./downloads", self.mock_track_info["bvid"])
        self.mock_music_item_instance.preview_cover = "http://example.com/detail_cover.jpg" # Set by _get_video_details_bili
        self.MockMusicItemClass.return_value = self.mock_music_item_instance
        
        # Mock os.makedirs which is called by MusicItem constructor.
        # Though MusicItem is mocked, its __init__ might still be called if not careful,
        # or if other parts of the code call it.
        self.patcher_os_makedirs = patch('src.utils.data_type.os.makedirs') # MusicItem is in data_type
        self.mock_os_makedirs = self.patcher_os_makedirs.start()


    def tearDown(self):
        self.patcher_get_details.stop()
        self.patcher_get_audio_options.stop()
        self.patcher_download_cover.stop()
        self.patcher_download_audio.stop()
        self.patcher_music_item.stop()
        self.patcher_os_makedirs.stop()

    def test_download_track_success_flac(self):
        # Configure mocks for a successful FLAC download
        self.mock_get_details.return_value = (
            { # video_details
                "title": "Full Video Title", "desc": "Full Description", "owner": {"name": "Full Author"},
                "tname": "Music", "tags": ["tag1", "tag2"], "duration": 125, 
                "pic": "http://example.com/detail_cover.jpg", "extracted_tags": ["tag1", "tag2", "Music"]
            }, 
            "test_cid_123" # cid
        )
        self.mock_get_audio_options.return_value = [
            {"url": "http://audio.flac/track.flac", "is_lossless": True, "quality_str": "FLAC"}
        ]
        self.mock_download_cover.return_value = "/fake/path/cover.jpg"
        self.mock_download_audio.return_value = ("/fake/path/audio.flac", True) # path, is_lossless

        result_item = bilibili_downloader.download_track(self.mock_track_info, progress_callback=self.mock_progress_callback)

        self.MockMusicItemClass.assert_called_once()
        # Verify some key args passed to MusicItem constructor based on video_details
        constructor_args, _ = self.MockMusicItemClass.call_args
        self.assertEqual(constructor_args[0], self.mock_track_info["bvid"]) # music_id
        self.assertEqual(constructor_args[1]["title"], "Full Video Title")
        self.assertEqual(constructor_args[1]["author"], "Full Author")
        self.assertEqual(constructor_args[1]["lossless"], False) # Initial value before audio download

        self.mock_get_details.assert_called_once_with(bvid=self.mock_track_info["bvid"], aid=self.mock_track_info["aid"])
        self.mock_get_audio_options.assert_called_once_with(bvid=self.mock_track_info["bvid"], cid="test_cid_123")
        
        self.mock_download_cover.assert_called_once_with(
            cover_url=self.mock_music_item_instance.preview_cover, # Uses preview_cover from MusicItem instance
            music_item=self.mock_music_item_instance,
            progress_callback=self.mock_progress_callback
        )
        self.mock_download_audio.assert_called_once_with(
            audio_options=[{"url": "http://audio.flac/track.flac", "is_lossless": True, "quality_str": "FLAC"}],
            music_item=self.mock_music_item_instance,
            progress_callback=self.mock_progress_callback
        )

        self.mock_music_item_instance.set_cover.assert_called_once_with("/fake/path/cover.jpg")
        self.mock_music_item_instance.set_audio.assert_called_once_with("/fake/path/audio.flac")
        self.assertTrue(self.mock_music_item_instance.lossless) # Should be updated
        self.mock_music_item_instance.dump_self.assert_called_once()
        
        self.assertEqual(result_item, self.mock_music_item_instance)
        self.mock_progress_callback.assert_any_call(
            track_id=self.mock_track_info["bvid"], current_size=1, total_size=1, 
            file_type="track", status="completed_track", error_message=None
        )

    def test_download_track_success_normal_audio(self):
        self.mock_get_details.return_value = ({"title": "Normal Audio Title", "desc": "Desc", "owner": {"name": "Author"}, "tname": "Pop", "tags": [], "duration": 130, "pic": "http://cover.url/n.jpg", "extracted_tags": ["Pop"]}, "cid_normal")
        self.mock_get_audio_options.return_value = [{"url": "http://audio.m4a/track.m4a", "is_lossless": False, "quality_str": "192k"}]
        self.mock_download_cover.return_value = "/fake/cover_n.jpg"
        self.mock_download_audio.return_value = ("/fake/audio.m4a", False)

        result_item = bilibili_downloader.download_track(self.mock_track_info, progress_callback=self.mock_progress_callback)
        
        self.MockMusicItemClass.assert_called_once()
        self.assertFalse(self.mock_music_item_instance.lossless) # Should be False
        self.mock_music_item_instance.dump_self.assert_called_once()
        self.assertEqual(result_item, self.mock_music_item_instance)

    def test_download_track_fail_get_video_details(self):
        self.mock_get_details.return_value = (None, None) # Simulate failure
        
        result_item = bilibili_downloader.download_track(self.mock_track_info, progress_callback=self.mock_progress_callback)
        
        self.assertIsNone(result_item)
        self.mock_get_details.assert_called_once_with(bvid=self.mock_track_info["bvid"], aid=self.mock_track_info["aid"])
        self.mock_get_audio_options.assert_not_called()
        self.mock_download_cover.assert_not_called()
        self.mock_download_audio.assert_not_called()
        self.MockMusicItemClass.assert_not_called() # MusicItem should not be created
        self.mock_progress_callback.assert_called_with(
            track_id=self.mock_track_info["bvid"], current_size=0, total_size=0, 
            file_type="track", status="error", error_message="Failed to get video details"
        )

    def test_download_track_fail_get_audio_options(self):
        self.mock_get_details.return_value = ({"title": "No Audio Options Title", "desc": "Desc", "owner": {"name": "Author"}, "tname": "Rock", "tags": [], "duration": 140, "pic": "http://cover.url/na.jpg", "extracted_tags": ["Rock"]}, "cid_no_audio")
        self.mock_get_audio_options.return_value = [] # Simulate no audio options
        self.mock_download_cover.return_value = "/fake/cover_na.jpg" # Cover might still download

        result_item = bilibili_downloader.download_track(self.mock_track_info, progress_callback=self.mock_progress_callback)

        self.assertIsNone(result_item) # Audio is essential, so overall failure
        self.mock_get_audio_options.assert_called_once_with(bvid=self.mock_track_info["bvid"], cid="cid_no_audio")
        self.mock_download_audio.assert_called_once() # Called with empty audio_options
        # Check if progress callback indicated audio error (this happens inside _download_audio_bili)
        # For this test, we ensure the final outcome is None and overall track status reflects error
        self.mock_progress_callback.assert_any_call(
            track_id=self.mock_track_info["bvid"], current_size=0, total_size=0, 
            file_type="audio", status="error", error_message="No audio options available"
        )
        self.mock_progress_callback.assert_any_call( # This is the final call from download_track
            track_id=self.mock_track_info["bvid"], current_size=1, total_size=1,
            file_type="track", status="error", error_message="Audio or cover download failed."
        )


    def test_download_track_fail_audio_download(self):
        self.mock_get_details.return_value = ({"title": "Audio Download Fail Title", "desc": "Desc", "owner": {"name": "Author"}, "tname": "Jazz", "tags": [], "duration": 150, "pic": "http://cover.url/adf.jpg", "extracted_tags": ["Jazz"]}, "cid_adf")
        self.mock_get_audio_options.return_value = [{"url": "http://audio.fail/track.mp3", "is_lossless": False}]
        self.mock_download_cover.return_value = "/fake/cover_adf.jpg"
        self.mock_download_audio.return_value = (None, False) # Simulate audio download failure

        result_item = bilibili_downloader.download_track(self.mock_track_info, progress_callback=self.mock_progress_callback)

        self.assertIsNone(result_item) # Audio is essential
        self.mock_music_item_instance.set_audio.assert_not_called()
        self.mock_music_item_instance.dump_self.assert_called_once() # dump_self is called even if parts fail
        self.mock_progress_callback.assert_any_call( # This is the final call from download_track
            track_id=self.mock_track_info["bvid"], current_size=1, total_size=1,
            file_type="track", status="error", error_message="Audio or cover download failed."
        )

    def test_download_track_fail_cover_download_audio_ok(self):
        self.mock_get_details.return_value = ({"title": "Cover Fail Title", "desc": "Desc", "owner": {"name": "Author"}, "tname": "Electronic", "tags": [], "duration": 160, "pic": "http://cover.url/cf.jpg", "extracted_tags": ["Electronic"]}, "cid_cf")
        self.mock_get_audio_options.return_value = [{"url": "http://audio.ok/track.m4a", "is_lossless": False}]
        self.mock_download_cover.return_value = None # Simulate cover download failure
        self.mock_download_audio.return_value = ("/fake/audio_ok.m4a", False)

        result_item = bilibili_downloader.download_track(self.mock_track_info, progress_callback=self.mock_progress_callback)

        self.assertIsNotNone(result_item) # Track should still be 'successful' if audio is OK
        self.assertEqual(result_item, self.mock_music_item_instance)
        self.mock_music_item_instance.set_cover.assert_not_called() # Not called with a valid path
        self.mock_music_item_instance.set_audio.assert_called_with("/fake/audio_ok.m4a")
        self.mock_music_item_instance.dump_self.assert_called_once()
        self.mock_progress_callback.assert_any_call(
            track_id=self.mock_track_info["bvid"], current_size=1, total_size=1, 
            file_type="track", status="completed_with_warnings", error_message="Audio or cover download failed."
        )


if __name__ == '__main__':
    unittest.main()
