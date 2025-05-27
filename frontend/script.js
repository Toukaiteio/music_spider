import WebSocketManager from "./modules/WebSocketManager.js";
import UIManager from "./modules/UIManager.js";
import PlayerManager from "./modules/PlayerManager.js";
import NavigationManager from "./modules/NavigationManager.js";
import CollectionManager from "./modules/CollectionManager.js";
import SearchManager from "./modules/SearchManager.js";
import FavoriteManager from "./modules/FavoriteManager.js"; 

const applyTheme = UIManager.applyTheme;
const savedTheme = localStorage.getItem("theme") || "light-theme";
applyTheme(savedTheme);

// Define the HTML structure for the Lyrics Tool
const lyricsToolHtml = `
<div class="lyrics-tool-container">
    <h4>Lyrics Editor (LRC Format)</h4>
    <div id="lyrics-waveform-placeholder">Waveform Display Placeholder</div>
    <div id="lyrics-playback-controls-placeholder">
        <button id="lyrics-slow-down" class="icon-button" aria-label="Slow Down"><span class="material-icons">fast_rewind</span></button>
        <button id="lyrics-simulate-play" class="icon-button" aria-label="Simulate Play"><span class="material-icons">play_arrow</span></button>
        <button id="lyrics-reset-simulation" class="icon-button" aria-label="Reset Simulation"><span class="material-icons">replay</span></button>
        <button id="lyrics-speed-up" class="icon-button" aria-label="Speed Up"><span class="material-icons">fast_forward</span></button>
    </div>
    <label for="lrc-input-area">LRC Content:</label>
    <textarea id="lrc-input-area" placeholder="[mm:ss.xx]Lyric line 1\n[mm:ss.xx]<00:00.xx>Word <00:00.xx>by <00:00.xx>word..." rows="10"></textarea>
    <label for="lrc-preview-area">Preview:</label>
    <div id="lrc-preview-area">Lyrics preview will appear here.</div>
</div>
`;

let mockPlaybackTimeoutIds = [];

window.parseLRC = function(lrcString) {
    const lines = lrcString.split('\n');
    const parsedLyrics = [];
    const timeTagRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/; 
    const wordTimeTagRegex = /<(\d{2}):(\d{2})\.(\d{2,3})>/g; 

    for (const line of lines) {
        const match = line.match(timeTagRegex);
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
            const time = minutes * 60 + seconds + milliseconds / 1000;
            
            let textContent = line.substring(match[0].length).trim();
            const words = [];
            let plainTextOnlyForLine = textContent; // Store text without word tags for the line's main text

            if (textContent.includes('<')) { 
                plainTextOnlyForLine = '';
                const parts = textContent.split(/(<[^>]+>)/); // Split by tags, keeping delimiters
                let currentAbsTime = time; // Word timings are often relative to line start, but we'll make them absolute

                for(let i=0; i < parts.length; i++) {
                    const part = parts[i];
                    if (part.match(wordTimeTagRegex)) {
                        const wordMatch = part.match(/<(\d{2}):(\d{2})\.(\d{2,3})>/);
                        if (wordMatch) {
                            const wordMinutes = parseInt(wordMatch[1], 10);
                            const wordSeconds = parseInt(wordMatch[2], 10);
                            const wordMilliseconds = parseInt(wordMatch[3].padEnd(3, '0'), 10);
                            // IMPORTANT: LRC spec often has word timestamps *relative to the line's main timestamp*.
                            // For absolute timing needed by playback simulation, we add the line's time.
                            // If your LRCs use absolute word timestamps, remove `+ time`.
                            currentAbsTime = time + (wordMinutes * 60 + wordSeconds + wordMilliseconds / 1000);
                        }
                    } else if (part.trim()) {
                        words.push({ time: currentAbsTime, text: part.trim() });
                        plainTextOnlyForLine += part.trim() + " ";
                    }
                }
                plainTextOnlyForLine = plainTextOnlyForLine.trim();
            }

            parsedLyrics.push({
                time: time,
                text: plainTextOnlyForLine, 
                words: words.length > 0 ? words : null 
            });
        }
    }
    return parsedLyrics.sort((a, b) => a.time - b.time);
};

window.renderLyricsPreview = function(parsedLyrics, targetElementSelector) {
    const previewArea = document.querySelector(targetElementSelector);
    if (!previewArea) return;
    previewArea.innerHTML = ''; 

    if (!parsedLyrics || parsedLyrics.length === 0) {
        previewArea.textContent = 'No lyrics to display or invalid LRC format.';
        return;
    }

    parsedLyrics.forEach(line => {
        const p = document.createElement('p');
        p.classList.add('lyric-line');
        p.dataset.time = line.time.toFixed(3);

        if (line.words && line.words.length > 0) {
            line.words.forEach(word => {
                const span = document.createElement('span');
                span.classList.add('lyric-word');
                span.textContent = word.text + ' '; 
                span.dataset.time = word.time.toFixed(3);
                p.appendChild(span);
            });
        } else {
            p.textContent = line.text;
        }
        previewArea.appendChild(p);
    });
};

window.resetMockPlayback = function() {
    mockPlaybackTimeoutIds.forEach(clearTimeout);
    mockPlaybackTimeoutIds = [];
    document.querySelectorAll('#lrc-preview-area .highlighted-lyric').forEach(el => {
        el.classList.remove('highlighted-lyric');
    });
     document.querySelectorAll('#lrc-preview-area .lyric-line.past-line').forEach(el => {
        el.classList.remove('past-line');
    });
};

window.startMockPlayback = function() {
    window.resetMockPlayback(); // Clear previous timeouts and highlights

    const lrcText = document.getElementById('lrc-input-area')?.value;
    if (!lrcText) return;

    const lyrics = window.parseLRC(lrcText);
    if (!lyrics || lyrics.length === 0) return;

    const previewArea = document.getElementById('lrc-preview-area');
    if (!previewArea) return;

    const lines = previewArea.querySelectorAll('.lyric-line');
    let globalStartTime = Date.now(); // Start of the simulation
    let lastHighlightedElement = null;

    lyrics.forEach((line, lineIndex) => {
        const lineElement = lines[lineIndex]; // Assumes direct mapping

        // Highlight the entire line
        const lineHighlightDelay = Math.max(0, (line.time * 1000) - (Date.now() - globalStartTime));
        const lineTimeoutId = setTimeout(() => {
            if (lastHighlightedElement) {
                 lastHighlightedElement.classList.remove('highlighted-lyric');
                 // Add 'past-line' to distinguish from upcoming lines for styling
                 if(lastHighlightedElement.classList.contains('lyric-line')) lastHighlightedElement.classList.add('past-line');
            }
             if(lineElement) {
                lineElement.classList.add('highlighted-lyric');
                lineElement.classList.remove('past-line'); // Ensure current line isn't styled as past
                lastHighlightedElement = lineElement;
             }
        }, lineHighlightDelay);
        mockPlaybackTimeoutIds.push(lineTimeoutId);

        // If word-level timing exists for this line
        if (line.words && lineElement) {
            const wordElements = lineElement.querySelectorAll('.lyric-word');
            line.words.forEach((word, wordIndex) => {
                const wordElement = wordElements[wordIndex]; // Assumes direct mapping
                // Word time is absolute in our parsed structure
                const wordHighlightDelay = Math.max(0, (word.time * 1000) - (Date.now() - globalStartTime));
                
                const wordTimeoutId = setTimeout(() => {
                    if (lastHighlightedElement && lastHighlightedElement !== lineElement) { // If previous highlight was a word in another line
                        lastHighlightedElement.classList.remove('highlighted-lyric');
                    }
                    // If the line itself was the last highlighted, remove its highlight
                    if (lineElement && lineElement.classList.contains('highlighted-lyric') && wordElement) {
                         lineElement.classList.remove('highlighted-lyric');
                    }

                    if(wordElement) {
                        wordElement.classList.add('highlighted-lyric');
                        lastHighlightedElement = wordElement;
                    }
                }, wordHighlightDelay);
                mockPlaybackTimeoutIds.push(wordTimeoutId);
            });
        }
    });
};


document.addEventListener("DOMContentLoaded", () => {
  const webSocketManager = new WebSocketManager();
  const playerManager = new PlayerManager({
    backgroundElement: document.getElementById("background-effects"),
    coverImgElement: document.getElementById("player-album-art"),
  });
  const themeSwitcher = document.getElementById("theme-switcher");
  const body = document.body; 

  if (themeSwitcher) {
    themeSwitcher.addEventListener("click", () => {
      const currentTheme = body.classList.contains("dark-theme")
        ? "dark-theme"
        : "light-theme";
      const newTheme =
        currentTheme === "dark-theme" ? "light-theme" : "dark-theme";
      applyTheme(newTheme);
    });
  }
  if (!localStorage.getItem("favSongs")) {
    localStorage.setItem("favSongs", "[]");
  }

  const taskQueueButton = document.getElementById("task-queue-button");
  const expandedTaskQueue = document.getElementById("expanded-task-queue");

  if (taskQueueButton && expandedTaskQueue) {
    taskQueueButton.addEventListener("click", (event) => {
      event.stopPropagation(); 
      const isVisible = expandedTaskQueue.classList.toggle("visible");
      expandedTaskQueue.setAttribute("aria-hidden", !isVisible);
    });

    document.addEventListener("click", (event) => {
      if (
        expandedTaskQueue.classList.contains("visible") &&
        !taskQueueButton.contains(event.target) &&
        !expandedTaskQueue.contains(event.target)
      ) {
        expandedTaskQueue.classList.remove("visible");
        expandedTaskQueue.setAttribute("aria-hidden", "true");
      }
    });
  }

  const drawerToggleButton = document.getElementById("drawer-toggle-button");
  const mainDrawer = document.getElementById("main-drawer");
  const drawerToggleIcon = drawerToggleButton
    ? drawerToggleButton.querySelector(".material-icons")
    : null;

  if (drawerToggleButton && mainDrawer && drawerToggleIcon) {
    const setDrawerState = (isCollapsed) => {
      mainDrawer.classList.toggle("collapsed", isCollapsed);
      drawerToggleIcon.textContent = isCollapsed ? "menu_open" : "menu";
      localStorage.setItem("drawerCollapsed", isCollapsed);
    };
    const savedDrawerState = localStorage.getItem("drawerCollapsed") === "true";
    setDrawerState(savedDrawerState);
    drawerToggleButton.addEventListener("click", () => {
      const isCollapsed = mainDrawer.classList.contains("collapsed");
      setDrawerState(!isCollapsed);
    });
  }

  const mainContent = document.getElementById("main-content");
  
  window.appState = {
    searchResults: [],
    searchQuery: "",
    searchError: null,
    downloadQueue: [],
    library: [], 
    currentSongDetail: null, 
    collectionDialogMode: "add_song", 
    editingCollectionName: null,
    isUploadPageActive: false, 
    droppedFile: null,         
    parsedMetadata: null,      
    selectedCoverBase64: null, 
  };

  const pageContents = {
    home: `
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
   `,
    collections: `
            <div id="collections-page">
                <h2 id="collection-name">My Music Collections</h2>
                <div id="collections-loading-message" style="text-align:center; padding: 20px; display:none;">Loading...</div>
                <div id="song-card-grid" class="collections-song-grid" style="display:none;"></div>
                <div id="collections-no-music-message" style="display:none; text-align:center; padding: 20px;">
                    <p>Select a playlist from the drawer, or create a new one.</p>
                </div>
            </div>
        `,
    "collection-detail": `
            <div id="collections-page"> <!-- Re-uses collections page structure -->
                <h2 id="collection-name">Collection Name</h2>
                <div id="collections-loading-message" style="text-align:center; padding: 20px; display:none;">Loading...</div>
                <div id="song-card-grid" class="collections-song-grid" style="display:none;"></div>
                <div id="collections-no-music-message" style="display:none; text-align:center; padding: 20px;">
                    <p>This playlist is empty.</p>
                </div>
            </div>
    `,
    "song-detail": `
            <div id="song-detail-page">
                <button id="song-detail-back-button" class="icon-button" aria-label="Go Back" style="position: absolute; top: 0px; left: 0px; z-index: 10;"><span class="material-icons">arrow_back</span></button>
                <div class="song-detail-left">
                    <img src="placeholder_album_art.png" alt="Album Art" id="detail-cover-art">
                    <h2 id="detail-title">Track Title</h2>
                    <p id="detail-artist">Artist Name</p>
                    <p id="detail-description">Full song description here...</p>
                    <div id="detail-action-buttons">
                        <button class="detail-play-button icon-button"><span class="material-icons">play_arrow</span></button>
                        <button class="detail-add-to-collection-button icon-button"><span class="material-icons">playlist_add</span></button>
                        <button class="detail-update-button icon-button" aria-label="Update Track Info"><span class="material-icons">edit</span></button>
                    </div>
                </div>
                <div class="song-detail-right">
                    <div id="lyrics-display-area">
                        <p>暂无歌词</p>
                    </div>
                    <button id="upload-lyrics-button" class="icon-button" style="display: none;">
                        <span class="material-icons">upload_file</span>
                    </button>
                </div>
            </div>
        `,
    "search-results": `
            <div id="search-results-page">
                <h2>Search Results</h2>
                <p id="search-results-info">Showing results for: <strong id="search-results-query"></strong></p>
                <div id="search-results-container">
                    <!-- Results will be injected here -->
                </div>
                <div id="no-search-results-message" style="display:none;">
                    <p>No results found for your query.</p>
                </div>
                <div id="search-loading-message" style="display:none;">
                    <p>Searching...</p>
                </div>
                <div id="search-error-message" style="display:none;">
                    <p>Sorry, an error occurred while searching. Please try again later.</p>
                </div>
            </div>
          `,
    "update-track": `
            <div id="update-track-page">
                <h2>Update Track Information</h2>
                <form id="update-track-form">
                    <div class="track-details-form-column">
                        <input type="hidden" id="update-music-id" name="music_id">
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
                        <div>
                            <label for="update-genre">Genre:</label>
                            <input type="text" id="update-genre" name="genre">
                        </div>
                        <div>
                            <label for="update-year">Year:</label>
                            <input type="text" id="update-year" name="year">
                        </div>
                        <div>
                            <label for="update-cover-path">Cover Path:</label>
                            <input type="text" id="update-cover-path" name="cover_path">
                        </div>
                        <div>
                            <label for="update-description">Description:</label>
                            <textarea id="update-description" name="description" rows="3"></textarea>
                        </div>
                    </div>
                    ${lyricsToolHtml} 
                    <div class="form-actions">
                        <button type="submit" id="save-track-update-button" class="dialog-button primary">Save Changes</button>
                        <button type="button" id="cancel-track-update-button" class="dialog-button secondary">Cancel</button>
                    </div>
                </form>
            </div>
        `,
    "upload-track": `
            <div id="upload-track-page">
                <h2>Upload New Track</h2>
                <div id="upload-file-info" style="margin-bottom:15px; padding:10px; background-color: var(--primary-bg-color); border-radius: 5px;">
                    Audio file: <span id="upload-filename-placeholder">No file selected</span>
                </div>
                <form id="upload-track-form">
                    <div class="track-details-form-column">
                        <input type="hidden" id="upload-original-filepath" name="original_filepath">
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
                        <div>
                            <label for="upload-genre">Genre:</label>
                            <input type="text" id="upload-genre" name="genre">
                        </div>
                        <div>
                            <label for="upload-year">Year:</label>
                            <input type="text" id="upload-year" name="year">
                        </div>
                        <div>
                            <label for="upload-cover-file">Cover Image (Optional):</label>
                            <input type="file" id="upload-cover-file" name="cover_file" accept="image/*">
                            <img id="upload-cover-preview" src="#" alt="Cover Preview" style="max-width: 100px; max-height: 100px; display: none; margin-top: 10px;">
                        </div>
                        <div>
                            <label for="upload-description">Description:</label>
                            <textarea id="upload-description" name="description" rows="3"></textarea>
                        </div>
                    </div>
                    ${lyricsToolHtml}
                    <div class="form-actions">
                        <button type="submit" id="submit-upload-button" class="dialog-button primary">Upload Track</button>
                        <button type="button" id="cancel-upload-button" class="dialog-button secondary">Cancel</button>
                    </div>
                </form>
            </div>
        `,
  };

  const navigationManager = new NavigationManager({
    mainContentElement: mainContent,
    drawerLinksSelector: ".drawer-link", 
    pageContents: pageContents,
    webSocketManager: webSocketManager,
    playerManager: playerManager,
    uiManager: UIManager,
    appState: window.appState,
  });

  const collectionManager = new CollectionManager({
    navigationManager: navigationManager, 
    appState: window.appState, 
  });
  collectionManager.init(); 

  const searchManager = new SearchManager({
    webSocketManager: webSocketManager,
    navigationManager: navigationManager, 
    appState: window.appState,
    uiManager: UIManager, 
  });
  
  const favoriteManager = new FavoriteManager();

  navigationManager.setSearchManager(searchManager);
  navigationManager.setFavoriteManager(favoriteManager);
  navigationManager.setCollectionManager(collectionManager); 
  searchManager.setFavoriteManager(favoriteManager);
  
  navigationManager.init(); 
  searchManager.init(); 
  // if (
  //   searchSourceButton &&
  //   webSocketManager &&
  //   typeof webSocketManager.sendWebSocketCommand === "function"
  // ) {
  //   webSocketManager
  //     .sendWebSocketCommand("get_available_sources", {})
  //     .then((response) => {
  //       const sources = Array.isArray(response.data) ? response.data : [];
  //       let currentSourceIndex = 0;
  //       if (sources.length > 0) {
  //         // Set initial icon and source
  //         const img = searchSourceButton.querySelector("img");
  //         if (img) {
  //           img.src = `source_icon/${sources[0]}.ico`;
  //         }
  //         if (typeof searchManager?.switchSource === "function") {
  //           searchManager.switchSource(sources[0]);
  //         }
  //       }
  //       searchSourceButton.addEventListener("click", () => {
  //         if (sources.length > 0) {
  //           currentSourceIndex = (currentSourceIndex + 1) % sources.length;
  //           const source = sources[currentSourceIndex];
  //           const img = searchSourceButton.querySelector("img");
  //           if (img && source) {
  //             img.src = `source_icon/${source}.ico`;
  //           }
  //           if (typeof searchManager?.switchSource === "function") {
  //             searchManager.switchSource(source);
  //           }
  //         }
  //       });
  //     })
  //     .catch((err) => {
  //       console.warn("Failed to fetch available sources:", err);
  //     });
  // }
  // Global Drag and Drop
  const dragOverlay = document.getElementById('drag-overlay');

  window.addEventListener('dragenter', (event) => {
    event.preventDefault();
    if (window.appState.isUploadPageActive) return; 
    if (dragOverlay) dragOverlay.style.display = 'flex';
  });

  window.addEventListener('dragover', (event) => {
    event.preventDefault(); 
  });

  window.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget || event.relatedTarget.nodeName === "HTML") {
        if (dragOverlay) dragOverlay.style.display = 'none';
    }
  });

  window.addEventListener('drop', (event) => {
    event.preventDefault();
    if (dragOverlay) dragOverlay.style.display = 'none';
    if (window.appState.isUploadPageActive) { 
        console.log("Drop event on upload page, likely for cover art, ignoring for new track upload.");
        return; 
    }

    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('audio/')) {
            window.appState.droppedFile = file;
            window.jsmediatags.read(file, {
                onSuccess: (tag) => {
                    const tags = tag.tags;
                    window.appState.parsedMetadata = {
                        title: tags.title || '',
                        artist: tags.artist || '',
                        album: tags.album || '',
                        year: tags.year || '',
                        genre: tags.genre || '',
                        picture: tags.picture || null, 
                        lyrics: tags.lyrics ? (typeof tags.lyrics === 'string' ? tags.lyrics : tags.lyrics.lyrics) : null 
                    };
                    navigationManager.navigateTo("upload-track", "Upload New Track", "#upload-track");
                },
                onError: (error) => {
                    console.warn('jsmediatags error:', error);
                    window.appState.parsedMetadata = { title: file.name.replace(/\.[^/.]+$/, "") }; 
                    navigationManager.navigateTo("upload-track", "Upload New Track", "#upload-track");
                }
            });
        } else {
            UIManager.showToast("Not an audio file. Please drop an audio file.", "error");
        }
    }
  });

  mainContent.addEventListener('change', function(event) {
    if (event.target.id === 'upload-cover-file') {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const preview = document.getElementById('upload-cover-preview');
                if (preview) {
                    preview.src = e.target.result;
                    preview.style.display = 'block';
                }
                window.appState.selectedCoverBase64 = e.target.result; 
            };
            reader.readAsDataURL(file);
        } else if (file) {
            UIManager.showToast("Please select an image file for the cover.", "error");
            window.appState.selectedCoverBase64 = null;
            const preview = document.getElementById('upload-cover-preview');
            if (preview) {
                 preview.src = "#";
                 preview.style.display = 'none';
            }
            event.target.value = ''; 
        }
    }
  });

  mainContent.addEventListener('input', function(event) {
    if (event.target.id === 'lrc-input-area') {
        const lrcText = event.target.value;
        const parsed = window.parseLRC(lrcText);
        window.renderLyricsPreview(parsed, '#lrc-preview-area');
    }
  });


  mainContent.addEventListener("click", function (event) {
    const playButton = event.target.closest(".play-on-card-button");
    const artContainer = event.target.closest(".card-art-container");
    const addToCollectionButton = event.target.closest(
      ".add-to-collection-button"
    );
    const favoriteButton = event.target.closest(".favorite-button"); 
    const inlineLink = event.target.closest(".inline-link"); 
    const addToDownloadQueueButton = event.target.closest(
      ".add-to-download-queue-button"
    );
    const deleteTrackButton = event.target.closest(".delete-track-button"); 

    if (playButton) {
      const trackInfoString = playButton.dataset.trackInfo;
      if (trackInfoString) {
        try {
          const trackInfo = JSON.parse(trackInfoString);
          document.getElementById("player-track-title").textContent =
            trackInfo.title || "Unknown Title";
          document.getElementById("player-track-artist").textContent =
            trackInfo.author || trackInfo.artist_name || "Unknown Artist";
          playerManager.playTrackById(trackInfo.music_id);
          UIManager.setPlayerVisibility(true); 
          const playerPlayPauseButton = document.getElementById("player-play-pause-button"); 
          if (playerPlayPauseButton) {
            const playPauseIcon = playerPlayPauseButton.querySelector(".material-icons");
            if (playPauseIcon) playPauseIcon.textContent = "pause_arrow"; 
          }
        } catch (e) {
          console.error("Failed to parse track info for play button:", e);
        }
      } else {
        console.warn("Play button clicked, but no track-info data found.");
      }
    } else if (
      artContainer &&
      !event.target.closest(".play-on-card-button") &&
      !event.target.closest(".add-to-collection-button")
    ) {
      const songCard = artContainer.closest(".song-card");
      if (songCard) {
        const trackInfoString =
          songCard.querySelector(".play-on-card-button")?.dataset.trackInfo ||
          songCard.querySelector(".add-to-collection-button")?.dataset
            .trackInfo ||
          songCard.dataset.trackInfo;
        if (trackInfoString) {
          try {
            const trackObject = JSON.parse(trackInfoString);
            window.appState.currentSongDetail = trackObject;
            navigationManager.navigateToSongDetail(trackObject);
          } catch (e) {
            console.error(
              "Failed to parse track info for song detail navigation:",
              e
            );
          }
        } else {
          console.warn("Could not find track-info for song detail navigation.");
        }
      }
    }

    if (deleteTrackButton) {
      const musicId = deleteTrackButton.dataset.songId;
      if (musicId) {
        webSocketManager.sendWebSocketCommand("delete_track", { music_id: musicId })
          .then(() => {
            const songCardToRemove = document.querySelector(`.song-card[data-song-id="${musicId}"]`);
            if (songCardToRemove) {
              songCardToRemove.remove();
              if (window.appState && window.appState.library) {
                window.appState.library = window.appState.library.filter(track => String(track.music_id || track.id) !== String(musicId));
                if (window.appState.library.length === 0) {
                    const noSongsMessage = document.getElementById('no-songs-message');
                    if (noSongsMessage) noSongsMessage.style.display = 'block';
                }
              }
            }
          })
          .catch(error => {
            console.error(`Error sending delete_track command for ${musicId}:`, error);
          });
      } else {
        console.warn("Delete button clicked, but no song-id data found.");
      }
    }

    if (addToCollectionButton) {
      const songIdForCollection = addToCollectionButton.dataset.songId;
      const trackInfoString = addToCollectionButton.dataset.trackInfo; 
      if (songIdForCollection) {
        collectionManager.handleAddToCollectionButtonClick(songIdForCollection);
      } else if (trackInfoString) {
        try {
          const trackInfo = JSON.parse(trackInfoString);
          const id = trackInfo.music_id || trackInfo.id;
          if (id) {
            collectionManager.handleAddToCollectionButtonClick(id);
          }
        } catch (e) {
          console.error("Error parsing track_info for add to collection:", e);
        }
      }
    }

    if (favoriteButton) {
        const songId = favoriteButton.dataset.songId;
        if (songId) {
            const newStatus = favoriteManager.toggleFavorite(songId);
            const iconElement = favoriteButton.querySelector('.material-icons');
            if (iconElement) {
                iconElement.textContent = newStatus ? 'favorite' : 'favorite_border';
            }
        }
    }

    if (addToDownloadQueueButton) {
      const songCard = addToDownloadQueueButton.closest(".song-card");
      const songId = songCard ? songCard.dataset.songId : null;
      const source = songCard ? songCard.dataset.source : "unknown"; 
      const title = songCard
        ? songCard.querySelector(".song-card-title").textContent
        : "Unknown Title";
      const icon = addToDownloadQueueButton.querySelector(".material-icons");
      if (icon) {
        icon.textContent = "downloading"; 
      }
    }

    if (inlineLink && inlineLink.dataset.page) {
      event.preventDefault();
      const pageId = inlineLink.dataset.page;
      const path = inlineLink.getAttribute("href");
      const title = inlineLink.dataset.title || pageId.charAt(0).toUpperCase() + pageId.slice(1); 
      const subPageId = inlineLink.dataset.subpageid || null;
      navigationManager.navigateTo(pageId, title, path, false, subPageId); 
    }

    const detailPlayButton = event.target.closest(".detail-play-button");
    const detailAddToCollectionButton = event.target.closest(
      ".detail-add-to-collection-button"
    );
    const detailUpdateButton = event.target.closest(".detail-update-button"); 

    if (detailPlayButton) {
      const trackInfoString = detailPlayButton.dataset.trackInfo;
      if (trackInfoString) {
        try {
          const trackInfo = JSON.parse(trackInfoString);
          document.getElementById("player-track-title").textContent =
            trackInfo.title || "Unknown Title";
          document.getElementById("player-track-artist").textContent =
            trackInfo.author || trackInfo.artist_name || "Unknown Artist";
          UIManager.setPlayerVisibility(true); 
          playerManager.playTrackById(trackInfo.music_id);
           const playerPlayPauseButton = document.getElementById("player-play-pause-button"); 
           if (playerPlayPauseButton) {
            const playPauseIcon = playerPlayPauseButton.querySelector(".material-icons");
            if (playPauseIcon) playPauseIcon.textContent = "pause_arrow";
           }
        } catch (e) {
          console.error(
            "Failed to parse track info for detail play button:",
            e
          );
        }
      }
    }

    if (detailAddToCollectionButton) {
      const songId = detailAddToCollectionButton.dataset.songId;
      if (songId) {
        collectionManager.handleAddToCollectionButtonClick(songId);
      } else {
        const trackInfoString = detailAddToCollectionButton.dataset.trackInfo;
        if (trackInfoString) {
          try {
            const trackInfo = JSON.parse(trackInfoString);
            const id = trackInfo.music_id || trackInfo.id;
            if (id) {
              collectionManager.handleAddToCollectionButtonClick(id);
            }
          } catch (e) {
            console.error("Error parsing track_info for detail add to collection:", e);
          }
        }
      }
    }

    if (detailUpdateButton) {
        if (window.appState && window.appState.currentSongDetail) {
            const trackToUpdate = window.appState.currentSongDetail;
            const musicId = trackToUpdate.music_id || trackToUpdate.id; 
            if (musicId) {
                navigationManager.navigateTo(
                    "update-track", 
                    "Update " + (trackToUpdate.title || "Track"), 
                    "#update-track/" + musicId, 
                    false, 
                    musicId 
                );
            } else {
                UIManager.showToast("Error: Music ID is missing. Cannot update track.", "error");
            }
        } else {
            UIManager.showToast("Could not load track details for update. Please try again.", "error");
        }
    }

    const saveUpdateButton = event.target.closest("#save-track-update-button");
    const cancelUpdateButton = event.target.closest("#cancel-track-update-button");
    const submitUploadButton = event.target.closest("#submit-upload-button");
    const cancelUploadButton = event.target.closest("#cancel-upload-button");
    const lyricsSimulatePlayButton = event.target.closest("#lyrics-simulate-play");
    const lyricsResetSimulationButton = event.target.closest("#lyrics-reset-simulation");
    const lrcPreviewArea = event.target.closest("#lrc-preview-area");


    if (saveUpdateButton) {
        event.preventDefault(); 
        const form = saveUpdateButton.closest("form");
        if (form) {
            const musicId = form.querySelector("#update-music-id").value;
            const title = form.querySelector("#update-title").value.trim();
            const artist = form.querySelector("#update-artist").value.trim();

            if (!title || !artist) {
                UIManager.showToast("Title and Artist cannot be empty.", "error");
                return;
            }

            const payload = {
                music_id: musicId,
                title: title,
                author: artist, 
                album: form.querySelector("#update-album").value.trim(),
                genre: form.querySelector("#update-genre").value.trim(),
                year: form.querySelector("#update-year").value.trim(),
                cover_path: form.querySelector("#update-cover-path").value.trim(),
                description: form.querySelector("#update-description").value.trim(),
                lyrics: form.querySelector("#lrc-input-area")?.value.trim() || null, 
            };

            webSocketManager.sendWebSocketCommand("update_track_info", payload)
                .then((response) => {
                    if (response.success || response.status === "success" || (response.data && response.data.success)) { 
                        UIManager.showToast("Track updated successfully!", "success");
                        if (window.appState && window.appState.library) {
                            const index = window.appState.library.findIndex(track => String(track.music_id || track.id) === String(musicId));
                            if (index !== -1) {
                                window.appState.library[index] = { ...window.appState.library[index], ...payload };
                            }
                        }
                        if (window.appState && window.appState.currentSongDetail && String(window.appState.currentSongDetail.music_id || window.appState.currentSongDetail.id) === String(musicId)) {
                            window.appState.currentSongDetail = { ...window.appState.currentSongDetail, ...payload };
                        }
                        navigationManager.navigateTo("song-detail", payload.title, "#song-detail/" + musicId, false, musicId);
                    } else {
                        UIManager.showToast(response.message || "Failed to update track.", "error");
                    }
                })
                .catch(error => {
                    UIManager.showToast("Error updating track: " + (error.message || "Unknown error"), "error");
                });
        }
    } else if (cancelUpdateButton) {
        history.back();
    }

    if (submitUploadButton) {
        event.preventDefault();
        const form = submitUploadButton.closest("form");
        if (form) {
            const audioFile = window.appState.droppedFile;
            if (!audioFile) {
                UIManager.showToast("No audio file has been selected or dropped.", "error");
                return;
            }
            const title = form.querySelector("#upload-title").value.trim();
            const artist = form.querySelector("#upload-artist").value.trim();
            if (!title || !artist) {
                UIManager.showToast("Title and Artist fields are required.", "error");
                return;
            }

            const payload = {
                title: title,
                author: artist,
                album_name: form.querySelector("#upload-album").value.trim(),
                genre: form.querySelector("#upload-genre").value.trim(),
                year: form.querySelector("#upload-year").value.trim(),
                description: form.querySelector("#upload-description").value.trim(),
                original_filename: audioFile.name,
                original_filepath: form.querySelector("#upload-original-filepath")?.value.trim() || audioFile.name,
                cover_image_base64: window.appState.selectedCoverBase64 || null,
                lyrics: form.querySelector("#lrc-input-area")?.value.trim() || null, 
            };
            
            webSocketManager.sendWebSocketCommand("upload_track", payload)
                .then(response => {
                    console.log("Upload track response:", response);
                    if (response.success || (response.data && response.data.success)) {
                        UIManager.showToast("Track upload process started successfully!", "success");
                        window.appState.droppedFile = null;
                        window.appState.parsedMetadata = null;
                        window.appState.selectedCoverBase64 = null;
                        form.reset();
                        const preview = document.getElementById('upload-cover-preview');
                        if (preview) {
                            preview.src = "#";
                            preview.style.display = 'none';
                        }
                        document.getElementById('upload-filename-placeholder').textContent = "No file selected";
                        const lrcInput = document.getElementById('lrc-input-area');
                        if(lrcInput) lrcInput.value = '';
                        const lrcPreview = document.getElementById('lrc-preview-area');
                        if(lrcPreview) lrcPreview.innerHTML = 'Lyrics preview will appear here.';

                        navigationManager.navigateTo("home", "Home", "#home"); 
                    } else {
                        UIManager.showToast(response.message || "Upload failed. Please check server logs.", "error");
                    }
                })
                .catch(error => {
                    console.error("Error uploading track:", error);
                    UIManager.showToast("Upload failed: " + (error.message || "Unknown error"), "error");
                });
        }
    } else if (cancelUploadButton) {
        window.appState.droppedFile = null;
        window.appState.parsedMetadata = null;
        window.appState.selectedCoverBase64 = null;
        const form = document.getElementById('upload-track-form');
        if(form) form.reset();
        const preview = document.getElementById('upload-cover-preview');
        if (preview) {
            preview.src = "#";
            preview.style.display = 'none';
        }
        const filenamePlaceholder = document.getElementById('upload-filename-placeholder');
        if(filenamePlaceholder) filenamePlaceholder.textContent = "No file selected";
        const lrcInput = document.getElementById('lrc-input-area');
        if(lrcInput) lrcInput.value = '';
        const lrcPreview = document.getElementById('lrc-preview-area');
        if(lrcPreview) lrcPreview.innerHTML = 'Lyrics preview will appear here.';
        history.back(); 
    }

    if (lyricsSimulatePlayButton) {
        window.startMockPlayback();
    } else if (lyricsResetSimulationButton) {
        window.resetMockPlayback();
    }

    if (lrcPreviewArea && event.target.closest('.lyric-line')) {
        const clickedLineElement = event.target.closest('.lyric-line');
        const lrcInputArea = document.getElementById('lrc-input-area');
        if (clickedLineElement && lrcInputArea) {
            // Reconstruct the text from spans if words exist, otherwise use textContent
            let clickedLineText = "";
            const wordSpans = clickedLineElement.querySelectorAll('.lyric-word');
            if (wordSpans.length > 0) {
                wordSpans.forEach(span => clickedLineText += span.textContent); // .textContent already includes the trailing space
                clickedLineText = clickedLineText.trim(); // Remove last space
            } else {
                clickedLineText = clickedLineElement.textContent.trim();
            }

            const fullLrc = lrcInputArea.value;
            const lines = fullLrc.split('\n');
            for(let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Match timestamp and text part
                const timeTagMatch = line.match(/\[\d{2}:\d{2}\.\d{2,3}\]/);
                if (timeTagMatch) {
                    const textPart = line.substring(timeTagMatch[0].length).replace(/<[^>]+>/g, '').trim();
                    if (textPart === clickedLineText) {
                        const startIndex = fullLrc.indexOf(line);
                        const endIndex = startIndex + line.length;
                        lrcInputArea.focus();
                        lrcInputArea.setSelectionRange(startIndex, endIndex);
                        // Scroll to selection:
                        const textLines = lrcInputArea.value.substr(0, startIndex).split("\n").length -1;
                        const avgLineHeight = lrcInputArea.scrollHeight / lrcInputArea.value.split("\n").length;
                        lrcInputArea.scrollTop = textLines * avgLineHeight;
                        break;
                    }
                }
            }
        }
    }

  });

  const playerCoverArea = document.getElementById("player-cover-area");
  if (playerCoverArea) {
    playerCoverArea.addEventListener("click", () => {
      const currentTrack = playerManager.getCurrentTrack?.();
      // console.log(currentTrack);
      window.appState.currentSongDetail = currentTrack;
      const musicId = currentTrack?.bvid  || currentTrack?.music_id || currentTrack?.id;
      if (musicId) {
        navigationManager.navigateTo("song-detail", currentTrack.title || "Track Detail", "#song-detail/" + musicId, false, musicId);
      }
    });
  }
  UIManager.renderTaskQueue(); 
  UIManager.updateMainTaskQueueIcon(); 

  if (!window.test) {
    window.test = {};
  }

  if (
    typeof webSocketManager !== "undefined" &&
    webSocketManager &&
    typeof webSocketManager.sendWebSocketCommand === "function"
  ) {
    window.test.sendWebSocketCommand =
      webSocketManager.sendWebSocketCommand.bind(webSocketManager);
  } else {
    window.test.sendWebSocketCommand = () =>
      console.warn(
        "webSocketManager not found or sendWebSocketCommand is not a function."
      );
  }
  
  window.test.getLocalCollections = collectionManager ? collectionManager.getCollections.bind(collectionManager) : () => console.warn("CollectionManager not available");
  window.test.saveLocalCollections = collectionManager ? collectionManager.saveCollections.bind(collectionManager) : () => console.warn("CollectionManager not available");
  window.test.deleteLocalCollection = collectionManager ? collectionManager.deleteCollection.bind(collectionManager) : () => console.warn("CollectionManager not available");
  window.test.renderDrawerCollections = collectionManager ? collectionManager.renderDrawerCollections.bind(collectionManager) : () => console.warn("CollectionManager not available");
  window.test.openAddToCollectionDialog = (songId) => collectionManager ? collectionManager.openDialog(songId, 'add_song') : console.warn("CollectionManager not available");
  window.test.openCreateCollectionDialog = () => collectionManager ? collectionManager.openDialog(null, 'create_direct') : console.warn("CollectionManager not available");
  window.test.openEditCollectionDialog = (collectionName) => collectionManager ? collectionManager.openDialog(null, 'edit', collectionName) : console.warn("CollectionManager not available");
  window.test.getDownloadQueue = () => window.appState && window.appState.downloadQueue ? window.appState.downloadQueue : [];
  window.test.renderTaskQueue = UIManager.renderTaskQueue ? UIManager.renderTaskQueue : () => console.warn("UIManager.renderTaskQueue not found.");
  window.test.updateMainTaskQueueIcon = UIManager.updateMainTaskQueueIcon ? UIManager.updateMainTaskQueueIcon : () => console.warn("UIManager.updateMainTaskQueueIcon not found.");
  window.test.navigateTo = navigationManager ? navigationManager.navigateTo.bind(navigationManager) : () => console.warn("NavigationManager not available");

  if (
    typeof webSocketManager !== "undefined" &&
    webSocketManager &&
    typeof webSocketManager.sendWebSocketCommand === "function"
  ) {
    window.test.fetchLibrary = () =>
      webSocketManager
        .sendWebSocketCommand("get_downloaded_music", {})
        .then((r) => r.data);
  } else {
    window.test.fetchLibrary = () => {
      console.warn("webSocketManager not available.");
      return Promise.reject("webSocketManager not available.");
    };
  }

  console.log(
    "Developer test functions are available under `window.test`."
  );
});
