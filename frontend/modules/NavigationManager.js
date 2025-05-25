// frontend/modules/NavigationManager.js
import SongCardRenderer from './SongCardRenderer.js';

class NavigationManager {
    constructor({
        mainContentElement,
        drawerLinksSelector,
        pageContents,
        webSocketManager,
        playerManager,
        uiManager, // For setPlayerVisibility and other UI updates
        // displaySearchResultsOnPageCallback, // Removed
        renderDrawerCollectionsCallback, // For updating collections in drawer
        getCollectionsCallback, // For getting collections
        appState, // Pass the global appState
        // searchManager instance will be set via setSearchManager
    }) {
        this.mainContent = mainContentElement;
        this.drawerLinksElements = document.querySelectorAll(drawerLinksSelector); // Query drawer links internally
        this.pageContents = pageContents; // Use the provided pageContents
        this.webSocketManager = webSocketManager;
        this.playerManager = playerManager;
        this.uiManager = uiManager;
        // this.displaySearchResultsOnPage = displaySearchResultsOnPageCallback; // Removed
        this.renderDrawerCollections = renderDrawerCollectionsCallback;
        this.getCollections = getCollectionsCallback;
        this.appState = appState;
        this.searchManager = null; // Will be set by setSearchManager
        this.favoriteManager = null; // Will be set by setFavoriteManager

        // Bind methods
        this.navigateTo = this.navigateTo.bind(this);
        this.updateActiveDrawerLink = this.updateActiveDrawerLink.bind(this);
        this.handlePopState = this.handlePopState.bind(this);
        this.handleInitialLoad = this.handleInitialLoad.bind(this);
        this.handleMainContentClick = this.handleMainContentClick.bind(this);
        this.handleFavoriteChange = this.handleFavoriteChange.bind(this); // Bind new handler
    }

    init() {
        // Update drawerLinksElements each time init is called, or ensure they are fresh
        this.drawerLinksElements = document.querySelectorAll(".drawer-link");

        this.drawerLinksElements.forEach(link => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const pageId = link.dataset.page;
                const path = link.getAttribute('href');
                let title = link.querySelector(".link-text")?.textContent || pageId.charAt(0).toUpperCase() + pageId.slice(1);
                
                // For collection detail links, the title should be the collection name
                if (pageId === 'collection-detail' && link.dataset.collectionName) {
                    title = link.dataset.collectionName;
                    this.navigateTo(pageId, title, path, false, link.dataset.collectionName);
                } else {
                    this.navigateTo(pageId, title, path);
                }
            });
        });

        window.addEventListener('popstate', this.handlePopState);
        // The mainContent click listener is complex and involves more than just navigation.
        // It's better to keep it in script.js for now and call navigationManager.navigateTo from there when needed.
        // However, we can move the specific navigation part for song cards here.
        // For now, this.mainContent.addEventListener('click', this.handleMainContentClick); will be set up
        // but the actual call to navigateTo for song details will be done from script.js after parsing track info.

        this.handleInitialLoad();
        document.addEventListener('favoritesChanged', this.handleFavoriteChange);
        document.addEventListener('collectionChanged', this.handleCollectionChange.bind(this)); // Listen for collection changes
    }

    updateActiveDrawerLink(pageId, subPageId = null) {
        this.drawerLinksElements = document.querySelectorAll(".drawer-link"); // Refresh the list
        this.drawerLinksElements.forEach((link) => {
            link.classList.remove("active");
            const linkPage = link.dataset.page;
            const linkCollectionName = link.dataset.collectionName;

            if (pageId === "collection-detail" && subPageId) {
                if (linkPage === "collection-detail" && linkCollectionName === subPageId) {
                    link.classList.add("active");
                }
            } else if (linkPage === pageId && !linkCollectionName) { // Avoid activating collection links when on main 'collections' page
                 if (pageId === "collections" && linkPage === "collections" && !linkCollectionName) {
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

        this.mainContent.innerHTML =
            this.pageContents[pageId] ||
            `<h2>Page Not Found</h2><p>The page "${pageId}" does not exist or has been moved.</p>`;

        document.title = title + " - Music Downloader";

        if (!skipPushState) {
            history.pushState({ pageId: pageId, subPageId: subPageId }, title, path);
        }

        this.updateActiveDrawerLink(pageId, subPageId);

        this.mainContent.style.opacity = "0";
        requestAnimationFrame(() => {
            this.mainContent.style.transition = "opacity 0.3s ease-in-out";
            this.mainContent.style.opacity = "1";

            // Page-specific logic
            if (pageId === "home") {
                const homeLoadingMessage = this.mainContent.querySelector("#home-loading-message");
                const songCardGrid = this.mainContent.querySelector("#song-card-grid");
                const noSongsMessage = this.mainContent.querySelector("#no-songs-message");

                if (homeLoadingMessage) homeLoadingMessage.style.display = "block";
                if (songCardGrid) songCardGrid.style.display = "none";
                if (noSongsMessage) noSongsMessage.style.display = "none";

                this.webSocketManager.sendWebSocketCommand("get_downloaded_music", {})
                    .then((response) => {
                        if (homeLoadingMessage) homeLoadingMessage.style.display = "none";
                        const libraryData = response.data && response.data.library ? response.data.library : [];
                        this.appState.library = libraryData;
                        this.playerManager.setPlayList(libraryData);
                        if (libraryData && libraryData.length > 0) {
                            if (songCardGrid) {
                                songCardGrid.innerHTML = ""; // Clear previous content
                                libraryData.forEach((track) => {
                                    const musicId = track.music_id;
                                    let imageUrl = "placeholder_cover_1.png";
                                    if (track.preview_cover && typeof track.preview_cover === "string" && track.preview_cover.trim() !== "") {
                                        imageUrl = track.preview_cover;
                                    }
                                    const trackTitle = track.title || "Unknown Title";
                                    const isFavorite = this.favoriteManager ? this.favoriteManager.isFavorite(track.music_id) : false;
                                    songCardGrid.innerHTML += SongCardRenderer.render(track, 'library', { isFavorite });
                                });
                                songCardGrid.style.display = "grid";
                            }
                            if (noSongsMessage) noSongsMessage.style.display = "none";
                        } else {
                            if (songCardGrid) songCardGrid.style.display = "none";
                            if (noSongsMessage) noSongsMessage.style.display = "block";
                        }
                    })
                    .catch((error) => {
                        console.error("Failed to load library:", error);
                        if (homeLoadingMessage) {
                            homeLoadingMessage.innerHTML = '<p style="color: red;">Failed to load your library. Please try again later.</p>';
                            homeLoadingMessage.style.display = "block";
                        }
                        if (songCardGrid) songCardGrid.style.display = "none";
                        if (noSongsMessage) noSongsMessage.style.display = "none";
                    });
            } else if (pageId === "search-results") {
                // Content is set by mainContent.innerHTML.
                // SearchManager will be responsible for populating it.
                // NavigationManager ensures the page is visible, then SearchManager fills it.
                if (this.searchManager) {
                    // Ensure DOM is updated before displayResults tries to access elements
                    setTimeout(() => this.searchManager.displayResults(), 0);
                } else {
                    console.warn("NavigationManager: SearchManager not set, cannot display search results.");
                    // Optionally display a message in the mainContent area
                    this.mainContent.innerHTML += '<p style="color:red;text-align:center;">Error: Search functionality is currently unavailable.</p>';
                }
            } else if (pageId === "song-detail") {
                const track = this.appState.currentSongDetail;
                if (!track) {
                    this.mainContent.innerHTML = '<p style="color:red; text-align:center; padding:20px;">Error: Song details not found. Please go back and try again.</p>';
                    return;
                }
                const coverArtEl = document.getElementById("detail-cover-art");
                const titleEl = document.getElementById("detail-title");
                const artistEl = document.getElementById("detail-artist");
                const descriptionEl = document.getElementById("detail-description");
                // Buttons are now handled by the main event listener in script.js for play/add to collection

                let detailImageUrl = "placeholder_album_art.png";
                if (track.preview_cover && typeof track.preview_cover === "string" && track.preview_cover.trim() !== "") {
                    detailImageUrl = track.preview_cover;
                } else if (track.cover_url && typeof track.cover_url === "string" && track.cover_url.trim() !== "") {
                    detailImageUrl = track.cover_url;
                }

                if (coverArtEl) coverArtEl.src = detailImageUrl;
                if (titleEl) titleEl.textContent = track.title || "Unknown Title";
                if (artistEl) artistEl.textContent = track.author || track.artist_name || "Unknown Artist";
                if (descriptionEl) descriptionEl.textContent = track.description || "No description available.";
                
                // Add track info to buttons for script.js listener
                const playButtonEl = this.mainContent.querySelector(".detail-play-button");
                const addToCollectionButtonEl = this.mainContent.querySelector(".detail-add-to-collection-button");
                const trackInfoJson = JSON.stringify(track).replace(/'/g, "&apos;");
                const songId = track.music_id;

                if (playButtonEl) playButtonEl.dataset.trackInfo = trackInfoJson;
                if (addToCollectionButtonEl) {
                    addToCollectionButtonEl.dataset.trackInfo = trackInfoJson;
                    if (songId) addToCollectionButtonEl.dataset.songId = songId;
                }

            } else if (pageId === "collections" || pageId === "collection-detail") {
                const collectionsLoadingMessage = this.mainContent.querySelector("#collections-loading-message");
                const songCardGrid = this.mainContent.querySelector("#song-card-grid");
                const noMusicMessage = this.mainContent.querySelector("#collections-no-music-message");
                const collectionNameElement = this.mainContent.querySelector("#collection-name");


                if (collectionsLoadingMessage) collectionsLoadingMessage.style.display = "block";
                if (songCardGrid) songCardGrid.style.display = "none";
                if (noMusicMessage) noMusicMessage.style.display = "none";
                
                let collectionTracks = [];
                let currentCollectionName = "";
                this.currentOpenCollectionName = null; // Reset current open collection

                if (pageId === "collection-detail" && subPageId) {
                    currentCollectionName = subPageId;
                    this.currentOpenCollectionName = subPageId; // Store for the event handler
                    if(collectionNameElement) collectionNameElement.textContent = currentCollectionName;

                    const collections = this.getCollections(); 
                    const collection = collections.find(c => c.name === subPageId);
                    if (collection && collection.songs) {
                        const allLibraryTracks = this.appState.library || [];
                        collectionTracks = collection.songs.map(musicId => 
                            allLibraryTracks.find(track => String(track.music_id) === String(musicId))
                        ).filter(Boolean);
                    } else if (!collection) {
                         this.navigateTo("collections", "Collections", "#collections", true); // Redirect if collection not found
                         return;
                    }
                     // Update the message for empty collections specifically
                    if (noMusicMessage && collectionTracks.length === 0) {
                        noMusicMessage.textContent = `This playlist "${currentCollectionName}" is empty.`;
                    }

                } else { // My Favorites view (pageId === 'collections' && !subPageId)
                    currentCollectionName = "My Favorites";
                     if(collectionNameElement) collectionNameElement.textContent = currentCollectionName;
                    
                    if (this.favoriteManager) {
                        const favoriteIds = this.favoriteManager.getFavoriteSongIds();
                        const allLibraryTracks = this.appState.library || [];
                        collectionTracks = allLibraryTracks.filter(track => favoriteIds.includes(String(track.music_id)));
                    } else {
                        collectionTracks = [];
                    }
                    if (noMusicMessage && collectionTracks.length === 0) {
                        noMusicMessage.textContent = "You haven't added any songs to your favorites yet.";
                    }
                }


                if (collectionTracks.length > 0) {
                    if (songCardGrid) {
                        songCardGrid.innerHTML = ""; // Clear previous content
                        collectionTracks.forEach((track) => {
                            // For 'favorites-view', isFavorite is always true. For 'collection-detail', it's dynamic.
                            const isFavorite = (pageId === 'collections' && !subPageId) || (this.favoriteManager ? this.favoriteManager.isFavorite(track.music_id) : false);
                            const cardContext = (pageId === 'collections' && !subPageId) ? 'favorites-view' : 'collection-view';
                            songCardGrid.innerHTML += SongCardRenderer.render(track, cardContext, { isFavorite });
                        });
                        songCardGrid.style.display = "grid";
                        // Attach listener for remove buttons if this is a specific collection view
                        if (pageId === 'collection-detail' && subPageId) {
                            this._attachRemoveFromCollectionListeners(songCardGrid);
                        }
                    }
                    if (noMusicMessage && collectionTracks.length > 0) noMusicMessage.style.display = "none";
                } else { 
                    if (songCardGrid) songCardGrid.style.display = "none";
                    if (noMusicMessage) noMusicMessage.style.display = "block"; // Message is set above based on context
                }
                if (collectionsLoadingMessage) collectionsLoadingMessage.style.display = "none";
            }
        });
    }
    
    _attachRemoveFromCollectionListeners(songCardGridElement) {
        if (!songCardGridElement) return;
        // Remove existing listener to prevent duplicates if this method is called multiple times on the same element
        if (this.removeSongFromCollectionHandler) {
            songCardGridElement.removeEventListener('click', this.removeSongFromCollectionHandler);
        }
        // Bind the handler to `this` context of NavigationManager
        this.removeSongFromCollectionHandler = this._handleRemoveSongFromCollectionClick.bind(this);
        songCardGridElement.addEventListener('click', this.removeSongFromCollectionHandler);
    }

    _handleRemoveSongFromCollectionClick(event) {
        const removeButton = event.target.closest('.remove-from-collection-button');
        if (removeButton && this.collectionManager && this.currentOpenCollectionName) {
            const songId = removeButton.dataset.songId;
            if (songId) {
                console.log(`NavigationManager: Remove song ${songId} from collection ${this.currentOpenCollectionName}`);
                this.collectionManager.removeSongFromCollection(songId, this.currentOpenCollectionName);
                // The 'collectionChanged' event will trigger page refresh via handleCollectionChange
            }
        }
    }

    handleFavoriteChange(event) {
        const { songId, isFavorite } = event.detail; // Source removed as it wasn't used
        console.log(`NavigationManager: favoritesChanged event for songId ${songId}, isFavorite: ${isFavorite}`);

        const currentPageId = this.getCurrentPageId();
        const currentSubPageId = this.getCurrentSubPageId();
        const relevantPages = ['home', 'collections', 'collection-detail', 'search-results'];

        if (relevantPages.includes(currentPageId)) {
            console.log(`NavigationManager: Refreshing page ${currentPageId} due to favorite change.`);
            this.navigateTo(currentPageId, document.title.replace(' - Music Downloader', ''), location.hash, true, currentSubPageId);
        }
    }

    handleCollectionChange(event) {
        const { collectionName, songId, action } = event.detail;
        console.log(`NavigationManager: collectionChanged event for collection ${collectionName}, songId ${songId}, action: ${action}`);

        const currentPageId = this.getCurrentPageId();
        const currentSubPageId = this.getCurrentSubPageId();

        // If a song was removed and we are currently viewing that collection, refresh the view.
        if (action === 'removed' && 
            (currentPageId === 'collection-detail' && currentSubPageId === collectionName) || 
            (currentPageId === 'collections' && currentSubPageId === collectionName) ) { // Also handles if collections main page lists songs
            console.log(`NavigationManager: Refreshing collection page ${collectionName} due to song removal.`);
            this.navigateTo(currentPageId, document.title.replace(' - Music Downloader', ''), location.hash, true, currentSubPageId);
        }
        // Could add handling for 'added' action if needed in the future for other features
    }
    
    getCurrentSubPageId() {
        const hash = location.hash.substring(1);
        const parts = hash.split('/');
        return parts[1] || null; 
    }

    handlePopState(event) {
        const pageIdFromState = event.state ? event.state.pageId : null;
        const subPageIdFromState = event.state ? event.state.subPageId : null;

        if (pageIdFromState) {
            let title = pageIdFromState.charAt(0).toUpperCase() + pageIdFromState.slice(1);
            if (pageIdFromState === "search-results") title = "Search Results";
            if (pageIdFromState === "collection-detail" && subPageIdFromState) title = subPageIdFromState;


            if (!this.pageContents[pageIdFromState]) {
                console.warn(`Invalid page ID in popstate: "${pageIdFromState}". Redirecting to home.`);
                this.navigateTo("home", "Home", "#home", true);
            } else {
                this.navigateTo(pageIdFromState, title, `#${pageIdFromState}${subPageIdFromState ? '/' + subPageIdFromState : ''}`, true, subPageIdFromState);
            }
        } else {
            // Fallback for cases where state is null (e.g., initial load, manual hash change)
            const hash = location.hash.substring(1);
            const parts = hash.split('/');
            const hashPageId = parts[0] || "home";
            const hashSubPageId = parts[1] || null;
            
            const pageIdToLoad = this.pageContents[hashPageId] ? hashPageId : "home";
            let title = pageIdToLoad.charAt(0).toUpperCase() + pageIdToLoad.slice(1);
            if (pageIdToLoad === "search-results") title = "Search Results";
            if (pageIdToLoad === "collection-detail" && hashSubPageId) title = hashSubPageId;

            this.navigateTo(pageIdToLoad, title, `#${hash}`, true, hashSubPageId);
        }
    }

    handleInitialLoad() {
        const hash = location.hash.substring(1);
        const parts = hash.split('/');
        let initialPage = parts[0] || "home";
        const initialSubPageId = parts[1] || null;

        if (!this.pageContents[initialPage]) {
            console.warn(`Invalid page ID in URL hash: "${initialPage}". Defaulting to home.`);
            initialPage = "home";
            // No subPageId for home
        }

        let initialTitle;
        if (initialPage === "search-results") {
            initialTitle = "Search Results";
        } else if (initialPage === "collection-detail" && initialSubPageId) {
            initialTitle = initialSubPageId; // Collection name
        } else {
            // Try to find title from drawer link
            const initialLink = document.querySelector(`.drawer-link[data-page="${initialPage}"]`);
            initialTitle = initialLink?.querySelector(".link-text")?.textContent || initialPage.charAt(0).toUpperCase() + initialPage.slice(1);
        }
        
        const initialPath = `#${initialPage}${initialSubPageId ? '/' + initialSubPageId : ''}`;

        history.replaceState({ pageId: initialPage, subPageId: initialSubPageId }, initialTitle, initialPath);

        // Wait for WebSocket to be open before navigating, if necessary for the initial page.
        // Home page needs WebSocket for library.
        const navigateLogic = () => this.navigateTo(initialPage, initialTitle, initialPath, true, initialSubPageId);

        if (initialPage === "home" || this.webSocketManager.isSocketNeededForPage(initialPage)) { // Hypothetical check
            if (this.webSocketManager.socket && this.webSocketManager.socket.readyState === WebSocket.OPEN) {
                navigateLogic();
            } else {
                // Temporarily override onopen, or use a promise from WebSocketManager
                const originalOnOpen = this.webSocketManager.socket ? this.webSocketManager.socket.onopen : null;
                this.webSocketManager.ensureSocketOpen().then(() => {
                     if (originalOnOpen && this.webSocketManager.socket) {
                        this.webSocketManager.socket.onopen = originalOnOpen; // Restore original
                        if (this.webSocketManager.socket.readyState === WebSocket.OPEN) originalOnOpen(null); // Call it if appropriate
                    }
                    navigateLogic();
                }).catch(err => {
                    console.error("Socket connection failed for initial load:", err);
                    // Potentially navigate to an error page or show a message
                    navigateLogic(); // Attempt navigation anyway, might show errors on page
                });
            }
        } else {
            navigateLogic();
        }
        console.log("NavigationManager initialized. Initial page: " + initialPage + (initialSubPageId ? `/${initialSubPageId}`: ""));
    }

    setSearchManager(searchManager) {
        this.searchManager = searchManager;
    }

    setFavoriteManager(favoriteManager) {
        this.favoriteManager = favoriteManager;
    }
    
    getCurrentPageId() {
        const hash = location.hash.substring(1);
        const parts = hash.split('/');
        return parts[0] || "home";
    }

    // This method is for navigating when a song card (not a drawer link) is clicked.
    // It's called from script.js after parsing track info.
    navigateToSongDetail(trackObject) {
        this.appState.currentSongDetail = trackObject;
        const songHash = trackObject.music_id || trackObject.id || Date.now(); // Create a unique-ish hash
        this.navigateTo(
            "song-detail",
            trackObject.title || "Song Detail",
            `#song-detail/${songHash}`
            // subPageId is not used here, but the songHash acts like one
        );
    }

    // handleMainContentClick is mostly for actions within a page,
    // but navigation actions like clicking a song card to go to detail view
    // are handled by this.navigateToSongDetail(), called from script.js
    handleMainContentClick(event) {
        // Example: Handling inline links if any were part of dynamic content loaded by NavigationManager
        const inlineLink = event.target.closest(".inline-nav-link"); // A hypothetical class for such links
        if (inlineLink && inlineLink.dataset.page) {
            event.preventDefault();
            const pageId = inlineLink.dataset.page;
            const path = inlineLink.getAttribute("href") || `#${pageId}`;
            const title = inlineLink.dataset.title || pageId.charAt(0).toUpperCase() + pageId.slice(1);
            const subPageId = inlineLink.dataset.subpageid || null;
            this.navigateTo(pageId, title, path, false, subPageId);
        }
    }
}

export default NavigationManager;
