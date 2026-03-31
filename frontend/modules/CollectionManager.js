// frontend/modules/CollectionManager.js

class CollectionManager {
    constructor({
        navigationManager = null, 
        appState, 
        webSocketManager,
        dialogElementId = "add-to-collection-dialog",
        drawerListElementId = "local-collections-list",
        contextMenuElementId = "drawer-context-menu",
        closeDialogButtonId = "close-dialog-button",
        createNewCollectionButtonId = "create-new-collection-button",
        createCollectionFormId = "create-collection-form",
        cancelCreateCollectionButtonId = "cancel-create-collection-button",
        saveCollectionButtonId = "save-collection-button", // For metadata
        confirmCollectionChangesButtonId = "confirm-collection-changes-button", // For song assignments
        newCollectionNameInputId = "new-collection-name",
        newCollectionCategorySelectId = "new-collection-category-select",
        newCollectionCategoryCustomInputId = "new-collection-category-custom",
        newCollectionCategoryCustomRowId = "new-collection-category-custom-row",
        newCollectionCategoryBackBtnId = "new-collection-category-back-btn",
        newCollectionDescriptionInputId = "new-collection-description",
        newCollectionColorInputId = "new-collection-color", // Added color input ID
        existingCollectionsListId = "existing-collections-list",
        noCollectionsMessageDialogId = "no-collections-message",
        dialogTitleId = "dialog-title",
    }) {
        this.navigationManager = navigationManager;
        this.appState = appState;
        this.webSocketManager = webSocketManager;

        this.currentSongIdToCollect = null;
        this.dialogMode = 'add_song';
        this.editingCollectionName = null;
        this.dialogSelectionChanges = { additions: new Set(), removals: new Set() };
        this.defaultCollectionColor = "#6B7280"; // Store default color

        this.dialogElement = document.getElementById(dialogElementId);
        this.drawerListElement = document.getElementById(drawerListElementId);
        this.contextMenuElement = document.getElementById(contextMenuElementId);

        if (this.dialogElement) {
            this.closeDialogButton = document.getElementById(closeDialogButtonId);
            this.createNewCollectionButton = document.getElementById(createNewCollectionButtonId);
            this.createCollectionForm = document.getElementById(createCollectionFormId);
            this.cancelCreateCollectionButton = document.getElementById(cancelCreateCollectionButtonId);
            this.saveCollectionButton = document.getElementById(saveCollectionButtonId);
            this.confirmCollectionChangesButton = document.getElementById(confirmCollectionChangesButtonId);
            this.newCollectionNameInput = document.getElementById(newCollectionNameInputId);
            this.newCollectionCategorySelect = document.getElementById(newCollectionCategorySelectId);
            this.newCollectionCategoryCustomInput = document.getElementById(newCollectionCategoryCustomInputId);
            this.newCollectionCategoryCustomRow = document.getElementById(newCollectionCategoryCustomRowId);
            this.newCollectionCategoryBackBtn = document.getElementById(newCollectionCategoryBackBtnId);
            this.newCollectionDescriptionInput = document.getElementById(newCollectionDescriptionInputId);
            this.newCollectionColorInput = document.getElementById(newCollectionColorInputId); // Get color input
            this.existingCollectionsList = document.getElementById(existingCollectionsListId);
            this.noCollectionsMessageDialog = document.getElementById(noCollectionsMessageDialogId);
            this.dialogTitleElement = document.getElementById(dialogTitleId);
        }

        this._bindMethods();
    }

    _bindMethods() {
        this.init = this.init.bind(this);
        this.getCollections = this.getCollections.bind(this);
        this._populateDialogCollectionsList = this._populateDialogCollectionsList.bind(this);
        this.openDialog = this.openDialog.bind(this);
        this.closeDialog = this.closeDialog.bind(this);
        this.handleSaveCollection = this.handleSaveCollection.bind(this);
        this.handleConfirmAddToCollection = this.handleConfirmAddToCollection.bind(this);
        this.renderDrawerCollections = this.renderDrawerCollections.bind(this);
        this.deleteCollection = this.deleteCollection.bind(this);
        this._handleContextMenuClick = this._handleContextMenuClick.bind(this);
        this._handleDrawerListContextMenu = this._handleDrawerListContextMenu.bind(this);
        this.handleAddToCollectionButtonClick = this.handleAddToCollectionButtonClick.bind(this);
        this.removeSongFromCollection = this.removeSongFromCollection.bind(this);
        this._handleDialogCollectionToggle = this._handleDialogCollectionToggle.bind(this);
        this._generateRandomHexColor = this._generateRandomHexColor.bind(this);
        this._populateCategorySelector = this._populateCategorySelector.bind(this);
        this._getCategoryValue = this._getCategoryValue.bind(this);
        this._renderCollectionItems = this._renderCollectionItems.bind(this);
    }

    _generateRandomHexColor() {
        return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    }

    async _populateCategorySelector() {
        const select = this.newCollectionCategorySelect;
        const customRow = this.newCollectionCategoryCustomRow;
        const backBtn = this.newCollectionCategoryBackBtn;
        if (!select || !customRow) return;

        const collections = await this.getCollections();
        const categories = [...new Set(
            collections.map(c => c.category || '').filter(c => c !== '')
        )].sort();

        select.innerHTML = '';

        if (categories.length === 0) {
            // No existing categories — show text input directly
            select.style.display = 'none';
            customRow.style.display = '';
            if (backBtn) backBtn.style.display = 'none';
            return;
        }

        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '— No Category —';
        select.appendChild(emptyOpt);

        for (const cat of categories) {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            select.appendChild(opt);
        }

        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = '──────────';
        select.appendChild(sep);

        const customOpt = document.createElement('option');
        customOpt.value = '__custom__';
        customOpt.textContent = 'Custom...';
        select.appendChild(customOpt);

        select.value = '';
        select.style.display = '';
        customRow.style.display = 'none';
    }

    _getCategoryValue() {
        const select = this.newCollectionCategorySelect;
        const customInput = this.newCollectionCategoryCustomInput;
        if (!select || !customInput) return '';
        if (select.style.display === 'none') {
            return customInput.value.trim();
        }
        const val = select.value;
        return val === '__custom__' ? '' : val;
    }
    
    async init() {
        if (!this.dialogElement || !this.drawerListElement || !this.contextMenuElement) {
            console.error("CollectionManager: Crucial DOM elements not found. Initialization aborted.");
            return;
        }

        if (this.closeDialogButton) this.closeDialogButton.addEventListener('click', this.closeDialog);
        this.dialogElement.addEventListener('click', (event) => {
            if (event.target === this.dialogElement) this.closeDialog();
        });
        if (this.createNewCollectionButton) {
            this.createNewCollectionButton.addEventListener('click', async () => {
                await this._populateCategorySelector();
                if(this.createCollectionForm) this.createCollectionForm.style.display = 'block';
                if(this.existingCollectionsList) this.existingCollectionsList.style.display = 'none';
                if(this.noCollectionsMessageDialog) this.noCollectionsMessageDialog.style.display = 'none';
                this.createNewCollectionButton.style.display = 'none';
                if(this.saveCollectionButton) this.saveCollectionButton.style.display = 'inline-block';
                if(this.confirmCollectionChangesButton) this.confirmCollectionChangesButton.style.display = 'none';
            });
        }
        if (this.cancelCreateCollectionButton) {
            this.cancelCreateCollectionButton.addEventListener('click', () => {
                if(this.createCollectionForm) this.createCollectionForm.style.display = 'none';
                this._populateDialogCollectionsList(); 
                if(this.createNewCollectionButton) this.createNewCollectionButton.style.display = 'block';
                if(this.dialogMode === 'add_song') {
                    if(this.saveCollectionButton) this.saveCollectionButton.style.display = 'none';
                    if(this.confirmCollectionChangesButton) this.confirmCollectionChangesButton.style.display = 'inline-block';
                }
            });
        }
        if (this.newCollectionCategorySelect) {
            this.newCollectionCategorySelect.addEventListener('change', () => {
                if (this.newCollectionCategorySelect.value === '__custom__') {
                    this.newCollectionCategorySelect.style.display = 'none';
                    if (this.newCollectionCategoryCustomRow) this.newCollectionCategoryCustomRow.style.display = '';
                    if (this.newCollectionCategoryBackBtn) this.newCollectionCategoryBackBtn.style.display = '';
                    if (this.newCollectionCategoryCustomInput) {
                        this.newCollectionCategoryCustomInput.value = '';
                        this.newCollectionCategoryCustomInput.focus();
                    }
                }
            });
        }
        if (this.newCollectionCategoryBackBtn) {
            this.newCollectionCategoryBackBtn.addEventListener('click', () => {
                if (this.newCollectionCategoryCustomInput) this.newCollectionCategoryCustomInput.value = '';
                if (this.newCollectionCategoryCustomRow) this.newCollectionCategoryCustomRow.style.display = 'none';
                if (this.newCollectionCategorySelect) {
                    this.newCollectionCategorySelect.style.display = '';
                    this.newCollectionCategorySelect.value = '';
                }
            });
        }
        if (this.saveCollectionButton) this.saveCollectionButton.addEventListener('click', this.handleSaveCollection);
        if (this.confirmCollectionChangesButton) this.confirmCollectionChangesButton.addEventListener('click', this.handleConfirmAddToCollection);

        this.drawerListElement.addEventListener('contextmenu', this._handleDrawerListContextMenu);
        this.contextMenuElement.addEventListener('click', this._handleContextMenuClick);
        document.addEventListener('click', (event) => {
            if (this.contextMenuElement.style.display === 'block' && 
                !this.contextMenuElement.contains(event.target) &&
                !this.drawerListElement.contains(event.target)) {
                this.contextMenuElement.style.display = 'none';
            }
        });
        await this.renderDrawerCollections();
        console.log("CollectionManager initialized.");
    }

    async getCollections() {
        try {
            const resp = await this.webSocketManager.sendWebSocketCommand('get_playlists', {});
            if (resp.code === 0 && resp.data) {
                return resp.data.playlists || [];
            }
        } catch (e) {
            console.error("CollectionManager: Failed to get collections from backend", e);
        }
        return [];
    }

    _handleDialogCollectionToggle(event, collectionName) {
        const button = event.currentTarget;
        const isOriginallySelected = button.dataset.originallySelected === 'true';
        
        button.classList.toggle('selected');
        const isNowSelected = button.classList.contains('selected');

        if (isOriginallySelected) {
            if (!isNowSelected) { 
                this.dialogSelectionChanges.removals.add(collectionName);
                this.dialogSelectionChanges.additions.delete(collectionName); 
            } else { 
                this.dialogSelectionChanges.removals.delete(collectionName);
            }
        } else { 
            if (isNowSelected) { 
                this.dialogSelectionChanges.additions.add(collectionName);
                this.dialogSelectionChanges.removals.delete(collectionName); 
            } else { 
                this.dialogSelectionChanges.additions.delete(collectionName);
            }
        }
    }
    
    async _populateDialogCollectionsList() {
        if (!this.existingCollectionsList || !this.noCollectionsMessageDialog) {
            console.error("CollectionManager: Dialog list elements not found for populating.");
            return;
        }
        const collections = await this.getCollections();
        this.existingCollectionsList.innerHTML = ""; 
        const songIdStr = String(this.currentSongIdToCollect);

        if (collections.length > 0) {
            // Need tracks for each collection to check selection state
            for (const collection of collections) {
                const button = document.createElement("button");
                button.className = "collection-item-button dialog-button";
                const displayName = collection.name === 'Liked' ? 'My Favorites' : collection.name;
                button.textContent = displayName;
                button.dataset.collectionName = collection.name;

                // For efficiency, backend should ideally return if song is in playlist,
                // but for now we fetch tracks or use a different approach.
                // Re-think: if we have many collections, fetching tracks for each is slow.
                // Let's assume the backend 'get_playlists' could optionally include if song is in it,
                // or we just fetch tracks for the active song's memberships once.
                
                // Let's fetch tracks for this collection to check if song is in it
                const tracksResp = await this.webSocketManager.sendWebSocketCommand('get_playlist_tracks', { name: collection.name });
                const tracks = (tracksResp.code === 0 && tracksResp.data) ? tracksResp.data.tracks : [];
                const isOriginallyInCollection = tracks.some(t => String(t.music_id || t.id || t.bvid) === songIdStr);

                button.dataset.originallySelected = isOriginallyInCollection;
                if (isOriginallyInCollection) {
                    button.classList.add('selected');
                }
                
                button.onclick = (event) => this._handleDialogCollectionToggle(event, collection.name);
                this.existingCollectionsList.appendChild(button);
            }
            this.noCollectionsMessageDialog.style.display = "none";
            this.existingCollectionsList.style.display = "block";
        } else {
            this.noCollectionsMessageDialog.style.display = "block";
            this.existingCollectionsList.style.display = "none";
        }
    }

    async openDialog(songId = null, mode = 'add_song', collectionNameToEdit = null) {
        this.currentSongIdToCollect = songId ? String(songId) : null;
        this.dialogMode = mode;
        this.editingCollectionName = mode === 'edit' ? collectionNameToEdit : null;
        this.dialogSelectionChanges = { additions: new Set(), removals: new Set() };

        if (!this.dialogElement || !this.dialogTitleElement || !this.createCollectionForm ||
            !this.existingCollectionsList || !this.noCollectionsMessageDialog ||
            !this.createNewCollectionButton || !this.saveCollectionButton || !this.confirmCollectionChangesButton ||
            !this.newCollectionNameInput || !this.newCollectionDescriptionInput ||
            !this.newCollectionColorInput) {
            console.error("CollectionManager: Essential dialog elements are missing. Cannot open dialog.");
            return;
        }

        this.newCollectionNameInput.value = "";
        if (this.newCollectionCategorySelect) this.newCollectionCategorySelect.innerHTML = '';
        if (this.newCollectionCategoryCustomInput) this.newCollectionCategoryCustomInput.value = '';
        if (this.newCollectionCategoryCustomRow) this.newCollectionCategoryCustomRow.style.display = 'none';
        this.newCollectionDescriptionInput.value = "";
        this.newCollectionColorInput.value = this.defaultCollectionColor;

        const isAddingSongMode = this.dialogMode === 'add_song';
        if(this.saveCollectionButton) this.saveCollectionButton.style.display = isAddingSongMode ? 'none' : 'inline-block'; 
        if(this.confirmCollectionChangesButton) this.confirmCollectionChangesButton.style.display = isAddingSongMode ? 'inline-block' : 'none';

        if (isAddingSongMode) {
            this.dialogTitleElement.textContent = "Add/Remove from Playlists";
            await this._populateDialogCollectionsList(); 
            this.createCollectionForm.style.display = "none"; 
            this.existingCollectionsList.style.display = "block";
            const collections = await this.getCollections();
            this.noCollectionsMessageDialog.style.display = collections.length === 0 ? "block" : "none";
            this.createNewCollectionButton.style.display = "block"; 
        } else if (this.dialogMode === 'create_direct') {
            this.dialogTitleElement.textContent = "Create New Playlist";
            if(this.saveCollectionButton) this.saveCollectionButton.textContent = "Save Playlist";
            await this._populateCategorySelector();
            this.createCollectionForm.style.display = "block";
            this.existingCollectionsList.style.display = "none";
            this.noCollectionsMessageDialog.style.display = "none";
            this.createNewCollectionButton.style.display = "none";
        } else if (this.dialogMode === 'edit') {
            this.dialogTitleElement.textContent = "Edit Playlist";
            if(this.saveCollectionButton) this.saveCollectionButton.textContent = "Save Changes";
            const collections = await this.getCollections();
            const collectionToEdit = collections.find(c => c.name === this.editingCollectionName);
            if (collectionToEdit) {
                this.newCollectionNameInput.value = collectionToEdit.name || "";
                await this._populateCategorySelector();
                // Set existing category value on the selector
                const existingCat = collectionToEdit.category || '';
                if (this.newCollectionCategorySelect && this.newCollectionCategorySelect.style.display !== 'none') {
                    const hasOpt = [...this.newCollectionCategorySelect.options].some(o => o.value === existingCat);
                    if (hasOpt) {
                        this.newCollectionCategorySelect.value = existingCat;
                    } else if (existingCat) {
                        // Switch to custom input for unrecognised category
                        this.newCollectionCategorySelect.style.display = 'none';
                        if (this.newCollectionCategoryCustomRow) this.newCollectionCategoryCustomRow.style.display = '';
                        if (this.newCollectionCategoryBackBtn) this.newCollectionCategoryBackBtn.style.display = '';
                        if (this.newCollectionCategoryCustomInput) this.newCollectionCategoryCustomInput.value = existingCat;
                    }
                } else if (this.newCollectionCategoryCustomInput) {
                    this.newCollectionCategoryCustomInput.value = existingCat;
                }
                this.newCollectionDescriptionInput.value = collectionToEdit.description || "";
                this.newCollectionColorInput.value = collectionToEdit.color || this._generateRandomHexColor();
            } else {
                console.error(`CollectionManager: Cannot edit. Playlist "${this.editingCollectionName}" not found.`);
                this.closeDialog();
                return;
            }
            this.createCollectionForm.style.display = "block";
            this.existingCollectionsList.style.display = "none";
            this.noCollectionsMessageDialog.style.display = "none";
            this.createNewCollectionButton.style.display = "none";
        }

        this.dialogElement.classList.add("visible");
        this.dialogElement.setAttribute("aria-hidden", "false");
    }

    closeDialog() {
        if (!this.dialogElement) return;
        
        this.dialogElement.classList.remove("visible");
        this.dialogElement.setAttribute("aria-hidden", "true");

        if (this.createCollectionForm) this.createCollectionForm.style.display = "none";
        if (this.newCollectionNameInput) this.newCollectionNameInput.value = "";
        if (this.newCollectionCategorySelect) {
            this.newCollectionCategorySelect.innerHTML = '';
            this.newCollectionCategorySelect.style.display = '';
        }
        if (this.newCollectionCategoryCustomInput) this.newCollectionCategoryCustomInput.value = '';
        if (this.newCollectionCategoryCustomRow) this.newCollectionCategoryCustomRow.style.display = 'none';
        if (this.newCollectionDescriptionInput) this.newCollectionDescriptionInput.value = "";
        if (this.newCollectionColorInput) this.newCollectionColorInput.value = this.defaultCollectionColor;
        
        if(this.createNewCollectionButton) this.createNewCollectionButton.style.display = 'block';
        if(this.existingCollectionsList) this.existingCollectionsList.style.display = 'block'; 
        if(this.noCollectionsMessageDialog) this.noCollectionsMessageDialog.style.display = 'none';
        if(this.saveCollectionButton) this.saveCollectionButton.style.display = 'inline-block'; 
        if(this.confirmCollectionChangesButton) this.confirmCollectionChangesButton.style.display = 'none';

        this.currentSongIdToCollect = null;
        this.dialogMode = 'add_song'; 
        this.editingCollectionName = null;
        this.dialogSelectionChanges = { additions: new Set(), removals: new Set() }; 
    }

    async handleSaveCollection() { 
        if (!this.newCollectionNameInput) {
            alert("Playlist name input not found.");
            return;
        }
        const name = this.newCollectionNameInput.value.trim();
        const category = this._getCategoryValue();
        const description = this.newCollectionDescriptionInput ? this.newCollectionDescriptionInput.value.trim() : "";
        let color = this.newCollectionColorInput ? this.newCollectionColorInput.value : this.defaultCollectionColor;

        if (!name) {
            alert("Playlist name is required.");
            return;
        }

        const collections = await this.getCollections();
        const isEditing = this.dialogMode === 'edit';
        const originalName = this.editingCollectionName;

        if ((!isEditing || (isEditing && name !== originalName)) && collections.some(c => c.name === name)) {
            alert("A playlist with this name already exists.");
            return;
        }

        try {
            if (isEditing) {
                await this.webSocketManager.sendWebSocketCommand('update_playlist', {
                    old_name: originalName,
                    new_metadata: { name, category, description, color }
                });
            } else { 
                if (!color || color === this.defaultCollectionColor || color === '#000000') {
                    color = this._generateRandomHexColor();
                }
                await this.webSocketManager.sendWebSocketCommand('create_playlist', {
                    name, category, description, color
                });
            }
            await this.renderDrawerCollections(); 
            this.closeDialog();
        } catch (e) {
            console.error("CollectionManager: Failed to save collection", e);
            alert("Failed to save playlist. See console for details.");
        }
    }

    async handleConfirmAddToCollection() {
        if (!this.currentSongIdToCollect) {
            console.error("CollectionManager: No song selected to add/remove from collections.");
            this.closeDialog();
            return;
        }
        const songIdStr = String(this.currentSongIdToCollect);
        
        // Find the track data in appState.library or searchResults
        let trackData = null;
        if (this.appState.library) {
            trackData = this.appState.library.find(t => String(t.music_id || t.id || t.bvid) === songIdStr);
        }
        if (!trackData && this.appState.searchResults) {
            trackData = this.appState.searchResults.find(t => String(t.music_id || t.id || t.bvid) === songIdStr);
        }

        if (!trackData) {
            console.error("CollectionManager: Track data not found for ID", songIdStr);
            this.closeDialog();
            return;
        }

        try {
            for (const collectionName of this.dialogSelectionChanges.additions) {
                await this.webSocketManager.sendWebSocketCommand('add_to_playlist', {
                    playlist_name: collectionName,
                    track_data: trackData
                });
                document.dispatchEvent(new CustomEvent('collectionChanged', {
                    detail: { collectionName, songId: songIdStr, action: 'added' }
                }));
            }

            for (const collectionName of this.dialogSelectionChanges.removals) {
                await this.webSocketManager.sendWebSocketCommand('remove_from_playlist', {
                    playlist_name: collectionName,
                    music_id: songIdStr
                });
                document.dispatchEvent(new CustomEvent('collectionChanged', {
                    detail: { collectionName, songId: songIdStr, action: 'removed' }
                }));
            }
            this.closeDialog();
        } catch (e) {
            console.error("CollectionManager: Failed to update song assignments", e);
            alert("Failed to update playlist assignments.");
        }
    }

    async renderDrawerCollections() {
        if (!this.drawerListElement) {
            console.error("CollectionManager: Drawer list element not found. Cannot render collections.");
            return;
        }

        this.drawerListElement.style.minHeight = "100px";

        const allCollections = await this.getCollections();
        const visibleCollections = allCollections.filter(c => c.name !== 'Liked');

        this.drawerListElement.innerHTML = "";

        if (visibleCollections.length === 0) {
            const noCollectionsLi = document.createElement("li");
            noCollectionsLi.innerHTML = `<span class="no-collections-message" style="padding: 10px; color: var(--text-color-secondary); font-size: 0.9em; display: block;">No playlists yet. Right-click here to create one.</span>`;
            this.drawerListElement.appendChild(noCollectionsLi);
        } else {
            // Group by category; empty-category key = ''
            const groups = new Map();
            for (const c of visibleCollections) {
                const cat = c.category || '';
                if (!groups.has(cat)) groups.set(cat, []);
                groups.get(cat).push(c);
            }

            // If more than one distinct category exists (counting '' as one), use grouped layout
            const hasMultipleGroups = groups.size > 1;

            // Named categories sorted A-Z, uncategorised last
            const sortedCategories = [...groups.keys()].sort((a, b) => {
                if (a === '') return 1;
                if (b === '') return -1;
                return a.localeCompare(b);
            });

            for (const category of sortedCategories) {
                const collections = groups.get(category);

                if (hasMultipleGroups) {
                    const storageKey = `collection_category_collapsed_${category}`;
                    const isCollapsed = localStorage.getItem(storageKey) === 'true';
                    const displayName = category || 'Uncategorized';

                    // Category header
                    const headerLi = document.createElement('li');
                    headerLi.className = 'collection-category-group-header';
                    if (isCollapsed) headerLi.classList.add('collapsed');

                    const toggleBtn = document.createElement('button');
                    toggleBtn.className = 'collection-category-toggle';
                    toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
                    toggleBtn.innerHTML = `
                        <span class="category-name">${displayName}</span>
                        <span class="category-count">${collections.length}</span>
                        <span class="material-icons category-chevron">${isCollapsed ? 'chevron_right' : 'expand_more'}</span>
                    `;
                    headerLi.appendChild(toggleBtn);
                    this.drawerListElement.appendChild(headerLi);

                    // Items container
                    const itemsLi = document.createElement('li');
                    itemsLi.className = 'collection-category-items';
                    if (isCollapsed) itemsLi.style.display = 'none';
                    const itemsUl = document.createElement('ul');
                    itemsLi.appendChild(itemsUl);
                    this._renderCollectionItems(itemsUl, collections);
                    this.drawerListElement.appendChild(itemsLi);

                    toggleBtn.addEventListener('click', () => {
                        const nowCollapsed = !headerLi.classList.contains('collapsed');
                        headerLi.classList.toggle('collapsed', nowCollapsed);
                        toggleBtn.setAttribute('aria-expanded', String(!nowCollapsed));
                        toggleBtn.querySelector('.category-chevron').textContent = nowCollapsed ? 'chevron_right' : 'expand_more';
                        itemsLi.style.display = nowCollapsed ? 'none' : '';
                        localStorage.setItem(storageKey, String(nowCollapsed));
                    });
                } else {
                    // Single group — flat list, no header
                    this._renderCollectionItems(this.drawerListElement, collections);
                }
            }
        }

        if (this.navigationManager) {
            this.navigationManager.init();
        }
    }

    _renderCollectionItems(container, collections) {
        for (const collection of collections) {
            const listItem = document.createElement("li");
            const link = document.createElement("a");
            link.href = `#collection-detail/${encodeURIComponent(collection.name)}`;
            link.className = "drawer-link local-collection-link";
            link.dataset.page = "collection-detail";
            link.dataset.collectionName = collection.name;
            link.draggable = false;
            const initial = collection.name.charAt(0).toUpperCase();
            const color = collection.color || this.defaultCollectionColor;
            link.innerHTML = `
                <span class="collection-initial" style="background-color: ${color};">
                    ${initial}
                </span>
                <span class="link-text">${collection.name}</span>
            `;
            listItem.appendChild(link);
            container.appendChild(listItem);
        }
    }

    async removeSongFromCollection(songId, collectionName) {
        if (!songId || !collectionName) {
            console.error("CollectionManager: songId and collectionName are required to remove a song.");
            return false;
        }
        const songIdStr = String(songId);
        try {
            const resp = await this.webSocketManager.sendWebSocketCommand('remove_from_playlist', {
                playlist_name: collectionName,
                music_id: songIdStr
            });
            if (resp.code === 0) {
                console.log(`CollectionManager: Song ${songIdStr} removed from collection ${collectionName}.`);
                document.dispatchEvent(new CustomEvent('collectionChanged', {
                    detail: {
                        collectionName: collectionName,
                        songId: songIdStr,
                        action: 'removed'
                    }
                }));
                return true;
            }
        } catch (e) {
            console.error("CollectionManager: Failed to remove song from playlist", e);
        }
        return false; 
    }

    async deleteCollection(collectionName) {
        try {
            await this.webSocketManager.sendWebSocketCommand('delete_playlist', { name: collectionName });
            console.log(`Playlist "${collectionName}" deleted.`);
            await this.renderDrawerCollections(); 
        } catch (e) {
            console.error("CollectionManager: Failed to delete collection", e);
        }
    }

    _handleDrawerListContextMenu(event) {
        event.preventDefault();
        if (!this.contextMenuElement) return;

        const targetCollectionLink = event.target.closest('a.local-collection-link');
        this.contextMenuElement.currentTargetCollectionName = targetCollectionLink ? targetCollectionLink.dataset.collectionName : null;

        this.contextMenuElement.style.top = `${event.clientY}px`;
        this.contextMenuElement.style.left = `${event.clientX}px`;
        this.contextMenuElement.style.display = "block";

        const editOption = this.contextMenuElement.querySelector('li[data-action="edit_collection"]');
        const deleteOption = this.contextMenuElement.querySelector('li[data-action="delete_collection"]');

        if (targetCollectionLink) {
            if (editOption) editOption.classList.remove("disabled");
            if (deleteOption) deleteOption.classList.remove("disabled");
        } else {
            if (editOption) editOption.classList.add("disabled");
            if (deleteOption) deleteOption.classList.add("disabled");
        }
    }

    async _handleContextMenuClick(event) {
        if (!this.contextMenuElement) return;
        const actionElement = event.target.closest('li[data-action]');
        if (!actionElement) return;

        const action = actionElement.dataset.action;
        const collectionName = this.contextMenuElement.currentTargetCollectionName;
        this.contextMenuElement.style.display = "none";

        switch (action) {
            case "create_collection":
                await this.openDialog(null, 'create_direct');
                break;
            case "edit_collection":
                if (collectionName) {
                    await this.openDialog(null, 'edit', collectionName);
                } else {
                    console.warn("CollectionManager: Edit action clicked but no playlist was targeted.");
                }
                break;
            case "delete_collection":
                if (collectionName) {
                    if (confirm(`Are you sure you want to delete the playlist "${collectionName}"? This cannot be undone.`)) {
                        await this.deleteCollection(collectionName);
                    }
                } else {
                    console.warn("CollectionManager: Delete action clicked but no playlist was targeted.");
                }
                break;
        }
    }

    async handleAddToCollectionButtonClick(songId) {
        if (songId) {
            await this.openDialog(songId, 'add_song');
        } else {
            console.error("CollectionManager: Could not determine song ID for 'Add to Playlist' button.");
        }
    }
    setNavigationManager(navigationManager) {
        this.navigationManager = navigationManager;
    }
    setUIManager(uiManager) {
        this.uiManager = uiManager;
    }
}

export default CollectionManager;
