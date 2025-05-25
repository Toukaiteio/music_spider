document.addEventListener('DOMContentLoaded', () => {
    // WebSocket Manager
    const webSocketManager = {
        socket: null,
        pendingRequests: {},
        cmdIdCounter: 0,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
        reconnectDelay: 3000, // 3 seconds

        generateCmdId: function() {
            return `cmd-${Date.now()}-${this.cmdIdCounter++}`;
        },

        connect: function() {
            if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
                console.log('WebSocket is already connected or connecting.');
                return;
            }

            this.socket = new WebSocket('ws://localhost:8765');
            console.log('Attempting to connect to WebSocket server...');

            this.socket.onopen = () => {
                console.log('WebSocket connection established.');
                this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
                // Process any queued commands if necessary (not implemented in this version)
            };

            this.socket.onmessage = (event) => {
                try {
                    const response = JSON.parse(event.data);
                    console.log('WebSocket message received:', response);

                    const { original_cmd_id, code, data } = response;

                    if (response.data && response.data.status_type === "download_progress") {
                        const progressData = response.data;
                        const { track_id, file_type, status, current_size, total_size, progress_percent, error_message } = progressData;
                        
                        const queueItem = window.appState.downloadQueue.find(item => item.music_id === track_id);

                        if (queueItem) {
                            queueItem.progressPercent = progress_percent !== undefined ? progress_percent : queueItem.progressPercent;
                            queueItem.status = status || queueItem.status;

                            switch (status) {
                                case 'downloading':
                                    queueItem.statusMessage = `Downloading (${file_type || 'file'}): ${queueItem.progressPercent.toFixed(1)}%`;
                                    break;
                                case 'processing':
                                    queueItem.statusMessage = `Processing ${file_type || 'file'}...`;
                                    break;
                                case 'completed_track':
                                    queueItem.statusMessage = `Download complete!`;
                                    queueItem.progressPercent = 100; // Ensure it's 100%
                                    break;
                                case 'completed_file':
                                    queueItem.statusMessage = `${file_type || 'File'} successfully processed.`;
                                    // If it's part of a multi-file download, progress might not be 100% for the whole track yet.
                                    break;
                                case 'error':
                                    queueItem.statusMessage = `Error: ${error_message || "Unknown download error"}`;
                                    break;
                                default:
                                    // Keep existing or set a generic one if needed
                                    // queueItem.statusMessage = `Status: ${status}`; 
                                    break;
                            }
                            renderTaskQueue();
                            updateMainTaskQueueIcon();
                        } else {
                            console.warn(`Received progress for unknown track_id: ${track_id}`, progressData);
                        }
                        return; // Progress messages don't need further processing as pending requests
                    }


                    if (!original_cmd_id) {
                        console.warn('Received message without original_cmd_id:', response);
                        // Handle other unsolicited messages if needed
                        return;
                    }

                    const request = this.pendingRequests[original_cmd_id];
                    if (request) {
                        clearTimeout(request.timeout);
                        if (code === 0) {
                            request.resolve(response); // Resolve with the full response including original_cmd_id for download_track
                        } else {
                            request.reject(new Error(data.message || 'Unknown server error'));
                        }
                        delete this.pendingRequests[original_cmd_id];
                    } else {
                        console.warn(`Received response for unknown cmd_id: ${original_cmd_id}`);
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message or handling response:', error);
                }
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                // Reconnection logic is typically handled in onclose
            };

            this.socket.onclose = (event) => {
                console.log(`WebSocket connection closed. Code: ${event.code}, Reason: "${event.reason}", Clean close: ${event.wasClean}`);
                if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                    setTimeout(() => this.connect(), this.reconnectDelay);
                } else if (!event.wasClean) {
                    console.error('Max WebSocket reconnection attempts reached.');
                }
            };
        },

        sendWebSocketCommand: function(command, payload) {
            return new Promise((resolve, reject) => {
                if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                    // TODO: Queue the command if not connected, or reject immediately
                    reject(new Error('WebSocket is not connected.'));
                    return;
                }

                const cmd_id = this.generateCmdId();
                const message = {
                    cmd_id: cmd_id,
                    command: command,
                    payload: payload
                };

                try {
                    this.socket.send(JSON.stringify(message));
                    console.log('WebSocket command sent:', message);

                    const timeoutDuration = 15000; // 15 seconds
                    const timeout = setTimeout(() => {
                        delete this.pendingRequests[cmd_id];
                        reject(new Error(`Request timed out for cmd_id: ${cmd_id}`));
                    }, timeoutDuration);

                    this.pendingRequests[cmd_id] = { resolve, reject, timeout };

                } catch (error) {
                    console.error('Error sending WebSocket command:', error);
                    reject(error);
                }
            });
        },

        init: function() {
            this.connect();
            // Expose test function globally
            window.test = window.test || {};
            window.test.getLibrary = this.testWebSocketGetLibrary.bind(this);
        },

        testWebSocketGetLibrary: async function() {
            console.log('Testing "get_downloaded_music" command...');
            try {
                const libraryData = await this.sendWebSocketCommand('get_downloaded_music', {});
                console.log('Library data received:', libraryData);
                return libraryData;
            } catch (error) {
                console.error('Error getting library data:', error.message);
                return error;
            }
        }
    };

    // Initialize WebSocket Manager
    webSocketManager.init();


    const themeSwitcher = document.getElementById('theme-switcher');
    const body = document.body; // Or document.documentElement for html tag

    // Function to apply theme
    const applyTheme = (themeName) => {
        body.classList.remove('light-theme', 'dark-theme');
        body.classList.add(themeName);
        localStorage.setItem('theme', themeName); // Save preference
        // Update icon based on theme (optional)
        if (themeSwitcher) {
            const icon = themeSwitcher.querySelector('.material-icons');
            if (icon) {
                icon.textContent = themeName === 'dark-theme' ? 'light_mode' : 'dark_mode';
            }
        }
    };

    // Load saved theme or default to light
    const savedTheme = localStorage.getItem('theme') || 'light-theme';
    applyTheme(savedTheme);

    // Event listener for the button
    if (themeSwitcher) {
        themeSwitcher.addEventListener('click', () => {
            const currentTheme = body.classList.contains('dark-theme') ? 'dark-theme' : 'light-theme';
            const newTheme = currentTheme === 'dark-theme' ? 'light-theme' : 'dark-theme';
            applyTheme(newTheme);
        });
    }

    // Placeholder function to update task queue progress
    function updateTaskQueueProgress(percentage) {
        const progressBar = document.querySelector('#task-queue-button .progress-bar');
        if (progressBar) {
            if (percentage === null || percentage < 0 || isNaN(percentage)) { // Indeterminate state or invalid input
                // Add class for spinning animation if designed (ensure .indeterminate styles are in CSS)
                // progressBar.closest('.circular-progress').classList.add('indeterminate');
                // For now, setting a specific dasharray for a visual cue of activity or indeterminate state.
                // This specific dasharray (e.g., "25, 100") might need adjustment based on desired visual.
                // If a CSS animation 'spin' is defined and triggered by '.indeterminate', that's preferred.
                progressBar.style.strokeDasharray = '25, 75'; // Example: 25% filled, 75% empty, looks like a spinning arc
                                                            // Or use 'stroke-dashoffset' animation for continuous spin.
                                                            // For a simple "busy" look without continuous animation via JS:
                                                            // Keep it simple for now, actual indeterminate animation can be CSS based.
            } else {
                // progressBar.closest('.circular-progress').classList.remove('indeterminate');
                const cleanPercentage = Math.max(0, Math.min(100, percentage)); // Clamp between 0-100
                // The SVG path length is 100 units (as per viewBox and stroke-dasharray usage)
                // For a percentage P, we want P units of the path to be stroked, and (100-P) to be empty.
                progressBar.style.strokeDasharray = `${cleanPercentage}, 100`;
            }
        }
    }

    // Example usage (remove or comment out for production):
    // setTimeout(() => updateTaskQueueProgress(30), 2000);    // Show 30% after 2s
    // setTimeout(() => updateTaskQueueProgress(75), 4000);    // Show 75% after 4s
    // setTimeout(() => updateTaskQueueProgress(null), 6000); // Show indeterminate state after 6s (e.g., busy)
    // setTimeout(() => updateTaskQueueProgress(100), 8000); // Show 100% after 8s
    // setTimeout(() => updateTaskQueueProgress(0), 10000);   // Show 0% after 10s (reset)

    // Expanded Task Queue Toggle
    const taskQueueButton = document.getElementById('task-queue-button');
    const expandedTaskQueue = document.getElementById('expanded-task-queue');

    if (taskQueueButton && expandedTaskQueue) {
        taskQueueButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent click from immediately closing due to body listener
            const isVisible = expandedTaskQueue.classList.toggle('visible');
            expandedTaskQueue.setAttribute('aria-hidden', !isVisible);
        });

        // Optional: Close when clicking outside
        document.addEventListener('click', (event) => {
            if (expandedTaskQueue.classList.contains('visible') &&
                !taskQueueButton.contains(event.target) &&
                !expandedTaskQueue.contains(event.target)) {
                expandedTaskQueue.classList.remove('visible');
                expandedTaskQueue.setAttribute('aria-hidden', 'true');
            }
        });
    }

    // Drawer Toggle Functionality
    const drawerToggleButton = document.getElementById('drawer-toggle-button');
    const mainDrawer = document.getElementById('main-drawer');
    const drawerToggleIcon = drawerToggleButton ? drawerToggleButton.querySelector('.material-icons') : null;

    if (drawerToggleButton && mainDrawer && drawerToggleIcon) {
        // Function to set drawer state, save preference
        const setDrawerState = (isCollapsed) => {
            mainDrawer.classList.toggle('collapsed', isCollapsed);
            drawerToggleIcon.textContent = isCollapsed ? 'menu_open' : 'menu';
            localStorage.setItem('drawerCollapsed', isCollapsed);
        };

        // Load saved drawer state or default to not collapsed
        const savedDrawerState = localStorage.getItem('drawerCollapsed') === 'true';
        setDrawerState(savedDrawerState);

        drawerToggleButton.addEventListener('click', () => {
            const isCollapsed = mainDrawer.classList.contains('collapsed');
            setDrawerState(!isCollapsed);
        });
    }

    // Player Functionality
    const mainPlayer = document.getElementById('main-player');
    const playerContent = document.getElementById('player-content');
    const playerHideButton = document.getElementById('player-hide-button');
    const playerShowButton = document.getElementById('player-show-button');
    const playerPlayPauseButton = document.getElementById('player-play-pause-button'); // For icon toggling

    // Function to set player visibility state
    const setPlayerVisibility = (visible) => {
        if (!mainPlayer || !playerContent || !playerShowButton) return;

        if (visible) {
            mainPlayer.classList.remove('collapsed-player');
            playerContent.classList.remove('hidden');
            playerShowButton.classList.add('hidden');
            localStorage.setItem('playerVisible', 'true');
        } else {
            mainPlayer.classList.add('collapsed-player');
            playerContent.classList.add('hidden');
            playerShowButton.classList.remove('hidden');
            localStorage.setItem('playerVisible', 'false');
        }
    };
    
    // --- Example: Simulate showing player when a track is chosen ---
    // This is a placeholder. Actual logic will depend on how tracks are selected.
    const simulatePlayTrack = () => {
        if (!mainPlayer || !playerContent || !playerShowButton) return;
        
        // Example track data (replace with actual data later)
        document.getElementById('player-album-art').src = 'placeholder_album_art_2.png'; // Different placeholder
        document.getElementById('player-track-title').textContent = 'Awesome New Song';
        document.getElementById('player-track-artist').textContent = 'The Cool Devs';
        document.getElementById('player-duration').textContent = '3:45'; // Example

        setPlayerVisibility(true);
        // Update play/pause icon to 'pause' as track is "playing"
        const icon = playerPlayPauseButton.querySelector('.material-icons');
        if (icon) icon.textContent = 'pause_arrow';
    };
    // --- End Example ---


    if (playerHideButton) {
        playerHideButton.addEventListener('click', () => {
            setPlayerVisibility(false);
        });
    }

    if (playerShowButton) {
        playerShowButton.addEventListener('click', () => {
            // When showing, ideally it would resume last playing track's info
            // For now, just make it visible. If no track was "playing", it shows default placeholders.
            setPlayerVisibility(true); 
        });
    }
    
    // Event listener for play/pause button (icon toggle only for now)
    if (playerPlayPauseButton) {
        playerPlayPauseButton.addEventListener('click', () => {
            const icon = playerPlayPauseButton.querySelector('.material-icons');
            if (icon) {
                if (icon.textContent === 'play_arrow') {
                    icon.textContent = 'pause_arrow';
                    // Later: actually play music
                    // simulatePlayTrack(); // Example: if player was hidden, show and play.
                } else {
                    icon.textContent = 'play_arrow';
                    // Later: actually pause music
                }
            }
        });
    }

    // Initial state: Player is hidden by default until a track is "played"
    // Or load saved visibility state
    const savedPlayerVisible = localStorage.getItem('playerVisible') === 'true';
    // If nothing is "playing" or saved state is hidden, keep it hidden.
    // For now, let's default to hidden unless explicitly shown by saved state or action.
    if (savedPlayerVisible) {
        // If it was saved as visible, we might need to repopulate track info or simulate play
        // For simplicity now, just set visibility. Actual track loading will make it visible.
        setPlayerVisibility(true); 
        // To make it more robust, one would check if there's a "current track" in localStorage too.
        // For now, if it was visible, we assume some track was playing.
        // Let's use the simulatePlayTrack to fill with some data if it was visible.
        // simulatePlayTrack(); // This makes it always show example track if it was previously visible.
        // Better: only setPlayerVisibility(true) and let actual track loading populate it.
    } else {
        setPlayerVisibility(false); // Start hidden or based on localStorage
    }
    
    // Call simulatePlayTrack() for testing if you want to see the player populated on load
    // setTimeout(simulatePlayTrack, 1000); // Example: "play" a track after 1s


    // Router Logic
    const mainContent = document.getElementById('main-content');
    const drawerLinks = document.querySelectorAll('.drawer-link');

    // Application state container
    window.appState = {
        searchResults: [],
        searchQuery: '',
        searchError: null,
        downloadQueue: [],
        library: [], // Explicitly initialize library
        currentSongDetail: null // Explicitly initialize currentSongDetail
    };

    // Placeholder page content - In a real app, you might load HTML templates or use a framework
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
                <h2>My Downloaded Music</h2>
                <div id="collections-loading-message" style="text-align:center; padding: 20px; display:none;">Loading...</div>
                <div id="song-card-grid" class="collections-song-grid" style="display:none;"></div>
                <div id="collections-no-music-message" style="display:none; text-align:center; padding: 20px;">
                    <p>You haven't downloaded any music yet. Use the search bar in the header to find and download music.</p>
                </div>
            </div>
        `,
        'song-detail': `
            <div id="song-detail-page">
                <div class="song-detail-left">
                    <img src="placeholder_album_art.png" alt="Album Art" id="detail-cover-art">
                    <h2 id="detail-title">Track Title</h2>
                    <p id="detail-artist">Artist Name</p>
                    <p id="detail-description">Full song description here...</p>
                    <div id="detail-action-buttons">
                        <!-- Action buttons like Play, Add to Collection will be added here or dynamically -->
                        <button class="detail-play-button"><span class="material-icons">play_arrow</span> Play</button>
                        <button class="detail-add-to-collection-button"><span class="material-icons">playlist_add</span> Add to Collection</button>
                    </div>
                </div>
                <div class="song-detail-right">
                    <p>暂无歌词</p> <!-- Lyrics not available yet -->
                </div>
            </div>
        `,
        'search-results': `
            <div id="search-results-page">
                <h2>Search Results</h2>
                <p id="search-results-info">Showing results for: <strong id="search-results-query"></strong></p>
                <div id="search-results-container">
                    <!-- Results will be injected here by Step 3 -->
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
          `
    };

    const updateActiveDrawerLink = (pageId) => {
        drawerLinks.forEach(link => {
            link.classList.remove('active');
            // The 'search-results' page doesn't have a corresponding drawer link.
            // Only activate a link if it directly matches the pageId.
            if (link.dataset.page === pageId) {
                link.classList.add('active');
            }
        });
    };

    const navigateTo = (pageId, title, path, skipPushState = false) => {
        // Ensure mainContent exists
        if (!mainContent) {
            console.error('Main content area not found!');
            return;
        }
        
        mainContent.innerHTML = pageContents[pageId] || `<h2>Page Not Found</h2><p>The page "${pageId}" does not exist or has been moved.</p>`;
        
        document.title = title + " - Music Downloader";
        
        if (!skipPushState) {
            history.pushState({ pageId: pageId }, title, path);
        }
        
        updateActiveDrawerLink(pageId);

        mainContent.style.opacity = '0';
        requestAnimationFrame(() => {
            mainContent.style.transition = 'opacity 0.3s ease-in-out';
            mainContent.style.opacity = '1';
            
            if (pageId === 'home') {
                const homeLoadingMessage = mainContent.querySelector('#home-loading-message');
                const songCardGrid = mainContent.querySelector('#song-card-grid');
                const noSongsMessage = mainContent.querySelector('#no-songs-message');

                if (homeLoadingMessage) homeLoadingMessage.style.display = 'block'; // Show loading message
                if (songCardGrid) songCardGrid.style.display = 'none'; // Hide grid initially
                if (noSongsMessage) noSongsMessage.style.display = 'none'; // Hide no songs message initially

                webSocketManager.sendWebSocketCommand("get_downloaded_music", {})
                    .then(response => {
                        if (homeLoadingMessage) homeLoadingMessage.style.display = 'none';
                        
                        const libraryData = response.data && response.data.library ? response.data.library : [];
                        window.appState.library = libraryData; // Store in app state

                        if (libraryData && libraryData.length > 0) {
                            if (songCardGrid) {
                                songCardGrid.innerHTML = ''; // Clear previous content
                                libraryData.forEach(track => {
                                    const musicId = track.music_id; // Prioritize music_id
                                    let imageUrl = 'placeholder_cover_1.png'; // Default placeholder
                                    if (track.preview_cover && typeof track.preview_cover === 'string' && track.preview_cover.trim() !== '') {
                                        imageUrl = track.preview_cover;
                                    }
                                    const title = track.title || 'Unknown Title';
                                    const artist = track.author || track.artist_name || 'Unknown Artist'; // Prioritize author as per example
                                    const trackInfoJson = JSON.stringify(track).replace(/'/g, '&apos;');

                                    const cardHTML = `
                                        <div class="song-card" data-song-id="${musicId}">
                                            <div class="card-art-container">
                                                <img src="${imageUrl}" alt="Album Art for ${title}" class="song-card-art">
                                                <button class="play-on-card-button" aria-label="Play Song" data-track-info='${trackInfoJson}'>
                                                    <span class="material-icons">play_arrow</span>
                                                </button>
                                            </div>
                                            <div class="song-card-info">
                                                <h3 class="song-card-title">${title}</h3>
                                                <p class="song-card-artist">${artist}</p>
                                            </div>
                                            <div class="song-card-actions">
                                                <button class="add-to-collection-button" aria-label="Add to Collection" data-song-id="${musicId}" data-track-info='${trackInfoJson}'>
                                                    <span class="material-icons">playlist_add</span>
                                                </button>
                                            </div>
                                        </div>
                                    `;
                                    songCardGrid.innerHTML += cardHTML;
                                });
                                songCardGrid.style.display = 'grid'; // Show grid
                            }
                            if (noSongsMessage) noSongsMessage.style.display = 'none';
                        } else {
                            if (songCardGrid) songCardGrid.style.display = 'none';
                            if (noSongsMessage) noSongsMessage.style.display = 'block'; // Show no songs message
                        }
                    })
                    .catch(error => {
                        console.error('Failed to load library:', error);
                        if (homeLoadingMessage) {
                            homeLoadingMessage.innerHTML = '<p style="color: red;">Failed to load your library. Please try again later.</p>';
                            homeLoadingMessage.style.display = 'block';
                        }
                        if (songCardGrid) songCardGrid.style.display = 'none';
                        if (noSongsMessage) noSongsMessage.style.display = 'none';
                    });

            } else if (pageId === 'search-results') {
                 // Ensure this runs after mainContent.innerHTML is processed by the browser
                setTimeout(displaySearchResultsOnPage, 0);
            } else if (pageId === 'song-detail') {
                // Content is already set by mainContent.innerHTML = pageContents[pageId];
                const track = window.appState.currentSongDetail;
                if (!track) {
                    mainContent.innerHTML = '<p style="color:red; text-align:center; padding:20px;">Error: Song details not found. Please go back and try again.</p>';
                    return;
                }

                const coverArtEl = document.getElementById('detail-cover-art');
                const titleEl = document.getElementById('detail-title');
                const artistEl = document.getElementById('detail-artist');
                const descriptionEl = document.getElementById('detail-description');
                const playButtonEl = mainContent.querySelector('.detail-play-button');
                const addToCollectionButtonEl = mainContent.querySelector('.detail-add-to-collection-button');

                // Use preview_cover for song detail page as well
                let detailImageUrl = 'placeholder_album_art.png';
                if (track.preview_cover && typeof track.preview_cover === 'string' && track.preview_cover.trim() !== '') {
                    detailImageUrl = track.preview_cover;
                } else if (track.cover_url && typeof track.cover_url === 'string' && track.cover_url.trim() !== '') {
                    // Fallback to cover_url if preview_cover is not good, though ideally preview_cover is always preferred for downloaded
                    detailImageUrl = track.cover_url; 
                }

                if (coverArtEl) coverArtEl.src = detailImageUrl;
                if (titleEl) titleEl.textContent = track.title || 'Unknown Title';
                if (artistEl) artistEl.textContent = track.author || track.artist_name || 'Unknown Artist';
                if (descriptionEl) descriptionEl.textContent = track.description || 'No description available.';

                const trackInfoJson = JSON.stringify(track).replace(/'/g, '&apos;');
                const songId = track.music_id; // Prioritize music_id

                if (playButtonEl) {
                    playButtonEl.dataset.trackInfo = trackInfoJson;
                }
                if (addToCollectionButtonEl) {
                    addToCollectionButtonEl.dataset.trackInfo = trackInfoJson;
                    if (songId) addToCollectionButtonEl.dataset.songId = songId;
                }
                
                // Future: Call function to fetch and display lyrics if available
                // displayLyrics(track.id, mainContent.querySelector('.song-detail-right'));

            } else if (pageId === 'collections') {
                const collectionsLoadingMessage = mainContent.querySelector('#collections-loading-message');
                const songCardGrid = mainContent.querySelector('#song-card-grid'); // Using the common ID
                const noMusicMessage = mainContent.querySelector('#collections-no-music-message');

                if (collectionsLoadingMessage) collectionsLoadingMessage.style.display = 'block';
                if (songCardGrid) songCardGrid.style.display = 'none';
                if (noMusicMessage) noMusicMessage.style.display = 'none';

                webSocketManager.sendWebSocketCommand("get_downloaded_music", {})
                    .then(response => {
                        if (collectionsLoadingMessage) collectionsLoadingMessage.style.display = 'none';
                        
                        const libraryData = response.data && response.data.library ? response.data.library : [];
                        // No need to store in appState.library again if Home page already does, unless specifically desired for this page's context

                        if (libraryData && libraryData.length > 0) {
                            if (songCardGrid) {
                                songCardGrid.innerHTML = ''; // Clear previous content
                                libraryData.forEach(track => {
                                    const musicId = track.music_id; // Prioritize music_id
                                    let imageUrl = 'placeholder_cover_1.png'; // Default placeholder
                                    if (track.preview_cover && typeof track.preview_cover === 'string' && track.preview_cover.trim() !== '') {
                                        imageUrl = track.preview_cover;
                                    }
                                    const title = track.title || 'Unknown Title';
                                    const artist = track.author || track.artist_name || 'Unknown Artist'; // Prioritize author
                                    const trackInfoJson = JSON.stringify(track).replace(/'/g, '&apos;');

                                    const cardHTML = `
                                        <div class="song-card" data-song-id="${musicId}">
                                            <div class="card-art-container">
                                                <img src="${imageUrl}" alt="Album Art for ${title}" class="song-card-art">
                                                <button class="play-on-card-button" aria-label="Play Song" data-track-info='${trackInfoJson}'>
                                                    <span class="material-icons">play_arrow</span>
                                                </button>
                                            </div>
                                            <div class="song-card-info">
                                                <h3 class="song-card-title">${title}</h3>
                                                <p class="song-card-artist">${artist}</p>
                                            </div>
                                            <div class="song-card-actions">
                                                <button class="add-to-collection-button" aria-label="Add to Collection" data-song-id="${musicId}" data-track-info='${trackInfoJson}'>
                                                    <span class="material-icons">playlist_add</span>
                                                </button>
                                            </div>
                                        </div>
                                    `;
                                    songCardGrid.innerHTML += cardHTML;
                                });
                                songCardGrid.style.display = 'grid'; // Show grid
                            }
                            if (noMusicMessage) noMusicMessage.style.display = 'none';
                        } else {
                            if (songCardGrid) songCardGrid.style.display = 'none';
                            if (noMusicMessage) noMusicMessage.style.display = 'block';
                        }
                    })
                    .catch(error => {
                        console.error('Failed to load collections (downloaded music):', error);
                        if (collectionsLoadingMessage) {
                            collectionsLoadingMessage.innerHTML = '<p style="color: red;">Failed to load your music. Please try again.</p>';
                            collectionsLoadingMessage.style.display = 'block';
                        }
                        if (songCardGrid) songCardGrid.style.display = 'none';
                        if (noMusicMessage) noMusicMessage.style.display = 'none';
                    });
            }
        });
    };

    // Handle navigation when drawer links are clicked
    drawerLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault(); // Prevent default anchor behavior
            const pageId = link.dataset.page;
            const path = link.getAttribute('href');
            const title = link.querySelector('.link-text').textContent; // Or a predefined title
            
            navigateTo(pageId, title, path);
        });
    });

    // Listen to popstate event (browser back/forward buttons)
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.pageId) {
            const { pageId } = event.state;
            let title = pageId.charAt(0).toUpperCase() + pageId.slice(1);
            if (pageId === 'search-results') title = 'Search Results';
            
            // Ensure that navigating back/forward to a non-existent page (like old #search)
            // defaults to home or shows page not found.
            if (!pageContents[pageId]) {
                console.warn(`Invalid page ID in popstate: "${pageId}". Redirecting to home.`);
                navigateTo('home', 'Home', '#home', true);
            } else {
                navigateTo(pageId, title, `#${pageId}`, true);
            }
        } else {
            // Fallback for cases where state is null (e.g., initial load, manual hash change)
            const hashPageId = location.hash.substring(1) || 'home';
            const pageId = pageContents[hashPageId] ? hashPageId : 'home';
            let title = pageId.charAt(0).toUpperCase() + pageId.slice(1);
            if (pageId === 'search-results') title = 'Search Results';
            
            navigateTo(pageId, title, `#${pageId}`, true);
        }
    });

    // Initial page load handling
    let initialPage = location.hash.substring(1) || 'home';
    // Validate initialPage: if it's not in pageContents (and not 'search-results' which is valid but might not have drawer link)
    // default to 'home'. This prevents errors if user lands on old #search or invalid hash.
    if (!pageContents[initialPage]) {
        console.warn(`Invalid page ID in URL hash: "${initialPage}". Defaulting to home.`);
        initialPage = 'home';
    }

    let initialTitle;
    if (initialPage === 'search-results') {
        initialTitle = 'Search Results';
    } else {
        const initialTitleElement = document.querySelector(`.drawer-link[data-page="${initialPage}"] .link-text`);
        initialTitle = initialTitleElement ? initialTitleElement.textContent : (initialPage.charAt(0).toUpperCase() + initialPage.slice(1));
    }
    const initialPath = `#${initialPage}`;

    // Replace state for the initial load to ensure correct history entry
    history.replaceState({ pageId: initialPage }, initialTitle, initialPath);
    navigateTo(initialPage, initialTitle, initialPath, true); // true to skip another history push
 
    console.log("Router initialized. Initial page: " + initialPage);

    // Add to Collection Dialog Logic
    const addToCollectionDialog = document.getElementById('add-to-collection-dialog');
    const closeDialogButton = document.getElementById('close-dialog-button');
    const createNewCollectionButton = document.getElementById('create-new-collection-button');
    const createCollectionForm = document.getElementById('create-collection-form');
    const cancelCreateCollectionButton = document.getElementById('cancel-create-collection-button');
    const saveCollectionButton = document.getElementById('save-collection-button');
    const newCollectionNameInput = document.getElementById('new-collection-name');
    const newCollectionCategoryInput = document.getElementById('new-collection-category');
    const newCollectionDescriptionInput = document.getElementById('new-collection-description');
    const existingCollectionsList = document.getElementById('existing-collections-list');
    const noCollectionsMessageDialog = document.getElementById('no-collections-message');
   
    let currentSongIdToCollect = null; // Stores the song ID when adding a song to a collection
    window.appState.collectionDialogMode = 'add_song'; // 'add_song', 'create_direct', 'edit'
    window.appState.editingCollectionName = null; // Stores name of collection being edited

    const getCollections = () => {
        return JSON.parse(localStorage.getItem('userCollections')) || [];
    };

    const saveCollections = (collections) => {
        localStorage.setItem('userCollections', JSON.stringify(collections));
    };

    const addSongToCollection = (songId, collectionName) => {
        if (!songId) { // If called in a context where there's no song (e.g. after direct creation)
            console.log(`Collection "${collectionName}" created/updated, no song to add.`);
            closeAddToCollectionDialog();
            return;
        }
        const collections = getCollections();
        const collection = collections.find(c => c.name === collectionName);
        if (collection) {
            if (!collection.songs) collection.songs = [];
            if (!collection.songs.includes(songId)) {
                collection.songs.push(songId);
                saveCollections(collections);
                console.log(`Song ${songId} added to ${collectionName}`);
            } else {
                console.log(`Song ${songId} already in ${collectionName}`);
            }
        }
        closeAddToCollectionDialog();
    };

    const populateCollectionsList = () => { // Populates the list within the "Add to Collection" dialog
        const collections = getCollections();
        existingCollectionsList.innerHTML = ''; 
        if (collections.length > 0) {
            collections.forEach(collection => {
                const button = document.createElement('button');
                button.className = 'collection-item-button dialog-button';
                button.textContent = collection.name;
                button.onclick = () => addSongToCollection(currentSongIdToCollect, collection.name);
                existingCollectionsList.appendChild(button);
            });
            noCollectionsMessageDialog.style.display = 'none';
            existingCollectionsList.style.display = 'block';
        } else {
            noCollectionsMessageDialog.style.display = 'block';
            existingCollectionsList.style.display = 'none';
        }
        // createCollectionForm.style.display = 'none'; // Should be hidden by default unless creating
    };
    
    const openAddToCollectionDialog = (songId) => {
        currentSongIdToCollect = songId; // Can be null if not adding a song
        
        // If songId is provided, and we are not already in a direct create/edit mode, it's 'add_song'
        if (songId && window.appState.collectionDialogMode !== 'create_direct' && window.appState.collectionDialogMode !== 'edit') {
             window.appState.collectionDialogMode = 'add_song';
        }
        // If songId is null, collectionDialogMode should have been set by the calling function 
        // (openCreateCollectionDialog or openEditCollectionDialog) BEFORE this is called.

        const dialogTitleEl = document.getElementById('dialog-title');
        const createForm = document.getElementById('create-collection-form');
        const existingList = document.getElementById('existing-collections-list');
        const noCollectionsMsg = document.getElementById('no-collections-message'); // In dialog
        const createNewBtn = document.getElementById('create-new-collection-button'); // In dialog
        const saveBtn = document.getElementById('save-collection-button');

        // Reset form fields initially for all modes
        if(newCollectionNameInput) newCollectionNameInput.value = '';
        if(newCollectionCategoryInput) newCollectionCategoryInput.value = '';
        if(newCollectionDescriptionInput) newCollectionDescriptionInput.value = '';
        
        let collectionsForList = getCollections(); // Get collections for populating list in add_song mode

        if (window.appState.collectionDialogMode === 'add_song') {
            if (dialogTitleEl) dialogTitleEl.textContent = "Add to Collection";
            if (saveBtn) saveBtn.textContent = "Save Collection"; // This button is part of the create form
            populateCollectionsList(); 
            if (createForm) createForm.style.display = 'none';
            if (existingList) existingList.style.display = 'block';
            if (noCollectionsMsg) noCollectionsMsg.style.display = collectionsForList.length === 0 ? 'block' : 'none';
            if (createNewBtn) createNewBtn.style.display = 'block';
        } else if (window.appState.collectionDialogMode === 'create_direct') {
            if (dialogTitleEl) dialogTitleEl.textContent = "Create New Collection";
            if (saveBtn) saveBtn.textContent = "Save Collection";
            if (createForm) createForm.style.display = 'block';
            if (existingList) existingList.style.display = 'none';
            if (noCollectionsMsg) noCollectionsMsg.style.display = 'none';
            if (createNewBtn) createNewBtn.style.display = 'none';
        } else if (window.appState.collectionDialogMode === 'edit') {
            if (dialogTitleEl) dialogTitleEl.textContent = "Edit Collection";
            if (saveBtn) saveBtn.textContent = "Save Changes";
            
            const collectionToEdit = collectionsForList.find(c => c.name === window.appState.editingCollectionName);
            if (collectionToEdit) {
                if(newCollectionNameInput) newCollectionNameInput.value = collectionToEdit.name || '';
                if(newCollectionCategoryInput) newCollectionCategoryInput.value = collectionToEdit.category || '';
                if(newCollectionDescriptionInput) newCollectionDescriptionInput.value = collectionToEdit.description || '';
            } else {
                console.error(`Cannot edit: Collection "${window.appState.editingCollectionName}" not found.`);
                closeAddToCollectionDialog(); // Close if collection to edit is not found
                return;
            }

            if (createForm) createForm.style.display = 'block';
            if (existingList) existingList.style.display = 'none';
            if (noCollectionsMsg) noCollectionsMsg.style.display = 'none';
            if (createNewBtn) createNewBtn.style.display = 'none';
        }

        if (addToCollectionDialog) {
            addToCollectionDialog.classList.add('visible');
            addToCollectionDialog.setAttribute('aria-hidden', 'false');
        }
    };

    const closeAddToCollectionDialog = () => {
        if (addToCollectionDialog) {
            addToCollectionDialog.classList.remove('visible');
            addToCollectionDialog.setAttribute('aria-hidden', 'true');
            
            // Reset form and dialog state
            const createForm = document.getElementById('create-collection-form');
            if (createForm) createForm.style.display = 'none';
            document.getElementById('new-collection-name').value = ''; 
            document.getElementById('new-collection-category').value = '';
            document.getElementById('new-collection-description').value = '';
            document.getElementById('create-new-collection-button').style.display = 'block';
            document.getElementById('existing-collections-list').style.display = 'block'; // Default show
            document.getElementById('no-collections-message').style.display = 'none'; // Default hide

            // Reset dialog mode states
            window.appState.collectionDialogMode = 'add_song'; // Default mode
            window.appState.editingCollectionName = null;
            currentSongIdToCollect = null;
        }
    };

    if (closeDialogButton) {
        closeDialogButton.addEventListener('click', closeAddToCollectionDialog);
    }
    if (addToCollectionDialog) { 
        addToCollectionDialog.addEventListener('click', (event) => {
            if (event.target === addToCollectionDialog) { 
                closeAddToCollectionDialog();
            }
        });
    }

    if (createNewCollectionButton) {
        createNewCollectionButton.addEventListener('click', () => {
            createCollectionForm.style.display = 'block';
            existingCollectionsList.style.display = 'none';
            noCollectionsMessageDialog.style.display = 'none';
            createNewCollectionButton.style.display = 'none'; 
        });
    }

    if (cancelCreateCollectionButton) {
        cancelCreateCollectionButton.addEventListener('click', () => {
            createCollectionForm.style.display = 'none';
            populateCollectionsList(); 
            createNewCollectionButton.style.display = 'block'; 
        });
    }

    if (saveCollectionButton) {
        saveCollectionButton.addEventListener('click', () => {
            const name = newCollectionNameInput.value.trim();
            const category = newCollectionCategoryInput.value.trim();
            const description = newCollectionDescriptionInput.value.trim();

            if (!name) {
                alert('Collection name is required.');
                return;
            }

            let collections = getCollections();
            const isEditing = window.appState.collectionDialogMode === 'edit';
            const originalName = window.appState.editingCollectionName;

            // Check for name uniqueness if creating new or renaming
            if ((!isEditing || (isEditing && name !== originalName)) && collections.some(c => c.name === name)) {
                alert('A collection with this name already exists.');
                return;
            }

            if (isEditing) {
                const collectionToUpdate = collections.find(c => c.name === originalName);
                if (collectionToUpdate) {
                    collectionToUpdate.name = name;
                    collectionToUpdate.category = category;
                    collectionToUpdate.description = description;
                    // Songs list remains unchanged
                } else {
                    alert('Error: Could not find the collection to update.');
                    return;
                }
            } else { // Creating new collection
                collections.push({ name, category, description, songs: [] });
            }
            
            saveCollections(collections);
            renderDrawerCollections(); // Update the drawer list

            if (!isEditing && currentSongIdToCollect) { // Only add song if creating new AND a song was targeted
                 addSongToCollection(currentSongIdToCollect, name);
            } else {
                 closeAddToCollectionDialog(); // Just close dialog if editing or creating directly
            }
            
            // Reset state (partially done in closeAddToCollectionDialog)
            window.appState.collectionDialogMode = 'add_song';
            window.appState.editingCollectionName = null;
        });
    }

    // Event delegation for dynamic content (like song cards, search results, etc.)
    mainContent.addEventListener('click', function(event) {
        const playButton = event.target.closest('.play-on-card-button');
        const artContainer = event.target.closest('.card-art-container');
        const addToCollectionButton = event.target.closest('.add-to-collection-button');
        const inlineLink = event.target.closest('.inline-link'); // For router links in text
        const addToDownloadQueueButton = event.target.closest('.add-to-download-queue-button');
        const searchResultDownloadButton = event.target.closest('.search-result-download-button');


        if (playButton) {
            const trackInfoString = playButton.dataset.trackInfo;
            if (trackInfoString) {
                try {
                    const trackInfo = JSON.parse(trackInfoString);
                    console.log('Play button clicked. Track Info:', trackInfo);
                    
                    // Populate and show the player
                    document.getElementById('player-album-art').src = trackInfo.cover_url || 'placeholder_album_art_2.png';
                    document.getElementById('player-track-title').textContent = trackInfo.title || 'Unknown Title';
                    document.getElementById('player-track-artist').textContent = trackInfo.author || trackInfo.artist_name || 'Unknown Artist';
                    // TODO: Set actual duration and handle playback (e.g., trackInfo.duration_ms)
                    // document.getElementById('player-duration').textContent = trackInfo.duration_formatted || '0:00'; 
                    
                    setPlayerVisibility(true);
                    const playPauseIcon = playerPlayPauseButton.querySelector('.material-icons');
                    if (playPauseIcon) playPauseIcon.textContent = 'pause_arrow'; // Assume immediate play

                    // Store current playing track info if needed by the player module
                    // window.playerModule.play(trackInfo); 
                } catch (e) {
                    console.error('Failed to parse track info for play button:', e);
                }
            } else {
                console.warn('Play button clicked, but no track-info data found.');
            }
        } else if (artContainer && !event.target.closest('.play-on-card-button') && !event.target.closest('.add-to-collection-button')) {
            const songCard = artContainer.closest('.song-card');
            if (songCard) {
                const trackInfoString = songCard.querySelector('.play-on-card-button')?.dataset.trackInfo || songCard.querySelector('.add-to-collection-button')?.dataset.trackInfo || songCard.dataset.trackInfo;
                if (trackInfoString) {
                    try {
                        const trackObject = JSON.parse(trackInfoString);
                        window.appState.currentSongDetail = trackObject;
                        const songHash = trackObject.music_id || trackObject.id || Date.now();
                        console.log('Navigating to song detail for:', trackObject.title, ` ID: ${songHash}`);
                        navigateTo('song-detail', trackObject.title || 'Song Detail', `#song-detail/${songHash}`);
                    } catch (e) {
                        console.error('Failed to parse track info for song detail navigation:', e);
                    }
                } else {
                    console.warn('Could not find track-info for song detail navigation.');
                }
            }
        }


        if (addToCollectionButton) {
            const songIdForCollection = addToCollectionButton.dataset.songId;
            const trackInfoString = addToCollectionButton.dataset.trackInfo; // For consistency if needed

            if (songIdForCollection) {
                console.log('Add to collection clicked for song ID:', songIdForCollection);
                openAddToCollectionDialog(songIdForCollection);
            } else if (trackInfoString) { // Fallback if data-song-id wasn't primary source
                try {
                    const trackInfo = JSON.parse(trackInfoString);
                    const id = trackInfo.music_id || trackInfo.id;
                    if (id) {
                        console.log('Add to collection (from track_info) for song ID:', id);
                        openAddToCollectionDialog(id);
                    } else {
                         console.error('Could not determine song ID for add to collection from track_info.');
                    }
                } catch(e) {
                    console.error('Error parsing track_info for add to collection:', e);
                }
            } else {
                console.error('Could not determine song ID for add to collection.');
            }
        }
        
        if (addToDownloadQueueButton) {
            const songCard = addToDownloadQueueButton.closest('.song-card');
            const songId = songCard ? songCard.dataset.songId : null;
            const source = songCard ? songCard.dataset.source : 'unknown'; // Get source from card
            const title = songCard ? songCard.querySelector('.song-card-title').textContent : 'Unknown Title';
            console.log(`Add to download queue clicked for song ID: ${songId}, Title: ${title}, Source: ${source}`);
            // Later: downloadManager.addToQueue({ id: songId, title: title, source: source, ...other_details });
            // Visually indicate it's added or processing (e.g., change icon)
            const icon = addToDownloadQueueButton.querySelector('.material-icons');
            if (icon) {
                icon.textContent = 'downloading'; // Example visual feedback
                // setTimeout(() => { icon.textContent = 'check_circle'; }, 2000); // Simulate completion
            }
        }

        // Removed: searchPageButton logic is no longer needed here as the search page itself is removed.
        // Header search is handled by a dedicated listener.

        if (inlineLink && inlineLink.dataset.page) {
            event.preventDefault();
            const pageId = inlineLink.dataset.page;
            const path = inlineLink.getAttribute('href');
            const title = pageId.charAt(0).toUpperCase() + pageId.slice(1); // Simple title
            navigateTo(pageId, title, path);
        }

        if (searchResultDownloadButton) {
            event.preventDefault(); // Prevent any default button action
            const trackInfoString = searchResultDownloadButton.dataset.trackInfo;
            if (trackInfoString && !searchResultDownloadButton.disabled) {
                try {
                    const trackObject = JSON.parse(trackInfoString);
                    console.log('Download button clicked for track:', trackObject);

                    // Disable button immediately to prevent multiple clicks
                    searchResultDownloadButton.innerHTML = '<span class="material-icons">hourglass_top</span> Starting...';
                    searchResultDownloadButton.disabled = true;

                    webSocketManager.sendWebSocketCommand("download_track", { source: "soundcloud", track_data: trackObject })
                        .then(response => { // Server acknowledged the command
                            console.log('Download command sent successfully for:', trackObject.title, response);
                            const queueItem = {
                                ...trackObject,
                                music_id: trackObject.music_id || trackObject.id || Date.now().toString(),
                                progressPercent: 0,
                                status: 'pending',
                                statusMessage: 'Queued for download...',
                                original_cmd_id: response ? response.cmd_id : null // Assuming server ack includes its own cmd_id for the task
                            };
                            window.appState.downloadQueue.push(queueItem);
                            
                            searchResultDownloadButton.innerHTML = '<span class="material-icons">check</span> Queued';
                            // Button remains disabled

                            renderTaskQueue();
                            updateMainTaskQueueIcon();
                        })
                        .catch(error => {
                            console.error('Failed to send download command for:', trackObject.title, error);
                            alert(`Failed to start download for: ${trackObject.title}. Error: ${error.message}`);
                            // Re-enable the button if the command failed to send or was rejected by server immediately
                            searchResultDownloadButton.innerHTML = '<span class="material-icons">download</span> Download';
                            searchResultDownloadButton.disabled = false;
                        });

                } catch (e) {
                    console.error('Failed to parse track info or initiate download:', e);
                    alert('Error processing this download request.');
                    searchResultDownloadButton.innerHTML = '<span class="material-icons">download</span> Download';
                    searchResultDownloadButton.disabled = false; // Re-enable on parsing error
                }
            } else if (searchResultDownloadButton.disabled) {
                console.log('Download button is already disabled (likely processing or queued).');
            } else {
                console.error('No track info found on download button.');
            }
        }

        // Handle clicks on song detail page buttons
        const detailPlayButton = event.target.closest('.detail-play-button');
        const detailAddToCollectionButton = event.target.closest('.detail-add-to-collection-button');

        if (detailPlayButton) {
            const trackInfoString = detailPlayButton.dataset.trackInfo;
            if (trackInfoString) {
                try {
                    const trackInfo = JSON.parse(trackInfoString);
                    console.log('Detail Page - Play button clicked. Track Info:', trackInfo);
                     // Populate and show the player (similar to card play button)
                    document.getElementById('player-album-art').src = trackInfo.cover_url || 'placeholder_album_art_2.png';
                    document.getElementById('player-track-title').textContent = trackInfo.title || 'Unknown Title';
                    document.getElementById('player-track-artist').textContent = trackInfo.author || trackInfo.artist_name || 'Unknown Artist';
                    setPlayerVisibility(true);
                    const playPauseIcon = playerPlayPauseButton.querySelector('.material-icons');
                    if (playPauseIcon) playPauseIcon.textContent = 'pause_arrow';
                } catch (e) {
                    console.error('Failed to parse track info for detail play button:', e);
                }
            }
        }

        if (detailAddToCollectionButton) {
            const songId = detailAddToCollectionButton.dataset.songId;
            if (songId) {
                console.log('Detail Page - Add to collection clicked for song ID:', songId);
                openAddToCollectionDialog(songId);
            } else {
                 const trackInfoString = detailAddToCollectionButton.dataset.trackInfo;
                 if (trackInfoString) {
                    try {
                        const trackInfo = JSON.parse(trackInfoString);
                        const id = trackInfo.music_id || trackInfo.id;
                        if (id) {
                            openAddToCollectionDialog(id);
                        } else {
                             console.error('Could not determine song ID for detail add to collection from track_info.');
                        }
                    } catch(e) {
                         console.error('Error parsing track_info for detail add to collection:', e);
                    }
                 } else {
                    console.error('No songId or trackInfo found on detail add to collection button.');
                 }
            }
        }
    });

    // Header Search Functionality
    const headerSearchInput = document.getElementById('header-search-input');
    if (headerSearchInput) {
        headerSearchInput.addEventListener('keypress', async (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); 
                const query = headerSearchInput.value.trim();
                window.appState.searchQuery = query; // Store query

                if (query === '') {
                    console.log('Empty search query.');
                    // Optionally, clear previous search results or show a message
                    window.appState.searchResults = [];
                    window.appState.searchError = null;
                    // If already on search results page, update it to show "empty"
                    if (location.hash === '#search-results') {
                        navigateTo('search-results', 'Search Results', '#search-results', true);
                    }
                    return;
                }

                console.log(`Searching for: ${query} (Source: SoundCloud)`);
                // Navigate to results page first to show loading state
                navigateTo('search-results', 'Search Results', '#search-results');
                
                // Show loading indicator on the search results page (will be handled by displaySearchResultsOnPage)
                // The displaySearchResultsOnPage will be called by navigateTo

                try {
                    const searchResults = await webSocketManager.sendWebSocketCommand('search', { query: query, source: 'soundcloud' });
                    console.log('Search results received:', searchResults);
                    
                    window.appState.searchResults = searchResults.results || [];
                    window.appState.searchError = null;
                } catch (error) {
                    console.error('Search failed:', error);
                    window.appState.searchResults = [];
                    window.appState.searchError = error.message || 'Unknown error occurred';
                    // alert(`Search error: ${window.appState.searchError}`); // Alert is disruptive, message on page is better
                } finally {
                    // Update the search results page content (already navigated, so just re-render)
                    // This relies on displaySearchResultsOnPage being called by navigateTo or manually if already on page
                    if (location.hash === '#search-results') {
                         displaySearchResultsOnPage(); // Re-render with new data or error
                    }
                }
            }
        });
    }

    // Function to display search results on the 'search-results' page
    function renderTaskQueue() {
        const taskQueueULElement = document.querySelector('#expanded-task-queue ul');
        const emptyQueueMessage = document.querySelector('#expanded-task-queue .empty-queue-message');

        if (!taskQueueULElement || !emptyQueueMessage) {
            console.error('Task queue elements not found for rendering.');
            return;
        }

        taskQueueULElement.innerHTML = ''; // Clear current list

        if (window.appState.downloadQueue.length === 0) {
            emptyQueueMessage.style.display = 'block';
            taskQueueULElement.style.display = 'none';
        } else {
            emptyQueueMessage.style.display = 'none';
            taskQueueULElement.style.display = 'block';

            window.appState.downloadQueue.forEach(task => {
                const listItem = document.createElement('li');
                listItem.className = 'task-item';
                listItem.dataset.musicId = task.music_id; // For potential future direct manipulation

                let progressIconHtml = '<span class="material-icons">hourglass_empty</span>'; // Default for pending/queued
                if (task.status === 'downloading') {
                    progressIconHtml = '<span class="material-icons">downloading</span>';
                } else if (task.status === 'processing') {
                     progressIconHtml = '<span class="material-icons">sync</span>'; // Example: sync icon for processing
                } else if (task.status === 'completed_track') {
                    progressIconHtml = '<span class="material-icons" style="color: var(--success-color, green);">check_circle</span>';
                } else if (task.status === 'error') {
                    progressIconHtml = `<span class="material-icons" style="color: var(--error-color, red);" title="${task.statusMessage || 'Error'}">error</span>`;
                }
                
                // Basic progress bar (can be styled further with CSS)
                const progressBarHtml = `
                    <div class="task-item-progress-bar-container" style="${task.progressPercent > 0 && task.progressPercent < 100 ? '' : 'display: none;'}">
                        <div class="task-item-progress-bar" style="width: ${task.progressPercent || 0}%; background-color: var(--primary-color); height: 4px; border-radius: 2px;"></div>
                    </div>
                `;

                listItem.innerHTML = `
                    <img src="${task.cover_url || 'placeholder_cover_1.png'}" alt="Cover for ${task.title}" class="task-item-cover">
                    <div class="task-item-info">
                        <h4 class="task-item-title" title="${task.title}">${task.title}</h4>
                        <p class="task-item-artist">${task.author || task.artist_name || 'Unknown Artist'}</p>
                        <p class="task-item-description">${task.statusMessage || task.status}</p>
                        ${progressBarHtml}
                    </div>
                    <div class="task-item-progress">
                        ${progressIconHtml}
                    </div>
                `;
                taskQueueULElement.appendChild(listItem);
            });
        }
    }

    function updateMainTaskQueueIcon() {
        const activeDownloads = window.appState.downloadQueue.filter(
            task => task.status === 'downloading' || task.status === 'pending' || task.status === 'processing'
        );
        
        const circularProgressElement = document.querySelector('#task-queue-button .circular-progress');
        if (!circularProgressElement) {
            console.error('Circular progress element for task queue button not found.');
            return;
        }

        if (activeDownloads.length > 0) {
            circularProgressElement.classList.remove('hidden');
            let overallProgress = 0;
            // Simple average progress of active downloads
            // More sophisticated logic might be needed for multiple concurrent downloads displayed as one.
            if (activeDownloads.some(task => task.status === 'downloading')) {
                 const downloadingTasks = activeDownloads.filter(t => t.status === 'downloading');
                 if (downloadingTasks.length > 0) {
                    overallProgress = downloadingTasks.reduce((sum, task) => sum + (task.progressPercent || 0), 0) / downloadingTasks.length;
                 } else { // If only pending/processing, show a small "busy" progress
                    overallProgress = 5; // Small static progress to indicate activity for pending/processing
                 }
            } else { // Only pending/processing
                 overallProgress = null; // Indeterminate for pending/processing if no active downloading
            }
            updateTaskQueueProgress(overallProgress); // Use existing function
        } else {
            updateTaskQueueProgress(0); // Reset to 0% or clear
            circularProgressElement.classList.add('hidden');
        }
    }

    function displaySearchResultsOnPage() {
        const resultsPage = document.getElementById('search-results-page');
        if (!resultsPage) {
            // console.log('Search results page elements not found yet.');
            return; 
        }

        const queryText = window.appState.searchQuery || '';
        const pageTitle = resultsPage.querySelector('h2');
        if (pageTitle) {
            pageTitle.textContent = queryText ? `Search Results for "${queryText}"` : 'Search Results';
        }
        
        const queryInfoDisplay = resultsPage.querySelector('#search-results-info'); // The <p> tag for "Showing results for..."
        const queryStrongDisplay = resultsPage.querySelector('#search-results-query'); // The <strong> tag within that <p>
        if (queryInfoDisplay && queryStrongDisplay) {
            if(queryText){
                queryStrongDisplay.textContent = queryText;
                queryInfoDisplay.style.display = 'block';
            } else {
                queryInfoDisplay.style.display = 'none';
            }
        }


        const resultsContainer = resultsPage.querySelector('#search-results-container');
        const noResultsMessage = resultsPage.querySelector('#no-search-results-message');
        const errorMessageDisplay = resultsPage.querySelector('#search-error-message');
        const loadingMessage = resultsPage.querySelector('#search-loading-message');

        // Reset state
        resultsContainer.innerHTML = ''; 
        noResultsMessage.style.display = 'none';
        errorMessageDisplay.style.display = 'none';
        loadingMessage.style.display = 'none'; // Assuming loading is handled before calling this for final display

        if (window.appState.searchError) {
            errorMessageDisplay.textContent = `Sorry, an error occurred: ${window.appState.searchError}`;
            errorMessageDisplay.style.display = 'block';
        } else if (window.appState.searchResults && window.appState.searchResults.length > 0) {
            resultsContainer.style.display = 'block'; // Make sure it's visible
            let songCardGrid = resultsContainer.querySelector('.song-card-grid');
            if (!songCardGrid) {
                songCardGrid = document.createElement('div');
                songCardGrid.className = 'song-card-grid search-results-grid'; // Add search-specific class if needed
                resultsContainer.appendChild(songCardGrid);
            } else {
                songCardGrid.innerHTML = ''; // Clear existing grid content
            }

            window.appState.searchResults.forEach(track => {
                const musicId = track.music_id || `generated-${Math.random().toString(36).substr(2, 9)}`;
                const coverUrl = track.cover_url || 'placeholder_cover_1.png';
                const title = track.title || 'Unknown Title';
                const artist = track.author || track.artist_name || 'Unknown Artist';

                // IMPORTANT: Sanitize JSON string for use in HTML attribute
                // JSON.stringify produces a valid JSON string, which uses double quotes.
                // To embed this in an HTML attribute, it's safest to wrap the attribute value in single quotes.
                // Or, if HTML attribute must use double quotes, then double quotes within JSON must be escaped.
                // For data- attributes, single quotes for the value are fine.
                const trackInfoJson = JSON.stringify(track).replace(/'/g, '&apos;'); // Escape single quotes if any in JSON string itself

                const cardHTML = `
                    <div class="song-card" data-song-id="${musicId}">
                        <div class="card-art-container">
                            <img src="${coverUrl}" alt="Album Art for ${title}" class="song-card-art">
                        </div>
                        <div class="song-card-info">
                            <h3 class="song-card-title">${title}</h3>
                            <p class="song-card-artist">${artist}</p>
                        </div>
                        <div class="song-card-actions">
                             <button class="search-result-download-button icon-button" data-track-info='${trackInfoJson}'>
                                <span class="material-icons">download</span> Download
                            </button>
                        </div>
                    </div>
                `;
                songCardGrid.innerHTML += cardHTML;
            });
        } else if (queryText) { // Only show "no results" if a search query was made
            noResultsMessage.style.display = 'block';
        } else {
            // No query, no results, no error - e.g. navigated to #search-results directly.
            // pageContents for search-results already has a generic "Search results will be displayed here" type message.
            // Or, we can explicitly set a prompt here.
             resultsContainer.innerHTML = '<p>Enter a search term in the header to find music.</p>';
        }
    }

    // --- Local Collections & Context Menu ---
    const localCollectionsList = document.getElementById('local-collections-list');
    const contextMenu = document.getElementById('drawer-context-menu');

    function renderDrawerCollections() {
        if (!localCollectionsList) {
            console.error('#local-collections-list element not found in the drawer.');
            return;
        }
        const collections = getCollections(); // Assumes getCollections() is available and returns array
        localCollectionsList.innerHTML = ''; // Clear existing items

        if (collections.length === 0) {
            const noCollectionsLi = document.createElement('li');
            noCollectionsLi.innerHTML = `<span class="no-collections-message" style="padding: 10px; color: var(--text-color-secondary); font-size: 0.9em;">No playlists yet. Right-click to create one.</span>`;
            localCollectionsList.appendChild(noCollectionsLi);
        } else {
            collections.forEach(collection => {
                const listItem = document.createElement('li');
                const link = document.createElement('a');
                link.href = `#collection/${encodeURIComponent(collection.name)}`;
                link.textContent = collection.name;
                link.dataset.page = "collection-detail"; // For potential future routing
                link.dataset.collectionName = collection.name;
                link.className = "drawer-link local-collection-link";
                listItem.appendChild(link);
                localCollectionsList.appendChild(listItem);
            });
        }
    }

    if (localCollectionsList && contextMenu) {
        localCollectionsList.addEventListener('contextmenu', function(event) {
            event.preventDefault();
            const targetCollectionLink = event.target.closest('a.local-collection-link');
            
            contextMenu.currentTargetCollectionName = targetCollectionLink ? targetCollectionLink.dataset.collectionName : null;

            // Position and show menu
            contextMenu.style.top = `${event.clientY}px`;
            contextMenu.style.left = `${event.clientX}px`;
            contextMenu.style.display = 'block';

            // Enable/disable "Edit" and "Delete"
            const editOption = contextMenu.querySelector('li[data-action="edit_collection"]');
            const deleteOption = contextMenu.querySelector('li[data-action="delete_collection"]');

            if (targetCollectionLink) {
                if (editOption) editOption.classList.remove('disabled');
                if (deleteOption) deleteOption.classList.remove('disabled');
            } else {
                if (editOption) editOption.classList.add('disabled');
                if (deleteOption) deleteOption.classList.add('disabled');
            }
        });

        contextMenu.addEventListener('click', function(event) {
            const action = event.target.dataset.action;
            const collectionName = contextMenu.currentTargetCollectionName;
            contextMenu.style.display = 'none'; // Hide menu after action

            switch (action) {
                case 'create_collection':
                    console.log('Context Menu: Create Collection');
                    openCreateCollectionDialog(); 
                    break;
                case 'edit_collection':
                    if (collectionName) {
                        console.log('Context Menu: Edit Collection', collectionName);
                        openEditCollectionDialog(collectionName);
                    } else {
                        console.warn('Edit action clicked but no collection was targeted.');
                    }
                    break;
                case 'delete_collection':
                    if (collectionName) {
                        if (confirm(`Are you sure you want to delete the collection "${collectionName}"? This cannot be undone.`)) {
                            console.log('Context Menu: Delete Collection', collectionName);
                            deleteLocalCollection(collectionName);
                            renderDrawerCollections(); // Re-render the list
                        }
                    } else {
                        console.warn('Delete action clicked but no collection was targeted.');
                    }
                    break;
            }
        });
    }

    document.addEventListener('click', function(event) {
        if (contextMenu && contextMenu.style.display === 'block') {
            if (!contextMenu.contains(event.target) && !localCollectionsList.contains(event.target)) {
                 contextMenu.style.display = 'none';
            }
        }
        // Also hide Add to Collection Dialog if click is outside
        const addToCollectionDialog = document.getElementById('add-to-collection-dialog');
        if (addToCollectionDialog && addToCollectionDialog.classList.contains('visible')) {
            const dialogBox = addToCollectionDialog.querySelector('.dialog-box');
            if (dialogBox && !dialogBox.contains(event.target) && event.target !== addToCollectionDialog && !event.target.closest('.add-to-collection-button')) {
                // Check if the click is NOT on the dialog itself OR any button that opens it.
                // The event.target !== addToCollectionDialog check is for clicks on the overlay.
                // console.log('Clicked outside add to collection dialog');
                // closeAddToCollectionDialog(); // This was causing issues with context menu opening dialog.
                // The existing close logic for this dialog seems sufficient.
            }
        }
    });
    
    function deleteLocalCollection(collectionName) {
        let collections = getCollections();
        collections = collections.filter(c => c.name !== collectionName);
        saveCollections(collections); // Assumes saveCollections is available
        console.log(`Collection "${collectionName}" deleted.`);
    }

    // Placeholder for dialog functions to be implemented/modified in next step
    // window.appState.collectionDialogMode and window.appState.editingCollectionName will be used here
    function openCreateCollectionDialog() {
        console.log("Attempting to open Create Collection Dialog");
        window.appState.collectionDialogMode = 'create_direct'; // Set mode BEFORE calling common dialog function
        openAddToCollectionDialog(null); // Signal that it's not for a song
        
        // Title is now set correctly within openAddToCollectionDialog based on the mode
        
        // Ensure form is visible, list is hidden
        const createForm = document.getElementById('create-collection-form');
        const existingList = document.getElementById('existing-collections-list');
        const noCollectionsMsg = document.getElementById('no-collections-message'); // in dialog
        const createNewCollectionBtn = document.getElementById('create-new-collection-button'); // in dialog

        if(createForm) createForm.style.display = 'block';
        if(existingList) existingList.style.display = 'none';
        if(noCollectionsMsg) noCollectionsMsg.style.display = 'none';
        if(createNewCollectionBtn) createNewCollectionBtn.style.display = 'none';

        window.appState.collectionDialogMode = 'create_direct'; // Specific mode for direct creation
    }

    function openEditCollectionDialog(collectionName) {
        console.log(`Attempting to open Edit Collection Dialog for: ${collectionName}`);
        const collections = getCollections();
        const collectionToEdit = collections.find(c => c.name === collectionName);
        if (!collectionToEdit) {
            console.error(`Collection "${collectionName}" not found for editing.`);
            return;
        }
        window.appState.collectionDialogMode = 'edit'; // Set mode BEFORE
        window.appState.editingCollectionName = collectionName; // Set editing name BEFORE
        openAddToCollectionDialog(null); // Signal it's not for a song
        
        // Title is now set correctly within openAddToCollectionDialog based on the mode
        // Form population will be handled by openAddToCollectionDialog in 'edit' mode.
        // const nameInput = document.getElementById('new-collection-name'); // No longer needed here
        const categoryInput = document.getElementById('new-collection-category');
        const descriptionInput = document.getElementById('new-collection-description');
        if(nameInput) nameInput.value = collectionToEdit.name || '';
        if(categoryInput) categoryInput.value = collectionToEdit.category || '';
        if(descriptionInput) descriptionInput.value = collectionToEdit.description || '';
        
        // Ensure form is visible, list is hidden
        const createForm = document.getElementById('create-collection-form');
        const existingList = document.getElementById('existing-collections-list');
        const noCollectionsMsg = document.getElementById('no-collections-message');
        const createNewCollectionBtn = document.getElementById('create-new-collection-button');

        if(createForm) createForm.style.display = 'block';
        if(existingList) existingList.style.display = 'none';
        if(noCollectionsMsg) noCollectionsMsg.style.display = 'none';
        if(createNewCollectionBtn) createNewCollectionBtn.style.display = 'none';
        
        window.appState.collectionDialogMode = 'edit';
        window.appState.editingCollectionName = collectionName;
    }

    // Initial UI setup calls after DOM is ready
    renderTaskQueue();
    updateMainTaskQueueIcon();
    renderDrawerCollections(); // Render local collections on load

});

// --- Expose functions for debugging/testing via window.test ---
// Note: This block is intentionally outside DOMContentLoaded to ensure all functions are defined
// and DOM is ready before these are potentially called from the console.
// However, functions defined within DOMContentLoaded and not globally will not be accessible here
// unless they were already attached to window or a global object (like webSocketManager).

if (!window.test) {
    window.test = {};
}

// WebSocket command function
// Assuming webSocketManager is a global or accessible variable.
// If webSocketManager is defined inside DOMContentLoaded, this specific assignment will fail
// unless webSocketManager itself is made globally accessible.
// For now, we proceed assuming webSocketManager is defined in a scope accessible here.
// If it was defined with 'const' or 'let' inside DOMContentLoaded, it's not global.
// This was previously within DOMContentLoaded, so webSocketManager was in scope.
// Moving it out requires webSocketManager to be in a higher scope or global.
// For the purpose of this refactor, we'll assume webSocketManager might need to be
// defined outside DOMContentLoaded or explicitly attached to window if it's to be used here.
// Let's assume it's globally available for this example.
if (typeof webSocketManager !== 'undefined' && webSocketManager && typeof webSocketManager.sendWebSocketCommand === 'function') {
    window.test.sendWebSocketCommand = webSocketManager.sendWebSocketCommand.bind(webSocketManager);
} else {
    // Fallback: if webSocketManager is not globally available, provide a stub or warning.
    window.test.sendWebSocketCommand = () => console.warn('webSocketManager not found or sendWebSocketCommand is not a function. Ensure webSocketManager is globally accessible if defined outside DOMContentLoaded.');
    // Note: getLibrary is also exposed via webSocketManager.init() if webSocketManager is accessible
     if (typeof webSocketManager !== 'undefined' && webSocketManager && webSocketManager.testWebSocketGetLibrary) {
         // getLibrary is already set up by webSocketManager.init if accessible.
     } else {
         window.test.getLibrary = () => console.warn('webSocketManager not found, getLibrary unavailable.');
     }
}


// For functions defined globally or within DOMContentLoaded but assigned to global/higher-scope vars:
// The following assumes these functions are either global or attached to an accessible object.
// If they are const/let inside DOMContentLoaded, they are not directly accessible here.
// We will proceed with the assumption that these functions *were intended* to be accessible,
// and if not, this highlights a structural dependency.

// Local collection management functions
window.test.getLocalCollections = typeof getCollections !== 'undefined' ? getCollections : () => console.warn('getCollections not found. Was it defined globally or attached to window?');
window.test.saveLocalCollections = typeof saveCollections !== 'undefined' ? saveCollections : () => console.warn('saveCollections not found.');
window.test.deleteLocalCollection = typeof deleteLocalCollection !== 'undefined' ? deleteLocalCollection : () => console.warn('deleteLocalCollection not found.');
window.test.renderDrawerCollections = typeof renderDrawerCollections !== 'undefined' ? renderDrawerCollections : () => console.warn('renderDrawerCollections not found.');

// Dialog invocation functions
window.test.openAddToCollectionDialog = typeof openAddToCollectionDialog !== 'undefined' ? openAddToCollectionDialog : () => console.warn('openAddToCollectionDialog not found.');
window.test.openCreateCollectionDialog = typeof openCreateCollectionDialog !== 'undefined' ? openCreateCollectionDialog : () => console.warn('openCreateCollectionDialog not found.');
window.test.openEditCollectionDialog = typeof openEditCollectionDialog !== 'undefined' ? openEditCollectionDialog : () => console.warn('openEditCollectionDialog not found.');

// Task queue related
window.test.getDownloadQueue = () => (typeof window.appState !== 'undefined' && window.appState.downloadQueue) ? window.appState.downloadQueue : (console.warn('window.appState.downloadQueue not found.'), []);
window.test.renderTaskQueue = typeof renderTaskQueue !== 'undefined' ? renderTaskQueue : () => console.warn('renderTaskQueue not found.');
window.test.updateMainTaskQueueIcon = typeof updateMainTaskQueueIcon !== 'undefined' ? updateMainTaskQueueIcon : () => console.warn('updateMainTaskQueueIcon not found.');

// Player related
window.test.simulatePlayTrack = typeof simulatePlayTrack !== 'undefined' ? simulatePlayTrack : () => console.warn('simulatePlayTrack not found or removed.');
window.test.setPlayerVisibility = typeof setPlayerVisibility !== 'undefined' ? setPlayerVisibility : () => console.warn('setPlayerVisibility not found.');

// Navigation
window.test.navigateTo = typeof navigateTo !== 'undefined' ? navigateTo : () => console.warn('navigateTo not found.');

// Library fetching
if (typeof webSocketManager !== 'undefined' && webSocketManager && typeof webSocketManager.sendWebSocketCommand === 'function') {
    window.test.fetchLibrary = () => webSocketManager.sendWebSocketCommand("get_downloaded_music", {}).then(r => r.data);
} else {
    window.test.fetchLibrary = () => {
        console.warn('webSocketManager not found or sendWebSocketCommand is not a function, cannot fetch library.');
        return Promise.reject('webSocketManager not available.');
    };
}

console.log('Developer test functions are available under `window.test`. Note: Some functions might be unavailable if they were not defined globally or attached to window.');
/*
    Available test functions (availability depends on their original scope):
    - window.test.sendWebSocketCommand(command, payload)
    - window.test.getLocalCollections()
    - window.test.saveLocalCollections(collectionsArray)
    - window.test.deleteLocalCollection(collectionName)
    - window.test.renderDrawerCollections()
    - window.test.openAddToCollectionDialog(songId)
    - window.test.openCreateCollectionDialog()
    - window.test.openEditCollectionDialog(collectionName)
    - window.test.getDownloadQueue()
    - window.test.renderTaskQueue()
    - window.test.updateMainTaskQueueIcon()
    - window.test.simulatePlayTrack()
    - window.test.setPlayerVisibility(boolean)
    - window.test.navigateTo(pageId, title, path, skipPushState)
    - window.test.fetchLibrary()
    (Note: getLibrary is also available from previous WebSocket setup if webSocketManager is accessible)
*/
