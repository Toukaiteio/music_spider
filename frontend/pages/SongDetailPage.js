// frontend/pages/SongDetailPage.js

import { parseLRC } from "../modules/LyricsEditor.js";
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
                <button id="song-detail-back-button" class="icon-button" aria-label="Go Back" style="position: absolute; top: 0px; left: 0px; z-index: 10;"><span class="material-icons">arrow_back</span></button>
                <div class="song-detail-left">
                    <img src="placeholder_album_art.png" alt="Album Art" id="detail-cover-art">
                    <h2 id="detail-title" style="margin-bottom:0px;">Track Title</h2>
                    <p id="detail-artist" style="margin-bottom:0px;margin-top:0px;">Artist Name</p>
                    <p id="detail-description">Full song description here...</p>
                    <div id="detail-action-buttons">
                        <button class="detail-play-button icon-button"><span class="material-icons">play_arrow</span></button>
                        <button class="detail-add-to-collection-button icon-button"><span class="material-icons">playlist_add</span></button>
                        <button class="detail-update-button icon-button" aria-label="Update Track Info"><span class="material-icons">edit</span></button>
                    </div>
                </div>
                <div class="song-detail-right">
                    <div id="lyrics-display-area" class="lyrics-display-area-no-lyrics">
                        <p>暂无歌词</p>
                    </div>
                    <button id="upload-lyrics-button" class="icon-button" style="display: none;">
                        <span class="material-icons">upload_file</span>
                    </button>
                </div>
            </div>
    `;
  }

  onLoad(mainContentElement, subPageId, appState, managers) {
    console.log("SongDetailPage loaded");

    const track = appState.currentSongDetail;

    if (!track) {
      // If not found, try to find in appState.library by subPageId (which may be song id)
      let foundTrack = null;
      if (subPageId && appState.library && Array.isArray(appState.library)) {
        foundTrack = appState.library.find(
          (item) => String(item.music_id || item.id) === String(subPageId)
        );
      } else if (!appState.inited) {
        managers.webSocketManager
          .sendWebSocketCommand("get_downloaded_music", {})
          .then((response) => {
            appState.inited = true;
            window.__collectionsPageLoadingLibrary = false;
            const libraryData =
              response.data && response.data.library
                ? response.data.library
                : [];
            appState.library = libraryData;
          });
      }
      if (foundTrack) {
        appState.currentSongDetail = foundTrack;
      } else {
        mainContentElement.innerHTML =
          '<p style="color:red; text-align:center; padding:20px;">Error: Song details not found. Please go back and try again.</p>';
        return;
      }
    }

    // Apply enter animation for song-detail page
    // This was handled in NavigationManager's _performNavigateTo requestAnimationFrame callback
    // We might need a way for page modules to signal NavigationManager for such animations,
    // or NavigationManager handles generic container animations. For now, let's assume NM handles the generic .song-detail-page-enter
    // The class is already on the main div in getHTML. NM can add/remove it.

    const coverArtEl = mainContentElement.querySelector("#detail-cover-art");
    const titleEl = mainContentElement.querySelector("#detail-title");
    const artistEl = mainContentElement.querySelector("#detail-artist");
    const descriptionEl = mainContentElement.querySelector(
      "#detail-description"
    );

    let detailImageUrl = "placeholder_album_art.png"; // Default placeholder
    if (
      track.cover_path &&
      typeof track.cover_path === "string" &&
      track.cover_path.trim() !== ""
    ) {
      detailImageUrl = "." + track.cover_path;
    } else if (
      track.preview_cover &&
      typeof track.preview_cover === "string" &&
      track.preview_cover.trim() !== ""
    ) {
      detailImageUrl = track.preview_cover;
    } else if (
      track.cover_url &&
      typeof track.cover_url === "string" &&
      track.cover_url.trim() !== ""
    ) {
      detailImageUrl = track.cover_url;
    }

    if (coverArtEl) coverArtEl.src = detailImageUrl;
    if (titleEl) titleEl.textContent = track.title || "Unknown Title";
    if (artistEl)
      artistEl.textContent =
        track.author || track.artist_name || "Unknown Artist";
    if (descriptionEl)
      descriptionEl.textContent =
        track.description || "No description available.";

    // Add track info to buttons for script.js listener (or page-specific listener if we move them)
    const playButtonEl = mainContentElement.querySelector(
      ".detail-play-button"
    );
    const addToCollectionButtonEl = mainContentElement.querySelector(
      ".detail-add-to-collection-button"
    );
    const trackInfoJson = JSON.stringify(track).replace(/'/g, "&apos;");
    const songId = track.music_id || track.id;

    if (playButtonEl) playButtonEl.dataset.trackInfo = trackInfoJson;
    if (addToCollectionButtonEl) {
      addToCollectionButtonEl.dataset.trackInfo = trackInfoJson;
      if (songId) addToCollectionButtonEl.dataset.songId = songId;
    }

    // Back button for song detail page
    const backButton = mainContentElement.querySelector(
      "#song-detail-back-button"
    );
    if (backButton && managers.navigationManager) {
      // Remove previous listener if any, to avoid multiple attachments if page is reloaded somehow
      // This is a simple way; a more robust way would be to store and remove the exact bound function.
      const newBackButton = backButton.cloneNode(true);
      backButton.parentNode.replaceChild(newBackButton, backButton);
      newBackButton.addEventListener(
        "click",
        managers.navigationManager.navigateBack
      );
    }

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
        lyricsDisplayArea.innerHTML = ""; // Clear "暂无歌词"
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

        if (parsedLyricsData.length > 0) {
          // Animation and drawing functions (getEaseInOut, isCurrentSongPlayingThisDetail, getIconColor, getCurrentLyricIndex, drawLyrics, animate, resizeCanvas)
          // These were defined inline in NavigationManager.js. They should be defined here or imported if they become shared.
          // For now, let's define them within this onLoad scope or as private methods of the class if they don't need external access.

          const getEaseInOut = (t) =>
            t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

          const isCurrentSongPlayingThisDetail = () => {
            let playingId = null;
            if (
              managers.playerManager &&
              typeof managers.playerManager.getCurrentTrack === "function"
            ) {
              const playingTrack = managers.playerManager.getCurrentTrack();
              playingId = playingTrack
                ? playingTrack.music_id || playingTrack.id
                : null;
            } else if (appState.currentPlayingTrack) {
              playingId =
                appState.currentPlayingTrack.music_id ||
                appState.currentPlayingTrack.id;
            }
            const detailId = track.music_id || track.id;
            return (
              playingId && detailId && String(playingId) === String(detailId)
            );
          };

          const ctx = canvas.getContext("2d");
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

          const getIconColor = () =>
            getComputedStyle(document.documentElement).getPropertyValue(
              "--icon-color"
            ) || "#aaa";

          const getCurrentLyricIndex = (currentTime, lyrics) => {
            if (!lyrics || lyrics.length === 0 || currentTime <= 0) return -1;
            for (let i = lyrics.length - 1; i >= 0; i--) {
              if (currentTime >= lyrics[i].time) return i;
            }
            return -1;
          };

          const drawLyrics = () => {
            if (!canvas || !ctx) return; // Ensure canvas and context are still valid
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const W = canvas.width;
            const H = canvas.height;
            const fontSize = Math.max(16, Math.floor(H / 16));
            const lineHeight = Math.floor(fontSize * 1.7);
            const maxLines = Math.floor(H / lineHeight) | 1; // Ensure odd number for perfect center
            const half = Math.floor(maxLines / 2);

            let start = Math.max(0, currentLineIndex - half);
            let end = Math.min(parsedLyricsData.length, start + maxLines);
            if (end - start < maxLines) start = Math.max(0, end - maxLines);

            const centerY = H / 2;

            for (let i = start; i < end; i++) {
              const y =
                centerY +
                (i - currentLineIndex - (scrollOffset - currentLineIndex)) *
                  lineHeight;
              ctx.font = `500 ${fontSize}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = i === currentLineIndex ? "#fff" : getIconColor();
              if (i === currentLineIndex) {
                ctx.shadowColor = "rgba(0,0,0,0.5)";
                ctx.shadowBlur = 8;
              } else {
                ctx.shadowBlur = 0;
              }
              if (parsedLyricsData[i]) {
                ctx.fillText(parsedLyricsData[i].text, W / 2, y);
              }
            }
            ctx.shadowBlur = 0;
          };

          const animateLyrics = () => {
            if (!canvas || !ctx) {
              // check if canvas is still in DOM
              if (animationFrameId) cancelAnimationFrame(animationFrameId);
              return;
            }
            if (canvas.width !== lastWidth || canvas.height !== lastHeight) {
              lastWidth = canvas.width;
              lastHeight = canvas.height;
              // resizeCanvas might be needed if dpr changes or for initial setup
            }

            let currentTime = 0;
            if (isCurrentSongPlayingThisDetail()) {
              currentTime = managers.playerManager.getCurrentTime();
            }
            let idx = getCurrentLyricIndex(currentTime, parsedLyricsData);
            if (currentTime === 0) idx = -1;

            if (targetLineIndex !== idx) {
              if (idx !== -1 && idx !== currentLineIndex) {
                animating = true;
                animationStart = performance.now();
                startOffset = scrollOffset;
                endOffset = idx; // Target the actual line index
              }
              targetLineIndex = idx;
            }

            if (animating) {
              const now = performance.now();
              const t = Math.min(1, (now - animationStart) / animationDuration);
              scrollOffset =
                startOffset + (endOffset - startOffset) * getEaseInOut(t);
              if (t >= 1) {
                animating = false;
                currentLineIndex = endOffset; // Update currentLineIndex when animation finishes
                scrollOffset = currentLineIndex; // Ensure scrollOffset matches
              }
            } else {
              // If not animating, gradually move currentLineIndex and scrollOffset towards targetLineIndex
              // This handles seeking or song changes without full animation shock
              if (idx !== -1 && currentLineIndex !== idx) {
                // Smooth transition or direct jump
                currentLineIndex = idx;
                scrollOffset = idx;
              } else if (idx === -1) {
                // No lyric active
                currentLineIndex = -1;
                scrollOffset = 0; // Or some default position
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
              // Ctx might not exist if getContext fails
              ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform before scaling
              ctx.scale(dpr, dpr);
            }
            drawLyrics(); // Redraw after resize
          };

          // Initial setup
          resizeCanvas(); // Call once to set initial size
          window.addEventListener("resize", resizeCanvas);
          animationFrameId = requestAnimationFrame(animateLyrics); // Start animation loop

          // Store cleanup function to be called on navigating away or if page is destroyed
          this.onUnload = () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            window.removeEventListener("resize", resizeCanvas);
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
    const detailPlayButton = mainContentElement.querySelector(
      ".detail-play-button"
    );
    const detailAddToCollectionButton = mainContentElement.querySelector(
      ".detail-add-to-collection-button"
    );
    const detailUpdateButton = mainContentElement.querySelector(
      ".detail-update-button"
    );

    if (detailPlayButton && managers.playerManager && managers.uiManager) {
      detailPlayButton.addEventListener("click", () => {
        const trackInfoString = detailPlayButton.dataset.trackInfo;
        if (trackInfoString) {
          managers.playerManager.playTrackFromCard(trackInfoString);
        } else {
          console.warn(
            "Detail play button clicked, but no track-info data found."
          );
          managers.uiManager.showToast(
            "Could not play track: Missing track data.",
            "error"
          );
        }
      });
    }

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
  }
}

export default SongDetailPage;
