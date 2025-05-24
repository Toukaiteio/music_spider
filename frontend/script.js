document.addEventListener('DOMContentLoaded', () => {
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

    // Placeholder page content - In a real app, you might load HTML templates or use a framework
    const pageContents = {
        home: `
       <div id="home-page">
           <h2>My Library</h2>
           <div id="song-card-grid">
               <!-- Song cards will be dynamically inserted here by JS later -->
               <!-- Static examples for now: -->
               <div class="song-card" data-song-id="1">
                   <div class="card-art-container">
                       <img src="placeholder_cover_1.png" alt="Album Art" class="song-card-art">
                       <button class="play-on-card-button" aria-label="Play Song">
                           <span class="material-icons">play_arrow</span>
                       </button>
                   </div>
                   <div class="song-card-info">
                       <h3 class="song-card-title">Example Song Title</h3>
                       <p class="song-card-artist">Artist Name</p>
                   </div>
                   <div class="song-card-actions">
                       <button class="add-to-collection-button" aria-label="Add to Collection">
                           <span class="material-icons">playlist_add</span>
                       </button>
                   </div>
               </div>
               <div class="song-card" data-song-id="2">
                   <div class="card-art-container">
                       <img src="placeholder_cover_2.png" alt="Album Art" class="song-card-art">
                       <button class="play-on-card-button" aria-label="Play Song">
                           <span class="material-icons">play_arrow</span>
                       </button>
                   </div>
                   <div class="song-card-info">
                       <h3 class="song-card-title">Another Great Track</h3>
                       <p class="song-card-artist">Another Artist</p>
                   </div>
                   <div class="song-card-actions">
                       <button class="add-to-collection-button" aria-label="Add to Collection">
                           <span class="material-icons">playlist_add</span>
                       </button>
                   </div>
               </div>
               <!-- Add a few more static examples if needed -->
           </div>
           <div id="no-songs-message" style="display:none;">
               <p>Your library is empty. Go to the <a href="#search" class="inline-link" data-page="search">Search page</a> to add music.</p>
           </div>
       </div>
   `,
        search: `
       <div id="search-page">
           <h2>Search Music</h2>
           <div class="search-input-area">
               <input type="text" id="search-page-input" placeholder="Enter artist, song, or album...">
               <div class="search-source-selector-container">
                  <label for="search-source-select">Source: </label>
                  <select id="search-source-select">
                       <option value="soundcloud">SoundCloud</option>
                       <!-- Options will be populated dynamically later -->
                       <option value="youtube" disabled>YouTube (Coming Soon)</option> 
                  </select>
               </div>
               <button id="search-page-button">
                   <span class="material-icons">search</span> Search
               </button>
           </div>
           <div id="search-results-area">
               <!-- Search results will be displayed here -->
           </div>
       </div>
   `,
        collections: "<h2>My Collections</h2><p>Manage your playlists and favorite tracks here.</p>",
        'song-detail': "<h2>Song Detail</h2><p>Details of the currently playing song.</p>" // Example, will be built out later
    };

    const updateActiveDrawerLink = (pageId) => {
        drawerLinks.forEach(link => {
            link.classList.remove('active');
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
        
        // Simulate page loading - replace with actual content loading
        mainContent.innerHTML = pageContents[pageId] || "<h2>Page Not Found</h2><p>The requested content is not available.</p>";
        
        // Update page title
        document.title = title + " - Music Downloader";
        
        // Update history state
        if (!skipPushState) {
            history.pushState({ pageId: pageId }, title, path);
        }
        
        updateActiveDrawerLink(pageId);

        // Basic fade-in animation for new content (optional)
        mainContent.style.opacity = '0';
        requestAnimationFrame(() => {
            mainContent.style.transition = 'opacity 0.3s ease-in-out';
            mainContent.style.opacity = '1';
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
            const pageId = event.state.pageId;
            // Construct title and path. For simplicity, using pageId for title and #pageId for path.
            // In a more robust router, you'd store these or have a route map.
            const title = pageId.charAt(0).toUpperCase() + pageId.slice(1);
            const path = '#' + pageId;
            navigateTo(pageId, title, path, true); // true to skip pushing state again
        } else {
             // Handle initial page load or cases where state is null (e.g. direct navigation to a hash)
             // Fallback to home or parse location.hash
             const initialPageId = location.hash.substring(1) || 'home';
             const initialTitle = initialPageId.charAt(0).toUpperCase() + initialPageId.slice(1);
             navigateTo(initialPageId, initialTitle, location.hash || '#home', true);
        }
    });

    // Initial page load handling
    // Determine the initial page from URL hash or default to 'home'
    let initialPage = location.hash.substring(1) || 'home';
    if (!pageContents[initialPage]) { // Fallback if hash is invalid
        initialPage = 'home';
    }
    const initialPath = '#' + initialPage;
    const initialTitleElement = document.querySelector(`.drawer-link[data-page="${initialPage}"] .link-text`);
    const initialTitle = initialTitleElement ? initialTitleElement.textContent : (initialPage.charAt(0).toUpperCase() + initialPage.slice(1));
    
    // Call navigateTo for the initial page load, ensuring history state is set correctly
    // For the very first load, we might want to replaceState instead of pushState
    // or ensure that if path is empty, it defaults to #home.
    if (location.pathname === '/' && !location.hash) {
         history.replaceState({ pageId: initialPage }, initialTitle, initialPath);
    } else {
         // If there's already a hash, use it but skip pushState if it's from a popstate-like event (e.g. refresh)
         // This part of popstate handling might need refinement for perfect initial load vs. back/forward.
         // For now, the popstate listener above should handle most cases.
         // The navigateTo call below ensures content is loaded based on current URL.
    }
    navigateTo(initialPage, initialTitle, initialPath, true); // true to skip pushing state for initial load based on URL
 
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
   
    let currentSongIdToCollect = null;

    const getCollections = () => {
        return JSON.parse(localStorage.getItem('userCollections')) || [];
    };

    const saveCollections = (collections) => {
        localStorage.setItem('userCollections', JSON.stringify(collections));
    };

    const addSongToCollection = (songId, collectionName) => {
        const collections = getCollections();
        const collection = collections.find(c => c.name === collectionName);
        if (collection) {
            if (!collection.songs) collection.songs = [];
            if (!collection.songs.includes(songId)) {
                collection.songs.push(songId);
                saveCollections(collections);
                console.log(`Song ${songId} added to ${collectionName}`);
                // Add user feedback here (e.g., toast message)
            } else {
                console.log(`Song ${songId} already in ${collectionName}`);
            }
        }
        closeAddToCollectionDialog();
    };

    const populateCollectionsList = () => {
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
        createCollectionForm.style.display = 'none'; 
    };

    const openAddToCollectionDialog = (songId) => {
        currentSongIdToCollect = songId;
        populateCollectionsList();
        if (addToCollectionDialog) {
            addToCollectionDialog.classList.add('visible');
            addToCollectionDialog.setAttribute('aria-hidden', 'false');
        }
    };

    const closeAddToCollectionDialog = () => {
        if (addToCollectionDialog) {
            addToCollectionDialog.classList.remove('visible');
            addToCollectionDialog.setAttribute('aria-hidden', 'true');
            createCollectionForm.style.display = 'none'; 
            newCollectionNameInput.value = ''; 
            newCollectionCategoryInput.value = '';
            newCollectionDescriptionInput.value = '';
            createNewCollectionButton.style.display = 'block'; // Ensure "Create New" is visible again
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

            const collections = getCollections();
            if (collections.some(c => c.name === name)) {
                alert('A collection with this name already exists.');
                return;
            }

            collections.push({ name, category, description, songs: [] });
            saveCollections(collections);
            
            populateCollectionsList(); 
            addSongToCollection(currentSongIdToCollect, name); 
            createNewCollectionButton.style.display = 'block'; 
        });
    }

    // Event delegation for dynamic content (like song cards, search results, etc.)
    mainContent.addEventListener('click', function(event) {
        const playButton = event.target.closest('.play-on-card-button');
        const artContainer = event.target.closest('.card-art-container');
        const addToCollectionButton = event.target.closest('.add-to-collection-button');
        const inlineLink = event.target.closest('.inline-link'); // For router links in text
        const searchPageButton = event.target.closest('#search-page-button');
        const addToDownloadQueueButton = event.target.closest('.add-to-download-queue-button');


        if (playButton) {
            const songCard = playButton.closest('.song-card');
            const songId = songCard ? songCard.dataset.songId : null;
            const source = songCard ? songCard.dataset.source : null; // Get source if available
            console.log('Play button clicked for song ID:', songId, 'Source:', source);
            // Later: playerModule.playTrack({id: songId, source: source, title: '...', artist: '...'});
            if (songId) { 
                 // Example: simulatePlayTrack needs an object for actual data
                 // const title = songCard.querySelector('.song-card-title').textContent;
                 // const artist = songCard.querySelector('.song-card-artist').textContent;
                 // const art = songCard.querySelector('.song-card-art').src;
                 // simulatePlayTrack({ title, artist, art });
            }
        } else if (artContainer && !event.target.closest('.play-on-card-button')) {
            const songCard = artContainer.closest('.song-card');
            const songId = songCard ? songCard.dataset.songId : null;
            console.log('Album art clicked for song ID:', songId, 'Navigating to song detail.');
            // Later: navigateTo('song-detail', 'Song Detail', '#song-detail/' + songId);
        }


        if (addToCollectionButton) {
            const songCard = addToCollectionButton.closest('.song-card');
            const songId = songCard ? songCard.dataset.songId : null;
            if (songId) openAddToCollectionDialog(songId);
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

        if (searchPageButton) {
            // Ensure we are on the search page before querying elements
            const searchPage = searchPageButton.closest('#search-page');
            if (!searchPage) return;

            const searchInput = searchPage.querySelector('#search-page-input');
            const sourceSelect = searchPage.querySelector('#search-source-select');
            const query = searchInput ? searchInput.value.trim() : '';
            const source = sourceSelect ? sourceSelect.value : '';
            
            if (query) {
                displaySearchResults(query, source);
            } else {
                const resultsContainer = searchPage.querySelector('#search-results-area');
                if (resultsContainer) resultsContainer.innerHTML = '<p class="search-results-info">Please enter a search term.</p>';
                 // Remove results-visible class if query is empty
                const searchInputArea = searchPage.querySelector('.search-input-area');
                if (searchInputArea) searchInputArea.classList.remove('results-visible');
            }
        }

        if (inlineLink && inlineLink.dataset.page) {
            event.preventDefault();
            const pageId = inlineLink.dataset.page;
            const path = inlineLink.getAttribute('href');
            const title = pageId.charAt(0).toUpperCase() + pageId.slice(1); // Simple title
            navigateTo(pageId, title, path);
        }
    });

    // Function to display search results
    // Note: searchResultsArea is defined inside navigateTo if search page is active.
    // For robust access, this function should be called when search page is visible
    // and 'mainContent' is guaranteed to contain '#search-results-area'.
    function displaySearchResults(query, source) {
        const resultsContainer = mainContent.querySelector('#search-results-area');
        if (!resultsContainer) {
            console.error("#search-results-area not found. Ensure search page is active.");
            return;
        }

        // Sanitize query for display to prevent XSS (basic example)
        const sanitizedQuery = query.replace(/</g, "&lt;").replace(/>/g, "&gt;");

        let html = `<p class="search-results-info">Showing results for: <strong>"${sanitizedQuery}"</strong> (Source: ${source})</p>`;
        // Simulate a "Searching..." message or spinner
        // resultsContainer.innerHTML = html + '<p>Searching...</p>'; 
        // For now, directly show static results after a brief conceptual delay (not implemented here)

        html += '<div id="song-card-grid" class="search-results-grid">'; // Reuse song-card-grid ID/class

        const exampleResults = [
            { id: 's1', title: 'Found Track Alpha', artist: 'Search Artist A', cover: 'placeholder_search_cover_1.png' },
            { id: 's2', title: 'Search Result Beta', artist: 'Search Artist B', cover: 'placeholder_search_cover_2.png' },
            { id: 's3', title: 'Echoes of Search', artist: 'Search Artist C', cover: 'placeholder_search_cover_3.png' }
        ];

        exampleResults.forEach(song => {
            html += `
                <div class="song-card" data-song-id="${song.id}" data-source="${source}">
                    <div class="card-art-container">
                        <img src="${song.cover}" alt="Album Art" class="song-card-art">
                        <button class="play-on-card-button" aria-label="Play Song">
                            <span class="material-icons">play_arrow</span>
                        </button>
                    </div>
                    <div class="song-card-info">
                        <h3 class="song-card-title">${song.title}</h3>
                        <p class="song-card-artist">${song.artist}</p>
                    </div>
                    <div class="song-card-actions">
                        <button class="add-to-download-queue-button" aria-label="Add to Download Queue">
                            <span class="material-icons">add_circle_outline</span>
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        resultsContainer.innerHTML = html;

        const searchInputArea = mainContent.querySelector('.search-input-area');
        if (searchInputArea) {
            searchInputArea.classList.add('results-visible');
        }
    }
});
