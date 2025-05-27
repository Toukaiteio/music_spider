// frontend/modules/NavigationManager.js
import SongCardRenderer from './SongCardRenderer.js';
import { initLyricsEditorControls, setMainPlayerManager, lyricsEditorAudio, loadAudioSource } from './LyricsEditor.js';
// PlayerManager is already available as this.playerManager.

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
        if(getCollectionsCallback)
            this.getCollections = getCollectionsCallback;
        this.appState = appState;
        this.searchManager = null; // Will be set by setSearchManager
        this.favoriteManager = null; // Will be set by setFavoriteManager
        this.navigationHistory = [];
        this.currentPageId = null;
        this.currentSubPageId = null;
        this.currentPath = null;
        this.currentTitle = null;


        // Bind methods
        this.navigateTo = this.navigateTo.bind(this);
        this.navigateBack = this.navigateBack.bind(this); // Bind new method
        this.updateActiveDrawerLink = this.updateActiveDrawerLink.bind(this);
        this.handlePopState = this.handlePopState.bind(this);
        this.handleInitialLoad = this.handleInitialLoad.bind(this);
        this.handleMainContentClick = this.handleMainContentClick.bind(this);
        this.handleFavoriteChange = this.handleFavoriteChange.bind(this); // Bind new handler
        this._animateColorBands = this._animateColorBands.bind(this); // Bind new method
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
    getCollections(){
        return JSON.parse(localStorage.getItem('userCollections')) || [];
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

        // Exit animation for song-detail page if currently on it and navigating elsewhere
        if (this.currentPageId === 'song-detail' && pageId !== 'song-detail' && !skipPushState) {
            const songDetailPageElement = this.mainContent.querySelector('#song-detail-page');
            if (songDetailPageElement) {
                songDetailPageElement.classList.add('song-detail-page-exit');
                songDetailPageElement.addEventListener('animationend', () => {
                    // Actual navigation after animation
                    this._performNavigateTo(pageId, title, path, skipPushState, subPageId);
                }, { once: true });
                return; // Prevent immediate navigation
            }
        }
        // If not coming from song-detail with an exit animation, proceed directly
        this._performNavigateTo(pageId, title, path, skipPushState, subPageId);
    }

    // Encapsulated the original navigateTo logic
    _performNavigateTo(pageId, title, path, skipPushState = false, subPageId = null) {
        if (!this.mainContent) { // Re-check in case it's called directly somehow
            console.error("Main content area not found in _performNavigateTo!");
            return;
        }

        // Animate color bands before changing content
        this._animateColorBands();

         // Manage navigation history
        if (this.currentPageId && this.currentPageId !== 'song-detail' && !skipPushState) {
            if (this.currentPath && this.currentPath !== path) { // Avoid pushing same page multiple times if logic allows
                this.navigationHistory.push({
                    pageId: this.currentPageId,
                    subPageId: this.currentSubPageId,
                    path: this.currentPath,
                    title: this.currentTitle
                });
                if (this.navigationHistory.length > 10) {
                    this.navigationHistory.shift(); // Keep history to a reasonable size
                }
            }
        }

        // Set upload page active state
        this.appState.isUploadPageActive = (pageId === "upload-track");

        this.mainContent.innerHTML =
            this.pageContents[pageId] ||
            `<h2>Page Not Found</h2><p>The page "${pageId}" does not exist or has been moved.</p>`;

        document.title = title + " - Music Downloader";

        if (!skipPushState) {
            history.pushState({ pageId: pageId, subPageId: subPageId }, title, path);
        }

        this.updateActiveDrawerLink(pageId, subPageId);

        this.mainContent.style.opacity = "0";
        requestAnimationFrame((() => {
            this.mainContent.style.transition = "opacity 0.3s ease-in-out";
            this.mainContent.style.opacity = "1";

            // Page-specific logic
            // Apply enter animation for song-detail page
            if (pageId === 'song-detail') {
                const songDetailPageElement = this.mainContent.querySelector('#song-detail-page');
                if (songDetailPageElement) {
                    // Ensure it's initially ready for animation (opacity 0 is set in CSS)
                    // songDetailPageElement.style.opacity = '0'; // Already set by base #song-detail-page CSS
                    
                    requestAnimationFrame(() => { // Next frame to ensure styles are applied
                        songDetailPageElement.classList.add('song-detail-page-enter');
                        songDetailPageElement.addEventListener('animationend', () => {
                            songDetailPageElement.style.opacity = '1'; // Ensure it's visible after animation
                            songDetailPageElement.classList.remove('song-detail-page-enter');
                        }, { once: true });
                    });
                }
            }
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
            if (track.cover_path && typeof track.cover_path === "string" && track.cover_path.trim() !== "") {
                detailImageUrl = '.' + track.cover_path;
            }
            else if (track.preview_cover && typeof track.preview_cover === "string" && track.preview_cover.trim() !== "") {
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
            const songId = track.music_id || track.id; // Ensure we get the ID

            if (playButtonEl) playButtonEl.dataset.trackInfo = trackInfoJson;
            if (addToCollectionButtonEl) {
                addToCollectionButtonEl.dataset.trackInfo = trackInfoJson;
                if (songId) addToCollectionButtonEl.dataset.songId = songId;
            }

            // Back button for song detail page
            const backButton = this.mainContent.querySelector("#song-detail-back-button");
            if (backButton) {
                backButton.addEventListener('click', this.navigateBack);
            }

            // Lyrics and Upload Lyrics button logic
            const lyricsDisplayArea = this.mainContent.querySelector("#lyrics-display-area");
            const uploadLyricsButton = this.mainContent.querySelector("#upload-lyrics-button");

            if (lyricsDisplayArea && uploadLyricsButton) {
                if (track.lyrics && typeof track.lyrics === 'string' && track.lyrics.trim() !== "") {
                    // For now, display as plain text. Future: Parse LRC if applicable.
                    // To prevent XSS, if lyrics content is user-generated and not sanitized, 
                    // consider using .textContent or sanitizing HTML.
                    // For LRC, a specific rendering function would be needed.
                    lyricsDisplayArea.innerHTML = `<pre>${track.lyrics.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`; // Basic XSS protection for preformatted text
                    uploadLyricsButton.style.display = 'none';
                } else {
                    lyricsDisplayArea.innerHTML = '<p>暂无歌词</p>';
                    uploadLyricsButton.style.display = 'block'; // Or 'inline-block', 'flex' etc. based on CSS
                    uploadLyricsButton.onclick = () => { // Use onclick for simplicity here, or addEventListener
                        this.appState.focusElementAfterLoad = '#lrc-input-area';
                        this.navigateTo('update-track', `Update ${track.title || 'Track'}`, `#update-track/${songId}`, false, songId);
                    };
                }
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
            } else if (pageId === "update-track") {
                const musicIdToUpdate = subPageId; // subPageId is the music_id
                const form = this.mainContent.querySelector("#update-track-form");

                if (!form) {
                    console.error("Update track form not found on the page.");
                    this.mainContent.innerHTML = "<p>Error: Update form failed to load.</p>";
                    return;
                }

                let trackToUpdate = null;
                if (this.appState.currentSongDetail && String(this.appState.currentSongDetail.music_id || this.appState.currentSongDetail.id) === String(musicIdToUpdate)) {
                    trackToUpdate = this.appState.currentSongDetail;
                } else if (this.appState.library) {
                    trackToUpdate = this.appState.library.find(track => String(track.music_id || track.id) === String(musicIdToUpdate));
                }

                if (trackToUpdate) {
                    form.querySelector("#update-music-id").value = trackToUpdate.music_id || trackToUpdate.id || '';
                    form.querySelector("#update-title").value = trackToUpdate.title || '';
                    form.querySelector("#update-artist").value = trackToUpdate.author || trackToUpdate.artist_name || '';
                    form.querySelector("#update-album").value = trackToUpdate.album_name || trackToUpdate.album || ''; // Assuming album_name or album
                    form.querySelector("#update-genre").value = trackToUpdate.genre || '';
                    form.querySelector("#update-year").value = trackToUpdate.year || trackToUpdate.release_year || ''; // Assuming year or release_year
                    form.querySelector("#update-cover-path").value = trackToUpdate.cover_path || '';
                    form.querySelector("#update-description").value = trackToUpdate.description || '';

                    // Handle lyrics for update page
                    const lrcInputArea = form.querySelector("#lrc-input-area");
                    const lrcPreviewArea = this.mainContent.querySelector("#lrc-preview-area"); // Preview area is outside form
                    if (lrcInputArea && lrcPreviewArea) {
                        if (trackToUpdate.lyrics && typeof trackToUpdate.lyrics === 'string') {
                            lrcInputArea.value = trackToUpdate.lyrics;
                            if (typeof window.parseLRC === 'function' && typeof window.renderLyricsPreview === 'function') {
                                const parsedLyrics = window.parseLRC(trackToUpdate.lyrics);
                                window.renderLyricsPreview(parsedLyrics, '#lrc-preview-area');
                            }
                        } else {
                            lrcInputArea.value = '';
                            lrcPreviewArea.innerHTML = 'Lyrics preview will appear here.';
                        }
                    }

                } else {
                    console.error(`Track with ID ${musicIdToUpdate} not found in appState.library or currentSongDetail.`);
                    const pageElement = this.mainContent.querySelector("#update-track-page");
                    if (pageElement) {
                        pageElement.innerHTML = `<p style="color: red; text-align: center;">Error: Could not load track details for ID ${musicIdToUpdate}. Please go back and try again.</p>`;
                    }
                }
            } else if (pageId === "upload-track") {
                const form = this.mainContent.querySelector("#upload-track-form");
                const filenamePlaceholder = this.mainContent.querySelector("#upload-filename-placeholder");

                if (filenamePlaceholder && this.appState.droppedFile) {
                    filenamePlaceholder.textContent = this.appState.droppedFile.name;
                    // Optionally store filename in a hidden input if needed for backend, though backend will receive the file itself
                    const originalFilepathInput = form.querySelector("#upload-original-filepath");
                    if (originalFilepathInput) {
                        originalFilepathInput.value = this.appState.droppedFile.name; // Storing for reference
                    }
                } else if (filenamePlaceholder) {
                     filenamePlaceholder.textContent = "No file selected/dropped.";
                }


                if (form && this.appState.parsedMetadata) {
                    form.querySelector("#upload-title").value = this.appState.parsedMetadata.title || '';
                    form.querySelector("#upload-artist").value = this.appState.parsedMetadata.artist || '';
                    form.querySelector("#upload-album").value = this.appState.parsedMetadata.album || '';
                    form.querySelector("#upload-genre").value = this.appState.parsedMetadata.genre || '';
                    form.querySelector("#upload-year").value = this.appState.parsedMetadata.year || '';
                    // Description is not typically in basic ID3 tags, leave for manual input or future enhancement
                    // Cover preview handling:
                    const coverPreview = form.querySelector("#upload-cover-preview");
                    if (this.appState.parsedMetadata.picture && coverPreview) {
                        const picture = this.appState.parsedMetadata.picture;
                        let base64String = "";
                        for (let i = 0; i < picture.data.length; i++) {
                            base64String += String.fromCharCode(picture.data[i]);
                        }
                        coverPreview.src = `data:${picture.format};base64,${window.btoa(base64String)}`;
                        coverPreview.style.display = 'block';
                    } else if (coverPreview) {
                        coverPreview.style.display = 'none';
                        coverPreview.src = '#';
                    }
                }
                 // Reset file input for cover to ensure change event fires even if same file is re-selected after page load
                const coverFileInput = form.querySelector("#upload-cover-file");
                if(coverFileInput) coverFileInput.value = "";

                // Handle lyrics for upload page (from jsmediatags if available)
                const lrcInputAreaUpload = form.querySelector("#lrc-input-area");
                const lrcPreviewAreaUpload = this.mainContent.querySelector("#lrc-preview-area");
                if (lrcInputAreaUpload && lrcPreviewAreaUpload) {
                    if (this.appState.parsedMetadata && this.appState.parsedMetadata.lyrics && typeof this.appState.parsedMetadata.lyrics === 'string') {
                        lrcInputAreaUpload.value = this.appState.parsedMetadata.lyrics;
                        if (typeof window.parseLRC === 'function' && typeof window.renderLyricsPreview === 'function') {
                            const parsedLyrics = window.parseLRC(this.appState.parsedMetadata.lyrics);
                            window.renderLyricsPreview(parsedLyrics, '#lrc-preview-area');
                        }
                    } else {
                        lrcInputAreaUpload.value = '';
                        lrcPreviewAreaUpload.innerHTML = 'Lyrics preview will appear here.';
                    }
                }
                
                // Note: We don't clear droppedFile or parsedMetadata here anymore, 
                // as the user might navigate away and back before submitting.
                // They are cleared after successful upload or explicit cancellation.
            } else if (pageId === "upload-track") { // This block was duplicated, ensure it's the correct one for upload-track logic
                this.appState.selectedCoverBase64 = null; 
                const form = this.mainContent.querySelector("#upload-track-form");
                const filenamePlaceholder = this.mainContent.querySelector("#upload-filename-placeholder");
                const coverPreview = form.querySelector("#upload-cover-preview");

                if (filenamePlaceholder && this.appState.droppedFile) {
                    filenamePlaceholder.textContent = this.appState.droppedFile.name;
                    const originalFilepathInput = form.querySelector("#upload-original-filepath");
                    if (originalFilepathInput) {
                        originalFilepathInput.value = this.appState.droppedFile.name; 
                    }
                } else if (filenamePlaceholder) {
                     filenamePlaceholder.textContent = "No file selected/dropped.";
                }

                if (form && this.appState.parsedMetadata) {
                    form.querySelector("#upload-title").value = this.appState.parsedMetadata.title || '';
                    form.querySelector("#upload-artist").value = this.appState.parsedMetadata.artist || '';
                    form.querySelector("#upload-album").value = this.appState.parsedMetadata.album || '';
                    form.querySelector("#upload-genre").value = this.appState.parsedMetadata.genre || '';
                    form.querySelector("#upload-year").value = this.appState.parsedMetadata.year || '';
                    
                    if (this.appState.parsedMetadata.picture && coverPreview) {
                        const picture = this.appState.parsedMetadata.picture;
                        let base64String = "";
                        for (let i = 0; i < picture.data.length; i++) {
                            base64String += String.fromCharCode(picture.data[i]);
                        }
                        coverPreview.src = `data:${picture.format};base64,${window.btoa(base64String)}`;
                        coverPreview.style.display = 'block';
                        this.appState.selectedCoverBase64 = coverPreview.src; // Store the auto-loaded cover
                    } else if (coverPreview) {
                        coverPreview.style.display = 'none';
                        coverPreview.src = '#';
                    }
                }
                 // Reset file input for cover to ensure change event fires even if same file is re-selected after page load
                const coverFileInput = form.querySelector("#upload-cover-file");
                if(coverFileInput) coverFileInput.value = "";

                // Note: We don't clear droppedFile or parsedMetadata here anymore, 
                // as the user might navigate away and back before submitting.
                // They are cleared after successful upload or explicit cancellation.
            }

            // Focus logic, should be after all content is loaded and visible
            if (this.appState.focusElementAfterLoad) {
                const elementToFocus = document.querySelector(this.appState.focusElementAfterLoad);
                if (elementToFocus) {
                    // Delay focus slightly to ensure the element is fully rendered and visible, especially after transitions.
                    setTimeout(() => elementToFocus.focus(), 50); 
                }
                delete this.appState.focusElementAfterLoad;
            }

        }));
        
        // Update current page trackers
        this.currentPageId = pageId;
        this.currentSubPageId = subPageId;
        this.currentPath = path;
        this.currentTitle = title;

        // Initialize lyrics editor controls if the page includes the lyrics tool
        if (pageId === "update-track" || pageId === "upload-track") {
            const lyricsEditorContainer = this.mainContent.querySelector(".lyrics-tool-container");
            if (lyricsEditorContainer) {
                initLyricsEditorControls(lyricsEditorContainer);
                // Setup mutual exclusivity
                if (this.playerManager && typeof this.playerManager.setLyricsEditorAudio === 'function') {
                    this.playerManager.setLyricsEditorAudio(lyricsEditorAudio);
                } else {
                    console.warn("PlayerManager instance or setLyricsEditorAudio method not available.");
                }
                setMainPlayerManager(this.playerManager); 

                // Load audio source for Lyrics Editor based on page context
                if (pageId === "update-track") {
                    if (this.appState.currentSongDetail && this.appState.currentSongDetail.music_id) {
                        const audioUrl = `/audio_stream/${this.appState.currentSongDetail.music_id}`;
                        loadAudioSource(audioUrl);
                    } else {
                        console.warn("No currentSongDetail or music_id found for update-track page, cannot load audio for lyrics editor.");
                        loadAudioSource(null); // Clear any previous audio
                    }
                } else if (pageId === "upload-track") {
                    if (this.appState.droppedFile && this.appState.droppedFile.type.startsWith('audio/')) {
                        const blobUrl = URL.createObjectURL(this.appState.droppedFile);
                        loadAudioSource(blobUrl);
                    } else {
                        console.warn("No dropped audio file found for upload-track page, cannot load audio for lyrics editor.");
                        loadAudioSource(null); // Clear any previous audio
                    }
                }

            } else {
                console.warn("Lyrics editor container not found on page:", pageId);
                loadAudioSource(null); // Clear audio if editor not present
            }
        } else {
            // If not on an editor page, ensure any existing blob URLs are revoked
            // and audio source is cleared if it was for the editor.
            // This is primarily for blob URLs from 'upload-track'.
            // The current logic in LyricsEditor.loadAudioSource(null) handles this.
            // We can explicitly call it if lyricsEditorAudio might persist across navigations
            // without going through a new loadAudioSource call.
            // However, loadAudioSource(null) is called when navigating away from editor pages
            // if those pages are the only ones loading audio.
            // For now, let's ensure editor audio is cleared if not on relevant pages:
            if (this.currentPageId === "update-track" || this.currentPageId === "upload-track") {
                 loadAudioSource(null); // Clear audio when navigating away from editor pages
            }
        }
    }

    navigateBack() {
        if (this.currentPageId === 'song-detail') {
            const songDetailPageElement = this.mainContent.querySelector('#song-detail-page');
            if (songDetailPageElement) {
                songDetailPageElement.classList.add('song-detail-page-exit');
                songDetailPageElement.addEventListener('animationend', () => {
                    // songDetailPageElement.classList.remove('song-detail-page-exit'); // Might be removed by innerHTML change
                    this._performActualNavigateBack();
                }, { once: true });
                return; // Prevent immediate navigation
            }
        }
        this._performActualNavigateBack();
    }

    _performActualNavigateBack() {
        if (this.navigationHistory.length > 0) {
            const lastPage = this.navigationHistory.pop();
            // Use _performNavigateTo to bypass exit animation check when navigating back
            this._performNavigateTo(lastPage.pageId, lastPage.title, lastPage.path, true, lastPage.subPageId);
        } else {
            // Fallback to home page if history is empty
            this._performNavigateTo('home', 'Home', '#home', true);
        }
    }

    _animateColorBands() {
        // if(this.playerManager.isPlaying) return;
        const bands = document.querySelectorAll('#background-effects .color-band');
        if (!bands || bands.length === 0) {
            return;
        }

        const newPositions = [];
        const overlapThreshold = 20; // Percentage difference for "too close"
        const maxRetries = 5;
        const positionRange = 70; // Max percentage for top/left to keep bands somewhat away from far edges

        bands.forEach(band => {
            let isTooClose;
            let retries = 0;
            let randomTop, randomLeft;

            do {
                isTooClose = false;
                randomTop = Math.random() * positionRange;
                randomLeft = Math.random() * positionRange;

                for (const pos of newPositions) {
                    if (Math.abs(pos.top - randomTop) < overlapThreshold && Math.abs(pos.left - randomLeft) < overlapThreshold) {
                        isTooClose = true;
                        break;
                    }
                }
                retries++;
            } while (isTooClose && retries < maxRetries);

            newPositions.push({ top: randomTop, left: randomLeft });
            band.style.top = randomTop + '%';
            band.style.left = randomLeft + '%';
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
    setCollectionManager(collectionManager) {
        this.collectionManager = collectionManager;
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

        // Consolidate back button logic if it was previously in mainContent event listener
        // For song-detail page, it's handled directly in navigateTo.
        // If there are other back buttons, they could be handled here or in their respective page load logic.
        const songDetailBackButton = event.target.closest("#song-detail-back-button");
        if (songDetailBackButton && this.getCurrentPageId() === 'song-detail') {
            // This is now redundant if added in navigateTo, but good for general case
            // this.navigateBack(); 
        }
    }
}

export default NavigationManager;
