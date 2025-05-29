// frontend/pages/UpdateTrackPage.js

import { lyricsToolHtml } from '../modules/LyricsEditor.js';
// For UploadTrackPage & UpdateTrackPage
import { 
    initLyricsEditorControls, 
    setMainPlayerManager, 
    lyricsEditorAudio, // Needed for playerManager.setLyricsEditorAudio
    loadAudioSource,
    parseLRC, // Used if displaying preview of existing lyrics
    renderLyricsPreview // Used if displaying preview of existing lyrics
} from '../modules/LyricsEditor.js';
class UpdateTrackPage {
    constructor() {
        // Page-specific initialization if any
    }

    getHTML() {
        return `
            <div id="update-track-page">
                <h2>Update Track Information</h2>
                <div id="update-track-form"> 
                    <input type="hidden" id="update-music-id" name="music_id">
                    <div class="form-columns-wrapper" style="display: flex; gap: 20px;width:100%;">
                        <div class="form-column-left" style="flex: 1;">
                            <div class="form-section">
                                <h3>Track Metadata</h3>
                                <div>
                                    <label for="update-title">Title:</label>
                                    <input type="text" id="update-title" name="title" required>
                                </div>
                                <div>
                                    <label for="update-artist">Artist:</label>
                                    <input type="text" id="update-artist" name="artist" required>
                                </div>
                                <div>
                                    <label for="update-album">Album:</label>
                                    <input type="text" id="update-album" name="album">
                                </div>
                            </div>
                            <div class="form-section">
                                <h3>Cover Art</h3>
                                <div class="cover-upload-area">
                                    <input type="file" id="update-cover-file-input" name="cover_file" accept="image/*" style="display: none;">
                                    <input type="hidden" id="update-cover-ext" name="cover_ext">
                                    <button type="button" id="update-cover-upload-button" class="cover-upload-button">
                                        <span class="material-icons initial-icon">add_photo_alternate</span>
                                        <img src="#" alt="Cover Preview" class="cover-preview-image" style="display: none;">
                                    </button>
                                    <p class="cover-upload-hint">Click to upload new cover image.</p>
                                </div>
                            </div>
                            <div class="form-section">
                                <h3>Description</h3>
                                <div>
                                    <label for="update-description">Track Description:</label>
                                    <textarea id="update-description" name="description" rows="4"></textarea>
                                </div>
                            </div>
                        </div>
                        <div class="form-column-right" style="flex: 1;">
                            <div class="lyrics-tool-container-wrapper"> <!-- Wrapper for consistent styling if needed -->
                                ${lyricsToolHtml} 
                            </div>
                            <div class="form-section">
                                <h3>Categorization & Details</h3>
                                <div>
                                    <label for="update-genre">Genre:</label>
                                    <input type="text" id="update-genre" name="genre">
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="button" id="save-track-update-button" class="dialog-button primary">Save Changes</button>
                        <button type="button" id="cancel-track-update-button" class="dialog-button secondary">Cancel</button>
                    </div>
                </div> 
            </div>
    `;
    }

    onLoad(mainContentElement, subPageId, appState, managers) { // subPageId is musicIdToUpdate
        console.log('UpdateTrackPage loaded for:', subPageId,managers);
        const musicIdToUpdate = subPageId;
        const form = mainContentElement.querySelector("#update-track-form");

        if (!form) {
            console.error("Update track form not found on the page.");
            mainContentElement.innerHTML = "<p>Error: Update form failed to load.</p>";
            return;
        }

        let trackToUpdate = null;
        if (appState.currentSongDetail && String(appState.currentSongDetail.music_id || appState.currentSongDetail.id) === String(musicIdToUpdate)) {
            trackToUpdate = appState.currentSongDetail;
        } else if (appState.library) {
            trackToUpdate = appState.library.find(track => String(track.music_id || track.id) === String(musicIdToUpdate));
        }

        if (trackToUpdate) {
            appState.editingTrackInitialData = JSON.parse(JSON.stringify(trackToUpdate)); // Deep copy
            appState.newCoverSelectedForUpdate = false;
            appState.selectedCoverBase64 = null;
            appState.selectedCoverFileObject = null;
            appState.selectedCoverExt = null;

            form.querySelector("#update-music-id").value = trackToUpdate.music_id || trackToUpdate.id || "";
            form.querySelector("#update-title").value = trackToUpdate.title || "";
            form.querySelector("#update-artist").value = trackToUpdate.author || trackToUpdate.artist_name || "";
            form.querySelector("#update-album").value = trackToUpdate.album_name || trackToUpdate.album || "";
            form.querySelector("#update-genre").value = trackToUpdate.genre || "";
            form.querySelector("#update-description").value = trackToUpdate.description || "";

            const lrcInputArea = form.querySelector("#lrc-input-area");
            const lrcPreviewArea = mainContentElement.querySelector("#lrc-preview-area");
            if (lrcInputArea && lrcPreviewArea) {
                lrcInputArea.value = trackToUpdate.lyrics || "";
                if (typeof renderLyricsPreview === "function" && typeof parseLRC === "function") {
                    const parsed = parseLRC(trackToUpdate.lyrics || "");
                    renderLyricsPreview(parsed.lyrics ? parsed.lyrics : parsed, lrcPreviewArea);
                }
            }

            const updateCoverButton = mainContentElement.querySelector("#update-cover-upload-button");
            const updateCoverFileInput = mainContentElement.querySelector("#update-cover-file-input");
            if (updateCoverButton && updateCoverFileInput) {
                // Click listener for button to file input is likely global or handled by NavigationManager/UIManager
                // updateCoverButton.addEventListener('click', () => updateCoverFileInput.click());
                
                const imgElement = updateCoverButton.querySelector(".cover-preview-image");
                const iconElement = updateCoverButton.querySelector(".initial-icon");
                let existingCoverSrc = null;
                if (trackToUpdate.cover_path && trackToUpdate.cover_path.trim() !== "") {
                    existingCoverSrc = "." + trackToUpdate.cover_path;
                } else if (trackToUpdate.preview_cover) {
                    existingCoverSrc = trackToUpdate.preview_cover;
                }

                if (imgElement && iconElement && existingCoverSrc) {
                    imgElement.src = existingCoverSrc;
                    imgElement.style.display = "block";
                    iconElement.style.display = "none";
                } else if (imgElement && iconElement) {
                    imgElement.style.display = "none";
                    iconElement.style.display = "block";
                }
            }
        } else {
            console.error(`Track with ID ${musicIdToUpdate} not found for update.`);
            const pageElement = mainContentElement.querySelector("#update-track-page");
            if (pageElement) {
                 pageElement.innerHTML = `<p style="color: red; text-align: center;">Error: Could not load track details for ID ${musicIdToUpdate}.</p>`;
            } else {
                 mainContentElement.innerHTML = `<p style="color: red; text-align: center;">Error: Could not load track details for ID ${musicIdToUpdate}.</p>`;
            }
            return; // Stop further processing if track not found
        }

        // Lyrics Editor Initialization
        const lyricsEditorContainer = mainContentElement.querySelector(".lyrics-tool-container");
        if (lyricsEditorContainer) {
            initLyricsEditorControls(lyricsEditorContainer, appState, managers);
            if (managers.playerManager && typeof managers.playerManager.setLyricsEditorAudio === "function") {
                managers.playerManager.setLyricsEditorAudio(lyricsEditorAudio);
            }
             if (typeof setMainPlayerManager === "function") {
                 setMainPlayerManager(managers.playerManager);
            }

            if (trackToUpdate && trackToUpdate.audio_path) { // Check trackToUpdate is defined
                const audioUrl = "." + trackToUpdate.audio_path;
                loadAudioSource(audioUrl);
            } else {
                console.warn("No audio_path found for update-track page, cannot load audio for lyrics editor.");
                loadAudioSource(null);
            }
        } else {
            loadAudioSource(null); // Clear if editor not present
        }
        
        // Focus logic
        if (appState.focusElementAfterLoad) {
            const elementToFocus = document.querySelector(appState.focusElementAfterLoad);
            if (elementToFocus && mainContentElement.contains(elementToFocus)) {
                setTimeout(() => elementToFocus.focus(), 50);
            }
            delete appState.focusElementAfterLoad;
        }

        // Event Handlers
        const saveUpdateButton = mainContentElement.querySelector("#save-track-update-button");
        const cancelUpdateButton = mainContentElement.querySelector("#cancel-track-update-button");

        if (saveUpdateButton && managers.uploadManager) { // UIManager now has handleUpdateTrackSubmit
            saveUpdateButton.addEventListener('click', (event) => {
                event.preventDefault();
                managers.uploadManager.handleUpdateTrackSubmit().then(result =>managers.navigationManager.navigateTo(
                ...result
                ))
                
            });
        }
        if (cancelUpdateButton && managers.navigationManager) {
            cancelUpdateButton.addEventListener('click', () => {
                managers.navigationManager.navigateBack();
            });
        }
    }
    
    onUnload() {
        console.log('UpdateTrackPage unloaded');
        // Clear any sensitive appState properties related to this form
        if (appState) {
            delete appState.editingTrackInitialData;
            delete appState.newCoverSelectedForUpdate;
            // selectedCoverBase64 is more general, might not need clearing here unless specifically for this page's edit context
            // delete appState.selectedCoverBase64; 
            delete appState.selectedCoverFileObject;
            delete appState.selectedCoverExt;
        }
         // Ensure lyrics editor audio is cleared
        if (lyricsEditorAudio && lyricsEditorAudio.src && lyricsEditorAudio.src.startsWith("blob:")) {
             URL.revokeObjectURL(lyricsEditorAudio.src); // Should not happen for update-track as it uses path
        }
        loadAudioSource(null);
    }
}

export default UpdateTrackPage;
