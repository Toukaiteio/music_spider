import asyncio
import websockets
import json
import unittest
import uuid # To generate unique cmd_id for each test run

# It's good practice to use configuration for the server URI if possible,
# but for a basic first test, hardcoding is acceptable.
# from src.config import HOST, WEBSOCKET_PORT # This might be complex for a simple test runner
WEBSOCKET_URI = "ws://localhost:8765" # Default from config

class TestWebSocketCommands(unittest.IsolatedAsyncioTestCase):

    async def test_get_available_sources(self):
        """Tests the 'get_available_sources' command."""
        cmd_id = f"test-cmd-{uuid.uuid4()}"
        command_payload = {
            "cmd_id": cmd_id,
            "command": "get_available_sources",
            "payload": {}
        }

        try:
            async with websockets.connect(WEBSOCKET_URI) as websocket:
                await websocket.send(json.dumps(command_payload))
                response_str = await asyncio.wait_for(websocket.recv(), timeout=5.0) # Added timeout
                response_json = json.loads(response_str)

                # Print response for debugging during test development
                # print(f"Response for get_available_sources: {response_json}")

                self.assertEqual(response_json.get("code"), 0, f"Server returned error code: {response_json.get('error')}")

                data = response_json.get("data", {})
                self.assertEqual(data.get("original_cmd_id"), cmd_id)

                sources = data.get("sources", [])
                self.assertIsInstance(sources, list, "Sources should be a list")
                self.assertIn("soundcloud", sources, "SoundCloud source not found")
                self.assertIn("bilibili", sources, "Bilibili source not found")

        except ConnectionRefusedError:
            self.fail(f"Connection to WebSocket server at {WEBSOCKET_URI} refused. Ensure the server is running.")
        except websockets.exceptions.ConnectionClosedError as e:
            self.fail(f"WebSocket connection closed unexpectedly: {e}")
        except asyncio.TimeoutError:
            self.fail(f"WebSocket operation timed out after 5 seconds.")
        except Exception as e:
            self.fail(f"An unexpected error occurred: {e}")

    async def test_search_command_soundcloud(self):
        """Tests the 'search' command for SoundCloud."""
        cmd_id = f"test-search-sc-{uuid.uuid4()}"
        command_payload = {
            "cmd_id": cmd_id,
            "command": "search",
            "payload": {
                "query": "NCS Alan Walker", # A common query that should yield results
                "source": "soundcloud",
                "limit": 1
            }
        }

        try:
            async with websockets.connect(WEBSOCKET_URI) as websocket:
                await websocket.send(json.dumps(command_payload))
                response_str = await asyncio.wait_for(websocket.recv(), timeout=15.0) # Increased timeout for search
                response_json = json.loads(response_str)

                # print(f"Response for search (SoundCloud): {response_json}")

                self.assertEqual(response_json.get("code"), 0, f"Server returned error code: {response_json.get('error')}")

                data = response_json.get("data", {})
                self.assertEqual(data.get("original_cmd_id"), cmd_id)
                self.assertEqual(data.get("source"), "soundcloud")

                results = data.get("results", [])
                self.assertIsInstance(results, list, "Search results should be a list")
                # Depending on SoundCloud's current API status, results might be empty.
                # For a robust test, you might mock the API or check for non-empty if the query is very generic.
                # For now, we'll just check the structure.
                # self.assertTrue(len(results) > 0, "Search should return at least one result for a common query")

        except ConnectionRefusedError:
            self.fail(f"Connection to WebSocket server at {WEBSOCKET_URI} refused. Ensure the server is running.")
        except websockets.exceptions.ConnectionClosedError as e:
            self.fail(f"WebSocket connection closed unexpectedly: {e}")
        except asyncio.TimeoutError:
            self.fail(f"WebSocket operation timed out after 15 seconds.")
        except Exception as e:
            self.fail(f"An unexpected error occurred: {e}")


if __name__ == '__main__':
    # This allows running the tests directly from this file using `python tests/test_websocket_commands.py`
    # However, the standard way is `python -m unittest tests.test_websocket_commands` from the project root.
    unittest.main()
