// frontend/pages/UploadTrackPage.js

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

class UploadTrackPage {
    constructor() {
        // Page-specific initialization if any
        this.currentBlobUrl = null; // Initialize for onUnload
    }

    getHTML() {
        return `
            <div id="upload-track-page">
                <h2>Upload New Track</h2>
                <div id="upload-file-info" style="margin-bottom:15px; padding:10px; background-color: var(--primary-bg-color); border-radius: 5px;">
                    Audio file: <span id="upload-filename-placeholder">No file selected</span>
                </div>
                <div id="upload-track-form"> 
                    <input type="hidden" id="upload-original-filepath" name="original_filepath">
                    <div class="form-columns-wrapper" style="display: flex; gap: 20px;width:100%;">
                        <div class="form-column-left" style="flex: 1;">
                            <div class="form-section">
                                <h3>Track Metadata</h3>
                                <div>
                                    <label for="upload-title">Title:</label>
                                    <input type="text" id="upload-title" name="title" required>
                                </div>
                                <div>
                                    <label for="upload-artist">Artist:</label>
                                    <input type="text" id="upload-artist" name="artist" required>
                                </div>
                                <div>
                                    <label for="upload-album">Album:</label>
                                    <input type="text" id="upload-album" name="album">
                                </div>
                            </div>
                            <div class="form-section">
                                <h3>Cover Art</h3>
                                <div class="cover-upload-area">
                                    <label for="upload-cover-file-input">Cover Image (Optional):</label>
                                    <input type="file" id="upload-cover-file-input" name="cover_file" accept="image/*" style="display: none;">
                                    <input type="hidden" id="upload-cover-ext" name="cover_ext">
                                    <button type="button" id="upload-cover-upload-button" class="cover-upload-button">
                                        <span class="material-icons initial-icon">add_photo_alternate</span>
                                        <img src="#" alt="Cover Preview" class="cover-preview-image" style="display: none;">
                                    </button>
                                    <p class="cover-upload-hint">Click to upload or drag & drop cover image</p>
                                    <input type="hidden" id="cover-local-path" name="cover_local_path">
                                </div>
                            </div>
                            <div class="form-section">
                                <h3>Description</h3>
                                <div>
                                    <label for="upload-description">Track Description:</label>
                                    <textarea id="upload-description" name="description" rows="4"></textarea>
                                </div>
                            </div>
                        </div>
                        <div class="form-column-right" style="flex: 1;">
                            <div class="lyrics-tool-container-wrapper"> <!-- Wrapper for consistent styling -->
                                ${lyricsToolHtml}
                            </div>
                            <div class="form-section"> 
                                <h3>Categorization</h3>
                                <div>
                                    <label for="upload-genre">Genre:</label>
                                    <input type="text" id="upload-genre" name="genre">
                                </div>
                            </div>

                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="button" id="submit-upload-button" class="dialog-button primary">Upload Track</button>
                        <button type="button" id="cancel-upload-button" class="dialog-button secondary">Cancel</button>
                    </div>
                </div> 
            </div>
    `;
    }

    onLoad(mainContentElement, subPageId, appState, managers) {
        console.log('UploadTrackPage loaded');
        // appState.isUploadPageActive = true; // This should be set by NavigationManager before loading the page module.

        const form = mainContentElement.querySelector("#upload-track-form");
        const filenamePlaceholder = mainContentElement.querySelector("#upload-filename-placeholder");

        if (filenamePlaceholder && appState.droppedFile) {
            filenamePlaceholder.textContent = appState.droppedFile.name;
            const originalFilepathInput = form.querySelector("#upload-original-filepath");
            if (originalFilepathInput) {
                originalFilepathInput.value = appState.droppedFile.name;
            }
        } else if (filenamePlaceholder) {
            filenamePlaceholder.textContent = "No file selected/dropped.";
        }

        if (form && appState.parsedMetadata) {
            form.querySelector("#upload-title").value = appState.parsedMetadata.title || "";
            form.querySelector("#upload-artist").value = appState.parsedMetadata.artist || "";
            form.querySelector("#upload-album").value = appState.parsedMetadata.album || "";
            form.querySelector("#upload-genre").value = appState.parsedMetadata.genre || "";

            const uploadCoverButton = mainContentElement.querySelector("#upload-cover-upload-button");
            const uploadCoverFileInput = mainContentElement.querySelector("#upload-cover-file-input");

            if (uploadCoverButton && uploadCoverFileInput) {
                // The click listener for button to trigger fileInput is often better placed in script.js global listener
                // or handled by UploadManager which owns the file selection logic.
                // For now, we'll assume it's handled globally or by UploadManager.
                // uploadCoverButton.addEventListener('click', () => uploadCoverFileInput.click());

                const imgElement = uploadCoverButton.querySelector(".cover-preview-image");
                const iconElement = uploadCoverButton.querySelector(".initial-icon");

                if (appState.parsedMetadata.picture && imgElement && iconElement) {
                    const picture = appState.parsedMetadata.picture;
                    let base64String = "";
                    const uint8Array = new Uint8Array(picture.data);
                    for (let i = 0; i < uint8Array.length; i++) {
                        base64String += String.fromCharCode(uint8Array[i]);
                    }
                    const imgSrc = `data:${picture.format};base64,${window.btoa(base64String)}`;
                    imgElement.src = imgSrc;
                    imgElement.style.display = "block";
                    iconElement.style.display = "none";
                    appState.selectedCoverBase64 = imgSrc; // Store auto-loaded cover
                } else {
                    if (iconElement) iconElement.style.display = "block";
                    if (imgElement) {
                        imgElement.style.display = "none";
                        imgElement.src = "#";
                    }
                }
                uploadCoverFileInput.value = ""; // Reset file input
            }
        }

        const lrcInputAreaUpload = form.querySelector("#lrc-input-area");
        const lrcPreviewAreaUpload = mainContentElement.querySelector("#lrc-preview-area");
        if (lrcInputAreaUpload && lrcPreviewAreaUpload) {
            if (appState.parsedMetadata && appState.parsedMetadata.lyrics && typeof appState.parsedMetadata.lyrics === 'string') {
                lrcInputAreaUpload.value = appState.parsedMetadata.lyrics;
                // Assuming renderLyricsPreview is available globally or imported
                if (typeof renderLyricsPreview === "function" && typeof parseLRC === "function") {
                     const parsed = parseLRC(appState.parsedMetadata.lyrics);
                     renderLyricsPreview(parsed.lyrics ? parsed.lyrics : parsed, lrcPreviewAreaUpload); // renderLyricsPreview might take raw text or parsed
                }
            } else {
                lrcInputAreaUpload.value = "";
                lrcPreviewAreaUpload.innerHTML = "Lyrics preview will appear here.";
            }
        }
        
        // Lyrics Editor Initialization
        const lyricsEditorContainer = mainContentElement.querySelector(".lyrics-tool-container");
        if (lyricsEditorContainer) {
            initLyricsEditorControls(lyricsEditorContainer, appState, managers); // Pass managers if needed by controls
            if (managers.playerManager && typeof managers.playerManager.setLyricsEditorAudio === "function") {
                managers.playerManager.setLyricsEditorAudio(lyricsEditorAudio);
            }
            if (typeof setMainPlayerManager === "function") {
                 setMainPlayerManager(managers.playerManager);
            }

            if (appState.droppedFile && appState.droppedFile.type.startsWith("audio/")) {
                const blobUrl = URL.createObjectURL(appState.droppedFile);
                loadAudioSource(blobUrl); // Make sure loadAudioSource revokes previous blob if any
                // Store blobUrl to revoke on unload
                this.currentBlobUrl = blobUrl;

            } else {
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
        const submitUploadButton = mainContentElement.querySelector("#submit-upload-button");
        const cancelUploadButton = mainContentElement.querySelector("#cancel-upload-button");

        if (submitUploadButton && managers.uploadManager && managers.uiManager) {
            submitUploadButton.addEventListener('click', (event) => {
                event.preventDefault();
                const form = mainContentElement.querySelector("#upload-track-form");
                if (form) {
                    managers.uploadManager.handleUploadFormSubmit(form, submitUploadButton);
                } else { 
                    managers.uiManager.showToast("Critical error: Upload form not found.", "error");
                }
            });
        }
        if (cancelUploadButton && managers.uploadManager) {
            cancelUploadButton.addEventListener('click', () => {
                managers.uploadManager.handleUploadCancel();
            });
        }
    }

    onUnload() {
        console.log('UploadTrackPage unloaded');
        if (this.currentBlobUrl) {
            URL.revokeObjectURL(this.currentBlobUrl);
            this.currentBlobUrl = null;
        }
        // Ensure lyrics editor audio is cleared if it was using a blob URL
        if (lyricsEditorAudio && lyricsEditorAudio.src && lyricsEditorAudio.src.startsWith("blob:")) {
             URL.revokeObjectURL(lyricsEditorAudio.src);
        }
        loadAudioSource(null); // Clear audio source for lyrics editor
    }
}

export default UploadTrackPage;
