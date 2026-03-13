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
    this.streamListeners = {}; // cmd_id -> { onUpdate, resolve, reject, timeout }
    this.pushHandlers = {};    // type -> callback
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

        const { code, data } = response;
        const { original_cmd_id } = data || {};

        // ── Push Notifications (Server-initiated) ──────────────────────────
        if (original_cmd_id === "llm_action") {
          const handler = this.pushHandlers["llm_action"];
          if (handler) {
            handler(data);
          }
          return;
        }

        // ── Music Claw streaming updates ─────────────────────────────────────
        if (response.data && response.data.status_type === "claw_update") {
          const sl = this.streamListeners[original_cmd_id];
          if (sl) {
            sl.onUpdate(response.data);
            if (response.data.update_type === "complete") {
              clearTimeout(sl.timeout);
              delete this.streamListeners[original_cmd_id];
              sl.resolve(response.data);
            }
          }
          return;
        }

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

          // track_id 可能为 null（部分后端实现的 completed_track 消息里不填）
          // 兜底：从 track_details 中取 music_id，或用 original_cmd_id 匹配
          const fallbackId = progressData.track_details?.music_id || null;
          const effectiveTrackId = track_id || fallbackId;

          const queueItem = window.appState.downloadQueue.find(
            (item) =>
              (effectiveTrackId && (
                item.bvid === effectiveTrackId ||
                item.music_id === effectiveTrackId ||
                item.id === effectiveTrackId
              )) ||
              (progressData.original_cmd_id && item.original_cmd_id === progressData.original_cmd_id)
          );

          if (queueItem) {
            queueItem.progressPercent =
              progress_percent !== undefined
                ? progress_percent
                : queueItem.progressPercent;
            queueItem.status = status || queueItem.status;

            switch (status) {
              case "downloading":
                queueItem.statusMessage = `Downloading (${file_type || "file"}): ${queueItem.progressPercent.toFixed(1)}%`;
                break;
              case "processing":
                queueItem.statusMessage = `Processing ${file_type || "file"}...`;
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
                queueItem.status = "completed_track";

                // 异步获取完整元数据并刷新库
                (async () => {
                  try {
                    const refreshResponse = await this.sendWebSocketCommand("get_downloaded_music", {});
                    const freshLibrary = refreshResponse?.data?.library || [];
                    const completedId = queueItem.music_id || queueItem.bvid || track_id;
                    const freshTrack = freshLibrary.find(t =>
                      t.music_id === completedId || t.music_id === track_id
                    );

                    if (freshTrack) {
                      const existingIndex = window.appState.library.findIndex(t => t.music_id === freshTrack.music_id);
                      if (existingIndex === -1) window.appState.library.push(freshTrack);
                      else window.appState.library[existingIndex] = freshTrack;

                      Object.assign(queueItem, freshTrack);
                      queueItem.status = "completed_track";
                    }
                    renderTaskQueue();
                    updateMainTaskQueueIcon();
                  } catch (e) {
                    console.error('[WebSocketManager] Failed to refresh library:', e);
                  }
                })();
                break;
              case "completed_file":
                queueItem.statusMessage = `${file_type || "File"} successfully processed.`;
                break;
              case "error":
                queueItem.statusMessage = `Error: ${error_message || "Unknown download error"}`;
                queueItem.status = "error";
                break;
            }

            renderTaskQueue();
            updateMainTaskQueueIcon();

            document.dispatchEvent(new CustomEvent('download-status-changed', {
              detail: {
                trackId: track_id,
                status: queueItem.status,
                progress: queueItem.progressPercent
              }
            }));
          } else if (status === 'downloading' || status === 'pending' || status === 'completed_track') {
            // Auto-create item for unknown downloads (e.g. AI tool calls)
            const details = progressData.track_details || {};
            const newItem = {
                music_id: effectiveTrackId,
                title: details.title || "Background Download",
                artist: details.artist || "Unknown",
                artwork_url: details.artwork_url || details.preview_cover || "placeholder_album_art_2.png",
                progressPercent: progress_percent || 0,
                status: status,
                statusMessage: `AI triggered download...`,
                original_cmd_id: progressData.original_cmd_id || "ai_trigger"
            };
            window.appState.downloadQueue.push(newItem);
            renderTaskQueue();
            updateMainTaskQueueIcon();
          } else {
            console.warn(`Received progress for unknown track_id: ${track_id}`, progressData);
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
            const errorMsg = response.data?.error || response.data?.message || "Unknown server error";
            request.reject(new Error(errorMsg));
          }
          delete this.pendingRequests[original_cmd_id];
        } else {
          // Check if it's an error for a streaming claw command
          const sl = this.streamListeners[original_cmd_id];
          if (sl && code !== 0) {
            clearTimeout(sl.timeout);
            delete this.streamListeners[original_cmd_id];
            const errorMsg = response.data?.error || response.data?.message || "Unknown server error";
            sl.reject(new Error(errorMsg));
          } else {
            console.warn(
              `Received response for unknown cmd_id: ${original_cmd_id}`
            );
          }
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

  /**
   * Send a streaming command (Music Claw).
   * @param {string} command
   * @param {object} payload
   * @param {function} onUpdate  - called for each intermediate update object
   * @returns {Promise<object>}  - resolves with the final complete update
   */
  sendClawCommand(command, payload, onUpdate) {
    return new Promise((resolve, reject) => {
      const cmd_id = this.generateCmdId();
      const message = { cmd_id, command, payload };

      // 2-minute timeout for AI responses
      const timeout = setTimeout(() => {
        delete this.streamListeners[cmd_id];
        reject(new Error("Music Claw request timed out."));
      }, 120000);

      this.streamListeners[cmd_id] = { onUpdate, resolve, reject, timeout };

      const send = () => {
        try {
          this.socket.send(JSON.stringify(message));
          console.log("Claw command sent:", message);
        } catch (err) {
          clearTimeout(timeout);
          delete this.streamListeners[cmd_id];
          reject(err);
        }
      };

      if (!this.commandQueue) this.commandQueue = [];
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.commandQueue.push(send);
        if (!this.socket ||
          (this.socket.readyState !== WebSocket.CONNECTING &&
           this.socket.readyState !== WebSocket.OPEN)) {
          this.connect();
        }
      } else {
        send();
      }
    });
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

  registerPushHandler(type, callback) {
    this.pushHandlers[type] = callback;
  }
}

// 初始化单例
WebSocketManager.getInstance();

export default WebSocketManager;
