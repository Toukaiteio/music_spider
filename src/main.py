import asyncio
from core.server import start_server # Import the main server startup function
from config import IS_USING_SPRINGBOOT_BACKEND
from core.data_sync import sync_with_backend # Import the data sync startup function
if __name__ == "__main__":
    try:
        if IS_USING_SPRINGBOOT_BACKEND:
            sync_with_backend()
        asyncio.run(start_server())
    except OSError as e:
        print(f"Failed to start server: {e}")
    except Exception as e:
        print(f"An unexpected error occurred during server startup: {e}")
        # For debugging, you might want to re-enable this:
        # import traceback
        # traceback.print_exc()
    finally:
        print("Application shutdown sequence initiated from main.py.")
