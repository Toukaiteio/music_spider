// UploadManager module
import { fileToBase64, getFileExtension, sliceFile } from "./Utils.js";

class UploadManager {
    constructor({ webSocketManager, navigationManager, uiManager, appState, CHUNK_SIZE }) {
        this.webSocketManager = webSocketManager;
        this.navigationManager = navigationManager;
        this.uiManager = uiManager;
        this.appState = appState;
        this.CHUNK_SIZE = CHUNK_SIZE;
        this.dragOverlay = document.getElementById('drag-overlay'); // Get dragOverlay once
    }

    initDragDrop() {
        window.addEventListener('dragenter', (event) => {
            event.preventDefault();
            if (this.appState.isUploadPageActive) return;
            if (this.dragOverlay) this.dragOverlay.style.display = 'flex';
        });

        window.addEventListener('dragover', (event) => {
            event.preventDefault();
        });

        window.addEventListener('dragleave', (event) => {
            if (!event.relatedTarget || event.relatedTarget.nodeName === "HTML") {
                if (this.dragOverlay) this.dragOverlay.style.display = 'none';
            }
        });

        window.addEventListener('drop', (event) => {
            event.preventDefault();
            if (this.dragOverlay) this.dragOverlay.style.display = 'none';
            if (this.appState.isUploadPageActive) {
                console.log("Global drop event ignored: Upload page is active (likely for cover art).");
                return;
            }

            const files = event.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                if (file.type.startsWith('audio/')) {
                    this.appState.droppedFile = file;
                    window.jsmediatags.read(file, {
                        onSuccess: (tag) => {
                            const tags = tag.tags;
                            this.appState.parsedMetadata = {
                                title: tags.title || '',
                                artist: tags.artist || '',
                                album: tags.album || '',
                                year: tags.year || '',
                                genre: tags.genre || '',
                                picture: tags.picture || null,
                                lyrics: tags.lyrics ? (typeof tags.lyrics === 'string' ? tags.lyrics : tags.lyrics.lyrics) : null
                            };
                            this.navigationManager.navigateTo("upload-track", "Upload New Track", "#upload-track");
                        },
                        onError: (error) => {
                            console.warn('jsmediatags error:', error);
                            this.appState.parsedMetadata = { title: file.name.replace(/\.[^/.]+$/, "") };
                            this.navigationManager.navigateTo("upload-track", "Upload New Track", "#upload-track");
                        }
                    });
                } else {
                    this.uiManager.showToast("Not an audio file. Please drop an audio file.", "error");
                }
            }
        });
    }

    handleCoverFileSelect(event) {
        const file = event.target.files[0];
        // This method is specifically for 'upload-cover-file-input'
        const previewButton = document.getElementById('upload-cover-upload-button'); 
        const coverExtInput = document.getElementById('upload-cover-ext');

        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (previewButton) {
                    const imgElement = previewButton.querySelector('.cover-preview-image');
                    const iconElement = previewButton.querySelector('.initial-icon');
                    if (imgElement) {
                        imgElement.src = e.target.result;
                        imgElement.style.display = 'block';
                    }
                    if (iconElement) {
                        iconElement.style.display = 'none';
                    }
                }
                this.appState.selectedCoverBase64 = e.target.result; // Full Data URL for preview
                const extension = getFileExtension(file.name); // Use imported getFileExtension
                this.appState.selectedCoverFileObject = file;
                this.appState.selectedCoverExt = extension;

                if (coverExtInput) {
                    coverExtInput.value = extension;
                }
            };
            reader.readAsDataURL(file);
        } else if (file) { // File selected but not an image
            this.uiManager.showToast("Please select an image file for the cover.", "error");
            this.appState.selectedCoverBase64 = null;
            this.appState.selectedCoverExt = null;
            this.appState.selectedCoverFileObject = null;
            
            if (coverExtInput) {
                coverExtInput.value = '';
            }
            if (previewButton) {
                const imgElement = previewButton.querySelector('.cover-preview-image');
                const iconElement = previewButton.querySelector('.initial-icon');
                if (imgElement) {
                    imgElement.src = "#";
                    imgElement.style.display = 'none';
                }
                if (iconElement) {
                    iconElement.style.display = 'block';
                }
            }
            event.target.value = ''; // Clear the file input
        }
    }


    async handleUploadFormSubmit(form, submitButtonElement) {
        try {
            const audioFile = this.appState.droppedFile;
            if (!audioFile) {
                this.uiManager.showToast("No audio file has been selected or dropped.", "error");
                return;
            }
            const title = form.querySelector("#upload-title").value.trim();
            const artist = form.querySelector("#upload-artist").value.trim();
            if (!title || !artist) {
                this.uiManager.showToast("Title and Artist fields are required.", "error");
                return;
            }

            if(submitButtonElement) {
                submitButtonElement.disabled = true;
                submitButtonElement.textContent = "Uploading...";
            }

            const audioMetadata = {
                title,
                author: artist,
                album_name: form.querySelector("#upload-album").value.trim(),
                genre: form.querySelector("#upload-genre").value.trim(),
                description: form.querySelector("#upload-description").value.trim(),
                lyrics: form.querySelector("#lrc-input-area")?.value.trim() || null,
                original_filename: audioFile.name
            };

            const audioUploadResult = await this.startChunkedUploadProcess(
                audioFile, "audio", audioMetadata
            );

            if (!audioUploadResult?.success) {
                this.uiManager.showToast(audioUploadResult.error || "Audio upload failed.", "error");
                if(submitButtonElement) {
                    submitButtonElement.disabled = false;
                    submitButtonElement.textContent = "Upload Track";
                }
                return; 
            }

            let finalTrackData = audioUploadResult.data?.track_data || null;
            const newMusicId = finalTrackData?.music_id || null;

            // Check for cover from ID3 tags ONLY if no user-selected cover exists
            if (!this.appState.selectedCoverFileObject) {
                const tagPic = this.appState.parsedMetadata?.picture;
                if (tagPic?.data && tagPic?.format) {
                    const ext = tagPic.format.split('/')[1] || 'jpg';
                    const fileFromTag = new File([new Uint8Array(tagPic.data)], `cover_from_tag.${ext}`, { type: tagPic.format });
                    this.appState.selectedCoverFileObject = fileFromTag; 
                }
            }
            
            if (this.appState.selectedCoverFileObject && newMusicId) {
                const coverUploadResult = await this.startChunkedUploadProcess(
                    this.appState.selectedCoverFileObject, "cover", {}, newMusicId
                );
                if (!coverUploadResult?.success) {
                    this.uiManager.showToast(coverUploadResult.error || "Cover upload failed. Audio was saved.", "warning");
                } else if (coverUploadResult.data?.cover_path && finalTrackData) {
                    finalTrackData.cover_path = coverUploadResult.data.cover_path; 
                    this.uiManager.showToast("Cover uploaded successfully!", "success");
                }
            } else if (newMusicId && audioMetadata.cover_binary_on_finalize) {
                 this.uiManager.showToast("Audio and initial cover uploaded successfully!", "success");
            } else if (!newMusicId && this.appState.selectedCoverFileObject) {
                this.uiManager.showToast("Audio upload succeeded but could not get Music ID to attach cover.", "warning");
            } else {
                 this.uiManager.showToast("Audio uploaded successfully!", "success");
            }

            this.appState.droppedFile = null;
            this.appState.parsedMetadata = null;
            this.appState.selectedCoverBase64 = null;
            this.appState.selectedCoverExt = null;
            this.appState.selectedCoverFileObject = null;

            const previewButton = document.getElementById('upload-cover-upload-button');
            if (previewButton) {
                const imgElement = previewButton.querySelector('.cover-preview-image');
                const iconElement = previewButton.querySelector('.initial-icon');
                if (imgElement) { imgElement.src = "#"; imgElement.style.display = 'none'; }
                if (iconElement) iconElement.style.display = 'block';
            }
            const uploadCoverExtInput = document.getElementById('upload-cover-ext');
            if (uploadCoverExtInput) uploadCoverExtInput.value = '';
            const filenamePlaceholder = document.getElementById('upload-filename-placeholder');
            if (filenamePlaceholder) filenamePlaceholder.textContent = "No file selected";
            const lrcInput = document.getElementById('lrc-input-area');
            if (lrcInput) lrcInput.value = '';
            const lrcPreview = document.getElementById('lrc-preview-area');
            if (lrcPreview) lrcPreview.innerHTML = 'Lyrics preview will appear here.';
            if (form) form.reset();

            if(submitButtonElement) {
                submitButtonElement.disabled = false;
                submitButtonElement.textContent = "Upload Track";
            }
            this.navigationManager.navigateTo("home", "Home", "#home");

        } catch (error) {
            this.uiManager.showToast("Upload failed: " + (error.message || "Unknown error"), "error");
            if(submitButtonElement) {
                submitButtonElement.disabled = false;
                submitButtonElement.textContent = "Upload Track";
            }
        }
    }


    async startChunkedUploadProcess(file, fileType, metadataForInit, associatedMusicId = null) {
        console.log(`Initiating ${fileType} upload...`);

        const initiatePayload = {
            filename: file.name,
            total_size: file.size,
            file_type: fileType,
            metadata: metadataForInit,
            chunk_size: this.CHUNK_SIZE
        };

        try {
            const initResponse = await this.webSocketManager.sendWebSocketCommand("initiate_chunked_upload", initiatePayload);
            if (!initResponse || !initResponse.data || !initResponse.data.upload_session_id) {
                this.uiManager.showToast(`Failed to initiate ${fileType} upload session: ${initResponse.error || 'Unknown error'}`, "error");
                return { success: false, error: `Failed to initiate ${fileType} upload session.` };
            }

            const { upload_session_id, actual_chunk_size = this.CHUNK_SIZE } = initResponse.data;

            const chunks = sliceFile(file, actual_chunk_size);
            const total_chunks = chunks.length;

            for (let i = 0; i < total_chunks; i++) {
                const chunk = chunks[i];
                const base64ChunkData = await fileToBase64(chunk);

                const chunkPayload = {
                    upload_session_id,
                    chunk_index: i,
                    total_chunks,
                    chunk_data: base64ChunkData
                };

                let attempt = 0;
                let chunkUploadSuccess = false;
                while (attempt < 3 && !chunkUploadSuccess) {
                    attempt++;
                    const chunkResponse = await this.webSocketManager.sendWebSocketCommand("upload_chunk", chunkPayload);
                    if (chunkResponse && chunkResponse.code === 0) {
                        chunkUploadSuccess = true;
                    } else {
                        this.uiManager.showToast(`Error uploading ${fileType} chunk ${i + 1} (attempt ${attempt}/3): ${chunkResponse.error || 'Unknown error'}`, "warning", 3000);
                        if (attempt >= 3) {
                            this.uiManager.showToast(`Failed to upload ${fileType} chunk ${i + 1} after 3 attempts. Aborting.`, "error");
                            return { success: false, error: `Chunk ${fileType} upload failed for chunk ${i + 1}.` };
                        }
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
                if (!chunkUploadSuccess) {
                     return { success: false, error: `Critical error in ${fileType} chunk upload logic for chunk ${i + 1}.` };
                }
            }

            const finalizePayload = {
                upload_session_id,
                filename: file.name,
                total_chunks
            };

            if (fileType === "audio") {
                finalizePayload.metadata = metadataForInit;
            } else if (fileType === "cover" && associatedMusicId) {
                finalizePayload.music_id = associatedMusicId;
            }

            const finalResponse = await this.webSocketManager.sendWebSocketCommand("finalize_chunked_upload", finalizePayload);
            if (!finalResponse || finalResponse.code !== 0) {
                this.uiManager.showToast(`Failed to finalize ${fileType} upload: ${finalResponse.error || 'Unknown error'}`, "error");
                return { success: false, error: `Finalization of ${fileType} upload failed.` };
            }

            this.uiManager.showToast(`${fileType} upload finalized successfully!`, "success");
            return { success: true, data: finalResponse.data };

        } catch (error) {
            console.error(`Error during ${fileType} chunked upload process:`, error);
            this.uiManager.showToast(`A critical error occurred during ${fileType} upload: ${error.message || 'Unknown error'}`, "error");
            return { success: false, error: `Critical error in ${fileType} upload process.` };
        }
    }

    handleUploadCancel() {
        // Clear appState properties
        this.appState.droppedFile = null;
        this.appState.parsedMetadata = null;
        this.appState.selectedCoverBase64 = null;
        this.appState.selectedCoverExt = null;
        this.appState.selectedCoverFileObject = null;

        // Reset the form
        const form = document.getElementById('upload-track-form');
        if (form) {
            form.reset();
        }

        // Reset UI elements
        const previewButton = document.getElementById('upload-cover-upload-button');
        if (previewButton) {
            const imgElement = previewButton.querySelector('.cover-preview-image');
            const iconElement = previewButton.querySelector('.initial-icon');
            if (imgElement) {
                imgElement.src = "#";
                imgElement.style.display = 'none';
            }
            if (iconElement) {
                iconElement.style.display = 'block';
            }
        }

        const filenamePlaceholder = document.getElementById('upload-filename-placeholder');
        if (filenamePlaceholder) {
            filenamePlaceholder.textContent = "No file selected";
        }

        const lrcInput = document.getElementById('lrc-input-area');
        if (lrcInput) {
            lrcInput.value = '';
        }

        const lrcPreview = document.getElementById('lrc-preview-area');
        if (lrcPreview) {
            lrcPreview.innerHTML = 'Lyrics preview will appear here.';
        }
        
        // Navigate back
        history.back();
    }
}

export default UploadManager;
