import os
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
# Useful for development. In production, variables are often set directly in the environment.
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env') # Assuming .env is in the root directory, one level up from src
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
else:
    # Fallback to loading .env from the current working directory if src/.env doesn't exist
    # This might be useful if the script is run from the root directory directly
    load_dotenv()

# Security
# Important: Provide a strong, randomly generated default key ONLY for local development if absolutely necessary,
# and ensure it's NOT the one used in production.
# Best practice: Require AES_KEY to be set in the environment for production.
DEFAULT_AES_KEY = "YOUR_SECURE_AES_KEY_HERE"
AES_KEY = os.getenv("AES_KEY", DEFAULT_AES_KEY)
if AES_KEY == DEFAULT_AES_KEY:
    print("WARNING: Using default weak AES_KEY. Please set a strong AES_KEY environment variable for production.")

DEFAULT_GENIUS_ACCESS_TOKEN = "YOUR _GENIUS_ACCESS_TOKEN_HERE"
GENIUS_ACCESS_TOKEN = os.getenv("GENIUS_ACCESS_TOKEN", DEFAULT_GENIUS_ACCESS_TOKEN)
if  GENIUS_ACCESS_TOKEN == DEFAULT_GENIUS_ACCESS_TOKEN:
    print("WARNING: Using default GENIUS_ACCESS_TOKEN. Please set a valid GENIUS_ACCESS_TOKEN environment variable for production.")


# File System Paths
DOWNLOADS_DIR = "./frontend/downloads"
TEMP_UPLOAD_DIR = os.getenv("TEMP_UPLOAD_DIR", "./temp_uploads")
TASK_EXECUTION_FILE = os.getenv("TASK_EXECUTION_FILE", "./task_execution_stats.json")
FRONTEND_DIR = os.getenv("FRONTEND_DIR", "./frontend")
# Ensure paths are absolute or resolve them relative to a known base directory if needed
# For simplicity, we'll use them as potentially relative paths for now,
# but absolute paths are safer for server applications.
# Example: BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# DOWNLOADS_DIR = os.path.join(BASE_DIR, os.getenv("DOWNLOADS_DIR", "downloads"))

# Server Configuration
HOST = os.getenv("HOST", "0.0.0.0")
WEBSOCKET_PORT = int(os.getenv("WEBSOCKET_PORT", 8765))
FRONTEND_PORT = int(os.getenv("FRONTEND_PORT", 8080)) # Example, not used by current server code but good for future

# Logging/Debug (Examples, not currently used but good practice to include)
# LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
# DEBUG_MODE = os.getenv("DEBUG_MODE", "False").lower() in ('true', '1', 't')


# Verify essential configurations
if not AES_KEY:
    raise ValueError("AES_KEY is not set. Please set it in your .env file or environment.")

# Create directories if they don't exist (optional, based on application needs)
# This can be useful to ensure the application starts up correctly.
try:
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
    os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)
except OSError as e:
    print(f"Warning: Could not create directories {DOWNLOADS_DIR} or {TEMP_UPLOAD_DIR}: {e}")
    # Depending on the app, you might want to raise an error here or handle it gracefully.

if __name__ == '__main__':
    # For testing the config loading
    print(f"AES_KEY: {AES_KEY[:10]}...") # Print only a portion for security
    print(f"DOWNLOADS_DIR: {DOWNLOADS_DIR}")
    print(f"TEMP_UPLOAD_DIR: {TEMP_UPLOAD_DIR}")
    print(f"TASK_EXECUTION_FILE: {TASK_EXECUTION_FILE}")
    print(f"HOST: {HOST}")
    print(f"WEBSOCKET_PORT: {WEBSOCKET_PORT}")
    print(f"FRONTEND_PORT: {FRONTEND_PORT}")
    # print(f"LOG_LEVEL: {LOG_LEVEL}")
    # print(f"DEBUG_MODE: {DEBUG_MODE}")
