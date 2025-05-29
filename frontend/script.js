import WebSocketManager from "./modules/WebSocketManager.js";
import UIManager from "./modules/UIManager.js";
import PlayerManager from "./modules/PlayerManager.js";
import NavigationManager from "./modules/NavigationManager.js";
import CollectionManager from "./modules/CollectionManager.js";
import SearchManager from "./modules/SearchManager.js";
import FavoriteManager from "./modules/FavoriteManager.js";
// fileToBase64, getFileExtension, sliceFile are now used by UploadManager
import { getFileExtension } from "./modules/Utils.js"; 
import UploadManager from "./modules/UploadManager.js";
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
// window.parseLRC = parseLRC; // Now handled by LyricsEditor.js
// window.renderLyricsPreview = renderLyricsPreview; // Now handled by LyricsEditor.js

document.addEventListener("DOMContentLoaded", () => {
  const webSocketManager = new WebSocketManager();
  const playerManager = new PlayerManager({
    backgroundElement: document.getElementById("background-effects"),
    coverImgElement: document.getElementById("player-album-art"),
  });
  // const themeSwitcher = document.getElementById("theme-switcher"); // No longer needed here
  // const body = document.body; // No longer needed here for theme switcher

  const CHUNK_SIZE = 256 * 1024; // 256KB

  // startChunkedUploadProcess has been moved to UploadManager.js

  // Theme switcher logic is now handled by UIManager.initThemeSwitcher()
  UIManager.initThemeSwitcher();

  // Task Queue UI controls are now handled by UIManager.initTaskQueueControls()
  UIManager.initTaskQueueControls();

  // Task Queue UI controls are now handled by UIManager.initTaskQueueControls()
  UIManager.initTaskQueueControls();

  // Drawer controls are now handled by UIManager.initDrawerControls()
  UIManager.initDrawerControls();

  if (!localStorage.getItem("favSongs")) {
    localStorage.setItem("favSongs", "[]");
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

  const uploadManager = new UploadManager({
    webSocketManager,
    navigationManager,
    uiManager: UIManager,
    appState: window.appState,
    CHUNK_SIZE
  });

  navigationManager.setSearchManager(searchManager);
  navigationManager.setFavoriteManager(favoriteManager);
  navigationManager.setCollectionManager(collectionManager); 
  searchManager.setFavoriteManager(favoriteManager);
  
  navigationManager.init(); 
  searchManager.init(); 
  uploadManager.initDragDrop(); // Initialize drag and drop listeners

  // Global drag-drop listeners for audio files have been moved to UploadManager.initDragDrop()

  mainContent.addEventListener('change', function(event) {
    if (event.target.id === 'upload-cover-file-input') {
        // Delegate to UploadManager
        uploadManager.handleCoverFileSelect(event);
    } else if (event.target.id === 'update-cover-file-input') {
        // Delegate to NavigationManager
        navigationManager.handleUpdateCoverFileSelect(event.target);
    }
  });

  // mainContent 'input' listener for 'lrc-input-area' removed, now handled by LyricsEditor.js

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
        playerManager.playTrackFromCard(trackInfoString);
      } else {
        console.warn("Play button clicked, but no track-info data found.");
        UIManager.showToast("Could not play track: Missing track data.", "error");
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
            // window.appState.currentSongDetail = trackObject; // Removed as NavigationManager handles this
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
        navigationManager.handleDeleteTrack(musicId);
      } else {
        console.warn("Delete button clicked, but no song-id data found.");
        UIManager.showToast("Cannot delete track: Missing Music ID.", "error");
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
            UIManager.updateFavoriteIcon(favoriteButton, newStatus);
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
        playerManager.playTrackFromCard(trackInfoString);
      } else {
        console.warn("Detail play button clicked, but no track-info data found.");
        UIManager.showToast("Could not play track: Missing track data.", "error");
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
    // const lrcPreviewArea = event.target.closest("#lrc-preview-area"); // Click handled by LyricsEditor.js


    if (saveUpdateButton) {
        event.preventDefault();
        navigationManager.handleUpdateTrackSubmit();
    } else if (cancelUpdateButton) {
        navigationManager.navigateBack(); // This will also clear update-track state
    }

    if (submitUploadButton) {
      event.preventDefault();
      const form = document.getElementById("upload-track-form");
      if (form) {
        // Delegate to UploadManager
        uploadManager.handleUploadFormSubmit(form, submitUploadButton);
      } else {
        UIManager.showToast("Critical error: Upload form not found.", "error");
      }
    } else if (cancelUploadButton) {
      uploadManager.handleUploadCancel();
    }

    // Removed lyricsSimulatePlayButton and lyricsResetSimulationButton listeners,
    // as they are now initialized within LyricsEditor.js by initLyricsEditorControls,
    // which is called by NavigationManager when the relevant pages are loaded.
    // The old startMockPlayback and resetMockPlayback were for LRC text simulation,
    // the new audio controls in LyricsEditor.js handle actual audio.

    // if (lrcPreviewArea && event.target.closest('.lyric-line')) {
    //     const clickedLineElement = event.target.closest('.lyric-line');
    //     const lrcInputArea = document.getElementById('lrc-input-area');
    //     if (clickedLineElement && lrcInputArea) {
    //         let clickedLineText = "";
    //         const wordSpans = clickedLineElement.querySelectorAll('.lyric-word');
    //         if (wordSpans.length > 0) {
    //             wordSpans.forEach(span => clickedLineText += span.textContent); 
    //             clickedLineText = clickedLineText.trim(); 
    //         } else {
    //             clickedLineText = clickedLineElement.textContent.trim();
    //         }

    //         const fullLrc = lrcInputArea.value;
    //         const lines = fullLrc.split('\n');
    //         for(let i = 0; i < lines.length; i++) {
    //             const line = lines[i];
    //             const timeTagMatch = line.match(/\[\d{2}:\d{2}\.\d{2,3}\]/);
    //             if (timeTagMatch) {
    //                 const textPart = line.substring(timeTagMatch[0].length).replace(/<[^>]+>/g, '').trim();
    //                 if (textPart === clickedLineText) {
    //                     const startIndex = fullLrc.indexOf(line);
    //                     const endIndex = startIndex + line.length;
    //                     lrcInputArea.focus();
    //                     lrcInputArea.setSelectionRange(startIndex, endIndex);
    //                     const textLines = lrcInputArea.value.substr(0, startIndex).split("\n").length -1;
    //                     const avgLineHeight = lrcInputArea.scrollHeight / lrcInputArea.value.split("\n").length;
    //                     lrcInputArea.scrollTop = textLines * avgLineHeight;
    //                     break;
    //                 }
    //             }
    //         }
    //     }
    // }

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
