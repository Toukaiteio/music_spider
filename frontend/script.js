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
  setUIManagerForLyricsEditor,
  setWebSocketManagerForLyricsEditor,
} from "./modules/LyricsEditor.js";
// Removed LyricsEditor imports as they are page-specific or handled by page modules / UIManager



document.addEventListener("DOMContentLoaded", () => {
  const webSocketManager = new WebSocketManager();
  setWebSocketManagerForLyricsEditor(webSocketManager);
  setUIManagerForLyricsEditor(UIManager);
  const playerManager = new PlayerManager({
    backgroundElement: document.getElementById("background-effects"),
    coverImgElement: document.getElementById("player-album-art"),
  });

  const mainPlayer = document.getElementById("main-player");
  if (mainPlayer) {
    mainPlayer.classList.add("no-transition");
    setTimeout(() => {
      mainPlayer.classList.remove("no-transition");
    }, 100);
  }

  const CHUNK_SIZE = 256 * 1024; // 256KB

  UIManager.initTaskQueueControls();
  UIManager.initDrawerControls();
  UIManager.initGlobalMarqueeListener();
  UIManager.initAuthControls(webSocketManager);

  // Add click listener for the task queue
  const expandedTaskQueue = document.getElementById("expanded-task-queue");
  if (expandedTaskQueue) {
    expandedTaskQueue.addEventListener('click', (event) => {
        const taskItem = event.target.closest('.task-item');
        if (!taskItem) return;

        const trackInfoString = taskItem.dataset.trackInfo;
        if (!trackInfoString) {
            console.warn("Task item clicked, but no track-info data found.");
            return;
        }

        try {
            const task = JSON.parse(trackInfoString);
            const musicId = task.music_id || task.id;

            // Only allow navigation if the track is completed and exists in the library
            if (task.status === 'completed_track') {
                const libraryTrack = window.appState.library.find(t => (t.music_id || t.id) === musicId);
                if (libraryTrack) {
                    navigationManager.navigateToSongDetail(libraryTrack);
                    // Hide the task queue after navigation
                    expandedTaskQueue.classList.remove('visible');
                    expandedTaskQueue.setAttribute('aria-hidden', 'true');
                } else {
                    UIManager.showToast("Cannot open detail: Track not found in library.", "error");
                }
            } else {
                UIManager.showToast("Please wait for the download to complete.", "info");
            }
        } catch (e) {
            console.error("Failed to parse track info from task queue item:", e);
            UIManager.showToast("Error processing task item click.", "error");
        }
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
    // Added from original script.js, ensure these are still relevant or managed by specific modules
    selectedCoverFileObject: null,
    selectedCoverExt: null,
    editingTrackInitialData: null,
    newCoverSelectedForUpdate: false,
    focusElementAfterLoad: null,
  };

  const collectionManager = new CollectionManager({
    appState: window.appState,
    webSocketManager: webSocketManager,
  });

  const navigationManager = new NavigationManager({
    mainContentElement: mainContent,
    drawerLinksSelector: ".drawer-link",
    webSocketManager: webSocketManager,
    playerManager: playerManager,
    uiManager: UIManager,
    appState: window.appState,
    renderDrawerCollectionsCallback:
      collectionManager.renderDrawerCollections.bind(collectionManager),
    getCollectionsCallback:
      collectionManager.getCollections.bind(collectionManager),
  });

  const favoriteManager = new FavoriteManager({
    webSocketManager: webSocketManager,
    appState: window.appState,
  });

  (async () => {
    // Set navigationManager on collectionManager
    collectionManager.setNavigationManager(navigationManager);
    collectionManager.setUIManager(UIManager);
    
    // Async inits
    await collectionManager.init();
    await favoriteManager.init();
    
    // Set managers for use elsewhere
    navigationManager.setCollectionManager(collectionManager);
    navigationManager.setFavoriteManager(favoriteManager);
    searchManager.setFavoriteManager(favoriteManager);
    
    // Initial navigation
    navigationManager.init();
  })();

  const searchManager = new SearchManager({
    webSocketManager: webSocketManager,
    navigationManager: navigationManager,
    appState: window.appState,
    uiManager: UIManager,
  });

  const uploadManager = new UploadManager({
    webSocketManager,
    navigationManager,
    uiManager: UIManager,
    appState: window.appState,
    CHUNK_SIZE,
  });
  navigationManager.setUploadManager(uploadManager); // Set UploadManager on NavigationManager

  navigationManager.setSearchManager(searchManager);
  navigationManager.setFavoriteManager(favoriteManager);
  navigationManager.setCollectionManager(collectionManager);
  searchManager.setFavoriteManager(favoriteManager); // SearchManager also needs FavoriteManager
  
  // Register AI push actions
  webSocketManager.registerPushHandler("llm_action", (data) => {
    if (data.action === "play" && data.track) {
      console.log("[AI Action] Playing track:", data.track);
      playerManager.playTrackFromCard(JSON.stringify(data.track));
    }
  });

  // Handle AI auth requests
  document.addEventListener("claw_auth_request", (e) => {
    const detail = e.detail;
    if (!detail) return;
    const { auth_id, action, details, session_id } = detail;
    
    UIManager.showAuthDialog(action, details, (granted, rememberSession) => {
      webSocketManager.sendWebSocketCommand("claw_auth_response", {
        auth_id,
        action,
        session_id,
        granted,
        remember_session: rememberSession
      });
    });
  });

  // Handle general authentication required errors from WebSocket (401)
  document.addEventListener("claw_auth_required", (e) => {
    const authLink = document.getElementById("auth-nav-link");
    const authDialog = document.getElementById("auth-dialog");
    
    // Check if not already logged in/showing dialog
    if (authLink && (!authDialog || !authDialog.classList.contains("visible"))) {
      if (!localStorage.getItem("jwt_token")) {
         UIManager.showToast("Authentication required! Please log in.", "warning");
         authLink.click(); // This clicks the nav link which opens the dialog
      } else {
         UIManager.showToast("Session expired! Please log in again.", "warning");
         localStorage.removeItem("jwt_token");
         UIManager.updateAuthStateUI();
         authLink.click();
      }
    }
  });

  // Initialize UIManager with all managers
  // UIManager.setPlayerManager(playerManager);
  // UIManager.setNavigationManager(navigationManager);
  // UIManager.setWebSocketManager(webSocketManager);
  // UIManager.setSearchManager(searchManager);
  // UIManager.setFavoriteManager(favoriteManager);
  // UIManager.setCollectionManager(collectionManager);
  // UIManager.setUploadManager(uploadManager);
  // UIManager.setAppState(window.appState);
  // UIManager.init(); // General UIManager initializations
  webSocketManager
    .sendWebSocketCommand("get_downloaded_music", {})
    .then((response) => {
      const libraryData =
        response.data && response.data.library ? response.data.library : [];
      appState.library = libraryData;
      playerManager.setPlayList(libraryData);
      navigationManager.init();
      searchManager.init();
      uploadManager.initDragDrop();
    })
    .catch((error) => {
      console.error("Failed to load library:", error);
      navigationManager.init();
      searchManager.init();
      uploadManager.initDragDrop();
    });

  mainContent.addEventListener("change", function (event) {
    if (event.target.id === "upload-cover-file-input") {
      uploadManager.handleCoverFileSelect(event);
    } else if (event.target.id === "update-cover-file-input") {
      uploadManager.handleUpdateCoverFileSelect(event);
    }
  });

  mainContent.addEventListener("click", async function (event) {
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
        UIManager.showToast(
          "Could not play track: Missing track data.",
          "error"
        );
      }
    } else if (
      artContainer &&
      !event.target.closest(".play-on-card-button") &&
      !event.target.closest(".add-to-collection-button")
    ) {
      const songCard = artContainer.closest(".song-card");
      if (
        songCard &&
        navigationManager.getCurrentPageId() !== "search-results"
      ) {
        // Avoid nav on search results page cards
        const trackInfoString =
          songCard.querySelector(".play-on-card-button")?.dataset.trackInfo ||
          songCard.querySelector(".add-to-collection-button")?.dataset
            .trackInfo ||
          songCard.dataset.trackInfo;
        if (trackInfoString) {
          try {
            const trackObject = JSON.parse(trackInfoString);
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
        UIManager.showConfirmationDialog(
          "Are you sure you want to delete this track?",
          () => {
            uploadManager.handleDeleteTrack(musicId);
          }
        );
        // uploadManager.handleDeleteTrack(musicId);
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
      const trackInfoString = favoriteButton.dataset.trackInfo;
      if (songId) {
        let trackData = null;
        if (trackInfoString) {
          try { trackData = JSON.parse(trackInfoString); } catch(e) {}
        }
        if (!trackData) {
            // Try to find in library
            trackData = window.appState.library.find(t => String(t.music_id || t.id || t.bvid) === String(songId));
        }
        
        if (trackData) {
          const newStatus = await favoriteManager.toggleFavorite(trackData);
          UIManager.updateFavoriteIcon(favoriteButton, newStatus);
        } else {
          // Fallback for ID only if already favorite (can only remove)
          if (favoriteManager.isFavorite(songId)) {
             const removed = await favoriteManager.removeFavorite(songId);
             if (removed) UIManager.updateFavoriteIcon(favoriteButton, false);
          } else {
             UIManager.showToast("Cannot add to favorites: Missing track details.", "error");
          }
        }
      }
    }

    if (addToDownloadQueueButton) {
      const trackInfoString = addToDownloadQueueButton.dataset.trackInfo;
      if (trackInfoString) {
        try {
          const trackObject = JSON.parse(trackInfoString);
          UIManager.addTrackToDownloadQueue(trackObject, webSocketManager);
        } catch (e) {
          console.error("Error parsing track info for download queue:", e);
          UIManager.showToast(
            "Could not add track to queue: Invalid track data.",
            "error"
          );
        }
      }
    }

    if (inlineLink && inlineLink.dataset.page) {
      event.preventDefault();
      const pageId = inlineLink.dataset.page;
      const path = inlineLink.getAttribute("href") || `#${pageId}`;
      const title =
        inlineLink.dataset.title ||
        pageId.charAt(0).toUpperCase() + pageId.slice(1);
      const subPageId = inlineLink.dataset.subpageid || null;
      navigationManager.navigateTo(pageId, title, path, false, subPageId);
    }
  });

  const playerCoverArea = document.getElementById("player-cover-area");
  if (playerCoverArea) {
    playerCoverArea.addEventListener("click", () => {
      const currentTrack = playerManager.currentLoadedTrack;
      if (currentTrack) {
        // Ensure currentTrack exists
        window.appState.currentSongDetail = currentTrack; // Set it for song detail page
        const musicId =
          currentTrack?.bvid || currentTrack?.music_id || currentTrack?.id;
        if (musicId) {
          navigationManager.navigateToSongDetail(currentTrack);
        }
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

  window.test.getLocalCollections = collectionManager
    ? collectionManager.getCollections.bind(collectionManager)
    : () => console.warn("CollectionManager not available");
  window.test.saveLocalCollections = collectionManager
    ? collectionManager.saveCollections.bind(collectionManager)
    : () => console.warn("CollectionManager not available");
  window.test.deleteLocalCollection = collectionManager
    ? collectionManager.deleteCollection.bind(collectionManager)
    : () => console.warn("CollectionManager not available");
  // window.test.renderDrawerCollections = collectionManager ? collectionManager.renderCollectionsInDrawer.bind(collectionManager) : () => console.warn("CollectionManager not available");
  window.test.openAddToCollectionDialog = (songId) =>
    collectionManager
      ? collectionManager.openDialog(songId, "add_song")
      : console.warn("CollectionManager not available");
  window.test.openCreateCollectionDialog = () =>
    collectionManager
      ? collectionManager.openDialog(null, "create_direct")
      : console.warn("CollectionManager not available");
  window.test.openEditCollectionDialog = (collectionName) =>
    collectionManager
      ? collectionManager.openDialog(null, "edit", collectionName)
      : console.warn("CollectionManager not available");
  window.test.getDownloadQueue = () =>
    window.appState && window.appState.downloadQueue
      ? window.appState.downloadQueue
      : [];
  window.test.renderTaskQueue = UIManager.renderTaskQueue
    ? UIManager.renderTaskQueue.bind(UIManager)
    : () => console.warn("UIManager.renderTaskQueue not found.");
  window.test.updateMainTaskQueueIcon = UIManager.updateMainTaskQueueIcon
    ? UIManager.updateMainTaskQueueIcon.bind(UIManager)
    : () => console.warn("UIManager.updateMainTaskQueueIcon not found.");
  window.test.navigateTo = navigationManager
    ? navigationManager.navigateTo.bind(navigationManager)
    : () => console.warn("NavigationManager not available");

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

  console.log("Developer test functions are available under `window.test`.");
});
