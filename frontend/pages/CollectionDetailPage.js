// frontend/pages/CollectionDetailPage.js

import SongCardRenderer from '../modules/SongCardRenderer.js';

class CollectionDetailPage {
    constructor() {
        // Page-specific initialization if any
    }

    getHTML() {
        return `
            <div id="collections-page"> <!-- Re-uses collections page structure -->
                <h2 id="collection-name">Collection Name</h2>
                <div id="collections-loading-message" style="text-align:center; padding: 20px; display:none;">Loading...</div>
                <div id="song-card-grid" class="collections-song-grid" style="display:none;"></div>
                <div id="collections-no-music-message" style="display:none; text-align:center; padding: 20px;">
                    <p>This playlist is empty.</p>
                </div>
            </div>
    `;
    }

    // Helper method (can be part of the class or imported if it's made more global)
    _getCollections() {
        return JSON.parse(localStorage.getItem("userCollections")) || [];
    }

    onLoad(mainContentElement, subPageId, appState, managers) { // subPageId is the collection name
        console.log('CollectionDetailPage loaded for:', subPageId);

        const collectionsLoadingMessage = mainContentElement.querySelector("#collections-loading-message");
        const songCardGrid = mainContentElement.querySelector("#song-card-grid");
        const noMusicMessage = mainContentElement.querySelector("#collections-no-music-message");
        const collectionNameElement = mainContentElement.querySelector("#collection-name");
        
        // Store current open collection name on appState or a page instance variable if needed for event handlers
        // For now, we use a convention that this page instance is for this subPageId
        this.currentOpenCollectionName = subPageId;


        if (!appState.library || appState.library.length === 0) {
            if (collectionsLoadingMessage) collectionsLoadingMessage.style.display = "block";
            if (!window.__collectionDetailPageLoadingLibrary) {
                window.__collectionDetailPageLoadingLibrary = true;
                managers.webSocketManager.sendWebSocketCommand("get_downloaded_music", {})
                    .then((response) => {
                        window.__collectionDetailPageLoadingLibrary = false;
                        const libraryData = response.data && response.data.library ? response.data.library : [];
                        appState.library = libraryData;
                        if (managers.navigationManager) {
                             managers.navigationManager.navigateTo(
                                "collection-detail", // current pageId
                                subPageId, // title (collection name)
                                location.hash, // current path
                                true, // skipPushState
                                subPageId // current subPageId
                             );
                        }
                    })
                    .catch((error) => {
                        window.__collectionDetailPageLoadingLibrary = false;
                        console.error("Failed to load library for collection detail:", error);
                        if (collectionsLoadingMessage) {
                            collectionsLoadingMessage.innerHTML = '<p style="color: red;">Failed to load your library. Please try again later.</p>';
                        }
                        // Further error display handled by the main logic below
                    });
                return;
            } else {
                return;
            }
        }

        if (collectionsLoadingMessage) collectionsLoadingMessage.style.display = "block";
        if (songCardGrid) songCardGrid.style.display = "none";
        if (noMusicMessage) noMusicMessage.style.display = "none";

        let collectionTracks = [];
        let currentCollectionName = subPageId; // From subPageId
        // managers.navigationManager.currentOpenCollectionName = subPageId; // This was how NM tracked it

        if (collectionNameElement) collectionNameElement.textContent = currentCollectionName;

        const collections = this._getCollections(); // Use helper
        const collection = collections.find(c => c.name === subPageId);

        if (collection && collection.songs) {
            const allLibraryTracks = appState.library || [];
            collectionTracks = collection.songs.map(musicId =>
                allLibraryTracks.find(track => String(track.music_id) === String(musicId))
            ).filter(Boolean); // Filter out undefined if a song ID is not in library
        } else if (!collection && managers.navigationManager) {
            // Redirect if collection not found
            managers.navigationManager.navigateTo("collections", "Collections", "#collections", true);
            return;
        }

        if (noMusicMessage && collectionTracks.length === 0) {
            noMusicMessage.textContent = `This playlist "${currentCollectionName}" is empty.`;
        }
        
        if (collectionTracks.length > 0) {
            if (songCardGrid) {
                songCardGrid.innerHTML = ""; // Clear previous content
                collectionTracks.forEach((track) => {
                    const isFavorite = managers.favoriteManager ? managers.favoriteManager.isFavorite(track.music_id) : false;
                    // Add remove button data if this page is responsible for it.
                    // The original NM._attachRemoveFromCollectionListeners was complex.
                    // For now, ensure cardContext is 'collection-view'
                    songCardGrid.innerHTML += SongCardRenderer.render(track, "collection-view", { isFavorite, collectionName: this.currentOpenCollectionName });
                });
                songCardGrid.style.display = "grid";
                // Listener for remove buttons will be attached in step 6 (script.js refactor) or if specific to this page, here.
                // For now, we assume the main click listener in script.js will handle .remove-from-collection-button
                // or CollectionManager sets up these listeners.
                // Original: this._attachRemoveFromCollectionListeners(songCardGrid);
                // Let's try to attach it here if CollectionManager is available
                if (managers.collectionManager) {
                    this._attachRemoveFromCollectionListeners(songCardGrid, managers.collectionManager, this.currentOpenCollectionName);
                }

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

    // Add this method to CollectionDetailPage class for handling remove buttons
    _attachRemoveFromCollectionListeners(songCardGridElement, collectionManager, currentOpenCollectionName) {
        if (!songCardGridElement || !collectionManager) return;

        // Use a more specific selector if possible, or ensure this listener is specific enough.
        // Storing the handler to remove it later if the page reloads/re-attaches.
        if (this.removeSongHandler) {
            songCardGridElement.removeEventListener('click', this.removeSongHandler);
        }
        
        this.removeSongHandler = (event) => {
            const removeButton = event.target.closest(".remove-from-collection-button");
            if (removeButton && currentOpenCollectionName) {
                const songId = removeButton.dataset.songId;
                if (songId) {
                    console.log(`CollectionDetailPage: Remove song ${songId} from collection ${currentOpenCollectionName}`);
                    collectionManager.removeSongFromCollection(songId, currentOpenCollectionName);
                    // The 'collectionChanged' event, if dispatched by CollectionManager and listened to by NavigationManager,
                    // should trigger a page refresh. Or this page could listen for it.
                    // For now, assume NM handles refresh based on its existing 'collectionChanged' listener.
                }
            }
        };
        songCardGridElement.addEventListener('click', this.removeSongHandler);
    }

    onUnload() {
        // Cleanup the listener if the page is unloaded
        const songCardGrid = document.querySelector("#song-card-grid"); // Re-query as mainContentElement might be stale
        if (songCardGrid && this.removeSongHandler) {
            songCardGrid.removeEventListener('click', this.removeSongHandler);
        }
        // console.log('CollectionDetailPage unloaded');
    }
}

export default CollectionDetailPage;
