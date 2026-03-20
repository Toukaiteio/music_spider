// frontend/modules/SearchManager.js
import SongCardRenderer from "./SongCardRenderer.js";
// const SEARCH_SOURCE = "bilibili" // Will be replaced by dynamic source selection
class SearchManager {
  constructor({
    webSocketManager,
    navigationManager,
    appState,
    uiManager, // Added UIManager
    // favoriteManager will be set via setFavoriteManager
    searchInputSelector = "#header-search-input", // Default selector
  }) {
    this.webSocketManager = webSocketManager;
    this.navigationManager = navigationManager;
    this.appState = appState; // window.appState
    this.uiManager = uiManager; // Store UIManager
    this.favoriteManager = null; // Will be set by setFavoriteManager
    this.searchInput = document.querySelector(searchInputSelector);

    this.availableSources = [];
    this.currentSourceIndex = 0;
    this.searchSourceButton = document.getElementById("search-source-button");
    this.searchSourceIcon = document.getElementById("search-source-icon");

    if (!this.searchInput) {
      console.error(
        `SearchManager: Search input with selector "${searchInputSelector}" not found.`
      );
    }
    if (!this.searchSourceButton) {
      console.error(
        "SearchManager: Search source button #search-source-button not found."
      );
    }
    if (!this.searchSourceIcon) {
      console.error(
        "SearchManager: Search source icon #search-source-icon not found."
      );
    }

    // Bind methods
    this.init = this.init.bind(this);
    this.fetchAvailableSources = this.fetchAvailableSources.bind(this);
    this.updateSearchSourceDisplay = this.updateSearchSourceDisplay.bind(this);
    this.handleSearchSourceButtonClick =
      this.handleSearchSourceButtonClick.bind(this);
    this._attachDownloadButtonListeners =
      this._attachDownloadButtonListeners.bind(this);
    this.handleDownloadButtonClick = this.handleDownloadButtonClick.bind(this);
    this.handleSearchInput = this.handleSearchInput.bind(this);
    this.updateDownloadButtonStatus = this.updateDownloadButtonStatus.bind(this);
  }

  async init() {
    if (this.searchInput) {
      this.searchInput.addEventListener("keypress", this.handleSearchInput);
    } else {
      console.error("SearchManager: Search input not found during init.");
    }
    await this.fetchAvailableSources();

    // Listen for download status changes
    document.addEventListener('download-status-changed', this.updateDownloadButtonStatus);

    // Listen for source status changes (e.g., from Source Manager)
    document.addEventListener('source-status-changed', async () => {
      console.log("SearchManager: Source status changed. Refreshing available sources...");
      await this.fetchAvailableSources();
    });

    console.log("SearchManager initialized.");
  }

  async fetchAvailableSources() {
    if (!this.webSocketManager) {
      console.error(
        "SearchManager: WebSocketManager not available to fetch sources."
      );
      if (this.searchSourceButton) this.searchSourceButton.disabled = true;
      return;
    }
    try {
      const response = await this.webSocketManager.sendWebSocketCommand(
        "get_available_sources",
        {}
      );
      if (
        response &&
        response.data &&
        Array.isArray(response.data.sources) &&
        response.data.sources.length > 0
      ) {
        this.availableSources = response.data.sources;
        // Optionally, set a preferred default source if backend indicates one or sort by preference
        // For now, default to the first one.
        // 尝试从本地获取保存的 source
        const savedSource = localStorage.getItem("searchSource");
        const savedIndex = savedSource
          ? this.availableSources.findIndex((src) => src === savedSource)
          : -1;
        this.currentSourceIndex = savedIndex >= 0 ? savedIndex : 0;
        this.updateSearchSourceDisplay();
        if (this.searchSourceButton) {
          this.searchSourceButton.addEventListener(
            "click",
            this.handleSearchSourceButtonClick
          );
          this.searchSourceButton.disabled = false;
        }
      } else {
        console.warn(
          "SearchManager: No available search sources received or data is malformed.",
          response
        );
        this.availableSources = []; // Ensure it's an empty array
        if (this.searchSourceButton) this.searchSourceButton.disabled = true;
      }
    } catch (error) {
      console.error(
        "SearchManager: Failed to fetch available search sources:",
        error
      );
      this.availableSources = [];
      if (this.searchSourceButton) this.searchSourceButton.disabled = true;
    }
  }

  handleSearchSourceButtonClick(event) {
    if (this.availableSources.length === 0) return;
    event.stopPropagation();
    const dropdown = document.getElementById("search-source-dropdown");
    const isVisible = dropdown.style.display === "flex";
    
    // Close other dropdowns if needed (optional)
    
    dropdown.style.display = isVisible ? "none" : "flex";

    if (!isVisible) {
      this.renderDropdown();
      const closeDropdown = (e) => {
        if (!dropdown.contains(e.target) && e.target !== this.searchSourceButton && !this.searchSourceButton.contains(e.target)) {
          dropdown.style.display = "none";
          document.removeEventListener("click", closeDropdown);
        }
      };
      document.addEventListener("click", closeDropdown);
    }
  }

  renderDropdown() {
    const dropdown = document.getElementById("search-source-dropdown");
    if (!dropdown) return;
    
    dropdown.innerHTML = "";
    this.availableSources.forEach((source, index) => {
      const item = document.createElement("div");
      item.className = `search-source-item ${index === this.currentSourceIndex ? "active" : ""}`;
      item.innerHTML = `
        <img src="source_icon/${source}.ico" alt="${source}" />
        <span>${source}</span>
      `;
      item.onclick = (e) => {
        e.stopPropagation();
        this.currentSourceIndex = index;
        localStorage.setItem("searchSource", source);
        this.updateSearchSourceDisplay();
        dropdown.style.display = "none";
      };
      dropdown.appendChild(item);
    });
  }

  updateSearchSourceDisplay() {
    if (!this.searchSourceIcon || this.availableSources.length === 0) {
      if (this.searchSourceButton) this.searchSourceButton.disabled = true;
      return;
    }
    const source = this.availableSources[this.currentSourceIndex];
    if (source) {
      this.searchSourceIcon.src = `source_icon/${source}.ico`;
      this.searchSourceIcon.alt = `Search source: ${source}`;
      if (this.searchSourceButton) {
        this.searchSourceButton.setAttribute(
          "aria-label",
          `Change search source (current: ${source})`
        );
      }
      
      // Update dropdown active state if it exists
      const dropdown = document.getElementById("search-source-dropdown");
      if (dropdown) {
        const items = dropdown.querySelectorAll(".search-source-item");
        items.forEach((item, idx) => {
          item.classList.toggle("active", idx === this.currentSourceIndex);
        });
      }
    } else {
      console.warn("SearchManager: Current source data is invalid for display.", source);
      if (this.searchSourceButton) this.searchSourceButton.disabled = true;
    }
  }

  async handleSearchInput(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      const query = this.searchInput.value.trim();
      await this.performSearch(query);
    }
  }

  async performSearch(query) {
    this.appState.searchQuery = query;

    if (query === "") {
      console.log("SearchManager: Empty search query.");
      this.appState.searchResults = [];
      this.appState.searchError = null;
      // If already on search results page, update it to show "empty" or prompt.
      // NavigationManager's navigateTo will call displayResults if current page is search-results.
      if (this.navigationManager.getCurrentPageId() === "search-results") {
        this.displayResults();
      } else {
        // Navigate to an empty search page if not already there.
        this.navigationManager.navigateTo(
          "search-results",
          "Search Results",
          "#search-results",
          false
        );
      }
      return;
    }

    // console.log(`SearchManager: Searching for: ${query} (Source: ${SEARCH_SOURCE})`);
    if (this.availableSources.length === 0) {
      console.warn(
        "SearchManager: No search source selected or available. Cannot perform search."
      );
      this.uiManager.showToast(
        "No search source available. Please check connection or configuration.",
        "error"
      );
      return;
    }
    const currentSource = this.availableSources[this.currentSourceIndex];
    console.log(
      `SearchManager: Searching for: ${query} (Source: ${currentSource})`
    );

    // Navigate to results page. If already on search-results, this will just ensure content area is set up.
    // The displayResults method will be called by NavigationManager's navigateTo logic for 'search-results' page.
    if (this.navigationManager.getCurrentPageId() !== "search-results") {
      this.navigationManager.navigateTo(
        "search-results",
        "Search Results",
        "#search-results"
      );
    }

    // Show loading state immediately AFTER navigation ensures the page structure is there.
    // This can be done by displayResults itself based on appState.
    // For now, let's assume navigateTo has prepared the page, and we can show loading.
    const resultsPageContent = document.getElementById("search-results-page");
    if (resultsPageContent) {
      // Check if the page content is loaded
      const loadingMessage = resultsPageContent.querySelector(
        "#search-loading-message"
      );
      const resultsContainer = resultsPageContent.querySelector(
        "#search-results-container"
      );
      if (loadingMessage) loadingMessage.style.display = "block";
      if (resultsContainer) resultsContainer.innerHTML = ""; // Clear previous results
    }

    try {
      const searchResponse = await this.webSocketManager.sendWebSocketCommand(
        "search",
        // { query: query, source: SEARCH_SOURCE } // Assuming SoundCloud for now
        { query: query, source: currentSource } // Use dynamic source ID
      );
      console.log("SearchManager: Results received:", searchResponse);
      this.appState.searchResults = searchResponse.data
        ? searchResponse.data.results || []
        : [];
      this.appState.searchError = null;
    } catch (error) {
      console.error("SearchManager: Search failed:", error);
      this.appState.searchResults = [];
      this.appState.searchError = error.message || "Unknown error occurred";
    } finally {
      // Display results or error. This will be called again by navigateTo if page was changed,
      // but it's fine to call it here to update content if already on the page.
      this.displayResults();
    }
  }

  displayResults() {
    const resultsPageContent = document.getElementById("search-results-page");
    // This check is crucial because displayResults can be called by NavigationManager
    // when the #search-results page is loaded, or by performSearch.
    if (!resultsPageContent || !document.body.contains(resultsPageContent)) {
      // If the search results page structure isn't loaded into the main content area yet, abort.
      // This can happen if performSearch finishes before navigateTo fully renders the page.
      // NavigationManager's navigateTo will call this method again once the page is ready.
      // console.log("SearchManager: Search results page content not ready for display.");
      return;
    }

    const queryText = this.appState.searchQuery || "";
    const pageTitle = resultsPageContent.querySelector("h2");
    if (pageTitle) {
      pageTitle.textContent = queryText
        ? `Search Results for "${queryText}"`
        : "Search Results";
    }

    const queryInfoDisplay = resultsPageContent.querySelector(
      "#search-results-info"
    );
    const queryStrongDisplay = resultsPageContent.querySelector(
      "#search-results-query"
    );
    if (queryInfoDisplay && queryStrongDisplay) {
      if (queryText) {
        queryStrongDisplay.textContent = queryText;
        queryInfoDisplay.style.display = "block";
      } else {
        queryInfoDisplay.style.display = "none";
      }
    }

    const resultsContainer = resultsPageContent.querySelector(
      "#search-results-container"
    );
    const noResultsMessage = resultsPageContent.querySelector(
      "#no-search-results-message"
    );
    const errorMessageDisplay = resultsPageContent.querySelector(
      "#search-error-message"
    );
    const loadingMessage = resultsPageContent.querySelector(
      "#search-loading-message"
    );

    if (
      !resultsContainer ||
      !noResultsMessage ||
      !errorMessageDisplay ||
      !loadingMessage
    ) {
      console.error(
        "SearchManager: One or more display elements for search results are missing from the DOM."
      );
      return;
    }

    resultsContainer.innerHTML = "";
    noResultsMessage.style.display = "none";
    errorMessageDisplay.style.display = "none";
    loadingMessage.style.display = "none";

    if (this.appState.searchError) {
      errorMessageDisplay.textContent = `Sorry, an error occurred: ${this.appState.searchError}`;
      errorMessageDisplay.style.display = "block";
    } else if (
      this.appState.searchResults &&
      this.appState.searchResults.length > 0
    ) {
      resultsContainer.style.display = "block";
      let songCardGrid = resultsContainer.querySelector(".song-card-grid");
      if (!songCardGrid) {
        songCardGrid = document.createElement("div");
        songCardGrid.className = "song-card-grid search-results-grid";
        resultsContainer.appendChild(songCardGrid);
      } else {
        songCardGrid.innerHTML = ""; // Clear if it existed
      }

      this.appState.searchResults.forEach((track) => {
        const trackId = track.id
          ? String(track.id)
          : track.bvid
            ? track.bvid
            : null; // Ensure track.id exists and is a string for isFavorite
        const isDownloaded =
          this.appState.library &&
          this.appState.library.some(
            (libraryTrack) =>
              libraryTrack.music_id === trackId ||
              libraryTrack.bvid === trackId ||
              (libraryTrack.id && String(libraryTrack.id) === trackId)
          );
        const isFavorite = this.favoriteManager
          ? this.favoriteManager.isFavorite(trackId)
          : false;
        songCardGrid.innerHTML += SongCardRenderer.render(
          track,
          "search-result",
          { isDownloaded, isFavorite }
        );
      });
      this._attachDownloadButtonListeners(songCardGrid); // Attach listeners after rendering
    } else if (queryText) {
      // Searched but no results
      noResultsMessage.style.display = "block";
    } else {
      // No search query, initial state of search page
      resultsContainer.innerHTML =
        "<p>Enter a search term in the header to find music.</p>";
    }
    console.log("SearchManager: Results displayed.");
  }

  _attachDownloadButtonListeners(parentElement) {
    if (!parentElement) return;
    parentElement.addEventListener("click", this.handleDownloadButtonClick);
    parentElement.addEventListener('click', this.handleSongCardClick.bind(this));
  }
  showTrackDetailsDialog(track) {
    // Create dialog HTML
    const dialogHTML = `
    <div class="track-details-dialog" id="track-details-dialog">
        <div class="dialog-content">
            <button class="close-dialog-button" aria-label="Close">
                <span class="material-icons">close</span>
            </button>
            <div class="track-cover">
                <img src="${track.artwork_url || "./assets/default-cover.png"
      }"
                         alt="${track.title} cover">
            </div>
            <div class="track-info">
                <h3>${track.title || "Unknown Title"}</h3>
                <p class="artist">${track.artist || "Unknown Artist"
      }</p>
                <p class="duration">${track.duration
        ? this.formatDuration(track.duration)
        : "Unknown duration"
      }</p>
                ${track.description
        ? `<div class="description">${track.description}</div>`
        : ""
      }
            </div>
        </div>
    </div>
`;
    const isDownloaded =
      this.appState.library &&
      this.appState.library.some(
        (libraryTrack) =>
          libraryTrack.music_id === (track.id ? String(track.id) : track.bvid || "") ||
          libraryTrack.bvid === (track.bvid || "") ||
          (libraryTrack.id && String(libraryTrack.id) === (track.id ? String(track.id) : ""))
      );

    // 动态创建下载按钮
    const downloadButton = document.createElement("button");
    downloadButton.className = "search-result-download-button";
    downloadButton.style.marginTop = "16px";
    downloadButton.innerHTML = '<span class="material-icons">download</span>';
    downloadButton.dataset.trackInfo = JSON.stringify(track);

    // 如果已下载则禁用按钮
    if (isDownloaded) {
      downloadButton.disabled = true;
      downloadButton.title = "Already downloaded";
    }

    // 绑定点击事件：下载并关闭dialog
    downloadButton.addEventListener("click", (event) => {
      this.handleDownloadButtonClick(event);
      // 关闭弹窗
      const dialog = document.getElementById("track-details-dialog");
      if (dialog) dialog.remove();
    });

    // 插入到dialog内容
    const dialogContent = document.createElement("div");
    dialogContent.innerHTML = dialogHTML;
    dialogContent.querySelector(".track-info").appendChild(downloadButton);

    // 用新内容替换原HTML插入
    document.body.appendChild(dialogContent.firstElementChild);
    const closeButton = document.querySelector("#track-details-dialog .close-dialog-button");
    if (closeButton) {
      closeButton.addEventListener("click", () => {
        const dialog = document.getElementById("track-details-dialog");
        if (dialog) dialog.remove();
      });
    }
    return;

  }
  handleSongCardClick(event) {
    const songCard = event.target.closest(".song-card");
    if (!songCard) return;

    // Check if click was on a button inside the card
    if (event.target.closest(".song-card-button")) {
      return; // Let button handlers deal with it
    }

    const trackInfoString = songCard.dataset.trackInfo;
    if (!trackInfoString) return;

    try {
      const track = JSON.parse(trackInfoString);
      this.showTrackDetailsDialog(track);
    } catch (e) {
      console.error("Failed to parse track info:", e);
    }
  }
  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  handleDownloadButtonClick(event) {
    const downloadButton = event.target.closest(
      ".search-result-download-button"
    );
    if (!downloadButton) return;

    event.preventDefault(); // Prevent any default button action
    const trackInfoString = downloadButton.dataset.trackInfo;

    if (trackInfoString && !downloadButton.disabled) {
      try {
        const trackObject = JSON.parse(trackInfoString);
        console.log(
          "SearchManager: Download button clicked for track:",
          trackObject
        );

        this.uiManager.addTrackToDownloadQueue(trackObject, this.webSocketManager);
      } catch (e) {
        console.error(
          "SearchManager: Failed to parse track info or initiate download:",
          e
        );
        this.uiManager.showToast("Error processing this download request.", "error");
      }
    } else if (downloadButton.disabled) {
      console.log("SearchManager: Download button is already disabled.");
    } else {
      console.error("SearchManager: No track info found on download button.");
    }
  }

  updateDownloadButtonStatus(event) {
    const { trackId, status } = event.detail;

    // This is called on any download status change, so we need to check if the search results page is visible.
    const resultsContainer = document.getElementById("search-results-container");
    if (!resultsContainer || !document.body.contains(resultsContainer)) {
      return; // Not on the search results page
    }

    // Find the specific song card by its track ID (which could be music_id, id, or bvid)
    const songCard = resultsContainer.querySelector(`[data-song-id="${trackId}"]`);
    if (!songCard) {
      return; // This track is not in the current search results
    }

    const downloadButton = songCard.querySelector('.search-result-download-button, .action-button-disabled');
    if (!downloadButton) {
      return; // No download button found on this card
    }

    switch (status) {
      case 'downloading':
      case 'processing':
      case 'downloading_segments':
      case 'all_segments_downloaded':
      case 'concatenating_segments':
        downloadButton.innerHTML = '<span class="material-icons">downloading</span>';
        downloadButton.disabled = true;
        break;
      case 'completed_track':
        // Replace the button with a "check" icon button
        const checkButton = document.createElement('button');
        checkButton.className = 'icon-button action-button-disabled';
        checkButton.disabled = true;
        checkButton.title = 'Already in your library';
        checkButton.innerHTML = '<span class="material-icons">check_circle</span>';
        downloadButton.replaceWith(checkButton);
        break;
      case 'error':
        // Re-enable the download button and show a download icon
        downloadButton.innerHTML = '<span class="material-icons">download</span>';
        downloadButton.disabled = false;
        // Optionally, we could show an error icon for a short time
        // For now, just revert to downloadable state.
        break;
      case 'pending':
        downloadButton.innerHTML = '<span class="material-icons">hourglass_top</span>';
        downloadButton.disabled = true;
        break;
      default:
        // For other states, do nothing, or revert to a default state if necessary
        break;
    }
  }

  setFavoriteManager(favoriteManager) {
    this.favoriteManager = favoriteManager;
  }
}

export default SearchManager;
