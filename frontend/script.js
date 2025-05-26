import WebSocketManager from "./modules/WebSocketManager.js";
import UIManager from "./modules/UIManager.js";
import PlayerManager from "./modules/PlayerManager.js";
import NavigationManager from "./modules/NavigationManager.js";
import CollectionManager from "./modules/CollectionManager.js";
import SearchManager from "./modules/SearchManager.js";
import FavoriteManager from "./modules/FavoriteManager.js"; // Added FavoriteManager
// Player Functionality
// const playerHideButton = document.getElementById("player-hide-button");
// const playerShowButton = document.getElementById("player-show-button");
// const playerPlayPauseButton = document.getElementById(
//   "player-play-pause-button"
// ); // For icon toggling

// Function to set player visibility state
// const setPlayerVisibility = UIManager.setPlayerVisibility;

// if (playerHideButton) {
//   playerHideButton.addEventListener("click", () => {
//     setPlayerVisibility(false);
//   });
// }

// if (playerShowButton) {
//   playerShowButton.addEventListener("click", () => {
//     // When showing, ideally it would resume last playing track's info
//     // For now, just make it visible. If no track was "playing", it shows default placeholders.
//     setPlayerVisibility(true);
//   });
// }
// Function to apply theme
const applyTheme = UIManager.applyTheme;

// Load saved theme or default to light
const savedTheme = localStorage.getItem("theme") || "light-theme";
applyTheme(savedTheme);
document.addEventListener("DOMContentLoaded", () => {
  const webSocketManager = new WebSocketManager();
  const playerManager = new PlayerManager({
    backgroundElement: document.getElementById("background-effects"),
    coverImgElement: document.getElementById("player-album-art"),
  });
  const themeSwitcher = document.getElementById("theme-switcher");
  const body = document.body; // Or document.documentElement for html tag

  // Event listener for the button
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
  // Placeholder function to update task queue progress

  // Example usage (remove or comment out for production):
  // setTimeout(() => updateTaskQueueProgress(30), 2000);    // Show 30% after 2s
  // setTimeout(() => updateTaskQueueProgress(75), 4000);    // Show 75% after 4s
  // setTimeout(() => updateTaskQueueProgress(null), 6000); // Show indeterminate state after 6s (e.g., busy)
  // setTimeout(() => updateTaskQueueProgress(100), 8000); // Show 100% after 8s
  // setTimeout(() => updateTaskQueueProgress(0), 10000);   // Show 0% after 10s (reset)

  // Expanded Task Queue Toggle
  const taskQueueButton = document.getElementById("task-queue-button");
  const expandedTaskQueue = document.getElementById("expanded-task-queue");

  if (taskQueueButton && expandedTaskQueue) {
    taskQueueButton.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent click from immediately closing due to body listener
      const isVisible = expandedTaskQueue.classList.toggle("visible");
      expandedTaskQueue.setAttribute("aria-hidden", !isVisible);
    });

    // Optional: Close when clicking outside
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

  // Drawer Toggle Functionality
  const drawerToggleButton = document.getElementById("drawer-toggle-button");
  const mainDrawer = document.getElementById("main-drawer");
  const drawerToggleIcon = drawerToggleButton
    ? drawerToggleButton.querySelector(".material-icons")
    : null;

  if (drawerToggleButton && mainDrawer && drawerToggleIcon) {
    // Function to set drawer state, save preference
    const setDrawerState = (isCollapsed) => {
      mainDrawer.classList.toggle("collapsed", isCollapsed);
      drawerToggleIcon.textContent = isCollapsed ? "menu_open" : "menu";
      localStorage.setItem("drawerCollapsed", isCollapsed);
    };

    // Load saved drawer state or default to not collapsed
    const savedDrawerState = localStorage.getItem("drawerCollapsed") === "true";
    setDrawerState(savedDrawerState);

    drawerToggleButton.addEventListener("click", () => {
      const isCollapsed = mainDrawer.classList.contains("collapsed");
      setDrawerState(!isCollapsed);
    });
  }

  // Call simulatePlayTrack() for testing if you want to see the player populated on load
  // setTimeout(simulatePlayTrack, 1000); // Example: "play" a track after 1s

  const mainContent = document.getElementById("main-content");
  // let drawerLinks = document.querySelectorAll(".drawer-link"); // Will be handled by NavigationManager

  // Application state container
  window.appState = {
    searchResults: [],
    searchQuery: "",
    searchError: null,
    downloadQueue: [],
    library: [], // Explicitly initialize library
    currentSongDetail: null, // Explicitly initialize currentSongDetail
    collectionDialogMode: "add_song", // 'add_song', 'create_direct', 'edit'
    editingCollectionName: null, // Stores name of collection being edited
  };

  // Page HTML structures - passed to NavigationManager
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
                <div class="song-detail-left">
                    <img src="placeholder_album_art.png" alt="Album Art" id="detail-cover-art">
                    <h2 id="detail-title">Track Title</h2>
                    <p id="detail-artist">Artist Name</p>
                    <p id="detail-description">Full song description here...</p>
                    <div id="detail-action-buttons">
                        <button class="detail-play-button"><span class="material-icons">play_arrow</span></button>
                        <button class="detail-add-to-collection-button"><span class="material-icons">playlist_add</span></button>
                    </div>
                </div>
                <div class="song-detail-right">
                    <p>暂无歌词</p> <!-- Lyrics not available yet -->
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
  };

  // NavigationManager setup
  const navigationManager = new NavigationManager({
    mainContentElement: mainContent,
    drawerLinksSelector: ".drawer-link", // Selector for all drawer links
    pageContents: pageContents,
    webSocketManager: webSocketManager,
    playerManager: playerManager,
    uiManager: UIManager,
    // displaySearchResultsOnPageCallback: () => displaySearchResultsOnPage(), // Removed
    // renderDrawerCollectionsCallback and getCollectionsCallback removed, CollectionManager will handle this.
    appState: window.appState,
  });
  // navigationManager.init(); // Initialize NavigationManager -- will be called after SearchManager is set

  // CollectionManager setup
  const collectionManager = new CollectionManager({
    navigationManager: navigationManager, // Pass NavigationManager instance
    appState: window.appState, // Pass appState if needed by CollectionManager
    // IDs for DOM elements used by CollectionManager are defaults in its constructor
    // but can be overridden here if needed.
    // dialogElementId: "add-to-collection-dialog",
    // drawerListElementId: "local-collections-list",
    // etc.
  });
  collectionManager.init(); // Initialize CollectionManager (sets up its listeners and renders collections)

  // SearchManager setup
  const searchManager = new SearchManager({
    webSocketManager: webSocketManager,
    navigationManager: navigationManager, // Pass NavigationManager instance
    appState: window.appState,
    uiManager: UIManager, // Pass UIManager
    // searchInputSelector: "#header-search-input" // Default selector
  });
  
  // FavoriteManager setup
  const favoriteManager = new FavoriteManager();

  // Link SearchManager to NavigationManager
  navigationManager.setSearchManager(searchManager);
  navigationManager.setFavoriteManager(favoriteManager);
  navigationManager.setCollectionManager(collectionManager); // Pass CollectionManager to NavigationManager
  searchManager.setFavoriteManager(favoriteManager);
  
  // Now initialize NavigationManager after SearchManager has been set on it (if it were needed at init)
  // and SearchManager has NavigationManager (for performSearch navigation)
  navigationManager.init(); 
  searchManager.init(); // Initialize SearchManager (sets up its listeners)


  // Event delegation for dynamic content (like song cards, search results, etc.)
  mainContent.addEventListener("click", function (event) {
    const playButton = event.target.closest(".play-on-card-button");
    const artContainer = event.target.closest(".card-art-container");
    const addToCollectionButton = event.target.closest(
      ".add-to-collection-button"
    );
    const favoriteButton = event.target.closest(".favorite-button"); // Added favorite button
    const inlineLink = event.target.closest(".inline-link"); // For router links in text
    const addToDownloadQueueButton = event.target.closest(
      ".add-to-download-queue-button"
    );
    // const searchResultDownloadButton = event.target.closest(".search-result-download-button"); // Handled by SearchManager

    if (playButton) {
      const trackInfoString = playButton.dataset.trackInfo;
      if (trackInfoString) {
        try {
          const trackInfo = JSON.parse(trackInfoString);
          console.log("Play button clicked. Track Info:", trackInfo);
          // Populate and show the player
          // document.getElementById('player-album-art').src = '.' + trackInfo.cover_path || 'placeholder_album_art_2.png';
          document.getElementById("player-track-title").textContent =
            trackInfo.title || "Unknown Title";
          document.getElementById("player-track-artist").textContent =
            trackInfo.author || trackInfo.artist_name || "Unknown Artist";
          // TODO: Set actual duration and handle playback (e.g., trackInfo.duration_ms)
          // document.getElementById('player-duration').textContent = trackInfo.duration_formatted || '0:00';
          playerManager.playTrackById(trackInfo.music_id);
          UIManager.setPlayerVisibility(true); // Corrected: Use UIManager.setPlayerVisibility
          const playerPlayPauseButton = document.getElementById("player-play-pause-button"); // Ensure this is defined if used
          if (playerPlayPauseButton) {
            const playPauseIcon = playerPlayPauseButton.querySelector(".material-icons");
            if (playPauseIcon) playPauseIcon.textContent = "pause_arrow"; // Assume immediate play
          }

          // Store current playing track info if needed by the player module
          // window.playerModule.play(trackInfo);
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
      if (songCard) {
        const trackInfoString =
          songCard.querySelector(".play-on-card-button")?.dataset.trackInfo ||
          songCard.querySelector(".add-to-collection-button")?.dataset
            .trackInfo ||
          songCard.dataset.trackInfo;
        if (trackInfoString) {
          try {
            const trackObject = JSON.parse(trackInfoString);
            window.appState.currentSongDetail = trackObject;
            const songHash =
            trackObject.music_id || trackObject.id || Date.now(); // music_id preferred
            console.log(
              "Navigating to song detail for:",
              trackObject.title,
              ` ID: ${songHash}`
            );
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

    if (addToCollectionButton) {
      const songIdForCollection = addToCollectionButton.dataset.songId;
      const trackInfoString = addToCollectionButton.dataset.trackInfo; // For consistency if needed

      if (songIdForCollection) {
        collectionManager.handleAddToCollectionButtonClick(songIdForCollection);
      } else if (trackInfoString) {
        try {
          const trackInfo = JSON.parse(trackInfoString);
          const id = trackInfo.music_id || trackInfo.id;
          if (id) {
            collectionManager.handleAddToCollectionButtonClick(id);
          } else {
            console.error("Could not determine song ID for add to collection from track_info.");
          }
        } catch (e) {
          console.error("Error parsing track_info for add to collection:", e);
        }
      } else {
        console.error("Could not determine song ID for add to collection.");
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
        } else {
            console.warn("Favorite button clicked, but no song-id data found.");
        }
    }

    if (addToDownloadQueueButton) {
      const songCard = addToDownloadQueueButton.closest(".song-card");
      const songId = songCard ? songCard.dataset.songId : null;
      const source = songCard ? songCard.dataset.source : "unknown"; // Get source from card
      const title = songCard
        ? songCard.querySelector(".song-card-title").textContent
        : "Unknown Title";
      console.log(
        `Add to download queue clicked for song ID: ${songId}, Title: ${title}, Source: ${source}`
      );
      // Later: downloadManager.addToQueue({ id: songId, title: title, source: source, ...other_details });
      // Visually indicate it's added or processing (e.g., change icon)
      const icon = addToDownloadQueueButton.querySelector(".material-icons");
      if (icon) {
        icon.textContent = "downloading"; // Example visual feedback
        // setTimeout(() => { icon.textContent = 'check_circle'; }, 2000); // Simulate completion
      }
    }

    // Removed: searchPageButton logic is no longer needed here as the search page itself is removed.
    // Header search is handled by a dedicated listener.

    if (inlineLink && inlineLink.dataset.page) {
      event.preventDefault();
      const pageId = inlineLink.dataset.page;
      const path = inlineLink.getAttribute("href");
      const title = inlineLink.dataset.title || pageId.charAt(0).toUpperCase() + pageId.slice(1); // Simple title
      const subPageId = inlineLink.dataset.subpageid || null;
      navigationManager.navigateTo(pageId, title, path, false, subPageId); // Corrected: Use navigationManager
    }

    // searchResultDownloadButton logic is now handled by SearchManager's delegated event listener.
    // The 'searchResultDownloadButton' variable itself can be removed if not used elsewhere.
    // if (searchResultDownloadButton) { ... } // This whole block is removed.

    // Handle clicks on song detail page buttons
    const detailPlayButton = event.target.closest(".detail-play-button");
    const detailAddToCollectionButton = event.target.closest(
      ".detail-add-to-collection-button"
    );

    if (detailPlayButton) {
      const trackInfoString = detailPlayButton.dataset.trackInfo;
      if (trackInfoString) {
        try {
          const trackInfo = JSON.parse(trackInfoString);
          console.log(
            "Detail Page - Play button clicked. Track Info:",
            trackInfo
          );
          // Populate and show the player (similar to card play button)
          //   document.getElementById("player-album-art").src =
          //     trackInfo.cover_url || "placeholder_album_art_2.png";
          document.getElementById("player-track-title").textContent =
            trackInfo.title || "Unknown Title";
          document.getElementById("player-track-artist").textContent =
            trackInfo.author || trackInfo.artist_name || "Unknown Artist";
          UIManager.setPlayerVisibility(true); // Corrected: Use UIManager.setPlayerVisibility
          playerManager.playTrackById(trackInfo.music_id);
           const playerPlayPauseButton = document.getElementById("player-play-pause-button"); // Ensure this is defined
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
            } else {
              console.error("Could not determine song ID for detail add to collection from track_info.");
            }
          } catch (e) {
            console.error("Error parsing track_info for detail add to collection:", e);
          }
        } else {
          console.error("No songId or trackInfo found on detail add to collection button.");
        }
      }
    }
  });

  // Header Search Functionality is now in SearchManager.js
  // const headerSearchInput = document.getElementById("header-search-input"); // Handled by SearchManager
  // Event listener for headerSearchInput is in SearchManager.init()
  
  // Function to display search results on the 'search-results' page is now SearchManager.displayResults()
  // const renderTaskQueue = UIManager.renderTaskQueue; // This is UIManager, not search
  // const updateMainTaskQueueIcon = UIManager.updateMainTaskQueueIcon; // This is UIManager, not search
  // function displaySearchResultsOnPage() { ... } // Moved to SearchManager.displayResults()


  // --- Local Collections & Context Menu functionality is now in CollectionManager ---
  // const localCollectionsList = document.getElementById("local-collections-list"); // Handled by CollectionManager
  // const contextMenu = document.getElementById("drawer-context-menu"); // Handled by CollectionManager
  // function renderDrawerCollections() { ... } // Now in CollectionManager
  // Event listeners for context menu and global click to hide it are in CollectionManager
  // function deleteLocalCollection(collectionName) { ... } // Now in CollectionManager
  // function openCreateCollectionDialog() { ... } // Now in CollectionManager
  // function openEditCollectionDialog(collectionName) { ... } // Now in CollectionManager


  // Initial UI setup calls after DOM is ready
  UIManager.renderTaskQueue(); // This UIManager function remains
  UIManager.updateMainTaskQueueIcon(); // This UIManager function remains
  // collectionManager.init() already called, which calls renderDrawerCollections
  // --- Expose functions for debugging/testing via window.test ---
// Note: Functions related to collections will be updated to point to collectionManager methods
// Note: This block is intentionally outside DOMContentLoaded to ensure all functions are defined
// and DOM is ready before these are potentially called from the console.
// However, functions defined within DOMContentLoaded and not globally will not be accessible here
// unless they were already attached to window or a global object (like webSocketManager).

if (!window.test) {
  window.test = {};
}

// WebSocket command function
// Assuming webSocketManager is a global or accessible variable.
// If webSocketManager is defined inside DOMContentLoaded, this specific assignment will fail
// unless webSocketManager itself is made globally accessible.
// For now, we proceed assuming webSocketManager is defined in a scope accessible here.
// If it was defined with 'const' or 'let' inside DOMContentLoaded, it's not global.
// This was previously within DOMContentLoaded, so webSocketManager was in scope.
// Moving it out requires webSocketManager to be in a higher scope or global.
// For the purpose of this refactor, we'll assume webSocketManager might need to be
// defined outside DOMContentLoaded or explicitly attached to window if it's to be used here.
// Let's assume it's globally available for this example.
if (
  typeof webSocketManager !== "undefined" &&
  webSocketManager &&
  typeof webSocketManager.sendWebSocketCommand === "function"
) {
  window.test.sendWebSocketCommand =
    webSocketManager.sendWebSocketCommand.bind(webSocketManager);
} else {
  // Fallback: if webSocketManager is not globally available, provide a stub or warning.
  window.test.sendWebSocketCommand = () =>
    console.warn(
      "webSocketManager not found or sendWebSocketCommand is not a function. Ensure webSocketManager is globally accessible if defined outside DOMContentLoaded."
    );
  // Note: getLibrary is also exposed via webSocketManager.init() if webSocketManager is accessible
  if (
    typeof webSocketManager !== "undefined" &&
    webSocketManager &&
    webSocketManager.testWebSocketGetLibrary
  ) {
    // getLibrary is already set up by webSocketManager.init if accessible.
  } else {
    window.test.getLibrary = () =>
      console.warn("webSocketManager not found, getLibrary unavailable.");
  }
}

// For functions defined globally or within DOMContentLoaded but assigned to global/higher-scope vars:
// The following assumes these functions are either global or attached to an accessible object.
// If they are const/let inside DOMContentLoaded, they are not directly accessible here.
// We will proceed with the assumption that these functions *were intended* to be accessible,
// and if not, this highlights a structural dependency.

// Local collection management functions
window.test.getLocalCollections = collectionManager ? collectionManager.getCollections.bind(collectionManager) : () => console.warn("CollectionManager not available for test.getLocalCollections");
window.test.saveLocalCollections = collectionManager ? collectionManager.saveCollections.bind(collectionManager) : () => console.warn("CollectionManager not available for test.saveLocalCollections");
window.test.deleteLocalCollection = collectionManager ? collectionManager.deleteCollection.bind(collectionManager) : () => console.warn("CollectionManager not available for test.deleteLocalCollection");
window.test.renderDrawerCollections = collectionManager ? collectionManager.renderDrawerCollections.bind(collectionManager) : () => console.warn("CollectionManager not available for test.renderDrawerCollections");

// Dialog invocation functions - now unified under openDialog in CollectionManager
window.test.openAddToCollectionDialog = (songId) => collectionManager ? collectionManager.openDialog(songId, 'add_song') : console.warn("CollectionManager not available for test.openAddToCollectionDialog");
window.test.openCreateCollectionDialog = () => collectionManager ? collectionManager.openDialog(null, 'create_direct') : console.warn("CollectionManager not available for test.openCreateCollectionDialog");
window.test.openEditCollectionDialog = (collectionName) => collectionManager ? collectionManager.openDialog(null, 'edit', collectionName) : console.warn("CollectionManager not available for test.openEditCollectionDialog");

// Task queue related (UIManager controlled, unchanged - ensure UIManager is referenced if these are from UIManager)
window.test.getDownloadQueue = () =>
  typeof window.appState !== "undefined" && window.appState.downloadQueue
    ? window.appState.downloadQueue
    : (console.warn("window.appState.downloadQueue not found."), []);
// Assuming renderTaskQueue and updateMainTaskQueueIcon are from UIManager
window.test.renderTaskQueue = UIManager.renderTaskQueue ? UIManager.renderTaskQueue : () => console.warn("UIManager.renderTaskQueue not found.");
window.test.updateMainTaskQueueIcon = UIManager.updateMainTaskQueueIcon ? UIManager.updateMainTaskQueueIcon : () => console.warn("UIManager.updateMainTaskQueueIcon not found.");

// Player related
window.test.simulatePlayTrack =
  typeof simulatePlayTrack !== "undefined"
    ? simulatePlayTrack
    : () => console.warn("simulatePlayTrack not found or removed.");
window.test.setPlayerVisibility =
  typeof setPlayerVisibility !== "undefined"
    ? setPlayerVisibility
    : () => console.warn("setPlayerVisibility not found.");

// Navigation
window.test.navigateTo = navigationManager ? navigationManager.navigateTo.bind(navigationManager) : () => console.warn("NavigationManager not available for test.navigateTo");

// Library fetching
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
    console.warn(
      "webSocketManager not found or sendWebSocketCommand is not a function, cannot fetch library."
    );
    return Promise.reject("webSocketManager not available.");
  };
}

console.log(
  "Developer test functions are available under `window.test`. Note: Some functions might be unavailable if they were not defined globally or attached to window."
);
/*
    Available test functions (availability depends on their original scope):
    - window.test.sendWebSocketCommand(command, payload)
    - window.test.getLocalCollections() // Now points to CollectionManager
    - window.test.saveLocalCollections(collectionsArray) // Now points to CollectionManager
    - window.test.deleteLocalCollection(collectionName) // Now points to CollectionManager
    - window.test.renderDrawerCollections() // Now points to CollectionManager
    - window.test.openAddToCollectionDialog(songId) // Now points to CollectionManager.openDialog
    - window.test.openCreateCollectionDialog() // Now points to CollectionManager.openDialog
    - window.test.openEditCollectionDialog(collectionName) // Now points to CollectionManager.openDialog
    - window.test.getDownloadQueue() // Unchanged
    - window.test.renderTaskQueue() // Points to UIManager
    - window.test.updateMainTaskQueueIcon() // Points to UIManager
    - window.test.simulatePlayTrack()
    - window.test.setPlayerVisibility(boolean)
    - window.test.navigateTo(pageId, title, path, skipPushState)
    - window.test.fetchLibrary()
    (Note: getLibrary is also available from previous WebSocket setup if webSocketManager is accessible)
*/

});

