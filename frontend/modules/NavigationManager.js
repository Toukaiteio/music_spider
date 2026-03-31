// frontend/modules/NavigationManager.js

// Page Module Imports
import HomePage from '../pages/HomePage.js';
import CollectionsPage from '../pages/CollectionsPage.js';
import CollectionDetailPage from '../pages/CollectionDetailPage.js';
import SongDetailPage from '../pages/SongDetailPage.js';
import SearchResultsPage from '../pages/SearchResultsPage.js';
import UpdateTrackPage from '../pages/UpdateTrackPage.js';
import UploadTrackPage from '../pages/UploadTrackPage.js';
import AuthManagerPage from '../pages/AuthManagerPage.js';
import MusicClawPage from '../pages/MusicClawPage.js';
import AdminPage from '../pages/AdminPage.js';
import UIManager from '../modules/UIManager.js';

// Utility Imports (keep if still used directly by NM)
import { getFileExtension } from "./Utils.js";
// LyricsEditor imports are removed as they are now page-specific or handled by page modules

class NavigationManager {
  constructor({
    mainContentElement,
    drawerLinksSelector,
    // pageContents, // REMOVED
    webSocketManager,
    playerManager,
    uiManager,
    renderDrawerCollectionsCallback, // Keep if still used by NM directly
    getCollectionsCallback, // Keep if still used by NM directly
    appState,
    // searchManager, favoriteManager, collectionManager, uploadManager will be set via setters
  }) {
    this.mainContent = mainContentElement;
    this.drawerLinksElements = document.querySelectorAll(drawerLinksSelector);
    this.webSocketManager = webSocketManager;
    this.playerManager = playerManager;
    this.uiManager = uiManager;
    this.renderDrawerCollections = renderDrawerCollectionsCallback;
    if (getCollectionsCallback) this.getCollections = getCollectionsCallback;
    this.appState = appState;

    this.searchManager = null;
    this.favoriteManager = null;
    this.collectionManager = null;
    this.uploadManager = null; // Added

    this.navigationHistory = [];
    this.currentPageId = null;
    this.currentSubPageId = null;
    this.currentPath = null;
    this.currentTitle = null;
    this.activePageModule = null;

    this.pageModuleInstances = {};
    this.pageModulesRegistry = {
      'home': HomePage,
      'collections': CollectionsPage,
      'collection-detail': CollectionDetailPage,
      'search-results': SearchResultsPage,
      'update-track': UpdateTrackPage,
      'upload-track': UploadTrackPage,
      'auth-manager': AuthManagerPage,
      'music-claw': MusicClawPage,
      'admin-panel': AdminPage
    };

    // Bind methods
    this.navigateTo = this.navigateTo.bind(this);
    this.navigateBack = this.navigateBack.bind(this);
    this.updateActiveDrawerLink = this.updateActiveDrawerLink.bind(this);
    this.handlePopState = this.handlePopState.bind(this);
    this.handleInitialLoad = this.handleInitialLoad.bind(this);
    this.handleMainContentClick = this.handleMainContentClick.bind(this); // If kept
    this.handleFavoriteChange = this.handleFavoriteChange.bind(this);
    this._animateColorBands = this._animateColorBands.bind(this);
  }

  init() {
    this.drawerLinksElements = document.querySelectorAll(".drawer-link");

    this.drawerLinksElements.forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const pageId = link.dataset.page;
        const path = link.getAttribute("href");
        let title =
          link.querySelector(".link-text")?.textContent ||
          pageId.charAt(0).toUpperCase() + pageId.slice(1);

        if (pageId === "collection-detail" && link.dataset.collectionName) {
          title = link.dataset.collectionName;
          this.navigateTo(
            pageId,
            title,
            path,
            false,
            link.dataset.collectionName
          );
        } else {
          this.navigateTo(pageId, title, path);
        }
      });
    });

    window.addEventListener("popstate", this.handlePopState);
    this.handleInitialLoad();
    document.addEventListener("favoritesChanged", this.handleFavoriteChange);
    document.addEventListener(
      "collectionChanged",
      this.handleCollectionChange.bind(this)
    );
  }

  getCollections() {
    return JSON.parse(localStorage.getItem("userCollections")) || [];
  }

  updateActiveDrawerLink(pageId, subPageId = null) {
    this.drawerLinksElements = document.querySelectorAll(".drawer-link");
    this.drawerLinksElements.forEach((link) => {
      link.classList.remove("active");
      const linkPage = link.dataset.page;
      const linkCollectionName = link.dataset.collectionName;

      if (pageId === "collection-detail" && subPageId) {
        if (
          linkPage === "collection-detail" &&
          linkCollectionName === subPageId
        ) {
          link.classList.add("active");
        }
      } else if (linkPage === pageId && !linkCollectionName) {
        if (
          pageId === "collections" &&
          linkPage === "collections" &&
          !linkCollectionName
        ) {
          link.classList.add("active");
        } else if (pageId !== "collections" && linkPage === pageId) {
          link.classList.add("active");
        }
      }
    });
  }

  navigateTo(pageId, title, path, skipPushState = false, subPageId = null) {
    if (!this.mainContent) {
      console.error("Main content area not found!");
      return;
    }

    this._performNavigateTo(pageId, title, path, skipPushState, subPageId);
  }

  _performNavigateTo(pageId, title, path, skipPushState = false, subPageId = null) {
    if (!this.mainContent) {
      console.error("Main content area not found in _performNavigateTo!");
      return;
    }

    // Auto close song detail when switching pages
    if (pageId !== "song-detail") {
      const overlay = document.getElementById('song-detail-overlay');
      if (overlay && overlay.classList.contains('active')) {
        UIManager.toggleSongDetail(false);
      }
    }

    // Call onUnload for the previous active page module if it exists and has the method
    if (this.activePageModule && typeof this.activePageModule.onUnload === 'function') {
      this.activePageModule.onUnload();
      this.activePageModule = null; // Reset active module
    }

    // Clear previous page's state if necessary (specific cases like update-track)
    // This logic is now primarily handled by UpdateTrackPage.onUnload() and UploadTrackPage.onUnload()

    this._animateColorBands();

    // Manage navigation history (remains largely the same)
    if (this.currentPageId && this.currentPageId !== "song-detail" && !skipPushState) {
      if (this.currentPath && this.currentPath !== path) {
        this.navigationHistory.push({
          pageId: this.currentPageId,
          subPageId: this.currentSubPageId,
          path: this.currentPath,
          title: this.currentTitle,
        });
        if (this.navigationHistory.length > 10) this.navigationHistory.shift();
      }
    }

    // Set global upload page active state (if still needed at this level)
    this.appState.isUploadPageActive = pageId === "upload-track";


    const PageModuleClass = this.pageModulesRegistry[pageId];
    if (!PageModuleClass) {
      this.mainContent.innerHTML = `<h2>Page Not Found</h2><p>The page module for "${pageId}" does not exist.</p>`;
      document.title = "Page Not Found - Music Downloader";
      this.updateActiveDrawerLink('error'); // Or some other way to indicate error
      // Update current page trackers to avoid inconsistent state
      this.currentPageId = pageId;
      this.currentSubPageId = subPageId;
      this.currentPath = path;
      this.currentTitle = "Page Not Found";
      return;
    }

    // Instantiate page module if not already done (simple caching)
    let pageModuleInstance = this.pageModuleInstances[pageId];
    if (!pageModuleInstance) {
      pageModuleInstance = new PageModuleClass();
      this.pageModuleInstances[pageId] = pageModuleInstance;
      // If the new instance has an init method, call it.
      if (typeof pageModuleInstance.init === 'function') {
        // We need to pass the managers object to init as well.
        const managers = {
          webSocketManager: this.webSocketManager,
          playerManager: this.playerManager,
          uiManager: this.uiManager,
          searchManager: this.searchManager,
          favoriteManager: this.favoriteManager,
          collectionManager: this.collectionManager,
          uploadManager: this.uploadManager,
          navigationManager: this
        };
        pageModuleInstance.init(this.appState, managers);
      }
    }
    this.activePageModule = pageModuleInstance; // Set current active module

    // Set HTML content
    this.mainContent.innerHTML = pageModuleInstance.getHTML();
    document.title = title + " - Music Downloader";

    if (!skipPushState) {
      history.pushState({ pageId: pageId, subPageId: subPageId }, title, path);
    } else {
      history.replaceState({ pageId: pageId, subPageId: subPageId }, title, path);
    }
    this.updateActiveDrawerLink(pageId, subPageId);

    // Prepare the managers object to pass to the page module
    const managers = {
      webSocketManager: this.webSocketManager,
      playerManager: this.playerManager,
      uiManager: this.uiManager,
      searchManager: this.searchManager,
      favoriteManager: this.favoriteManager,
      collectionManager: this.collectionManager,
      uploadManager: this.uploadManager,
      navigationManager: this
    };

    // Apply transition and then call onLoad
    this.mainContent.style.opacity = "0";
    requestAnimationFrame(() => {
      this.mainContent.style.transition = "opacity 0.3s ease-in-out";
      this.mainContent.style.opacity = "1";

      if (pageId === "song-detail") {
        const songDetailPageElement = this.mainContent.querySelector("#song-detail-page");
        if (songDetailPageElement) {
          requestAnimationFrame(() => {
            songDetailPageElement.classList.add("song-detail-page-enter");
            songDetailPageElement.addEventListener("animationend", () => {
              songDetailPageElement.style.opacity = "1";
              songDetailPageElement.classList.remove("song-detail-page-enter");
            }, { once: true });
          });
        }
      }

      if (typeof pageModuleInstance.onLoad === 'function') {
        pageModuleInstance.onLoad(this.mainContent, subPageId, this.appState, managers);
      }
    });

    this.currentPageId = pageId;
    this.currentSubPageId = subPageId;
    this.currentPath = path;
    this.currentTitle = title;
  }

  navigateBack() {
    if (this.currentPageId === "song-detail") {
      const songDetailPageElement =
        this.mainContent.querySelector("#song-detail-page");
      if (songDetailPageElement) {
        songDetailPageElement.classList.add("song-detail-page-exit");
        songDetailPageElement.addEventListener(
          "animationend",
          () => {
            this._performActualNavigateBack();
          },
          { once: true }
        );
        return;
      }
    }
    this._performActualNavigateBack();
  }

  _performActualNavigateBack() {
    // _clearUpdateTrackState is now handled by UpdateTrackPage.onUnload()
    if (this.navigationHistory.length > 0) {
      const lastPage = this.navigationHistory.pop();
      this._performNavigateTo(
        lastPage.pageId,
        lastPage.title,
        lastPage.path,
        true,
        lastPage.subPageId
      );
    } else {
      this._performNavigateTo("home", "Home", "#home", true);
    }
  }

  _animateColorBands() {
    const bands = document.querySelectorAll("#background-effects .color-band");
    if (!bands || bands.length === 0) {
      return;
    }

    const newPositions = [];
    const overlapThreshold = 20;
    const maxRetries = 5;
    const positionRange = 70;

    bands.forEach((band) => {
      let isTooClose;
      let retries = 0;
      let randomTop, randomLeft;

      do {
        isTooClose = false;
        randomTop = Math.random() * positionRange;
        randomLeft = Math.random() * positionRange;

        for (const pos of newPositions) {
          if (
            Math.abs(pos.top - randomTop) < overlapThreshold &&
            Math.abs(pos.left - randomLeft) < overlapThreshold
          ) {
            isTooClose = true;
            break;
          }
        }
        retries++;
      } while (isTooClose && retries < maxRetries);

      newPositions.push({ top: randomTop, left: randomLeft });
      band.style.top = randomTop + "%";
      band.style.left = randomLeft + "%";
    });
  }

  _attachRemoveFromCollectionListeners(songCardGridElement) {
    // This method is now part of CollectionDetailPage.js
    // If it were to remain here, it would need access to collectionManager, etc.
    // For now, this is intentionally left empty or can be removed if not called.
    console.warn("_attachRemoveFromCollectionListeners called on NavigationManager, but should be handled by CollectionDetailPage.");
  }

  _handleRemoveSongFromCollectionClick(event) {
    // This method is now part of CollectionDetailPage.js
    console.warn("_handleRemoveSongFromCollectionClick called on NavigationManager, but should be handled by CollectionDetailPage.");
  }

  handleFavoriteChange(event) {
    const { songId, isFavorite } = event.detail;
    console.log(
      `NavigationManager: favoritesChanged event for songId ${songId}, isFavorite: ${isFavorite}`
    );

    const currentPageId = this.currentPageId; // Use internal state
    const currentSubPageId = this.currentSubPageId; // Use internal state
    const relevantPages = ["collections", "collection-detail", "home", "song-detail"]; // Added home and song-detail

    // If current page is 'collections' (favorites view) or 'collection-detail' (a specific playlist)
    // or 'home' (library view) or 'song-detail' (detail of a song)
    // we might need to refresh to show updated favorite status.
    if (relevantPages.includes(currentPageId)) {
      // For 'collections' page (favorites), a change always means refresh.
      // For 'collection-detail', if a song's favorite status changes, the heart icon needs update.
      // For 'home', similar to 'collection-detail'.
      // For 'song-detail', the favorite button on that page needs update.
      // The most straightforward way is to re-trigger onLoad for the current page module.
      if (this.activePageModule && typeof this.activePageModule.onLoad === 'function') {
        console.log(`NavigationManager: Re-loading page ${currentPageId} due to favorite change.`);
        const managers = { /* construct managers object again */
          webSocketManager: this.webSocketManager, playerManager: this.playerManager,
          uiManager: this.uiManager, searchManager: this.searchManager,
          favoriteManager: this.favoriteManager, collectionManager: this.collectionManager,
          uploadManager: this.uploadManager, navigationManager: this
        };
        // We need to pass mainContent itself, not a query.
        this.activePageModule.onLoad(this.mainContent, currentSubPageId, this.appState, managers);
      } else {
        // Fallback to full navigate if re-triggering onLoad is not feasible/implemented
        this.navigateTo(
          currentPageId,
          this.currentTitle, // Use stored title
          this.currentPath,  // Use stored path
          true, // skipPushState
          currentSubPageId
        );
      }
    }
  }

  handleCollectionChange(event) {
    const { collectionName, songId, action } = event.detail;
    console.log(
      `NavigationManager: collectionChanged event for collection ${collectionName}, songId ${songId}, action: ${action}`
    );

    const currentPageId = this.currentPageId;
    const currentSubPageId = this.currentSubPageId;

    if (
      (currentPageId === "collection-detail" && currentSubPageId === collectionName) ||
      (currentPageId === "collections" && !currentSubPageId && action === "deleted") // Full collection deleted, refresh main collections
    ) {
      console.log(
        `NavigationManager: Refreshing page due to collection change on ${collectionName}.`
      );
      // If a collection is deleted and we are on the main 'collections' page,
      // we should also re-render the drawer.
      if (action === "deleted" && currentPageId === "collections" && typeof this.renderDrawerCollections === 'function') {
        this.renderDrawerCollections();
      }

      // Re-trigger onLoad for the current page module.
      if (this.activePageModule && typeof this.activePageModule.onLoad === 'function') {
        const managers = { /* construct managers object again */
          webSocketManager: this.webSocketManager, playerManager: this.playerManager,
          uiManager: this.uiManager, searchManager: this.searchManager,
          favoriteManager: this.favoriteManager, collectionManager: this.collectionManager,
          uploadManager: this.uploadManager, navigationManager: this
        };
        this.activePageModule.onLoad(this.mainContent, currentSubPageId, this.appState, managers);
      } else {
        this.navigateTo(
          currentPageId,
          this.currentTitle,
          this.currentPath,
          true,
          currentSubPageId
        );
      }
    }
    // If a song is added/removed from ANY collection, and we are on the home page, refresh home.
    // This is because song cards on home show "add to collection" status which might change.
    // Or, more simply, if the current song detail page is open and that song is added/removed from a collection.
    else if (currentPageId === "home" || (currentPageId === "song-detail" && (this.appState.currentSongDetail?.music_id === songId || this.appState.currentSongDetail?.id === songId))) {
      if (this.activePageModule && typeof this.activePageModule.onLoad === 'function') {
        console.log(`NavigationManager: Re-loading page ${currentPageId} due to collection change impacting it.`);
        const managers = { /* construct managers object again */
          webSocketManager: this.webSocketManager, playerManager: this.playerManager,
          uiManager: this.uiManager, searchManager: this.searchManager,
          favoriteManager: this.favoriteManager, collectionManager: this.collectionManager,
          uploadManager: this.uploadManager, navigationManager: this
        };
        this.activePageModule.onLoad(this.mainContent, currentSubPageId, this.appState, managers);
      }
    }
  }

  getCurrentPageId() { // Keep one definition
    return this.currentPageId || (location.hash.substring(1).split("/")[0] || "home");
  }

  getCurrentSubPageId() {
    return this.currentSubPageId || (location.hash.substring(1).split("/")[1] || null);
  }

  handlePopState(event) {
    const pageIdFromState = event.state ? event.state.pageId : null;
    const subPageIdFromState = event.state ? event.state.subPageId : null;

    if (pageIdFromState) {
      let title =
        pageIdFromState.charAt(0).toUpperCase() + pageIdFromState.slice(1);
      if (pageIdFromState === "search-results") title = "Search Results";
      if (pageIdFromState === "song-detail") {
        this.navigateTo("home", "Home", "#home", true);
        return;
      }

      if (!this.pageModulesRegistry[pageIdFromState]) {
        console.warn(
          `Invalid page ID in popstate: "${pageIdFromState}". Redirecting to home.`
        );
        this.navigateTo("home", "Home", "#home", true);
      } else {
        this.navigateTo(
          pageIdFromState,
          title,
          `#${pageIdFromState}${subPageIdFromState ? "/" + subPageIdFromState : ""
          }`,
          true,
          subPageIdFromState
        );
      }
    } else {
      const hash = location.hash.substring(1);
      const parts = hash.split("/");
      const hashPageId = parts[0] || "home";
      const hashSubPageId = parts[1] || null;

      const pageIdToLoad = this.pageModulesRegistry[hashPageId] ? hashPageId : "home"; // Changed
      let title = pageIdToLoad.charAt(0).toUpperCase() + pageIdToLoad.slice(1);
      if (pageIdToLoad === "search-results") title = "Search Results";
      if (pageIdToLoad === "collection-detail" && hashSubPageId)
        title = hashSubPageId;

      this.navigateTo(pageIdToLoad, title, `#${hash}`, true, hashSubPageId);
    }
  }

  handleInitialLoad() {
    const hash = (location.hash || '#home').substring(1);
    const parts = hash.split("/");
    let initialPage = parts[0] || "home";
    const initialSubPageId = parts[1] || null;

    if (initialPage === "song-detail") {
      initialPage = "home";
    }

    if (!this.pageModulesRegistry[initialPage]) {
      console.warn(
        `Invalid page ID in URL hash: "${initialPage}". Defaulting to home.`
      );
      initialPage = "home";
    }

    let initialTitle;
    if (initialPage === "search-results") {
      initialTitle = "Search Results";
    } else if (initialPage === "collection-detail" && initialSubPageId) {
      initialTitle = initialSubPageId;
    } else {
      const initialLink = document.querySelector(
        `.drawer-link[data-page="${initialPage}"]`
      );
      initialTitle =
        initialLink?.querySelector(".link-text")?.textContent ||
        initialPage.charAt(0).toUpperCase() + initialPage.slice(1);
    }

    const initialPath = `#${initialPage}${initialSubPageId ? "/" + initialSubPageId : ""
      }`;

    history.replaceState(
      { pageId: initialPage, subPageId: initialSubPageId },
      initialTitle,
      initialPath
    );

    const navigateLogic = () =>
      this.navigateTo(
        initialPage,
        initialTitle,
        initialPath,
        true,
        initialSubPageId
      );

    if (
      initialPage === "home" || (this.webSocketManager &&
        typeof this.webSocketManager.isSocketNeededForPage === 'function' &&
        this.webSocketManager.isSocketNeededForPage(initialPage))
    ) {
      if (
        this.webSocketManager.socket &&
        this.webSocketManager.socket.readyState === WebSocket.OPEN
      ) {
        navigateLogic();
      } else {
        this.webSocketManager
          .ensureSocketOpen()
          .then(navigateLogic)
          .catch((err) => {
            console.error("Socket connection failed for initial load:", err);
            navigateLogic();
          });
      }
    } else {
      navigateLogic();
    }
    console.log(
      "NavigationManager initialized. Initial page: " +
      initialPage +
      (initialSubPageId ? `/${initialSubPageId}` : "")
    );
  }

  setSearchManager(searchManager) {
    this.searchManager = searchManager;
  }

  setFavoriteManager(favoriteManager) {
    this.favoriteManager = favoriteManager;
  }
  setCollectionManager(collectionManager) {
    this.collectionManager = collectionManager;
  }
  setUploadManager(uploadManager) { // Added
    this.uploadManager = uploadManager;
  }

  navigateToSongDetail(trackObject) {
    this.appState.currentSongDetail = trackObject;
    UIManager.toggleSongDetail(true, trackObject, this.appState, {
      webSocketManager: this.webSocketManager,
      playerManager: this.playerManager,
      uiManager: this.uiManager,
      searchManager: this.searchManager,
      favoriteManager: this.favoriteManager,
      collectionManager: this.collectionManager,
      uploadManager: this.uploadManager,
      navigationManager: this
    });
  }

  // Removed handleUpdateCoverFileSelect, handleUpdateTrackSubmit, handleDeleteTrack
  // These are now handled by UIManager or specific managers/page modules.

  handleMainContentClick(event) {
    const inlineLink = event.target.closest(".inline-nav-link");
    if (inlineLink && inlineLink.dataset.page) {
      event.preventDefault();
      const pageId = inlineLink.dataset.page;
      const path = inlineLink.getAttribute("href") || `#${pageId}`;
      const title =
        inlineLink.dataset.title ||
        pageId.charAt(0).toUpperCase() + pageId.slice(1);
      const subPageId = inlineLink.dataset.subpageid || null;
      this.navigateTo(pageId, title, path, false, subPageId);
    }
  }
}

export default NavigationManager;
