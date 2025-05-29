// frontend/pages/HomePage.js

import SongCardRenderer from '../modules/SongCardRenderer.js';

class HomePage {
    constructor() {
        // Page-specific initialization if any
    }

    getHTML() {
        return `
       <div id="home-page">
           <h2>My Library</h2>
           <div id="home-loading-message" style="display:none; text-align:center; padding: 20px;">Loading your library...</div>
           <div id="song-card-grid">
               <!-- Song cards will be dynamically inserted here by JS -->
           </div>
           <div id="no-songs-message" style="display:none;">
               <p>Your library is empty. Use the search bar in the header to find and download music.</p>
           </div>
       </div>
    `;
    }

    onLoad(mainContentElement, subPageId, appState, managers) {
        console.log('HomePage loaded');

        const homeLoadingMessage = mainContentElement.querySelector("#home-loading-message");
        const songCardGrid = mainContentElement.querySelector("#song-card-grid");
        const noSongsMessage = mainContentElement.querySelector("#no-songs-message");

        if (homeLoadingMessage) homeLoadingMessage.style.display = "block";
        if (songCardGrid) songCardGrid.style.display = "none";
        if (noSongsMessage) noSongsMessage.style.display = "none";

        managers.webSocketManager.sendWebSocketCommand("get_downloaded_music", {})
            .then((response) => {
                if (homeLoadingMessage) homeLoadingMessage.style.display = "none";
                const libraryData = response.data && response.data.library ? response.data.library : [];
                appState.library = libraryData;
                managers.playerManager.setPlayList(libraryData);

                if (libraryData && libraryData.length > 0) {
                    if (songCardGrid) {
                        songCardGrid.innerHTML = ""; // Clear previous content
                        libraryData.forEach((track) => {
                            // const musicId = track.music_id; // Not directly used for rendering card here
                            // let imageUrl = "placeholder_cover_1.png"; // Handled by SongCardRenderer
                            // if (track.preview_cover && typeof track.preview_cover === 'string' && track.preview_cover.trim() !== '') {
                            //     imageUrl = track.preview_cover;
                            // }
                            // const trackTitle = track.title || "Unknown Title"; // Handled by SongCardRenderer
                            const isFavorite = managers.favoriteManager ? managers.favoriteManager.isFavorite(track.music_id) : false;
                            songCardGrid.innerHTML += SongCardRenderer.render(track, "library", { isFavorite });
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

        // Focus logic, if any, previously handled by NavigationManager for 'home'
        if (appState.focusElementAfterLoad) {
            const elementToFocus = document.querySelector(appState.focusElementAfterLoad);
            if (elementToFocus && mainContentElement.contains(elementToFocus)) {
                setTimeout(() => elementToFocus.focus(), 50);
            }
            delete appState.focusElementAfterLoad; // Clear it if it was meant for this page
        }
    }

    // Add any other page-specific methods here
}

export default HomePage;
