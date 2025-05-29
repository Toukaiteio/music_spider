// frontend/pages/CollectionsPage.js

import SongCardRenderer from '../modules/SongCardRenderer.js';

class CollectionsPage {
    constructor() {
        // Page-specific initialization if any
    }

    getHTML() {
        return `
            <div id="collections-page">
                <h2 id="collection-name">My Music Collections</h2>
                <div id="collections-loading-message" style="text-align:center; padding: 20px; display:none;">Loading...</div>
                <div id="song-card-grid" class="collections-song-grid" style="display:none;"></div>
                <div id="collections-no-music-message" style="display:none; text-align:center; padding: 20px;">
                    <p>Select a playlist from the drawer, or create a new one.</p>
                </div>
            </div>
    `;
    }

    onLoad(mainContentElement, subPageId, appState, managers) { // subPageId is not used for CollectionsPage main view
        console.log('CollectionsPage loaded');

        const collectionsLoadingMessage = mainContentElement.querySelector("#collections-loading-message");
        const songCardGrid = mainContentElement.querySelector("#song-card-grid");
        const noMusicMessage = mainContentElement.querySelector("#collections-no-music-message");
        const collectionNameElement = mainContentElement.querySelector("#collection-name");

        // Ensure library is loaded. If not, fetch it and re-navigate.
        // The re-navigate part will be handled by NavigationManager's updated logic later,
        // for now, the page module assumes library might need loading.
        if (!appState.library || appState.library.length === 0) {
            if (collectionsLoadingMessage) collectionsLoadingMessage.style.display = "block";
            // Prevent infinite loop if WebSocket is already trying to load
            if (!window.__collectionsPageLoadingLibrary) {
                window.__collectionsPageLoadingLibrary = true;
                managers.webSocketManager.sendWebSocketCommand("get_downloaded_music", {})
                    .then((response) => {
                        window.__collectionsPageLoadingLibrary = false;
                        const libraryData = response.data && response.data.library ? response.data.library : [];
                        appState.library = libraryData;
                        // Re-trigger load for this page now that library is available
                        // This ideally should be handled more elegantly by NavigationManager or a state change trigger
                        if (managers.navigationManager) {
                             managers.navigationManager.navigateTo(
                                "collections", // current pageId
                                "My Music Collections", // title
                                location.hash, // current path
                                true, // skipPushState
                                null  // subPageId
                             );
                        }
                    })
                    .catch((error) => {
                        window.__collectionsPageLoadingLibrary = false;
                        console.error("Failed to load library for collections:", error);
                        if (collectionsLoadingMessage) {
                            collectionsLoadingMessage.innerHTML = '<p style="color: red;">Failed to load your library. Please try again later.</p>';
                        }
                        if (songCardGrid) songCardGrid.style.display = "none";
                        if (noMusicMessage) noMusicMessage.style.display = "none";
                    });
                return; // Exit to prevent rendering without library
            } else {
                 // Library is already being loaded, wait for re-navigation.
                 return;
            }
        }
        
        if (collectionsLoadingMessage) collectionsLoadingMessage.style.display = "block";
        if (songCardGrid) songCardGrid.style.display = "none";
        if (noMusicMessage) noMusicMessage.style.display = "none";

        let collectionTracks = [];
        const currentCollectionName = "My Favorites"; // For 'collections' page, it's always My Favorites
        if (collectionNameElement) collectionNameElement.textContent = currentCollectionName;
        // appState.currentOpenCollectionName = null; // NM should handle this or it's not needed for this page

        if (managers.favoriteManager) {
            const favoriteIds = managers.favoriteManager.getFavoriteSongIds();
            const allLibraryTracks = appState.library || [];
            collectionTracks = allLibraryTracks.filter(track => favoriteIds.includes(String(track.music_id)));
        } else {
            collectionTracks = [];
        }

        if (noMusicMessage && collectionTracks.length === 0) {
            noMusicMessage.textContent = "You haven't added any songs to your favorites yet.";
        }

        if (collectionTracks.length > 0) {
            if (songCardGrid) {
                songCardGrid.innerHTML = ""; // Clear previous content
                collectionTracks.forEach((track) => {
                    const isFavorite = true; // Always true for "My Favorites" page
                    songCardGrid.innerHTML += SongCardRenderer.render(track, "favorites-view", { isFavorite });
                });
                songCardGrid.style.display = "grid";
            }
            if (noMusicMessage) noMusicMessage.style.display = "none";
        } else {
            if (songCardGrid) songCardGrid.style.display = "none";
            if (noMusicMessage) noMusicMessage.style.display = "block";
        }
        if (collectionsLoadingMessage) collectionsLoadingMessage.style.display = "none";
        
        // Focus logic
        if (appState.focusElementAfterLoad) {
            const elementToFocus = document.querySelector(appState.focusElementAfterLoad);
            if (elementToFocus && mainContentElement.contains(elementToFocus)) {
                setTimeout(() => elementToFocus.focus(), 50);
            }
            delete appState.focusElementAfterLoad;
        }
    }

    // Add any other page-specific methods here
}

export default CollectionsPage;
