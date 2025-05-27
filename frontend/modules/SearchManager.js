// frontend/modules/SearchManager.js
import SongCardRenderer from './SongCardRenderer.js';
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
        this.searchSourceButton = document.getElementById('search-source-button');
        this.searchSourceIcon = document.getElementById('search-source-icon');

        if (!this.searchInput) {
            console.error(`SearchManager: Search input with selector "${searchInputSelector}" not found.`);
        }
        if (!this.searchSourceButton) {
            console.error("SearchManager: Search source button #search-source-button not found.");
        }
        if (!this.searchSourceIcon) {
            console.error("SearchManager: Search source icon #search-source-icon not found.");
        }

        // Bind methods
        this.init = this.init.bind(this);
        this.fetchAvailableSources = this.fetchAvailableSources.bind(this);
        this.updateSearchSourceDisplay = this.updateSearchSourceDisplay.bind(this);
        this.handleSearchSourceButtonClick = this.handleSearchSourceButtonClick.bind(this);
        this._attachDownloadButtonListeners = this._attachDownloadButtonListeners.bind(this);
        this.handleDownloadButtonClick = this.handleDownloadButtonClick.bind(this);
        this.handleSearchInput = this.handleSearchInput.bind(this);
    }

    async init() {
        if (this.searchInput) {
            this.searchInput.addEventListener("keypress", this.handleSearchInput);
        } else {
            console.error("SearchManager: Search input not found during init.");
        }
        await this.fetchAvailableSources();
        console.log("SearchManager initialized.");
    }

    async fetchAvailableSources() {
        if (!this.webSocketManager) {
            console.error("SearchManager: WebSocketManager not available to fetch sources.");
            if (this.searchSourceButton) this.searchSourceButton.disabled = true;
            return;
        }
        try {
            const response = await this.webSocketManager.sendWebSocketCommand('get_available_sources', {});
            if (response && response.data && Array.isArray(response.data.sources) && response.data.sources.length > 0) {
                this.availableSources = response.data.sources;
                // Optionally, set a preferred default source if backend indicates one or sort by preference
                // For now, default to the first one.
                this.currentSourceIndex = 0; 
                this.updateSearchSourceDisplay();
                if (this.searchSourceButton) {
                    this.searchSourceButton.addEventListener('click', this.handleSearchSourceButtonClick);
                    this.searchSourceButton.disabled = false;
                }
            } else {
                console.warn("SearchManager: No available search sources received or data is malformed.", response);
                this.availableSources = []; // Ensure it's an empty array
                if (this.searchSourceButton) this.searchSourceButton.disabled = true;
            }
        } catch (error) {
            console.error("SearchManager: Failed to fetch available search sources:", error);
            this.availableSources = [];
            if (this.searchSourceButton) this.searchSourceButton.disabled = true;
        }
    }

    updateSearchSourceDisplay() {
        if (!this.searchSourceIcon || this.availableSources.length === 0) {
            if (this.searchSourceButton) this.searchSourceButton.disabled = true; // Disable button if no sources or icon
            return;
        }
        const source = this.availableSources[this.currentSourceIndex];
        // if (source && source.icon_filename && source.name) {
        if (source) {
            this.searchSourceIcon.src = `source_icon/${source}.ico`;
            this.searchSourceIcon.alt = `Search source: ${source}`;
            if (this.searchSourceButton) {
                 this.searchSourceButton.setAttribute('aria-label', `Change search source (current: ${source})`);
            }
        } else {
            console.warn("SearchManager: Current source data is invalid for display.", source);
            // Optionally set a default/error icon or text
            if (this.searchSourceButton) this.searchSourceButton.disabled = true;
        }
    }

    handleSearchSourceButtonClick() {
        if (this.availableSources.length === 0) return;
        this.currentSourceIndex++;
        if (this.currentSourceIndex >= this.availableSources.length) {
            this.currentSourceIndex = 0;
        }
        this.updateSearchSourceDisplay();
        // Optional: if a search query exists in the input, re-trigger search
        // const query = this.searchInput.value.trim();
        // if (query) {
        //     this.performSearch(query);
        // }
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
                this.navigationManager.navigateTo("search-results", "Search Results", "#search-results", false);
            }
            return;
        }

        // console.log(`SearchManager: Searching for: ${query} (Source: ${SEARCH_SOURCE})`);
        if (this.availableSources.length === 0) {
            console.warn("SearchManager: No search source selected or available. Cannot perform search.");
            this.uiManager.showToast("No search source available. Please check connection or configuration.", "error");
            return;
        }
        const currentSource = this.availableSources[this.currentSourceIndex];
        console.log(`SearchManager: Searching for: ${query} (Source: ${currentSource})`);

        // Navigate to results page. If already on search-results, this will just ensure content area is set up.
        // The displayResults method will be called by NavigationManager's navigateTo logic for 'search-results' page.
        if (this.navigationManager.getCurrentPageId() !== "search-results") {
            this.navigationManager.navigateTo("search-results", "Search Results", "#search-results");
        }


        // Show loading state immediately AFTER navigation ensures the page structure is there.
        // This can be done by displayResults itself based on appState.
        // For now, let's assume navigateTo has prepared the page, and we can show loading.
        const resultsPageContent = document.getElementById("search-results-page");
        if (resultsPageContent) { // Check if the page content is loaded
            const loadingMessage = resultsPageContent.querySelector("#search-loading-message");
            const resultsContainer = resultsPageContent.querySelector("#search-results-container");
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
            this.appState.searchResults = searchResponse.data ? (searchResponse.data.results || []) : [];
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
            pageTitle.textContent = queryText ? `Search Results for "${queryText}"` : "Search Results";
        }

        const queryInfoDisplay = resultsPageContent.querySelector("#search-results-info");
        const queryStrongDisplay = resultsPageContent.querySelector("#search-results-query");
        if (queryInfoDisplay && queryStrongDisplay) {
            if (queryText) {
                queryStrongDisplay.textContent = queryText;
                queryInfoDisplay.style.display = "block";
            } else {
                queryInfoDisplay.style.display = "none";
            }
        }

        const resultsContainer = resultsPageContent.querySelector("#search-results-container");
        const noResultsMessage = resultsPageContent.querySelector("#no-search-results-message");
        const errorMessageDisplay = resultsPageContent.querySelector("#search-error-message");
        const loadingMessage = resultsPageContent.querySelector("#search-loading-message");

        if (!resultsContainer || !noResultsMessage || !errorMessageDisplay || !loadingMessage) {
            console.error("SearchManager: One or more display elements for search results are missing from the DOM.");
            return;
        }
        
        resultsContainer.innerHTML = "";
        noResultsMessage.style.display = "none";
        errorMessageDisplay.style.display = "none";
        loadingMessage.style.display = "none";

        if (this.appState.searchError) {
            errorMessageDisplay.textContent = `Sorry, an error occurred: ${this.appState.searchError}`;
            errorMessageDisplay.style.display = "block";
        } else if (this.appState.searchResults && this.appState.searchResults.length > 0) {
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
                const trackId = track.id ? String(track.id) : null; // Ensure track.id exists and is a string for isFavorite
                const isDownloaded = this.appState.library && this.appState.library.some(libraryTrack => libraryTrack.music_id === trackId || (libraryTrack.id && String(libraryTrack.id) === trackId));
                const isFavorite = this.favoriteManager ? this.favoriteManager.isFavorite(trackId) : false;
                songCardGrid.innerHTML += SongCardRenderer.render(track, 'search-result', { isDownloaded, isFavorite });
            });
            this._attachDownloadButtonListeners(songCardGrid); // Attach listeners after rendering
        } else if (queryText) { // Searched but no results
            noResultsMessage.style.display = "block";
        } else { // No search query, initial state of search page
            resultsContainer.innerHTML = "<p>Enter a search term in the header to find music.</p>";
        }
        console.log("SearchManager: Results displayed.");
    }

    _attachDownloadButtonListeners(parentElement) {
        if (!parentElement) return;
        parentElement.addEventListener('click', this.handleDownloadButtonClick);
    }

    handleDownloadButtonClick(event) {
        const downloadButton = event.target.closest('.search-result-download-button');
        if (!downloadButton) return;

        event.preventDefault(); // Prevent any default button action
        const trackInfoString = downloadButton.dataset.trackInfo;

        if (trackInfoString && !downloadButton.disabled) {
            try {
                const trackObject = JSON.parse(trackInfoString);
                console.log("SearchManager: Download button clicked for track:", trackObject);

                downloadButton.innerHTML = '<span class="material-icons">hourglass_top</span>';
                downloadButton.disabled = true;

                const queueItem = {
                    ...trackObject,
                    artwork_url:trackObject.cover_url,
                    music_id: trackObject.id ? trackObject.id.toString() : Date.now().toString(), // Ensure music_id from id
                    progressPercent: 0,
                    status: "pending",
                    statusMessage: "Queued for download...",
                    original_cmd_id: null,
                };
                this.appState.downloadQueue.push(queueItem);

                this.uiManager.renderTaskQueue();
                this.uiManager.updateMainTaskQueueIcon();

                this.webSocketManager.sendWebSocketCommand("download_track", {
                    // source: trackObject.source || SEARCH_SOURCE, // Ensure source is passed
                    source: trackObject.source || (this.availableSources.length > 0 ? this.availableSources[this.currentSourceIndex] : "soundcloud"),
                    track_data: trackObject,
                })
                .then((response) => {
                    queueItem.original_cmd_id = response ? response.cmd_id : null;
                    this.uiManager.renderTaskQueue();
                    this.uiManager.updateMainTaskQueueIcon();
                })
                .catch((error) => {
                    console.error("SearchManager: Failed to send download command for:", trackObject.title, error);
                    alert(`Failed to start download for: ${trackObject.title}. Error: ${error.message || 'Unknown error'}`);
                    
                    queueItem.status = "error";
                    queueItem.statusMessage = "Failed to queue download";
                    this.uiManager.renderTaskQueue();
                    this.uiManager.updateMainTaskQueueIcon();
                    
                    downloadButton.innerHTML = '<span class="material-icons">download</span>';
                    downloadButton.disabled = false;
                });
            } catch (e) {
                console.error("SearchManager: Failed to parse track info or initiate download:", e);
                alert("Error processing this download request.");
                downloadButton.innerHTML = '<span class="material-icons">download</span>';
                downloadButton.disabled = false; 
            }
        } else if (downloadButton.disabled) {
            console.log("SearchManager: Download button is already disabled.");
        } else {
            console.error("SearchManager: No track info found on download button.");
        }
    }

    setFavoriteManager(favoriteManager) {
        this.favoriteManager = favoriteManager;
    }
}

export default SearchManager;
