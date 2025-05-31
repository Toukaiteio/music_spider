# Music Downloader WebSocket Backend

This project is a Python-based WebSocket backend for searching and downloading music. It supports various music sources and provides a simple way to manage a local music library. It also includes a basic HTTP server to serve a frontend application.

## Features

*   WebSocket interface for all operations.
*   Search for music tracks (SoundCloud, Bilibili currently supported).
*   Download music tracks with real-time progress updates.
*   Chunked file uploads for tracks and covers.
*   List all downloaded music.
*   Search within the downloaded music library.
*   Update metadata and cover art for downloaded tracks.
*   Delete tracks from the local library.
*   System overview statistics (CPU, GPU, disk, network usage).
*   Extensible design to support multiple music sources.
*   Serves a frontend from the `/frontend` directory.

## Project Structure

The project follows a structured layout:

*   `src/`: Contains the main application source code.
    *   `main.py`: The main entry point to start the application (both WebSocket and Frontend servers).
    *   `core/`: Core components of the server.
        *   `server.py`: Handles WebSocket connections, server startup logic, and command dispatching.
    *   `handlers/`: Contains individual handler functions for each WebSocket command (e.g., search, download).
    *   `downloaders/`: Modules for specific music sources (e.g., `soundcloud_downloader.py`, `bilibili_downloader.py`).
    *   `utils/`: Utility modules, including data type definitions (`data_type.py`) and helper functions (`helpers.py`).
    *   `config.py`: Manages application configuration by loading environment variables.
*   `frontend/`: Contains static files for the frontend application (HTML, CSS, JavaScript).
*   `tests/`: Contains unit tests (if any).
*   `.env.example`: Example environment variable file.
*   `README.md`: This file.
*   `downloads/`: Default directory where downloaded music is stored (configurable).
*   `temp_uploads/`: Default directory for temporary chunked uploads (configurable).

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
    The project relies on several Python libraries. Ensure they are installed. If a `requirements.txt` file is provided, you can install them using:
    ```bash
    pip install -r requirements.txt
    ```
    Key dependencies include:
    *   `websockets` (for WebSocket server)
    *   `requests` (for HTTP requests in downloaders)
    *   `python-dotenv` (for loading `.env` configuration files)
    *   `pycryptodome` (for AES encryption/decryption, e.g., for paths)
    *   `psutil` (for system resource monitoring)
    *   `pyqrcode` (for Bilibili login QR code generation, if used)
    *   `Pillow` (PIL, for qrcode image manipulation, if used)
    *   `PyQuery` (for parsing HTML, e.g., in downloaders)

    Install them manually if `requirements.txt` is not available:
    ```bash
    pip install websockets requests python-dotenv pycryptodome psutil pyqrcode Pillow PyQuery
    ```

## Configuration

Application configuration is managed using environment variables, which can be conveniently set using a `.env` file in the project root.

1.  **Create a `.env` file:**
    Copy the example configuration file to a new `.env` file:
    ```bash
    cp .env.example .env
    ```

2.  **Edit `.env`:**
    Open the `.env` file and fill in your specific configuration values. At a minimum, you might need to set a secure `AES_KEY`.

    Key environment variables loaded by `src/config.py`:
    *   `HOST`: The host address for both WebSocket and Frontend servers (Default: "0.0.0.0").
    *   `WEBSOCKET_PORT`: Port for the WebSocket server (Default: 8765).
    *   `FRONTEND_PORT`: Port for the Frontend HTTP server (Default: 8080 or as specified).
    *   `AES_KEY`: A 64-character hex string (32 bytes) for AES encryption. **Important: Change the default weak key.**
    *   `DOWNLOADS_DIR`: Directory to store downloaded music (Default: "./downloads").
    *   `TEMP_UPLOAD_DIR`: Directory for temporary chunked uploads (Default: "./temp_uploads").
    *   `TASK_EXECUTION_FILE`: Path to store task execution statistics (Default: "./task_execution_stats.json").

## Running the Application

To start the backend server (which includes both the WebSocket server and the static file server for the frontend):

```bash
python src/main.py
```

*   The **WebSocket server** will be available at `ws://<HOST>:<WEBSOCKET_PORT>` (e.g., `ws://0.0.0.0:8765` by default).
*   The **Frontend server** will serve files from the `frontend/` directory at `http://<HOST>:<FRONTEND_PORT>` (e.g., `http://0.0.0.0:8080` by default). You can access the frontend by opening this URL in your browser.

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
(This section can be expanded as more commands are documented or changed)

1.  **Search for music:**
    *   `command`: `"search"`
    *   `payload`:
        ```json
        {
          "query": "search term",
          "source": "soundcloud" // or "bilibili", etc.
        }
        ```

2.  **Download a track:**
    *   `command`: `"download_track"`
    *   `payload`:
        ```json
        {
          "source": "soundcloud", // or "bilibili"
          "track_data": { /* dictionary of the track to download from search results */ }
        }
        ```

3.  **List downloaded music:**
    *   `command`: `"get_downloaded_music"`

4.  **Search downloaded music:**
    *   `command`: `"search_downloaded_music"`
    *   `payload`: `{"query": "search term"}`

5.  **Update track info:**
    *   `command`: `"update_track_info"`
    *   `payload`: `{"music_id": "some_id", "title": "New Title", ...}`

6.  **Delete track:**
    *   `command`: `"delete_track"`
    *   `payload`: `{"music_id": "some_id"}`

7.  **Chunked Upload (Initiate, Upload Chunk, Finalize):**
    *   `command`: `"initiate_chunked_upload"`
    *   `command`: `"upload_chunk"`
    *   `command`: `"finalize_chunked_upload"`
    *   (Payloads vary for each step)

8.  **Get System Overview:**
    *   `command`: `"get_system_overview"`

## Development

*   Unit tests are located in the `tests/` directory (if available).
    ```bash
    # Example: python -m unittest discover -s tests
    ```
