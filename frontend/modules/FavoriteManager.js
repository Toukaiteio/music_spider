// frontend/modules/FavoriteManager.js

class FavoriteManager {
    constructor({ webSocketManager, appState }) {
        this.webSocketManager = webSocketManager;
        this.appState = appState;
        this.favoriteSongIds = [];
        this.playlistName = "Liked";
        
        // Bind methods
        this.toggleFavorite = this.toggleFavorite.bind(this);
        this.isFavorite = this.isFavorite.bind(this);
    }

    async init() {
        await this._loadFavorites();
        console.log("FavoriteManager initialized.");
    }

    async _loadFavorites() {
        try {
            const resp = await this.webSocketManager.sendWebSocketCommand('get_playlist_tracks', { name: this.playlistName });
            if (resp.code === 0 && resp.data) {
                const tracks = resp.data.tracks || [];
                this.favoriteSongIds = tracks.map(t => String(t.music_id || t.id || t.bvid));
            }
        } catch (error) {
            console.error("FavoriteManager: Error loading favorites from backend", error);
        }
    }

    getFavoriteSongIds() {
        return [...this.favoriteSongIds]; // Return a copy
    }

    isFavorite(songId) {
        if (songId === null || typeof songId === 'undefined') return false;
        return this.favoriteSongIds.includes(String(songId));
    }

    async addFavorite(trackData) {
        if (!trackData) return;
        const songId = String(trackData.music_id || trackData.id || trackData.bvid);
        
        try {
            const resp = await this.webSocketManager.sendWebSocketCommand('add_to_playlist', {
                playlist_name: this.playlistName,
                track_data: trackData
            });
            
            if (resp.code === 0) {
                if (!this.favoriteSongIds.includes(songId)) {
                    this.favoriteSongIds.push(songId);
                    document.dispatchEvent(new CustomEvent('favoritesChanged', {
                        detail: { songId, isFavorite: true, source: 'FavoriteManager' }
                    }));
                    console.log(`FavoriteManager: Added ${songId} to favorites.`);
                }
                return true;
            }
        } catch (error) {
            console.error("FavoriteManager: Error adding favorite to backend", error);
        }
        return false;
    }

    async removeFavorite(songId) {
        if (songId === null || typeof songId === 'undefined') return;
        const idStr = String(songId);
        
        try {
            const resp = await this.webSocketManager.sendWebSocketCommand('remove_from_playlist', {
                playlist_name: this.playlistName,
                music_id: idStr
            });
            
            if (resp.code === 0) {
                const index = this.favoriteSongIds.indexOf(idStr);
                if (index > -1) {
                    this.favoriteSongIds.splice(index, 1);
                    document.dispatchEvent(new CustomEvent('favoritesChanged', {
                        detail: { songId: idStr, isFavorite: false, source: 'FavoriteManager' }
                    }));
                    console.log(`FavoriteManager: Removed ${idStr} from favorites.`);
                }
                return true;
            }
        } catch (error) {
            console.error("FavoriteManager: Error removing favorite from backend", error);
        }
        return false;
    }

    async toggleFavorite(trackData) {
        if (!trackData) {
            console.warn("FavoriteManager: toggleFavorite called with invalid trackData");
            return false; 
        }
        const songId = String(trackData.music_id || trackData.id || trackData.bvid);
        if (this.isFavorite(songId)) {
            return await this.removeFavorite(songId);
        } else {
            return await this.addFavorite(trackData);
        }
    }
}

export default FavoriteManager;
