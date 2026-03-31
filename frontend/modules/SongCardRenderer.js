// frontend/modules/SongCardRenderer.js
import TrackAdapter from './TrackAdapter.js';

class SongCardRenderer {
    /**
     * Renders a song card HTML string.
     * @param {object} track - The track object.
     * @param {string} context - The context in which the card is being rendered 
     *                           (e.g., 'library', 'search-result', 'collection-view').
     * @param {object} options - Additional options, e.g., { isDownloaded: true/false } for search results.
     * @returns {string} HTML string for the song card.
     */
    static getSourceIcon(track) {
        let source = track.source || '';
        const musicId = TrackAdapter.getMusicId(track) || '';
        
        // If source is missing, try to infer from music_id for older tracks
        if (!source && typeof musicId === 'string') {
            if (musicId.startsWith('netease_')) source = 'netease';
            else if (musicId.startsWith('kugou_')) source = 'kugou';
            else if (musicId.startsWith('BV') || musicId.startsWith('av')) source = 'bilibili';
            else if (musicId.includes('soundcloud')) source = 'soundcloud';
        }
        
        if (source && ['netease', 'kugou', 'bilibili', 'soundcloud'].includes(source)) {
            return `<img src="source_icon/${source}.ico" class="source-tag-icon" alt="${source}" title="${source}">`;
        }
        return '';
    }

    static render(track, context = 'library', options = {}) {
        if (!track) {
            console.warn("SongCardRenderer: Track object is undefined. Cannot render card.");
            return ""; // Return empty string or a placeholder/error HTML
        }

        const musicId = TrackAdapter.getMusicId(track) || `generated-${Math.random().toString(36).substr(2, 9)}`;
        let imageUrl = TrackAdapter.getCoverUrl(track);


        // Ensure image URLs that might be local are correctly prefixed if necessary
        // For now, assuming URLs are absolute or correctly relative from CSS.
        // If preview_cover is a local path like "./covers/image.png", it should work if served correctly.

        const title = track.title || "Unknown Title";
        const artist = track.artist || "Unknown Artist";

        // 规范化后序列化，确保 data-track-info 总是包含完整字段（含 cover_path / audio_path）
        const trackInfoJson = TrackAdapter.toDataAttr(track);


        let actionButtonsHtml = "";
        // Favorite button - always added, icon depends on options.isFavorite
        const favoriteIcon = options.isFavorite ? 'favorite' : 'favorite_border';
        const favoriteButtonHtml = `
            <button class="favorite-button icon-button" data-song-id="${musicId}" aria-label="Favorite">
                <span class="material-icons">${favoriteIcon}</span>
            </button>
        `;

        if (context === 'library') {
            actionButtonsHtml = `
                <button class="add-to-collection-button icon-button" aria-label="Add to Playlist" data-song-id="${musicId}" data-track-info='${trackInfoJson}'>
                    <span class="material-icons">playlist_add</span>
                </button>
                <button class="delete-track-button icon-button" aria-label="Delete Track" data-song-id="${musicId}">
                    <span class="material-icons">delete</span>
                </button>
            ` + favoriteButtonHtml;
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
            ` + favoriteButtonHtml;
        } else if (context === 'favorites-view') { // Favorites view specific buttons (if different from collection)
            actionButtonsHtml = `
                <button class="add-to-collection-button icon-button" aria-label="Add to Playlist" data-song-id="${musicId}" data-track-info='${trackInfoJson}'>
                    <span class="material-icons">playlist_add</span>
                </button>
            ` + favoriteButtonHtml;
        }




        return `
            <div class="song-card" data-song-id="${musicId}" data-track-info='${trackInfoJson}' data-source="${track.source || 'unknown'}">
                <div class="card-art-container">
                    <img referrerpolicy="no-referrer" src="${imageUrl}" alt="Album Art for ${title}" class="song-card-art">
                    <div class="card-tags-container">
                        ${track.lossless ? '<span class="song-tag lossless-tag">无损</span>' : ''}
                        ${track.lyrics ? '<span class="song-tag lyrics-tag">歌词</span>' : ''}
                        ${this.getSourceIcon(track) ? `<span class="song-tag source-tag">${this.getSourceIcon(track)}</span>` : ''}
                    </div>
                    ${context !== 'search-result' ? `
                    <button class="play-on-card-button icon-button" aria-label="Play Song" data-track-info='${trackInfoJson}'>
                        <span class="material-icons">play_arrow</span>
                    </button>
                    ` : ''}
                </div>
                <div class="song-card-info">
                    <div class="song-card-title-scroller">
                        <h3 class="song-card-title" data-title="${title}">${title}</h3>
                    </div>
                    <p class="song-card-artist">${artist}</p>
                </div>
                <div class="song-card-actions">
                    ${actionButtonsHtml} 
                </div>
            </div>
        `;
    }
}

export default SongCardRenderer;
