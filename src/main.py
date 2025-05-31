import asyncio
from core.server import start_server # Import the main server startup function

if __name__ == "__main__":
    try:
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
