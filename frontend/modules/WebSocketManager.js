import UIManager from "./UIManager.js";
const { renderTaskQueue, updateMainTaskQueueIcon } = UIManager;
class WebSocketManager {
  static instance = null;

  constructor() {
    if (WebSocketManager.instance) {
      return WebSocketManager.instance;
    }
    this.socket = null;
    this.pendingRequests = {};
    this.cmdIdCounter = 0;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000; // 3 seconds
    this.connect();
    // Expose test function globally
    window.test = window.test || {};
    window.test.getLibrary = this.testWebSocketGetLibrary.bind(this);

    WebSocketManager.instance = this;
  }

  static getInstance() {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  generateCmdId() {
    return `cmd-${Date.now()}-${this.cmdIdCounter++}`;
  }

  connect() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      console.log("WebSocket is already connected or connecting.");
      return;
    }
    const host = location.hostname
    this.socket = new WebSocket(`ws://${host}:8765`);
    console.log("Attempting to connect to WebSocket server...");

    this.socket.onopen = () => {
      console.log("WebSocket connection established.");
      this.reconnectAttempts = 0;
      if (this._ensureSocketOpenResolver) {
        this._ensureSocketOpenResolver();
        this._ensureSocketOpenResolver = null;
      }
      this.processCommandQueue();
    };

    this.socket.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        console.log("WebSocket message received:", response);

        const { code, data: { original_cmd_id } = {} } = response;

        if (
          response.data &&
          response.data.status_type === "download_progress"
        ) {
          const progressData = response.data;
          const {
            track_id,
            file_type,
            status,
            progress_percent,
            error_message,
          } = progressData;

          const queueItem = window.appState.downloadQueue.find(
            (item) => item.bvid ? item.bvid === track_id : item.music_id === track_id
          );

          if (queueItem) {
            queueItem.progressPercent =
              progress_percent !== undefined
                ? progress_percent
                : queueItem.progressPercent;
            queueItem.status = status || queueItem.status;

            switch (status) {
              case "downloading":
                queueItem.statusMessage = `Downloading (${
                  file_type || "file"
                }): ${queueItem.progressPercent.toFixed(1)}%`;
                break;
              case "processing":
                queueItem.statusMessage = `Processing ${
                  file_type || "file"
                }...`;
                break;
              case "downloading_segments":
                queueItem.statusMessage = `Downloading segments...`;
                break;
              case "all_segments_downloaded":
                queueItem.statusMessage = `All segments downloaded.`;
                break;
              case "concatenating_segments":
                queueItem.statusMessage = `Concatenating segments...`;
                break;
              case "completed_track":
               queueItem.statusMessage = `Download complete!`;
               
               // Use the track info from the queueItem itself, which is more reliable.
               // The backend might not send the full track_info on completion.
               const completedTrackInfo = { ...queueItem };
               // Ensure the object added to the library is clean and doesn't have queue-specific status fields
               delete completedTrackInfo.progressPercent;
               delete completedTrackInfo.status;
               delete completedTrackInfo.statusMessage;
               delete completedTrackInfo.original_cmd_id;

               // Avoid duplicates
               const existingIndex = window.appState.library.findIndex(t => (t.music_id || t.id) === (completedTrackInfo.music_id || completedTrackInfo.id));
               if (existingIndex === -1) {
                   window.appState.library.push(completedTrackInfo);
               } else {
                   // Update existing track info in case it changed (e.g., new metadata from backend)
                   window.appState.library[existingIndex] = completedTrackInfo;
               }
               
               // Dispatch an event to notify that the library has changed
               document.dispatchEvent(new CustomEvent('library-changed', { detail: { track: completedTrackInfo } }));

               break;
             case "completed_file":
               queueItem.statusMessage = `${
                 file_type || "File"
               } successfully processed.`;
                break;
              case "error":
                queueItem.statusMessage = `Error: ${
                  error_message || "Unknown download error"
                }`;
                break;
              default:
                break;
            }
            renderTaskQueue();
            updateMainTaskQueueIcon();
            
            // Dispatch a custom event for other modules to listen to
            document.dispatchEvent(new CustomEvent('download-status-changed', {
                detail: {
                    trackId: track_id,
                    status: queueItem.status,
                    progress: queueItem.progressPercent
                }
            }));

          } else {
            console.warn(
              `Received progress for unknown track_id: ${track_id}`,
              progressData
            );
          }
          return;
        }

        if (!original_cmd_id) {
          console.warn("Received message without original_cmd_id:", response);
          return;
        }

        const request = this.pendingRequests[original_cmd_id];
        if (request) {
          clearTimeout(request.timeout);
          if (code === 0) {
            request.resolve(response);
          } else {
            request.reject(
              new Error(response.data?.message || "Unknown server error")
            );
          }
          delete this.pendingRequests[original_cmd_id];
        } else {
          console.warn(
            `Received response for unknown cmd_id: ${original_cmd_id}`
          );
        }
      } catch (error) {
        console.error(
          "Error parsing WebSocket message or handling response:",
          error
        );
      }
    };

    this.socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    this.socket.onclose = (event) => {
      console.log(
        `WebSocket connection closed. Code: ${event.code}, Reason: "${event.reason}", Clean close: ${event.wasClean}`
      );
      if (
        !event.wasClean &&
        this.reconnectAttempts < this.maxReconnectAttempts
      ) {
        this.reconnectAttempts++;
        console.log(
          `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
        );
        setTimeout(() => this.connect(), this.reconnectDelay);
      } else if (!event.wasClean) {
        console.error("Max WebSocket reconnection attempts reached.");
      }
    };
  }
  isSocketNeededForPage() {
    return true;
  }
  ensureSocketOpen() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this._ensureSocketOpenPromise) {
      return this._ensureSocketOpenPromise;
    }
    this._ensureSocketOpenPromise = new Promise((resolve) => {
      this._ensureSocketOpenResolver = () => {
        resolve();
        this._ensureSocketOpenPromise = null;
      };
    });
    if (!this.socket || this.socket.readyState !== WebSocket.CONNECTING) {
      this.connect();
    }
    return this._ensureSocketOpenPromise;
  }

  sendWebSocketCommand(command, payload) {
    return new Promise((resolve, reject) => {
      const executeCommand = () => {
        const cmd_id = this.generateCmdId();
        const message = {
          cmd_id: cmd_id,
          command: command,
          payload: payload,
        };

        try {
          this.socket.send(JSON.stringify(message));
          console.log("WebSocket command sent:", message);

          const timeoutDuration = 15000; // 15 seconds
          const timeout = setTimeout(() => {
            delete this.pendingRequests[cmd_id];
            reject(new Error(`Request timed out for cmd_id: ${cmd_id}`));
          }, timeoutDuration);

          this.pendingRequests[cmd_id] = { resolve, reject, timeout };
        } catch (error) {
          console.error("Error sending WebSocket command:", error);
          reject(error);
        }
      };

      // Initialize the queue if not present
      if (!this.commandQueue) {
        this.commandQueue = [];
      }

      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        // Queue the command to be sent after connection is open
        this.commandQueue.push(executeCommand);

        // Optionally, try to connect if not already connecting/connected
        if (
          !this.socket ||
          (this.socket.readyState !== WebSocket.CONNECTING &&
            this.socket.readyState !== WebSocket.OPEN)
        ) {
          this.connect();
        }
      } else {
        executeCommand();
      }
    });
  }

  // Add this after connect() in the class
  processCommandQueue() {
    if (
      this.commandQueue &&
      this.commandQueue.length > 0 &&
      this.socket &&
      this.socket.readyState === WebSocket.OPEN
    ) {
      while (this.commandQueue.length > 0) {
        const cmd = this.commandQueue.shift();
        try {
          cmd();
        } catch (e) {
          console.error("Error executing queued WebSocket command:", e);
        }
      }
    }
  }

  async testWebSocketGetLibrary() {
    console.log('Testing "get_downloaded_music" command...');
    try {
      const libraryData = await this.sendWebSocketCommand(
        "get_downloaded_music",
        {}
      );
      console.log("Library data received:", libraryData);
      return libraryData;
    } catch (error) {
      console.error("Error getting library data:", error.message);
      return error;
    }
  }
}

// 初始化单例
WebSocketManager.getInstance();

export default WebSocketManager;
