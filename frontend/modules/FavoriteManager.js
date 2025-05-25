// frontend/modules/FavoriteManager.js

const FAVORITES_STORAGE_KEY = 'favoriteSongs';

class FavoriteManager {
    constructor() {
        this.favoriteSongIds = this._loadFavorites();
        // Bind methods that might be used as callbacks or event handlers
        this.toggleFavorite = this.toggleFavorite.bind(this);
        this.isFavorite = this.isFavorite.bind(this);
    }

    _loadFavorites() {
        try {
            const storedFavorites = localStorage.getItem(FAVORITES_STORAGE_KEY);
            if (storedFavorites) {
                const parsedFavorites = JSON.parse(storedFavorites);
                // Ensure it's an array of strings for consistency
                return Array.isArray(parsedFavorites) ? parsedFavorites.map(String) : [];
            }
        } catch (error) {
            console.error("FavoriteManager: Error loading favorites from localStorage", error);
        }
        return [];
    }

    _saveFavorites() {
        try {
            localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(this.favoriteSongIds));
        } catch (error) {
            console.error("FavoriteManager: Error saving favorites to localStorage", error);
        }
    }

    getFavoriteSongIds() {
        return [...this.favoriteSongIds]; // Return a copy
    }

    isFavorite(songId) {
        if (songId === null || typeof songId === 'undefined') return false;
        return this.favoriteSongIds.includes(String(songId));
    }

    addFavorite(songId) {
        if (songId === null || typeof songId === 'undefined') return;
        const idStr = String(songId);
        if (!this.favoriteSongIds.includes(idStr)) {
            this.favoriteSongIds.push(idStr);
            this._saveFavorites();
            document.dispatchEvent(new CustomEvent('favoritesChanged', {
                detail: { songId: idStr, isFavorite: true, source: 'FavoriteManager' }
            }));
            console.log(`FavoriteManager: Added ${idStr} to favorites.`);
        }
    }

    removeFavorite(songId) {
        if (songId === null || typeof songId === 'undefined') return;
        const idStr = String(songId);
        const index = this.favoriteSongIds.indexOf(idStr);
        if (index > -1) {
            this.favoriteSongIds.splice(index, 1);
            this._saveFavorites();
            document.dispatchEvent(new CustomEvent('favoritesChanged', {
                detail: { songId: idStr, isFavorite: false, source: 'FavoriteManager' }
            }));
            console.log(`FavoriteManager: Removed ${idStr} from favorites.`);
        }
    }

    toggleFavorite(songId) {
        if (songId === null || typeof songId === 'undefined') {
            console.warn("FavoriteManager: toggleFavorite called with invalid songId");
            return false; 
        }
        const idStr = String(songId);
        if (this.isFavorite(idStr)) {
            this.removeFavorite(idStr);
            return false;
        } else {
            this.addFavorite(idStr);
            return true;
        }
    }
}

export default FavoriteManager;
