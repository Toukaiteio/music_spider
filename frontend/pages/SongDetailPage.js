// frontend/pages/SongDetailPage.js

import { parseLRC } from "../modules/LyricsEditor.js";
import UIManager from '../modules/UIManager.js';
// Removed: renderLyricsPreview, initLyricsEditorControls, setMainPlayerManager, lyricsEditorAudio, loadAudioSource
// These will be handled by the LyricsEditor module itself or general init logic.
// NavigationManager itself will call initLyricsEditorControls if lyricsToolHtml is used.

class SongDetailPage {
  constructor() {
    // Page-specific initialization if any
  }

  getHTML() {
    return `
            <div id="song-detail-page">
                <div class="drag-handle-container">
                  <div class="drag-handle"></div>
                </div>
                <div class="song-detail-main-content">
                    <div class="song-detail-left">
                        <div class="detail-cover-container">
                          <img src="placeholder_album_art.png" alt="Album Art" id="detail-cover-art">
                        </div>
                        <div class="detail-info-group">
                          <h2 id="detail-title">Track Title</h2>
                          <p id="detail-artist">Artist Name</p>
                        </div>
                        <div id="detail-action-buttons">
                            <button class="detail-add-to-collection-button icon-button" title="Add to Collection"><span class="material-icons">playlist_add</span></button>
                            <button class="detail-update-button icon-button" aria-label="Update Track Info" title="Edit Track Info"><span class="material-icons">edit</span></button>
                        </div>
                    </div>
                    <div class="song-detail-right">
                        <div id="lyrics-display-area" class="lyrics-display-area-no-lyrics">
                            <p>正在加载歌词...</p>
                        </div>
                        <button id="upload-lyrics-button" class="icon-button" style="display: none;">
                            <span class="material-icons">upload_file</span>
                        </button>
                    </div>
                </div>
            </div>
    `;
  }

  async #fetchLibrary(appState, managers) {
    // If library is already initialized, no need to fetch again.
    if (appState.inited) {
        return appState.library;
    }

    try {
        const response = await managers.webSocketManager.sendWebSocketCommand("get_downloaded_music", {});
        const libraryData = response.data?.library || [];
        appState.library = libraryData;
        appState.inited = true; // Mark as initialized
        return libraryData;
    } catch (error) {
        console.error("Failed to load library for detail page:", error);
        return []; // Return empty on error
    }
  }

  async onLoad(mainContentElement, subPageId, appState, managers) {
    console.log("SongDetailPage loaded");

    // Ensure library is loaded, especially on direct refresh.
    if (!appState.inited) {
        await this.#fetchLibrary(appState, managers);
    }

    let track = appState.currentSongDetail;

    // If track is not in currentSongDetail (e.g., direct navigation/refresh), find it in the library.
    if (!track || String(track.music_id || track.id) !== String(subPageId)) {
        if (subPageId && appState.library && Array.isArray(appState.library)) {
            track = appState.library.find(
                (item) => String(item.music_id || item.id) === String(subPageId)
            );
            if (track) {
                appState.currentSongDetail = track; // Update appState for consistency
            }
        }
    }
    
    if (!track) {
        mainContentElement.innerHTML =
            '<p style="color:red; text-align:center; padding:20px;">Error: Song details not found. Please go back and try again.</p>';
        // Set a title for the error page
        document.title = "Error - Music Downloader";
        return;
    }

    // Apply enter animation for song-detail page
    // This was handled in NavigationManager's _performNavigateTo requestAnimationFrame callback
    // We might need a way for page modules to signal NavigationManager for such animations,
    // or NavigationManager handles generic container animations. For now, let's assume NM handles the generic .song-detail-page-enter
    // The class is already on the main div in getHTML. NM can add/remove it.

    const coverArtEl = mainContentElement.querySelector("#detail-cover-art");
    const titleEl = mainContentElement.querySelector("#detail-title");
    const artistEl = mainContentElement.querySelector("#detail-artist");

    // Prioritize local cover path, then fallback to artwork_url
    let detailImageUrl = "placeholder_album_art.png"; // Default
    if (track.cover_path && typeof track.cover_path === 'string' && track.cover_path.trim() !== '') {
        // Ensure the path is correctly formatted for local access.
        // The backend sends a path relative to the project root, like 'downloads/bvid/cover.jpg'
        // Prepending './' is correct.
        detailImageUrl = './' + track.cover_path.replace(/\\/g, '/');
    } else if (track.artwork_url && typeof track.artwork_url === 'string' && track.artwork_url.trim() !== '') {
        detailImageUrl = track.artwork_url;
    }

    if (coverArtEl) coverArtEl.src = detailImageUrl;
    if (titleEl) titleEl.textContent = track.title || "Unknown Title";
    if (artistEl)
      artistEl.textContent =
        track.artist || "Unknown Artist";

    // Add track info to buttons for script.js listener (or page-specific listener if we move them)
    const addToCollectionButtonEl = mainContentElement.querySelector(
      ".detail-add-to-collection-button"
    );
    const trackInfoJson = JSON.stringify(track).replace(/'/g, "&apos;");
    const songId = track.music_id || track.id;
    if (addToCollectionButtonEl) {
      addToCollectionButtonEl.dataset.trackInfo = trackInfoJson;
      if (songId) addToCollectionButtonEl.dataset.songId = songId;
    }

    // --- Interactive Close Logic ---
    const overlay = document.getElementById('song-detail-overlay');
    const dragHandle = mainContentElement.querySelector('.drag-handle-container');
    
    // 1. Drag to Close (Vertical Swipe)
    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    if (dragHandle && overlay) {
      // Ensure overlay starts clean
      overlay.style.transform = '';
      overlay.style.opacity = '';

      const startDrag = (e) => {
        // Stop events from reaching layers below
        e.stopPropagation();
        
        startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        isDragging = true;
        overlay.classList.add('dragging');
        
        window.addEventListener('mousemove', onDrag, { passive: false });
        window.addEventListener('touchmove', onDrag, { passive: false });
        window.addEventListener('mouseup', stopDrag);
        window.addEventListener('touchend', stopDrag);
      };

      const onDrag = (e) => {
        if (!isDragging) return;
        e.stopPropagation();
        if (e.cancelable) e.preventDefault(); // Prevent scrolling/selection while dragging
        
        currentY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const deltaY = Math.max(0, currentY - startY); // Only allow dragging down
        
        // Apply visual feedback
        overlay.style.setProperty('transform', `translateY(${deltaY}px) scale(${1 - (deltaY / 3000)})`, 'important');
        overlay.style.setProperty('opacity', 1 - (deltaY / 1200), 'important');
      };

      const stopDrag = (e) => {
        if (!isDragging) return;
        if (e) e.stopPropagation();
        
        isDragging = false;
        overlay.classList.remove('dragging');
        const deltaY = currentY - startY;
        
        if (deltaY > 150) {
          // Trigger close
          UIManager.toggleSongDetail(false, null, appState, managers);
          // UIManager.toggleSongDetail handles the rest, 
          // but we reset styles in onUnload to be safe for next expansion
        } else {
          // Snap back
          overlay.style.transform = '';
          overlay.style.opacity = '';
        }

        window.removeEventListener('mousemove', onDrag);
        window.removeEventListener('touchmove', onDrag);
        window.removeEventListener('mouseup', stopDrag);
        window.removeEventListener('touchend', stopDrag);
      };

      dragHandle.addEventListener('mousedown', startDrag);
      dragHandle.addEventListener('touchstart', startDrag, { passive: false });
      
      // Store references for cleanup
      this._dragStartListener = startDrag;
      this._dragMoveListener = onDrag;
      this._dragEndListener = stopDrag;
    }

    // 2. Double Click on Empty Area (Left/Right margins) to Close
    mainContentElement.addEventListener('dblclick', (e) => {
      // If the click is directly on the #song-detail-page or .song-detail-content-wrapper (if we had one)
      // or just check if the target is an "empty" container
      if (e.target.id === 'song-detail-page' || e.target.classList.contains('song-detail-left') || e.target.classList.contains('song-detail-right')) {
        UIManager.toggleSongDetail(false, null, appState, managers);
      }
    });

    // 3. ESC Key to Close
    const handleEscKey = (e) => {
      if (e.key === 'Escape' && overlay && overlay.classList.contains('active')) {
        UIManager.toggleSongDetail(false, null, appState, managers);
      }
    };
    window.addEventListener('keydown', handleEscKey);

    // Lyrics and Upload Lyrics button logic
    const lyricsDisplayArea = mainContentElement.querySelector(
      "#lyrics-display-area"
    );
    const uploadLyricsButton = mainContentElement.querySelector(
      "#upload-lyrics-button"
    );

    if (lyricsDisplayArea && uploadLyricsButton) {
      if (
        track.lyrics &&
        typeof track.lyrics === "string" &&
        track.lyrics.trim() !== ""
      ) {
        lyricsDisplayArea.innerHTML = ""; // Clear "Searching for lyrics..."
        lyricsDisplayArea.classList.remove("lyrics-display-area-no-lyrics");
        const canvas = document.createElement("canvas");
        canvas.id = "lyrics-canvas";
        canvas.style.display = "block";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.margin = "0 auto";
        lyricsDisplayArea.appendChild(canvas);

        let parsedLyricsData = [];
        if (typeof parseLRC === "function") {
          parsedLyricsData = parseLRC(track.lyrics).lyrics;
        } else {
          canvas.style.display = "none";
          lyricsDisplayArea.innerHTML = `<pre>${track.lyrics
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</pre>`;
          // return; // If parseLRC is critical and not found, might stop further lyrics processing.
        }

        // Requirement 4: Auto update song-detail info when playing track changes
        this.playerManager = managers.playerManager;
        this._playerStateCallback = (state) => {
          if (state && state.track) {
            const currentId = appState.currentSongDetail ? (appState.currentSongDetail.music_id || appState.currentSongDetail.id) : null;
            const newId = state.track.music_id || state.track.id;
            if (currentId !== newId) {
              appState.currentSongDetail = state.track;
              if (managers.uiManager && typeof managers.uiManager.toggleSongDetail === 'function') {
                if (typeof this.onUnload === 'function') {
                  this.onUnload();
                }
                managers.uiManager.toggleSongDetail(true, state.track, appState, managers);
              }
            }
          }
        };
        if (this.playerManager) {
          this.playerManager.onStateChange(this._playerStateCallback);
        }

        if (parsedLyricsData.length > 0) {
          const getEaseInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          const formatTime = (timeInSec) => {
            const m = Math.floor(timeInSec / 60);
            const s = Math.floor(timeInSec % 60);
            return `${m}:${String(s).padStart(2, "0")}`;
          };

          const isCurrentSongPlayingThisDetail = () => {
            let playingId = null;
            if (managers.playerManager && typeof managers.playerManager.getCurrentTrack === "function") {
              const playingTrack = managers.playerManager.getCurrentTrack();
              playingId = playingTrack ? playingTrack.music_id || playingTrack.id : null;
            } else if (appState.currentPlayingTrack) {
              playingId = appState.currentPlayingTrack.music_id || appState.currentPlayingTrack.id;
            }
            const detailId = track.music_id || track.id;
            return playingId && detailId && String(playingId) === String(detailId);
          };

          const ctx = canvas.getContext("2d");
          let wrappedLyricsData = [];
          
          const wrapLyrics = (canvasWidth) => {
            wrappedLyricsData = [];
            const maxWidth = Math.max(10, canvasWidth * 0.9);
            for (let i = 0; i < parsedLyricsData.length; i++) {
              const item = parsedLyricsData[i];
              if (!item.text) {
                wrappedLyricsData.push({ text: "", time: item.time, origIndex: i });
                continue;
              }
              let currentLine = "";
              for (let j = 0; j < item.text.length; j++) {
                const char = item.text[j];
                const testLine = currentLine + char;
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth && j > 0) {
                  wrappedLyricsData.push({ text: currentLine, time: item.time, origIndex: i });
                  currentLine = char;
                } else {
                  currentLine = testLine;
                }
              }
              wrappedLyricsData.push({ text: currentLine, time: item.time, origIndex: i });
            }
          };

          let currentLineIndex = -1;
          let targetLineIndex = -1;
          let scrollOffset = 0;
          let animating = false;
          let animationStart = 0;
          const animationDuration = 400; // ms
          let startOffset = 0;
          let endOffset = 0;
          let lastWidth = 0;
          let lastHeight = 0;
          let animationFrameId = null;

          let isDraggingLyrics = false;
          let dragStartY = 0;
          let dragStartScrollOffset = 0;
          let autoScrollEnabled = true;

          lyricsDisplayArea.style.position = 'relative';

          const cancelDragHint = document.createElement('div');
          cancelDragHint.textContent = '将光标拖动到此处或者右键取消拖动';
          cancelDragHint.style.cssText = `
              position: absolute; left: 0; top: 0; bottom: 0; width: 60px;
              background: rgba(255, 255, 255, 0.1); color: #fff;
              display: flex; align-items: center; justify-content: center;
              writing-mode: vertical-lr; text-align: center; font-size: 14px;
              opacity: 0; transition: opacity 0.3s, background 0.3s; pointer-events: none; z-index: 10;
          `;
          lyricsDisplayArea.appendChild(cancelDragHint);

          const timeIndicLine = document.createElement('div');
          timeIndicLine.style.cssText = `
              position: absolute; left: 60px; right: 20px; top: 50%; height: 1px;
              border-top: 1px dashed rgba(255,255,255,0.5);
              display: none; pointer-events: none; z-index: 9;
          `;
          lyricsDisplayArea.appendChild(timeIndicLine);

          const timeIndicText = document.createElement('div');
          timeIndicText.style.cssText = `
              position: absolute; left: 65px; top: 50%; transform: translateY(-50%);
              color: #fff; font-size: 12px; margin-top: -10px; display: none; pointer-events: none; z-index: 9;
          `;
          lyricsDisplayArea.appendChild(timeIndicText);

          const getIconColor = () => getComputedStyle(document.documentElement).getPropertyValue("--icon-color") || "#aaa";

          const getCurrentLyricIndex = (currentTime) => {
            if (!wrappedLyricsData || wrappedLyricsData.length === 0 || currentTime <= 0) return -1;
            for (let i = wrappedLyricsData.length - 1; i >= 0; i--) {
              if (currentTime >= wrappedLyricsData[i].time) return i;
            }
            return -1;
          };

          const drawLyrics = () => {
            if (!canvas || !ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const W = canvas.width;
            const H = canvas.height;
            const fontSize = Math.max(16, Math.floor(H / 16));
            const lineHeight = Math.floor(fontSize * 1.7);
            const maxLines = Math.floor(H / lineHeight) | 1;
            const half = Math.floor(maxLines / 2);

            let start = Math.max(0, Math.floor(scrollOffset) - half - 2);
            let end = Math.min(wrappedLyricsData.length, Math.ceil(scrollOffset) + half + 2);

            const centerY = H / 2;

            for (let i = start; i < end; i++) {
              if (i < 0) continue;
              const y = centerY + (i - scrollOffset) * lineHeight;
              
              ctx.font = `500 ${fontSize}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";

              const origIndex = wrappedLyricsData[i] ? wrappedLyricsData[i].origIndex : -1;
              const activeOrigIndex = wrappedLyricsData[currentLineIndex] ? wrappedLyricsData[currentLineIndex].origIndex : -1;
              const isActive = (origIndex !== -1 && origIndex === activeOrigIndex);

              ctx.fillStyle = isActive ? "#fff" : getIconColor();
              if (isActive) {
                ctx.shadowColor = "rgba(0,0,0,0.5)";
                ctx.shadowBlur = 8;
                ctx.globalAlpha = 1;
              } else {
                ctx.shadowBlur = 0;
                const dist = Math.abs(i - scrollOffset);
                const alpha = Math.max(0, 1 - (dist / (half + 2)));
                ctx.globalAlpha = alpha;
              }
              if (wrappedLyricsData[i]) {
                ctx.fillText(wrappedLyricsData[i].text, W / 2, y);
              }
            }
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
          };

          const animateLyrics = () => {
            if (!canvas || !ctx) {
              if (animationFrameId) cancelAnimationFrame(animationFrameId);
              return;
            }

            let currentTime = 0;
            if (isCurrentSongPlayingThisDetail()) {
              currentTime = managers.playerManager.getCurrentTime();
            }
            let idx = getCurrentLyricIndex(currentTime);
            if (currentTime === 0) idx = -1;

            if (isCurrentSongPlayingThisDetail() && autoScrollEnabled && !isDraggingLyrics) {
               currentLineIndex = idx;
               let idealOffset = idx;
               if (idealOffset !== -1) {
                  const H = canvas.height / (window.devicePixelRatio || 1);
                  const fontSize = Math.max(16, Math.floor(H / 16));
                  const lineHeight = Math.floor(fontSize * 1.7);
                  const maxLines = Math.floor(H / lineHeight) | 1;
                  const half = Math.floor(maxLines / 2);
                  
                  if (idealOffset < half) idealOffset = half;

                  if (targetLineIndex !== idealOffset) {
                    animating = true;
                    animationStart = performance.now();
                    startOffset = scrollOffset;
                    endOffset = idealOffset;
                    targetLineIndex = idealOffset;
                  }
               }
            }

            if (animating && autoScrollEnabled && !isDraggingLyrics) {
              const now = performance.now();
              const t = Math.min(1, (now - animationStart) / animationDuration);
              scrollOffset = startOffset + (endOffset - startOffset) * getEaseInOut(t);
              if (t >= 1) {
                animating = false;
                scrollOffset = endOffset;
              }
            } else if (!isDraggingLyrics && autoScrollEnabled) {
              if (idx !== -1 && targetLineIndex !== -1) {
                scrollOffset = targetLineIndex;
              } else if (idx === -1) {
                scrollOffset = 0;
              }
            }

            drawLyrics();
            animationFrameId = requestAnimationFrame(animateLyrics);
          };

          const resizeCanvas = () => {
            if (!canvas || !mainContentElement.contains(canvas)) {
              if (animationFrameId) cancelAnimationFrame(animationFrameId);
              window.removeEventListener("resize", resizeCanvas);
              return;
            }
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            if (ctx) {
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.scale(dpr, dpr);
            }
            
            const fontSize = Math.max(16, Math.floor(rect.height / 16));
            ctx.font = `500 ${fontSize}px sans-serif`;
            wrapLyrics(rect.width);
            
            drawLyrics();
          };

          resizeCanvas();
          window.addEventListener("resize", resizeCanvas);
          animationFrameId = requestAnimationFrame(animateLyrics);

          const onDragStart = (e) => {
            if (e.type === "mousedown" && e.button !== 0) return;
            isDraggingLyrics = true;
            autoScrollEnabled = false;
            let clientY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
            dragStartY = clientY;
            dragStartScrollOffset = scrollOffset;
            cancelDragHint.style.opacity = '1';
            timeIndicLine.style.display = 'block';
            timeIndicText.style.display = 'block';
          };

          const onDragMove = (e) => {
            if (!isDraggingLyrics) return;
            let clientY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
            let clientX = e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
            const deltaY = clientY - dragStartY;

            const rect = canvas.getBoundingClientRect();
            const fontSize = Math.max(16, Math.floor(rect.height / 16));
            const lineHeight = Math.floor(fontSize * 1.7);

            scrollOffset = dragStartScrollOffset - (deltaY / lineHeight);
            
            const centerIdx = Math.max(0, Math.min(wrappedLyricsData.length - 1, Math.round(scrollOffset)));
            if (wrappedLyricsData[centerIdx]) {
              timeIndicText.textContent = formatTime(wrappedLyricsData[centerIdx].time);
            }

            if (clientX - rect.left < 60) {
              cancelDragHint.style.background = 'rgba(255, 60, 60, 0.4)';
              cancelDragHint.textContent = '松开取消拖动';
            } else {
              cancelDragHint.style.background = 'rgba(255, 255, 255, 0.1)';
              cancelDragHint.textContent = '将光标拖动到此处或者右键取消拖动';
            }
          };

          const onDragEnd = (e) => {
            if (!isDraggingLyrics) return;
            isDraggingLyrics = false;
            cancelDragHint.style.opacity = '0';
            timeIndicLine.style.display = 'none';
            timeIndicText.style.display = 'none';

            let clientX = 0;
            if (e.type.includes("touch")) {
              clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
            } else {
              clientX = e.clientX;
            }

            const rect = canvas.getBoundingClientRect();
            if (clientX - rect.left < 60) {
               autoScrollEnabled = true;
            } else {
               const centerIdx = Math.max(0, Math.min(wrappedLyricsData.length - 1, Math.round(scrollOffset)));
               if (wrappedLyricsData[centerIdx] && managers.playerManager && managers.playerManager.audio) {
                 managers.playerManager.audio.currentTime = wrappedLyricsData[centerIdx].time;
               }
               setTimeout(() => { autoScrollEnabled = true; animating = false; }, 1000);
            }
          };

          const onContextMenu = (e) => {
            if (isDraggingLyrics) {
              e.preventDefault();
              isDraggingLyrics = false;
              cancelDragHint.style.opacity = '0';
              timeIndicLine.style.display = 'none';
              timeIndicText.style.display = 'none';
              autoScrollEnabled = true;
            }
          };

          canvas.addEventListener("mousedown", onDragStart);
          window.addEventListener("mousemove", onDragMove, {passive: false});
          window.addEventListener("mouseup", onDragEnd);
          canvas.addEventListener("touchstart", onDragStart, {passive: true});
          window.addEventListener("touchmove", onDragMove, {passive: false});
          window.addEventListener("touchend", onDragEnd);
          canvas.addEventListener("contextmenu", onContextMenu);

          const originalOnUnload = this.onUnload.bind(this);
          this.onUnload = () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            window.removeEventListener("resize", resizeCanvas);
            canvas.removeEventListener("mousedown", onDragStart);
            window.removeEventListener("mousemove", onDragMove);
            window.removeEventListener("mouseup", onDragEnd);
            canvas.removeEventListener("touchstart", onDragStart);
            window.removeEventListener("touchmove", onDragMove);
            window.removeEventListener("touchend", onDragEnd);
            canvas.removeEventListener("contextmenu", onContextMenu);
            if (typeof originalOnUnload === 'function') {
              originalOnUnload();
            }
          };
        }
        uploadLyricsButton.style.display = "none";
      } else {
        lyricsDisplayArea.innerHTML = "<p>暂无歌词</p>";
        uploadLyricsButton.style.display = "block";
        uploadLyricsButton.onclick = () => {
          appState.focusElementAfterLoad = "#lrc-input-area";
          if (managers.navigationManager) {
            managers.navigationManager.navigateTo(
              "update-track",
              `Update ${track.title || "Track"}`,
              `#update-track/${songId}`,
              false,
              songId
            );
          }
        };
      }
    }

    // Focus logic
    if (appState.focusElementAfterLoad) {
      const elementToFocus = document.querySelector(
        appState.focusElementAfterLoad
      );
      if (elementToFocus && mainContentElement.contains(elementToFocus)) {
        setTimeout(() => elementToFocus.focus(), 50);
      }
      delete appState.focusElementAfterLoad;
    }

    // Event Handlers
    const detailAddToCollectionButton = mainContentElement.querySelector(
      ".detail-add-to-collection-button"
    );
    const detailUpdateButton = mainContentElement.querySelector(
      ".detail-update-button"
    );


    if (detailAddToCollectionButton && managers.collectionManager) {
      detailAddToCollectionButton.addEventListener("click", () => {
        const songId = detailAddToCollectionButton.dataset.songId;
        if (songId) {
          managers.collectionManager.handleAddToCollectionButtonClick(songId);
        } else {
          const trackInfoString = detailAddToCollectionButton.dataset.trackInfo;
          if (trackInfoString) {
            try {
              const trackObject = JSON.parse(trackInfoString);
              const id = trackObject.music_id || trackObject.id;
              if (id) {
                managers.collectionManager.handleAddToCollectionButtonClick(id);
              }
            } catch (e) {
              console.error(
                "Error parsing track_info for detail add to collection:",
                e
              );
              if (managers.uiManager)
                managers.uiManager.showToast(
                  "Error processing track data.",
                  "error"
                );
            }
          } else if (managers.uiManager) {
            managers.uiManager.showToast(
              "Cannot add to collection: Missing track data.",
              "error"
            );
          }
        }
      });
    }

    if (
      detailUpdateButton &&
      managers.navigationManager &&
      managers.uiManager
    ) {
      detailUpdateButton.addEventListener("click", () => {
        if (appState.currentSongDetail) {
          const trackToUpdate = appState.currentSongDetail;
          const musicId = trackToUpdate.music_id || trackToUpdate.id;
          if (musicId) {
            managers.navigationManager.navigateTo(
              "update-track",
              "Update " + (trackToUpdate.title || "Track"),
              "#update-track/" + musicId,
              false,
              musicId
            );
          } else {
            managers.uiManager.showToast(
              "Cannot update: Music ID is missing.",
              "error"
            );
          }
        } else {
          managers.uiManager.showToast(
            "Cannot update: No song details available.",
            "error"
          );
        }
      });
    }

    this._keyListener = handleEscKey;
  }

  // It's good practice to have a cleanup method for event listeners or animation frames
  // when the page is navigated away from. NavigationManager could call this.
  onUnload() {
    // This method will be populated by onLoad if lyrics animation starts
    // console.log('SongDetailPage unloaded');
    // Note: Event listeners attached to elements within mainContentElement are automatically
    // removed when mainContentElement.innerHTML is changed by NavigationManager._performNavigateTo.
    // However, listeners on `window` or other persistent elements need manual cleanup here or in NM.
    // The lyrics animation cleanup is already handled by `this.onUnload` being overwritten in `onLoad`.

    if (this._playerStateCallback && this.playerManager) {
      this.playerManager.offStateChange(this._playerStateCallback);
    }
    
    // Clean up key listener (ESC key)
    if (this._keyListener) {
      window.removeEventListener('keydown', this._keyListener);
    }

    // Clean up double-click listener
    const songDetailOverlay = document.getElementById('song-detail-overlay');
    if (songDetailOverlay && this._doubleClickListener) {
      songDetailOverlay.removeEventListener('dblclick', this._doubleClickListener);
    }

    // Clean up drag listeners
    if (this._dragStartListener) {
      const dragHandle = songDetailOverlay ? songDetailOverlay.querySelector('.drag-handle') : null;
      if (dragHandle) {
        dragHandle.removeEventListener('mousedown', this._dragStartListener);
        dragHandle.removeEventListener('touchstart', this._dragStartListener);
      }
      window.removeEventListener('mousemove', this._dragMoveListener);
      window.removeEventListener('touchmove', this._dragMoveListener);
      window.removeEventListener('mouseup', this._dragEndListener);
      window.removeEventListener('touchend', this._dragEndListener);
    }
    
    // Clean up styles modified during dragging if any
    const overlay = document.getElementById('song-detail-overlay');
    if (overlay) {
      overlay.style.transform = '';
      overlay.style.opacity = '';
    }
  }
}

export default SongDetailPage;
