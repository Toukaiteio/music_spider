// frontend/pages/CollectionDetailPage.js

import SongCardRenderer from '../modules/SongCardRenderer.js';

class CollectionDetailPage {
    constructor() {
        // Page-specific initialization if any
        this.currentOpenCollectionName = null;
        this.removeSongHandler = null;
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

    async onLoad(mainContentElement, subPageId, appState, managers) { // subPageId is the collection name
        console.log('CollectionDetailPage loaded for:', subPageId);

        const collectionsLoadingMessage = mainContentElement.querySelector("#collections-loading-message");
        const songCardGrid = mainContentElement.querySelector("#song-card-grid");
        const noMusicMessage = mainContentElement.querySelector("#collections-no-music-message");
        const collectionNameElement = mainContentElement.querySelector("#collection-name");
        
        this.currentOpenCollectionName = subPageId;

        if (collectionsLoadingMessage) collectionsLoadingMessage.style.display = "block";
        if (songCardGrid) songCardGrid.style.display = "none";
        if (noMusicMessage) noMusicMessage.style.display = "none";
        if (collectionNameElement) collectionNameElement.textContent = subPageId;

        try {
            const resp = await managers.webSocketManager.sendWebSocketCommand('get_playlist_tracks', { name: subPageId });
            if (resp.code !== 0) {
                console.error("CollectionDetailPage: Failed to load playlist tracks:", resp.error);
                if (collectionsLoadingMessage) {
                    collectionsLoadingMessage.innerHTML = `<p style="color: red;">Failed to load playlist: ${resp.error}</p>`;
                }
                return;
            }

            const collectionTracks = resp.data.tracks || [];

            if (collectionTracks.length === 0) {
                if (noMusicMessage) {
                    noMusicMessage.style.display = "block";
                    noMusicMessage.textContent = `This playlist "${subPageId}" is empty.`;
                }
                if (songCardGrid) songCardGrid.style.display = "none";
            } else {
                if (songCardGrid) {
                    songCardGrid.innerHTML = ""; // Clear previous content
                    collectionTracks.forEach((track) => {
                        const trackId = String(track.music_id || track.id || track.bvid);
                        const isFavorite = managers.favoriteManager ? managers.favoriteManager.isFavorite(trackId) : false;
                        songCardGrid.innerHTML += SongCardRenderer.render(track, "collection-view", { 
                            isFavorite, 
                            collectionName: this.currentOpenCollectionName 
                        });
                    });
                    songCardGrid.style.display = "grid";
                    
                    if (managers.collectionManager) {
                        this._attachRemoveFromCollectionListeners(songCardGrid, managers.collectionManager, this.currentOpenCollectionName);
                    }
                }
                if (noMusicMessage) noMusicMessage.style.display = "none";
            }
        } catch (error) {
            console.error("CollectionDetailPage: Error loading collection details:", error);
            if (collectionsLoadingMessage) {
                collectionsLoadingMessage.innerHTML = '<p style="color: red;">An error occurred while loading the collection.</p>';
            }
        } finally {
            if (collectionsLoadingMessage) collectionsLoadingMessage.style.display = "none";
        }

        // Focus logic
        if (appState.focusElementAfterLoad) {
            const elementToFocus = document.querySelector(appState.focusElementAfterLoad);
            if (elementToFocus && mainContentElement.contains(elementToFocus)) {
                setTimeout(() => elementToFocus.focus(), 50);
            }
            delete appState.focusElementAfterLoad;
        }
    }

    _attachRemoveFromCollectionListeners(songCardGridElement, collectionManager, currentOpenCollectionName) {
        if (!songCardGridElement || !collectionManager) return;

        if (this.removeSongHandler) {
            songCardGridElement.removeEventListener('click', this.removeSongHandler);
        }
        
        this.removeSongHandler = (event) => {
            const removeButton = event.target.closest(".remove-from-collection-button");
            if (removeButton && currentOpenCollectionName) {
                const songId = removeButton.dataset.songId;
                if (songId) {
                    collectionManager.removeSongFromCollection(songId, currentOpenCollectionName);
                }
            }
        };
        songCardGridElement.addEventListener('click', this.removeSongHandler);
    }

    onUnload() {
        const songCardGrid = document.querySelector("#song-card-grid");
        if (songCardGrid && this.removeSongHandler) {
            songCardGrid.removeEventListener('click', this.removeSongHandler);
        }
    }
}

export default CollectionDetailPage;
