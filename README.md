# Music Downloader WebSocket Backend

This project is a Python-based WebSocket backend for searching and downloading music. It currently supports SoundCloud as a source and provides a simple way to manage a local music library.

## Features

*   WebSocket interface for all operations.
*   Search for music tracks (currently supports SoundCloud).
*   Download music tracks with real-time progress updates.
*   List all downloaded music.
*   Search within the downloaded music library.
*   Extensible design to support multiple music sources.

## Project Structure

*   `src/`: Contains the main source code.
    *   `main.py`: The WebSocket server entry point.
    *   `utils/`: Utility modules, including data type definitions.
    *   `downloaders/`: Modules for specific music sources (e.g., `soundcloud_downloader.py`).
*   `tests/`: Contains unit tests.
*   `requirements.txt`: Python dependencies.
*   `downloads/`: Default directory where downloaded music is stored.

## Setup and Installation

1.  **Clone the repository (if you haven't already):**
    ```bash
    # git clone <repository_url>
    # cd <repository_directory>
    ```

2.  **Create a virtual environment (recommended):**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

## Running the Server

To start the WebSocket server:

```bash
python src/main.py
```

By default, the server will start on `ws://localhost:8765`.

## WebSocket API

The server communicates via JSON messages over WebSockets. Each client request should include a `cmd_id` (unique identifier for the command) and a `command` field. Responses will also include the `original_cmd_id`.

**Common Request Format:**
```json
{
  "cmd_id": "your_unique_command_id",
  "command": "<command_name>",
  "payload": {
    // Command-specific data
  }
}
```

**Common Response Format:**
```json
{
  "code": 0, // 0 for success, 1 for error
  "data": {
    "original_cmd_id": "your_unique_command_id",
    // ... other response data or error message
  }
}
```

### Implemented Commands:

1.  **Search for music:**
    *   `command`: `"search"`
    *   `payload`:
        ```json
        {
          "query": "search term",
          "source": "soundcloud" // Optional, defaults to "soundcloud"
        }
        ```
    *   Response `data` includes: `"results": [list_of_track_dictionaries]`

2.  **Download a track:**
    *   `command`: `"download_track"`
    *   `payload`:
        ```json
        {
          "source": "soundcloud", // Optional, defaults to "soundcloud"
          "track_data": { /* dictionary of the track to download from search results */ }
        }
        ```
    *   Server will send `download_progress` messages and a final `download_complete` or error message.

3.  **List downloaded music:**
    *   `command`: `"get_downloaded_music"`
    *   `payload`: `{}` (empty)
    *   Response `data` includes: `"library": [list_of_music_item_data_dictionaries]`

4.  **Search downloaded music:**
    *   `command`: `"search_downloaded_music"`
    *   `payload`:
        ```json
        {
          "query": "search term for local library"
        }
        ```
    *   Response `data` includes: `"results": [list_of_matching_music_item_data_dictionaries]`

## Development

*   Unit tests are located in the `tests/` directory and can be run using:
    ```bash
    python -m unittest discover -s tests
    ```
