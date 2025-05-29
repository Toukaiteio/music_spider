import WebSocketManager from "./modules/WebSocketManager.js";
import UIManager from "./modules/UIManager.js";
import PlayerManager from "./modules/PlayerManager.js";
import NavigationManager from "./modules/NavigationManager.js";
import CollectionManager from "./modules/CollectionManager.js";
import SearchManager from "./modules/SearchManager.js";
import FavoriteManager from "./modules/FavoriteManager.js"; 
import { 
    lyricsToolHtml, 
    parseLRC, 
    renderLyricsPreview, 

    // initLyricsEditorControls // No longer needed here, NavigationManager handles it.
    loadAudioSource // Potentially needed if we load audio from script.js context
} from "./modules/LyricsEditor.js";

const applyTheme = UIManager.applyTheme;
const savedTheme = localStorage.getItem("theme") || "light-theme";
applyTheme(savedTheme);

// Assign functions to window object for potential global usage (legacy or external)
// This ensures that if any other part of the application (or developer console) 
// was relying on these functions being global, they still work.
window.parseLRC = parseLRC;
window.renderLyricsPreview = renderLyricsPreview;

document.addEventListener("DOMContentLoaded", () => {
  const webSocketManager = new WebSocketManager();
  const playerManager = new PlayerManager({
    backgroundElement: document.getElementById("background-effects"),
    coverImgElement: document.getElementById("player-album-art"),
  });
  const themeSwitcher = document.getElementById("theme-switcher");
  const body = document.body;

  const CHUNK_SIZE = 256 * 1024; // 256KB

  // Helper function to convert File to base64 string (data part only)
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result;
        // Remove the prefix 'data:*/*;base64,'
        const parts = base64String.split(',');
        if (parts.length === 2) {
          resolve(parts[1]);
        } else {
          // Handle cases where the prefix might be missing or different, though unlikely for standard files
          console.warn("Base64 string prefix not found or in unexpected format. Resolving with full string.");
          resolve(base64String); // Fallback, though backend might not like this
        }
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  // Helper function to get file extension without dot, in lowercase
  function getFileExtension(filename) {
    if (!filename || typeof filename !== 'string') {
      return '';
    }
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1 || lastDot === filename.length - 1) {
      // No extension or filename ends with a dot
      return '';
    }
    return filename.substring(lastDot + 1).toLowerCase();
  }

  // Helper function to slice a file into Blob chunks
  function sliceFile(file, chunkSize) {
      const chunks = [];
      let offset = 0;
      while (offset < file.size) {
          const chunk = file.slice(offset, offset + chunkSize);
          chunks.push(chunk);
          offset += chunkSize;
      }
      return chunks;
  }

  async function startChunkedUploadProcess(file, fileType, metadataForInit, webSocketManager, uiManager, associatedMusicId = null) {
    console.log(`Initiating ${fileType} upload...`);

    const initiatePayload = {
        filename: file.name,
        total_size: file.size,
        file_type: fileType,
        metadata: metadataForInit, // For audio: { title, artist, etc. }, For cover: { music_id_for_cover: associatedMusicId }
        chunk_size: CHUNK_SIZE 
    };

    try {
        const initResponse = await webSocketManager.sendWebSocketCommand("initiate_chunked_upload", initiatePayload);
        if (!initResponse || !initResponse.data || !initResponse.data.upload_session_id) {
            UIManager.showToast(`Failed to initiate ${fileType} upload session: ${initResponse.error || 'Unknown error'}`, "error");
            return { success: false, error: `Failed to initiate ${fileType} upload session.` };
        }

        const { upload_session_id, actual_chunk_size = CHUNK_SIZE } = initResponse.data;
        // UIManager.showToast(`${fileType} upload session started: ${upload_session_id}`, "info");

        const chunks = sliceFile(file, actual_chunk_size);
        const total_chunks = chunks.length;

        for (let i = 0; i < total_chunks; i++) {
            const chunk = chunks[i];
            // fileToBase64 already returns only the data part.
            const base64ChunkData = await fileToBase64(chunk); 

            const chunkPayload = {
                upload_session_id,
                chunk_index: i,
                total_chunks,
                chunk_data: base64ChunkData
            };

            // Simple retry mechanism
            let attempt = 0;
            let chunkUploadSuccess = false;
            while (attempt < 3 && !chunkUploadSuccess) {
                attempt++;
                const chunkResponse = await webSocketManager.sendWebSocketCommand("upload_chunk", chunkPayload);
                if (chunkResponse && chunkResponse.code === 0) {
                    chunkUploadSuccess = true;
                    // UIManager.showToast(`Uploaded ${fileType} chunk ${i + 1}/${total_chunks}`, "info", 2000); // Short duration
                } else {
                    UIManager.showToast(`Error uploading ${fileType} chunk ${i + 1} (attempt ${attempt}/3): ${chunkResponse.error || 'Unknown error'}`, "warning", 3000);
                    if (attempt >= 3) {
                        UIManager.showToast(`Failed to upload ${fileType} chunk ${i + 1} after 3 attempts. Aborting.`, "error");
                        return { success: false, error: `Chunk ${fileType} upload failed for chunk ${i + 1}.` };
                    }
                    // Wait a bit before retrying (optional)
                    await new Promise(resolve => setTimeout(resolve, 1000)); 
                }
            }
            if (!chunkUploadSuccess) { // Should have been caught by the attempt limit, but as a safeguard
                 return { success: false, error: `Critical error in ${fileType} chunk upload logic for chunk ${i + 1}.` };
            }
        }

        // UIManager.showToast(`All ${fileType} chunks uploaded. Finalizing...`, "info");
        const finalizePayload = {
            upload_session_id,
            filename: file.name,
            total_chunks
        };

        if (fileType === "audio") {
            finalizePayload.metadata = metadataForInit; 
        } else if (fileType === "cover" && associatedMusicId) {
            // For cover, the key 'music_id' is used to associate with existing track.
            // 'metadataForInit' for cover ( { music_id_for_cover: associatedMusicId } ) was used for initiation.
            // The finalize command for cover might just need the music_id.
            finalizePayload.music_id = associatedMusicId; 
        }

        const finalResponse = await webSocketManager.sendWebSocketCommand("finalize_chunked_upload", finalizePayload);
        if (!finalResponse || finalResponse.code !== 0) {
            UIManager.showToast(`Failed to finalize ${fileType} upload: ${finalResponse.error || 'Unknown error'}`, "error");
            return { success: false, error: `Finalization of ${fileType} upload failed.` };
        }

        UIManager.showToast(`${fileType} upload finalized successfully!`, "success");
        return { success: true, data: finalResponse.data };

    } catch (error) {
        console.error(`Error during ${fileType} chunked upload process:`, error);
        UIManager.showToast(`A critical error occurred during ${fileType} upload: ${error.message || 'Unknown error'}`, "error");
        return { success: false, error: `Critical error in ${fileType} upload process.` };
    }
  }

  if (themeSwitcher) {
    themeSwitcher.addEventListener("click", () => {
      const currentTheme = body.classList.contains("dark-theme")
        ? "dark-theme"
        : "light-theme";
      const newTheme =
        currentTheme === "dark-theme" ? "light-theme" : "dark-theme";
      applyTheme(newTheme);
    });
  }
  if (!localStorage.getItem("favSongs")) {
    localStorage.setItem("favSongs", "[]");
  }

  const taskQueueButton = document.getElementById("task-queue-button");
  const expandedTaskQueue = document.getElementById("expanded-task-queue");

  if (taskQueueButton && expandedTaskQueue) {
    taskQueueButton.addEventListener("click", (event) => {
      event.stopPropagation(); 
      const isVisible = expandedTaskQueue.classList.toggle("visible");
      expandedTaskQueue.setAttribute("aria-hidden", !isVisible);
    });

    document.addEventListener("click", (event) => {
      if (
        expandedTaskQueue.classList.contains("visible") &&
        !taskQueueButton.contains(event.target) &&
        !expandedTaskQueue.contains(event.target)
      ) {
        expandedTaskQueue.classList.remove("visible");
        expandedTaskQueue.setAttribute("aria-hidden", "true");
      }
    });
  }

  const drawerToggleButton = document.getElementById("drawer-toggle-button");
  const mainDrawer = document.getElementById("main-drawer");
  const drawerToggleIcon = drawerToggleButton
    ? drawerToggleButton.querySelector(".material-icons")
    : null;

  if (drawerToggleButton && mainDrawer && drawerToggleIcon) {
    const setDrawerState = (isCollapsed) => {
      mainDrawer.classList.toggle("collapsed", isCollapsed);
      drawerToggleIcon.textContent = isCollapsed ? "menu_open" : "menu";
      localStorage.setItem("drawerCollapsed", isCollapsed);
    };
    const savedDrawerState = localStorage.getItem("drawerCollapsed") === "true";
    setDrawerState(savedDrawerState);
    drawerToggleButton.addEventListener("click", () => {
      const isCollapsed = mainDrawer.classList.contains("collapsed");
      setDrawerState(!isCollapsed);
    });
  }

  const mainContent = document.getElementById("main-content");
  
  window.appState = {
    searchResults: [],
    searchQuery: "",
    searchError: null,
    downloadQueue: [],
    library: [], 
    currentSongDetail: null, 
    collectionDialogMode: "add_song", 
    editingCollectionName: null,
    isUploadPageActive: false, 
    droppedFile: null,         
    parsedMetadata: null,      
    selectedCoverBase64: null, 
  };

  const pageContents = {
    home: `
       <div id="home-page">
           <h2>My Library</h2>
           <div id="home-loading-message" style="display:none; text-align:center; padding: 20px;">Loading your library...</div>
           <div id="song-card-grid">
               <!-- Song cards will be dynamically inserted here by JS -->
           </div>
           <div id="no-songs-message" style="display:none;">
               <p>Your library is empty. Use the search bar in the header to find and download music.</p>
           </div>
       </div>
   `,
    collections: `
            <div id="collections-page">
                <h2 id="collection-name">My Music Collections</h2>
                <div id="collections-loading-message" style="text-align:center; padding: 20px; display:none;">Loading...</div>
                <div id="song-card-grid" class="collections-song-grid" style="display:none;"></div>
                <div id="collections-no-music-message" style="display:none; text-align:center; padding: 20px;">
                    <p>Select a playlist from the drawer, or create a new one.</p>
                </div>
            </div>
        `,
    "collection-detail": `
            <div id="collections-page"> <!-- Re-uses collections page structure -->
                <h2 id="collection-name">Collection Name</h2>
                <div id="collections-loading-message" style="text-align:center; padding: 20px; display:none;">Loading...</div>
                <div id="song-card-grid" class="collections-song-grid" style="display:none;"></div>
                <div id="collections-no-music-message" style="display:none; text-align:center; padding: 20px;">
                    <p>This playlist is empty.</p>
                </div>
            </div>
    `,
    "song-detail": `
            <div id="song-detail-page">
                <button id="song-detail-back-button" class="icon-button" aria-label="Go Back" style="position: absolute; top: 0px; left: 0px; z-index: 10;"><span class="material-icons">arrow_back</span></button>
                <div class="song-detail-left">
                    <img src="placeholder_album_art.png" alt="Album Art" id="detail-cover-art">
                    <h2 id="detail-title">Track Title</h2>
                    <p id="detail-artist">Artist Name</p>
                    <p id="detail-description">Full song description here...</p>
                    <div id="detail-action-buttons">
                        <button class="detail-play-button icon-button"><span class="material-icons">play_arrow</span></button>
                        <button class="detail-add-to-collection-button icon-button"><span class="material-icons">playlist_add</span></button>
                        <button class="detail-update-button icon-button" aria-label="Update Track Info"><span class="material-icons">edit</span></button>
                    </div>
                </div>
                <div class="song-detail-right">
                    <div id="lyrics-display-area">
                        <p>暂无歌词</p>
                    </div>
                    <button id="upload-lyrics-button" class="icon-button" style="display: none;">
                        <span class="material-icons">upload_file</span>
                    </button>
                </div>
            </div>
        `,
    "search-results": `
            <div id="search-results-page">
                <h2>Search Results</h2>
                <p id="search-results-info">Showing results for: <strong id="search-results-query"></strong></p>
                <div id="search-results-container">
                    <!-- Results will be injected here -->
                </div>
                <div id="no-search-results-message" style="display:none;">
                    <p>No results found for your query.</p>
                </div>
                <div id="search-loading-message" style="display:none;">
                    <p>Searching...</p>
                </div>
                <div id="search-error-message" style="display:none;">
                    <p>Sorry, an error occurred while searching. Please try again later.</p>
                </div>
            </div>
          `,
    "update-track": `
            <div id="update-track-page">
                <h2>Update Track Information</h2>
                <div id="update-track-form"> 
                    <input type="hidden" id="update-music-id" name="music_id">
                    <div class="form-columns-wrapper" style="display: flex; gap: 20px;width:100%;">
                        <div class="form-column-left" style="flex: 1;">
                            <div class="form-section">
                                <h3>Track Metadata</h3>
                                <div>
                                    <label for="update-title">Title:</label>
                                    <input type="text" id="update-title" name="title" required>
                                </div>
                                <div>
                                    <label for="update-artist">Artist:</label>
                                    <input type="text" id="update-artist" name="artist" required>
                                </div>
                                <div>
                                    <label for="update-album">Album:</label>
                                    <input type="text" id="update-album" name="album">
                                </div>
                            </div>
                            <div class="form-section">
                                <h3>Cover Art</h3>
                                <div class="cover-upload-area">
                                    <input type="file" id="update-cover-file-input" name="cover_file" accept="image/*" style="display: none;">
                                    <input type="hidden" id="update-cover-ext" name="cover_ext">
                                    <button type="button" id="update-cover-upload-button" class="cover-upload-button">
                                        <span class="material-icons initial-icon">add_photo_alternate</span>
                                        <img src="#" alt="Cover Preview" class="cover-preview-image" style="display: none;">
                                    </button>
                                    <p class="cover-upload-hint">Click to upload new cover image.</p>
                                </div>
                            </div>
                            <div class="form-section">
                                <h3>Description</h3>
                                <div>
                                    <label for="update-description">Track Description:</label>
                                    <textarea id="update-description" name="description" rows="4"></textarea>
                                </div>
                            </div>
                        </div>
                        <div class="form-column-right" style="flex: 1;">
                            <div class="lyrics-tool-container-wrapper"> <!-- Wrapper for consistent styling if needed -->
                                ${lyricsToolHtml} 
                            </div>
                            <div class="form-section">
                                <h3>Categorization & Details</h3>
                                <div>
                                    <label for="update-genre">Genre:</label>
                                    <input type="text" id="update-genre" name="genre">
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="button" id="save-track-update-button" class="dialog-button primary">Save Changes</button>
                        <button type="button" id="cancel-track-update-button" class="dialog-button secondary">Cancel</button>
                    </div>
                </div> 
            </div>
        `,
    "upload-track": `
            <div id="upload-track-page">
                <h2>Upload New Track</h2>
                <div id="upload-file-info" style="margin-bottom:15px; padding:10px; background-color: var(--primary-bg-color); border-radius: 5px;">
                    Audio file: <span id="upload-filename-placeholder">No file selected</span>
                </div>
                <div id="upload-track-form"> 
                    <input type="hidden" id="upload-original-filepath" name="original_filepath">
                    <div class="form-columns-wrapper" style="display: flex; gap: 20px;width:100%;">
                        <div class="form-column-left" style="flex: 1;">
                            <div class="form-section">
                                <h3>Track Metadata</h3>
                                <div>
                                    <label for="upload-title">Title:</label>
                                    <input type="text" id="upload-title" name="title" required>
                                </div>
                                <div>
                                    <label for="upload-artist">Artist:</label>
                                    <input type="text" id="upload-artist" name="artist" required>
                                </div>
                                <div>
                                    <label for="upload-album">Album:</label>
                                    <input type="text" id="upload-album" name="album">
                                </div>
                            </div>
                            <div class="form-section">
                                <h3>Cover Art</h3>
                                <div class="cover-upload-area">
                                    <label for="upload-cover-file-input">Cover Image (Optional):</label>
                                    <input type="file" id="upload-cover-file-input" name="cover_file" accept="image/*" style="display: none;">
                                    <input type="hidden" id="upload-cover-ext" name="cover_ext">
                                    <button type="button" id="upload-cover-upload-button" class="cover-upload-button">
                                        <span class="material-icons initial-icon">add_photo_alternate</span>
                                        <img src="#" alt="Cover Preview" class="cover-preview-image" style="display: none;">
                                    </button>
                                    <p class="cover-upload-hint">Click to upload or drag & drop cover image</p>
                                </div>
                            </div>
                            <div class="form-section">
                                <h3>Description</h3>
                                <div>
                                    <label for="upload-description">Track Description:</label>
                                    <textarea id="upload-description" name="description" rows="4"></textarea>
                                </div>
                            </div>
                        </div>
                        <div class="form-column-right" style="flex: 1;">
                            <div class="lyrics-tool-container-wrapper"> <!-- Wrapper for consistent styling -->
                                ${lyricsToolHtml}
                            </div>
                            <div class="form-section"> 
                                <h3>Categorization</h3>
                                <div>
                                    <label for="upload-genre">Genre:</label>
                                    <input type="text" id="upload-genre" name="genre">
                                </div>
                            </div>

                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="button" id="submit-upload-button" class="dialog-button primary">Upload Track</button>
                        <button type="button" id="cancel-upload-button" class="dialog-button secondary">Cancel</button>
                    </div>
                </div> 
            </div>
        `,
  };

  const navigationManager = new NavigationManager({
    mainContentElement: mainContent,
    drawerLinksSelector: ".drawer-link", 
    pageContents: pageContents,
    webSocketManager: webSocketManager,
    playerManager: playerManager,
    uiManager: UIManager,
    appState: window.appState,
  });

  const collectionManager = new CollectionManager({
    navigationManager: navigationManager, 
    appState: window.appState, 
  });
  collectionManager.init(); 

  const searchManager = new SearchManager({
    webSocketManager: webSocketManager,
    navigationManager: navigationManager, 
    appState: window.appState,
    uiManager: UIManager, 
  });
  
  const favoriteManager = new FavoriteManager();

  navigationManager.setSearchManager(searchManager);
  navigationManager.setFavoriteManager(favoriteManager);
  navigationManager.setCollectionManager(collectionManager); 
  searchManager.setFavoriteManager(favoriteManager);
  
  navigationManager.init(); 
  searchManager.init(); 

  const dragOverlay = document.getElementById('drag-overlay');

  window.addEventListener('dragenter', (event) => {
    event.preventDefault();
    if (window.appState.isUploadPageActive) return; 
    if (dragOverlay) dragOverlay.style.display = 'flex';
  });

  window.addEventListener('dragover', (event) => {
    event.preventDefault(); 
  });

  window.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget || event.relatedTarget.nodeName === "HTML") {
        if (dragOverlay) dragOverlay.style.display = 'none';
    }
  });

  window.addEventListener('drop', (event) => {
    event.preventDefault();
    if (dragOverlay) dragOverlay.style.display = 'none';
    if (window.appState.isUploadPageActive) { 
        console.log("Drop event on upload page, likely for cover art, ignoring for new track upload.");
        return; 
    }

    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('audio/')) {
            window.appState.droppedFile = file;
            window.jsmediatags.read(file, {
                onSuccess: (tag) => {
                    const tags = tag.tags;
                    window.appState.parsedMetadata = {
                        title: tags.title || '',
                        artist: tags.artist || '',
                        album: tags.album || '',
                        year: tags.year || '',
                        genre: tags.genre || '',
                        picture: tags.picture || null, 
                        lyrics: tags.lyrics ? (typeof tags.lyrics === 'string' ? tags.lyrics : tags.lyrics.lyrics) : null 
                    };
                    navigationManager.navigateTo("upload-track", "Upload New Track", "#upload-track");
                },
                onError: (error) => {
                    console.warn('jsmediatags error:', error);
                    window.appState.parsedMetadata = { title: file.name.replace(/\.[^/.]+$/, "") }; 
                    navigationManager.navigateTo("upload-track", "Upload New Track", "#upload-track");
                }
            });
        } else {
            UIManager.showToast("Not an audio file. Please drop an audio file.", "error");
        }
    }
  });

  mainContent.addEventListener('change', function(event) {
    if (event.target.id === 'upload-cover-file-input' || event.target.id === 'update-cover-file-input') {
        const file = event.target.files[0];
        const isUpdatePage = event.target.id === 'update-cover-file-input';
        const previewButton = isUpdatePage 
            ? document.getElementById('update-cover-upload-button') 
            : document.getElementById('upload-cover-upload-button');

        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                if (previewButton) {
                    const imgElement = previewButton.querySelector('.cover-preview-image');
                    const iconElement = previewButton.querySelector('.initial-icon');
                    if (imgElement) {
                        imgElement.src = e.target.result;
                        imgElement.style.display = 'block';
                    }
                    if (iconElement) {
                        iconElement.style.display = 'none';
                    }
                }
                window.appState.selectedCoverBase64 = e.target.result; // Full Data URL for preview
                const extension = getFileExtension(file.name); // Extension without dot, lowercase
                window.appState.selectedCoverFileObject = file; // Store the File object

                window.appState.selectedCoverExt = extension;

                if (isUpdatePage) {
                    window.appState.newCoverSelectedForUpdate = true;
                    const updateCoverExtInput = document.getElementById('update-cover-ext');
                    if (updateCoverExtInput) {
                        updateCoverExtInput.value = extension;
                    }
                } else { // Upload page
                    const uploadCoverExtInput = document.getElementById('upload-cover-ext');
                    if (uploadCoverExtInput) {
                        uploadCoverExtInput.value = extension;
                    }
                }
            };
            reader.readAsDataURL(file);
        } else if (file) { // File selected but not an image
            UIManager.showToast("Please select an image file for the cover.", "error");
            window.appState.selectedCoverBase64 = null;
            window.appState.selectedCoverExt = null;
            window.appState.selectedCoverFileObject = null; // Clear File object
            if (isUpdatePage) {
                window.appState.newCoverSelectedForUpdate = false;
                const updateCoverExtInput = document.getElementById('update-cover-ext');
                if (updateCoverExtInput) updateCoverExtInput.value = '';
            } else { // Upload page
                const uploadCoverExtInput = document.getElementById('upload-cover-ext');
                if (uploadCoverExtInput) uploadCoverExtInput.value = '';
            }
            if (previewButton) {
                const imgElement = previewButton.querySelector('.cover-preview-image');
                const iconElement = previewButton.querySelector('.initial-icon');
                if (imgElement) {
                    imgElement.src = "#";
                    imgElement.style.display = 'none';
                }
                if (iconElement) {
                    iconElement.style.display = 'block'; // Show icon again
                }
            }
            event.target.value = '';
        }
    }
});

  mainContent.addEventListener('input', function(event) {
    if (event.target.id === 'lrc-input-area') {
        const lrcText = event.target.value;
        const parsed = parseLRC(lrcText); // Use imported function
        renderLyricsPreview(parsed, '#lrc-preview-area'); // Use imported function
    }
  });


  mainContent.addEventListener("click", function (event) {
    const playButton = event.target.closest(".play-on-card-button");
    const artContainer = event.target.closest(".card-art-container");
    const addToCollectionButton = event.target.closest(
      ".add-to-collection-button"
    );
    const favoriteButton = event.target.closest(".favorite-button"); 
    const inlineLink = event.target.closest(".inline-link"); 
    const addToDownloadQueueButton = event.target.closest(
      ".add-to-download-queue-button"
    );
    const deleteTrackButton = event.target.closest(".delete-track-button"); 

    if (playButton) {
      const trackInfoString = playButton.dataset.trackInfo;
      if (trackInfoString) {
        try {
          const trackInfo = JSON.parse(trackInfoString);
          document.getElementById("player-track-title").textContent =
            trackInfo.title || "Unknown Title";
          document.getElementById("player-track-artist").textContent =
            trackInfo.author || trackInfo.artist_name || "Unknown Artist";
          playerManager.playTrackById(trackInfo.music_id);
          UIManager.setPlayerVisibility(true); 
          const playerPlayPauseButton = document.getElementById("player-play-pause-button"); 
          if (playerPlayPauseButton) {
            const playPauseIcon = playerPlayPauseButton.querySelector(".material-icons");
            if (playPauseIcon) playPauseIcon.textContent = "pause_arrow"; 
          }
        } catch (e) {
          console.error("Failed to parse track info for play button:", e);
        }
      } else {
        console.warn("Play button clicked, but no track-info data found.");
      }
    } else if (
      artContainer &&
      !event.target.closest(".play-on-card-button") &&
      !event.target.closest(".add-to-collection-button")
    ) {
      const songCard = artContainer.closest(".song-card");
      if (songCard && navigationManager.getCurrentPageId() !== "search-results") {
        const trackInfoString =
          songCard.querySelector(".play-on-card-button")?.dataset.trackInfo ||
          songCard.querySelector(".add-to-collection-button")?.dataset
            .trackInfo ||
          songCard.dataset.trackInfo;
        if (trackInfoString) {
          try {
            const trackObject = JSON.parse(trackInfoString);
            window.appState.currentSongDetail = trackObject;
            navigationManager.navigateToSongDetail(trackObject);
          } catch (e) {
            console.error(
              "Failed to parse track info for song detail navigation:",
              e
            );
          }
        } else {
          console.warn("Could not find track-info for song detail navigation.");
        }
      }
    }

    if (deleteTrackButton) {
      const musicId = deleteTrackButton.dataset.songId;
      if (musicId) {
        webSocketManager.sendWebSocketCommand("delete_track", { music_id: musicId })
          .then(() => {
            const songCardToRemove = document.querySelector(`.song-card[data-song-id="${musicId}"]`);
            if (songCardToRemove) {
              songCardToRemove.remove();
              if (window.appState && window.appState.library) {
                window.appState.library = window.appState.library.filter(track => String(track.music_id || track.id) !== String(musicId));
                if (window.appState.library.length === 0) {
                    const noSongsMessage = document.getElementById('no-songs-message');
                    if (noSongsMessage) noSongsMessage.style.display = 'block';
                }
              }
            }
          })
          .catch(error => {
            console.error(`Error sending delete_track command for ${musicId}:`, error);
          });
      } else {
        console.warn("Delete button clicked, but no song-id data found.");
      }
    }

    if (addToCollectionButton) {
      const songIdForCollection = addToCollectionButton.dataset.songId;
      const trackInfoString = addToCollectionButton.dataset.trackInfo; 
      if (songIdForCollection) {
        collectionManager.handleAddToCollectionButtonClick(songIdForCollection);
      } else if (trackInfoString) {
        try {
          const trackInfo = JSON.parse(trackInfoString);
          const id = trackInfo.music_id || trackInfo.id;
          if (id) {
            collectionManager.handleAddToCollectionButtonClick(id);
          }
        } catch (e) {
          console.error("Error parsing track_info for add to collection:", e);
        }
      }
    }

    if (favoriteButton) {
        const songId = favoriteButton.dataset.songId;
        if (songId) {
            const newStatus = favoriteManager.toggleFavorite(songId);
            const iconElement = favoriteButton.querySelector('.material-icons');
            if (iconElement) {
                iconElement.textContent = newStatus ? 'favorite' : 'favorite_border';
            }
        }
    }

    if (addToDownloadQueueButton) {
      const songCard = addToDownloadQueueButton.closest(".song-card");
      const songId = songCard ? songCard.dataset.songId : null;
      const source = songCard ? songCard.dataset.source : "unknown"; 
      const title = songCard
        ? songCard.querySelector(".song-card-title").textContent
        : "Unknown Title";
      const icon = addToDownloadQueueButton.querySelector(".material-icons");
      if (icon) {
        icon.textContent = "downloading"; 
      }
    }

    if (inlineLink && inlineLink.dataset.page) {
      event.preventDefault();
      const pageId = inlineLink.dataset.page;
      const path = inlineLink.getAttribute("href");
      const title = inlineLink.dataset.title || pageId.charAt(0).toUpperCase() + pageId.slice(1); 
      const subPageId = inlineLink.dataset.subpageid || null;
      navigationManager.navigateTo(pageId, title, path, false, subPageId); 
    }

    const detailPlayButton = event.target.closest(".detail-play-button");
    const detailAddToCollectionButton = event.target.closest(
      ".detail-add-to-collection-button"
    );
    const detailUpdateButton = event.target.closest(".detail-update-button"); 

    if (detailPlayButton) {
      const trackInfoString = detailPlayButton.dataset.trackInfo;
      if (trackInfoString) {
        try {
          const trackInfo = JSON.parse(trackInfoString);
          document.getElementById("player-track-title").textContent =
            trackInfo.title || "Unknown Title";
          document.getElementById("player-track-artist").textContent =
            trackInfo.author || trackInfo.artist_name || "Unknown Artist";
          UIManager.setPlayerVisibility(true); 
          playerManager.playTrackById(trackInfo.music_id);
           const playerPlayPauseButton = document.getElementById("player-play-pause-button"); 
           if (playerPlayPauseButton) {
            const playPauseIcon = playerPlayPauseButton.querySelector(".material-icons");
            if (playPauseIcon) playPauseIcon.textContent = "pause_arrow";
           }
        } catch (e) {
          console.error(
            "Failed to parse track info for detail play button:",
            e
          );
        }
      }
    }

    if (detailAddToCollectionButton) {
      const songId = detailAddToCollectionButton.dataset.songId;
      if (songId) {
        collectionManager.handleAddToCollectionButtonClick(songId);
      } else {
        const trackInfoString = detailAddToCollectionButton.dataset.trackInfo;
        if (trackInfoString) {
          try {
            const trackInfo = JSON.parse(trackInfoString);
            const id = trackInfo.music_id || trackInfo.id;
            if (id) {
              collectionManager.handleAddToCollectionButtonClick(id);
            }
          } catch (e) {
            console.error("Error parsing track_info for detail add to collection:", e);
          }
        }
      }
    }

    if (detailUpdateButton) {
        if (window.appState && window.appState.currentSongDetail) {
            const trackToUpdate = window.appState.currentSongDetail;
            const musicId = trackToUpdate.music_id || trackToUpdate.id; 
            if (musicId) {
                navigationManager.navigateTo(
                    "update-track", 
                    "Update " + (trackToUpdate.title || "Track"), 
                    "#update-track/" + musicId, 
                    false, 
                    musicId 
                );
            } else {
                UIManager.showToast("Error: Music ID is missing. Cannot update track.", "error");
            }
        } else {
            UIManager.showToast("Could not load track details for update. Please try again.", "error");
        }
    }

    const saveUpdateButton = event.target.closest("#save-track-update-button");
    const cancelUpdateButton = event.target.closest("#cancel-track-update-button");
    const submitUploadButton = event.target.closest("#submit-upload-button");
    const cancelUploadButton = event.target.closest("#cancel-upload-button");
    const lrcPreviewArea = event.target.closest("#lrc-preview-area");


    if (saveUpdateButton) {
        event.preventDefault();
        console.log("Save Changes button clicked - handler entered");
        const form = document.getElementById("update-track-form");
        if (!form) {
            console.error("Update form (#update-track-form) not found in the DOM!");
            UIManager.showToast("Critical error: Update form not found.", "error");
            return;
        }
        // The original 'if (form)' is now handled by the explicit check above.
        // Proceeding with form processing logic directly.
        const musicId = form.querySelector("#update-music-id").value;
            const title = form.querySelector("#update-title").value.trim();
            const artist = form.querySelector("#update-artist").value.trim();

            if (!title || !artist) {
                UIManager.showToast("Title and Artist cannot be empty.", "error");
                return;
            }

            const initialData = window.appState.editingTrackInitialData || {};
            const payload = { music_id: musicId };
            let hasChanges = false;

            // Define fields to check and their form element IDs and initial data keys
            const fieldsToCompare = [
                { formId: "#update-title", payloadKey: "title", initialKey: "title" },
                { formId: "#update-artist", payloadKey: "author", initialKey: "author" }, // Backend expects 'author'
                { formId: "#update-album", payloadKey: "album", initialKey: "album_name", altInitialKey: "album" },
                { formId: "#update-genre", payloadKey: "genre", initialKey: "genre" },
                { formId: "#update-description", payloadKey: "description", initialKey: "description" },
                { formId: "#lrc-input-area", payloadKey: "lyrics", initialKey: "lyrics" }
            ];

            fieldsToCompare.forEach(field => {
                const formElement = form.querySelector(field.formId);
                if (formElement) {
                    const currentValue = formElement.value.trim();
                    let initialValue = initialData[field.initialKey];
                    if (field.altInitialKey && initialValue === undefined) {
                        initialValue = initialData[field.altInitialKey];
                    }
                    initialValue = initialValue || ""; // Treat null/undefined initial values as empty string for comparison

                    if (currentValue !== initialValue) {
                        payload[field.payloadKey] = currentValue;
                        hasChanges = true;
                    }
                }
            });
            
            // Always include title and author if they are not empty, even if not "changed" from an empty initial state
            // This ensures they are sent if they were initially null/empty but now have values.
            if (title && !payload.title) payload.title = title;
            if (artist && !payload.author) payload.author = artist;

            // Cover image handling
            if (window.appState.newCoverSelectedForUpdate && window.appState.selectedCoverBase64 && window.appState.selectedCoverExt) {
                const base64Parts = window.appState.selectedCoverBase64.split(',');
                if (base64Parts.length === 2) {
                    payload.cover_binary = base64Parts[1];
                    payload.cover_ext = window.appState.selectedCoverExt;
                    hasChanges = true;
                    // Optionally populate the hidden form field, though not strictly needed if sending in payload
                    const coverExtInput = form.querySelector("#update-cover-ext");
                    if (coverExtInput) coverExtInput.value = window.appState.selectedCoverExt;
                } else {
                    console.warn("Invalid base64 string format for cover image.");
                }
            }

            if (!hasChanges) {
                UIManager.showToast("No changes detected to save.", "info");
                return;
            }
            
            // Ensure mandatory fields (title, author) are in payload if they have values,
            // even if not strictly "changed" from an empty initial state but were filled by user.
            if (!payload.title && title) payload.title = title;
            if (!payload.author && artist) payload.author = artist;


            webSocketManager.sendWebSocketCommand("update_track_info", payload)
                .then((response) => {
                    if (response.code === 0) {
                        UIManager.showToast("Track updated successfully!", "success");
                        
                        // Create an updated track object based on payload for local state update
                        const updatedTrackDataForState = { ...initialData }; // Start with initial
                        for (const key in payload) {
                            if (key === "author") updatedTrackDataForState["author"] = payload[key];
                            else if (key === "album") updatedTrackDataForState["album_name"] = payload[key]; // Assuming store uses album_name
                            else if (key !== "music_id" && key !== "cover_binary" && key !== "cover_ext") { // Don't store binary in appState
                                updatedTrackDataForState[key] = payload[key];
                            }
                        }
                        // If cover was updated, backend will provide new cover_path. We might need to refresh or use a placeholder.
                        // For now, if a cover was sent, we can anticipate the detail page might need to show it.
                        // The navigation to song-detail should ideally handle fetching the latest track details or use current appState.

                        if (window.appState && window.appState.library) {
                            const index = window.appState.library.findIndex(track => String(track.music_id || track.id) === String(musicId));
                            if (index !== -1) {
                                // Merge changes. If new cover was uploaded, cover_path might change,
                                // so a full refresh or specific update of cover_path would be ideal.
                                // For now, merge known fields. Backend response might include full updated track.
                                window.appState.library[index] = { ...window.appState.library[index], ...updatedTrackDataForState };
                                if (payload.cover_ext) { // If a new cover was sent
                                    // We don't know the new path yet from frontend alone.
                                    // A full re-fetch or response from backend is needed for cover_path.
                                    // Forcing a refresh on song-detail might be an option or rely on backend sending full object.
                                    // For now, let's assume backend response would be used if it contained the full object.
                                    // Or, we can mark it to be reloaded.
                                }
                            }
                        }
                        if (window.appState && window.appState.currentSongDetail && String(window.appState.currentSongDetail.music_id || window.appState.currentSongDetail.id) === String(musicId)) {
                            window.appState.currentSongDetail = { ...window.appState.currentSongDetail, ...updatedTrackDataForState };
                             if (payload.cover_ext && response.data && response.data.cover_path) { // Example: if backend sends back new path
                                window.appState.currentSongDetail.cover_path = response.data.cover_path;
                            }
                        }
                        // NavigationManager will clear editingTrackInitialData, etc. on successful navigation
                        navigationManager.navigateTo("song-detail", updatedTrackDataForState.title || "Track Detail", "#song-detail/" + musicId, false, musicId);
                    } else {
                        UIManager.showToast(response.message || "Failed to update track.", "error");
                    }
                })
                .catch(error => { // Only one .catch block needed for the promise chain
                    UIManager.showToast("Error updating track: " + (error.message || "Unknown error"), "error");
                });
    } else if (cancelUpdateButton) {
        history.back(); // NavigationManager will handle clearing update-track state
    }

    if (submitUploadButton) {
      event.preventDefault();
      const form = document.getElementById("upload-track-form");
      if (!form) {
        UIManager.showToast("Critical error: Upload form not found.", "error");
        return;
      }

      (async () => {
        try {
          // 1. 校验音频文件和表单字段
          const audioFile = window.appState.droppedFile;
          if (!audioFile) {
            UIManager.showToast("No audio file has been selected or dropped.", "error");
            return;
          }
          const title = form.querySelector("#upload-title").value.trim();
          const artist = form.querySelector("#upload-artist").value.trim();
          if (!title || !artist) {
            UIManager.showToast("Title and Artist fields are required.", "error");
            return;
          }

          // 2. 禁用按钮防止重复提交
          submitUploadButton.disabled = true;
          submitUploadButton.textContent = "Uploading...";

          // 3. 构建音频元数据
          const audioMetadata = {
            title,
            author: artist,
            album_name: form.querySelector("#upload-album").value.trim(),
            genre: form.querySelector("#upload-genre").value.trim(),
            description: form.querySelector("#upload-description").value.trim(),
            lyrics: form.querySelector("#lrc-input-area")?.value.trim() || null,
            original_filename: audioFile.name
          };

          // 4. 上传音频文件（分片）
          const audioUploadResult = await startChunkedUploadProcess(
            audioFile, "audio", audioMetadata, webSocketManager, UIManager
          );
          if (!audioUploadResult?.success) {
            UIManager.showToast(audioUploadResult.error || "Audio upload failed.", "error");
            return;
          }

          // 5. 处理音乐ID和封面
          let finalTrackData = audioUploadResult.data?.track_data || null;
          const newMusicId = finalTrackData?.music_id || null;

          // 5.1 如果标签中有图片，转为File对象
          const tagPic = window.appState.parsedMetadata?.picture;
          if (tagPic?.data && tagPic?.format) {
            const ext = tagPic.format.split('/')[1] || 'jpg';
            const file = new File([new Uint8Array(tagPic.data)], `cover_from_tag.${ext}`, { type: tagPic.format });
            window.appState.selectedCoverFileObject = file;
            window.appState.selectedCoverExt = ext;
            const reader = new FileReader();
            reader.onload = e => window.appState.selectedCoverBase64 = e.target.result;
            reader.readAsDataURL(file);
          }

          // 5.2 上传封面（如果有）
          if (window.appState.selectedCoverFileObject && newMusicId && !audioMetadata.cover_binary_on_finalize) {
            const coverUploadResult = await startChunkedUploadProcess(
              window.appState.selectedCoverFileObject, "cover", {}, webSocketManager, UIManager, newMusicId
            );
            if (!coverUploadResult?.success) {
              UIManager.showToast(coverUploadResult.error || "Cover upload failed. Audio was saved.", "warning");
            } else if (coverUploadResult.data?.cover_path && finalTrackData) {
              finalTrackData.cover_path = coverUploadResult.data.cover_path;
              UIManager.showToast("Cover uploaded successfully!", "success");
            }
          } else if (newMusicId && audioMetadata.cover_binary_on_finalize) {
            UIManager.showToast("Audio and initial cover uploaded successfully!", "success");
          } else if (!newMusicId && window.appState.selectedCoverFileObject) {
            UIManager.showToast("Audio upload succeeded but could not get Music ID to attach cover.", "warning");
          } else {
            UIManager.showToast("Audio uploaded successfully!", "success");
          }

          // 6. 清理状态和UI
          window.appState.droppedFile = null;
          window.appState.parsedMetadata = null;
          window.appState.selectedCoverBase64 = null;
          window.appState.selectedCoverExt = null;
          window.appState.selectedCoverFileObject = null;

          const previewButton = document.getElementById('upload-cover-upload-button');
          if (previewButton) {
            const imgElement = previewButton.querySelector('.cover-preview-image');
            const iconElement = previewButton.querySelector('.initial-icon');
            if (imgElement) { imgElement.src = "#"; imgElement.style.display = 'none'; }
            if (iconElement) iconElement.style.display = 'block';
          }
          const uploadCoverExtInput = document.getElementById('upload-cover-ext');
          if (uploadCoverExtInput) uploadCoverExtInput.value = '';
          const filenamePlaceholder = document.getElementById('upload-filename-placeholder');
          if (filenamePlaceholder) filenamePlaceholder.textContent = "No file selected";
          const lrcInput = document.getElementById('lrc-input-area');
          if (lrcInput) lrcInput.value = '';
          const lrcPreview = document.getElementById('lrc-preview-area');
          if (lrcPreview) lrcPreview.innerHTML = 'Lyrics preview will appear here.';

          // 7. 恢复按钮状态并跳转
          submitUploadButton.disabled = false;
          submitUploadButton.textContent = "Upload Track";
          navigationManager.navigateTo("home", "Home", "#home");

        } catch (error) {
          UIManager.showToast("Upload failed: " + (error.message || "Unknown error"), "error");
          submitUploadButton.disabled = false;
          submitUploadButton.textContent = "Upload Track";
        }
      })();

    } else if (cancelUploadButton) {
      // 清理状态和UI
      window.appState.droppedFile = null;
      window.appState.parsedMetadata = null;
      window.appState.selectedCoverBase64 = null;
      window.appState.selectedCoverExt = null;
      window.appState.selectedCoverFileObject = null;
      const form = document.getElementById('upload-track-form');
      if (form) form.reset();
      const previewButton = document.getElementById('upload-cover-upload-button');
      if (previewButton) {
        const imgElement = previewButton.querySelector('.cover-preview-image');
        const iconElement = previewButton.querySelector('.initial-icon');
        if (imgElement) { imgElement.src = "#"; imgElement.style.display = 'none'; }
        if (iconElement) iconElement.style.display = 'block';
      }
      const filenamePlaceholder = document.getElementById('upload-filename-placeholder');
      if (filenamePlaceholder) filenamePlaceholder.textContent = "No file selected";
      const lrcInput = document.getElementById('lrc-input-area');
      if (lrcInput) lrcInput.value = '';
      const lrcPreview = document.getElementById('lrc-preview-area');
      if (lrcPreview) lrcPreview.innerHTML = 'Lyrics preview will appear here.';
      history.back();
    }

    // Removed lyricsSimulatePlayButton and lyricsResetSimulationButton listeners,
    // as they are now initialized within LyricsEditor.js by initLyricsEditorControls,
    // which is called by NavigationManager when the relevant pages are loaded.
    // The old startMockPlayback and resetMockPlayback were for LRC text simulation,
    // the new audio controls in LyricsEditor.js handle actual audio.

    if (lrcPreviewArea && event.target.closest('.lyric-line')) {
        const clickedLineElement = event.target.closest('.lyric-line');
        const lrcInputArea = document.getElementById('lrc-input-area');
        if (clickedLineElement && lrcInputArea) {
            let clickedLineText = "";
            const wordSpans = clickedLineElement.querySelectorAll('.lyric-word');
            if (wordSpans.length > 0) {
                wordSpans.forEach(span => clickedLineText += span.textContent); 
                clickedLineText = clickedLineText.trim(); 
            } else {
                clickedLineText = clickedLineElement.textContent.trim();
            }

            const fullLrc = lrcInputArea.value;
            const lines = fullLrc.split('\n');
            for(let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const timeTagMatch = line.match(/\[\d{2}:\d{2}\.\d{2,3}\]/);
                if (timeTagMatch) {
                    const textPart = line.substring(timeTagMatch[0].length).replace(/<[^>]+>/g, '').trim();
                    if (textPart === clickedLineText) {
                        const startIndex = fullLrc.indexOf(line);
                        const endIndex = startIndex + line.length;
                        lrcInputArea.focus();
                        lrcInputArea.setSelectionRange(startIndex, endIndex);
                        const textLines = lrcInputArea.value.substr(0, startIndex).split("\n").length -1;
                        const avgLineHeight = lrcInputArea.scrollHeight / lrcInputArea.value.split("\n").length;
                        lrcInputArea.scrollTop = textLines * avgLineHeight;
                        break;
                    }
                }
            }
        }
    }

  });

  const playerCoverArea = document.getElementById("player-cover-area");
  if (playerCoverArea) {
    playerCoverArea.addEventListener("click", () => {
      const currentTrack = playerManager.currentLoadedTrack;
      window.appState.currentSongDetail = currentTrack;
      const musicId = currentTrack?.bvid  || currentTrack?.music_id || currentTrack?.id;
      if (musicId) {
        navigationManager.navigateTo("song-detail", currentTrack.title || "Track Detail", "#song-detail/" + musicId, false, musicId);
      }
    });
  }
  UIManager.renderTaskQueue(); 
  UIManager.updateMainTaskQueueIcon(); 

  if (!window.test) {
    window.test = {};
  }

  if (
    typeof webSocketManager !== "undefined" &&
    webSocketManager &&
    typeof webSocketManager.sendWebSocketCommand === "function"
  ) {
    window.test.sendWebSocketCommand =
      webSocketManager.sendWebSocketCommand.bind(webSocketManager);
  } else {
    window.test.sendWebSocketCommand = () =>
      console.warn(
        "webSocketManager not found or sendWebSocketCommand is not a function."
      );
  }
  
  window.test.getLocalCollections = collectionManager ? collectionManager.getCollections.bind(collectionManager) : () => console.warn("CollectionManager not available");
  window.test.saveLocalCollections = collectionManager ? collectionManager.saveCollections.bind(collectionManager) : () => console.warn("CollectionManager not available");
  window.test.deleteLocalCollection = collectionManager ? collectionManager.deleteCollection.bind(collectionManager) : () => console.warn("CollectionManager not available");
  window.test.renderDrawerCollections = collectionManager ? collectionManager.renderDrawerCollections.bind(collectionManager) : () => console.warn("CollectionManager not available");
  window.test.openAddToCollectionDialog = (songId) => collectionManager ? collectionManager.openDialog(songId, 'add_song') : console.warn("CollectionManager not available");
  window.test.openCreateCollectionDialog = () => collectionManager ? collectionManager.openDialog(null, 'create_direct') : console.warn("CollectionManager not available");
  window.test.openEditCollectionDialog = (collectionName) => collectionManager ? collectionManager.openDialog(null, 'edit', collectionName) : console.warn("CollectionManager not available");
  window.test.getDownloadQueue = () => window.appState && window.appState.downloadQueue ? window.appState.downloadQueue : [];
  window.test.renderTaskQueue = UIManager.renderTaskQueue ? UIManager.renderTaskQueue : () => console.warn("UIManager.renderTaskQueue not found.");
  window.test.updateMainTaskQueueIcon = UIManager.updateMainTaskQueueIcon ? UIManager.updateMainTaskQueueIcon : () => console.warn("UIManager.updateMainTaskQueueIcon not found.");
  window.test.navigateTo = navigationManager ? navigationManager.navigateTo.bind(navigationManager) : () => console.warn("NavigationManager not available");

  if (
    typeof webSocketManager !== "undefined" &&
    webSocketManager &&
    typeof webSocketManager.sendWebSocketCommand === "function"
  ) {
    window.test.fetchLibrary = () =>
      webSocketManager
        .sendWebSocketCommand("get_downloaded_music", {})
        .then((r) => r.data);
  } else {
    window.test.fetchLibrary = () => {
      console.warn("webSocketManager not available.");
      return Promise.reject("webSocketManager not available.");
    };
  }

  console.log(
    "Developer test functions are available under `window.test`."
  );
});
