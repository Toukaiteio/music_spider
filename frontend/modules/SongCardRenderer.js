// frontend/modules/SongCardRenderer.js

class SongCardRenderer {
    /**
     * Renders a song card HTML string.
     * @param {object} track - The track object.
     * @param {string} context - The context in which the card is being rendered 
     *                           (e.g., 'library', 'search-result', 'collection-view').
     * @param {object} options - Additional options, e.g., { isDownloaded: true/false } for search results.
     * @returns {string} HTML string for the song card.
     */
    static render(track, context = 'library', options = {}) {
        if (!track) {
            console.warn("SongCardRenderer: Track object is undefined. Cannot render card.");
            return ""; // Return empty string or a placeholder/error HTML
        }

        const musicId = track.music_id || track.id || `generated-${Math.random().toString(36).substr(2, 9)}`;
        let imageUrl = track.cover_path ? '.' + track.cover_path : (track.preview_cover?.replace('large','t500x500') || track.artwork_url?.replace('large','t500x500') || track.cover_url?.replace('large','t500x500') || 'placeholder_cover_1.png');
        
        // Ensure image URLs that might be local are correctly prefixed if necessary
        // For now, assuming URLs are absolute or correctly relative from CSS.
        // If preview_cover is a local path like "./covers/image.png", it should work if served correctly.

        const title = track.title || "Unknown Title";
        const artist = track.author || track.artist_name || "Unknown Artist";
        
        // Sanitize track info for data attribute
        // Ensure track object is stringified and quotes are escaped for HTML attribute
        const trackInfoJson = JSON.stringify(track).replace(/'/g, "&apos;");

        let actionButtonsHtml = "";

        if (context === 'library') {
            actionButtonsHtml = `
                <button class="add-to-collection-button icon-button" aria-label="Add to Playlist" data-song-id="${musicId}" data-track-info='${trackInfoJson}'>
                    <span class="material-icons">playlist_add</span>
                </button>
            `;
        } else if (context === 'search-result') {
            if (options.isDownloaded) {
                 actionButtonsHtml = `
                    <button class="icon-button action-button-disabled" disabled title="Already in your library">
                        <span class="material-icons">check_circle</span>
                    </button>
                `; // Using action-button-disabled for consistent styling
            } else {
                 actionButtonsHtml = `
                    <button class="search-result-download-button icon-button" aria-label="Download" data-track-info='${trackInfoJson}'>
                        <span class="material-icons">download</span>
                    </button>
                `;
            }
        } else if (context === 'collection-view') { 
            actionButtonsHtml = `
                <button class="remove-from-collection-button icon-button" data-song-id="${musicId}" aria-label="Remove from this collection">
                    <span class="material-icons">remove_circle_outline</span>
                </button>
                <button class="add-to-collection-button icon-button" aria-label="Add to Playlist" data-song-id="${musicId}" data-track-info='${trackInfoJson}'>
                    <span class="material-icons">playlist_add</span>
                </button>
            `;
        } else if (context === 'favorites-view') { // Favorites view specific buttons (if different from collection)
             actionButtonsHtml = `
                <button class="add-to-collection-button icon-button" aria-label="Add to Playlist" data-song-id="${musicId}" data-track-info='${trackInfoJson}'>
                    <span class="material-icons">playlist_add</span>
                </button>
            `;
        }


        // Favorite button - always added, icon depends on options.isFavorite
        const favoriteIcon = options.isFavorite ? 'favorite' : 'favorite_border';
        const favoriteButtonHtml = `
            <button class="favorite-button icon-button" data-song-id="${musicId}" aria-label="Favorite">
                <span class="material-icons">${favoriteIcon}</span>
            </button>
        `;

        return `
            <div class="song-card" data-song-id="${musicId}" data-track-info='${trackInfoJson}' data-source="${track.source || 'unknown'}">
                <div class="card-art-container">
                    <img src="${imageUrl}" alt="Album Art for ${title}" class="song-card-art">
                    <button class="play-on-card-button icon-button" aria-label="Play Song" data-track-info='${trackInfoJson}'>
                        <span class="material-icons">play_arrow</span>
                    </button>
                </div>
                <div class="song-card-info">
                    <h3 class="song-card-title">${title}</h3>
                    <p class="song-card-artist">${artist}</p>
                </div>
                <div class="song-card-actions">
                    ${favoriteButtonHtml}
                    ${actionButtonsHtml} 
                </div>
            </div>
        `;
    }
}

export default SongCardRenderer;
