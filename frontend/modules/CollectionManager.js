// frontend/modules/CollectionManager.js

class CollectionManager {
    constructor({
        navigationManager = null, 
        appState, 
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
        newCollectionCategoryInputId = "new-collection-category",
        newCollectionDescriptionInputId = "new-collection-description",
        newCollectionColorInputId = "new-collection-color", // Added color input ID
        existingCollectionsListId = "existing-collections-list",
        noCollectionsMessageDialogId = "no-collections-message",
        dialogTitleId = "dialog-title",
    }) {
        this.navigationManager = navigationManager;
        this.appState = appState;

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
            this.newCollectionCategoryInput = document.getElementById(newCollectionCategoryInputId);
            this.newCollectionDescriptionInput = document.getElementById(newCollectionDescriptionInputId);
            this.newCollectionColorInput = document.getElementById(newCollectionColorInputId); // Get color input
            this.existingCollectionsList = document.getElementById(existingCollectionsListId);
            this.noCollectionsMessageDialog = document.getElementById(noCollectionsMessageDialogId);
            this.dialogTitleElement = document.getElementById(dialogTitleId);
        }

        this._bindMethods();
        this._ensureCollectionColors(); // Ensure all collections have colors on instantiation
    }

    _bindMethods() {
        this.init = this.init.bind(this);
        this.getCollections = this.getCollections.bind(this);
        this.saveCollections = this.saveCollections.bind(this);
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
    }

    _generateRandomHexColor() {
        return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    }

    _ensureCollectionColors() {
        let collections = this.getCollections(); // Use getCollections to load
        let collectionsModified = false;
        collections = collections.map(collection => {
            if (!collection.color) {
                collection.color = this._generateRandomHexColor();
                collectionsModified = true;
            }
            return collection;
        });

        if (collectionsModified) {
            this.saveCollections(collections);
        }
    }
    
    init() {
        if (!this.dialogElement || !this.drawerListElement || !this.contextMenuElement) {
            console.error("CollectionManager: Crucial DOM elements not found. Initialization aborted.");
            return;
        }

        if (this.closeDialogButton) this.closeDialogButton.addEventListener('click', this.closeDialog);
        this.dialogElement.addEventListener('click', (event) => {
            if (event.target === this.dialogElement) this.closeDialog();
        });
        if (this.createNewCollectionButton) {
            this.createNewCollectionButton.addEventListener('click', () => {
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
        this.renderDrawerCollections();
        console.log("CollectionManager initialized.");
    }

    getCollections() {
        // This method now just retrieves, color ensuring is done at init and save.
        return JSON.parse(localStorage.getItem("userCollections")) || [];
    }

    saveCollections(collections) {
        localStorage.setItem("userCollections", JSON.stringify(collections));
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
    
    _populateDialogCollectionsList() {
        if (!this.existingCollectionsList || !this.noCollectionsMessageDialog) {
            console.error("CollectionManager: Dialog list elements not found for populating.");
            return;
        }
        const collections = this.getCollections();
        this.existingCollectionsList.innerHTML = ""; 
        const songIdStr = String(this.currentSongIdToCollect);

        if (collections.length > 0) {
            collections.forEach((collection) => {
                const button = document.createElement("button");
                button.className = "collection-item-button dialog-button";
                button.textContent = collection.name;
                button.dataset.collectionName = collection.name;

                const isOriginallyInCollection = collection.songs && collection.songs.includes(songIdStr);
                button.dataset.originallySelected = isOriginallyInCollection;
                if (isOriginallyInCollection) {
                    button.classList.add('selected');
                }
                
                button.onclick = (event) => this._handleDialogCollectionToggle(event, collection.name);
                this.existingCollectionsList.appendChild(button);
            });
            this.noCollectionsMessageDialog.style.display = "none";
            this.existingCollectionsList.style.display = "block";
        } else {
            this.noCollectionsMessageDialog.style.display = "block";
            this.existingCollectionsList.style.display = "none";
        }
    }

    openDialog(songId = null, mode = 'add_song', collectionNameToEdit = null) {
        this.currentSongIdToCollect = songId ? String(songId) : null;
        this.dialogMode = mode;
        this.editingCollectionName = mode === 'edit' ? collectionNameToEdit : null;
        this.dialogSelectionChanges = { additions: new Set(), removals: new Set() };

        if (!this.dialogElement || !this.dialogTitleElement || !this.createCollectionForm || 
            !this.existingCollectionsList || !this.noCollectionsMessageDialog || 
            !this.createNewCollectionButton || !this.saveCollectionButton || !this.confirmCollectionChangesButton ||
            !this.newCollectionNameInput || !this.newCollectionCategoryInput || !this.newCollectionDescriptionInput ||
            !this.newCollectionColorInput ) { // Check for color input
            console.error("CollectionManager: Essential dialog elements are missing. Cannot open dialog.");
            return;
        }
        
        this.newCollectionNameInput.value = "";
        this.newCollectionCategoryInput.value = "";
        this.newCollectionDescriptionInput.value = "";
        this.newCollectionColorInput.value = this.defaultCollectionColor; // Reset color picker

        const isAddingSongMode = this.dialogMode === 'add_song';
        if(this.saveCollectionButton) this.saveCollectionButton.style.display = isAddingSongMode ? 'none' : 'inline-block'; 
        if(this.confirmCollectionChangesButton) this.confirmCollectionChangesButton.style.display = isAddingSongMode ? 'inline-block' : 'none';

        if (isAddingSongMode) {
            this.dialogTitleElement.textContent = "Add/Remove from Playlists";
            this._populateDialogCollectionsList(); 
            this.createCollectionForm.style.display = "none"; 
            this.existingCollectionsList.style.display = "block";
            this.noCollectionsMessageDialog.style.display = this.getCollections().length === 0 ? "block" : "none";
            this.createNewCollectionButton.style.display = "block"; 
        } else if (this.dialogMode === 'create_direct') {
            this.dialogTitleElement.textContent = "Create New Playlist";
            if(this.saveCollectionButton) this.saveCollectionButton.textContent = "Save Playlist";
            this.createCollectionForm.style.display = "block";
            this.existingCollectionsList.style.display = "none";
            this.noCollectionsMessageDialog.style.display = "none";
            this.createNewCollectionButton.style.display = "none"; 
        } else if (this.dialogMode === 'edit') {
            this.dialogTitleElement.textContent = "Edit Playlist";
            if(this.saveCollectionButton) this.saveCollectionButton.textContent = "Save Changes";
            const collectionToEdit = this.getCollections().find(c => c.name === this.editingCollectionName);
            if (collectionToEdit) {
                this.newCollectionNameInput.value = collectionToEdit.name || "";
                this.newCollectionCategoryInput.value = collectionToEdit.category || "";
                this.newCollectionDescriptionInput.value = collectionToEdit.description || "";
                this.newCollectionColorInput.value = collectionToEdit.color || this._generateRandomHexColor(); // Populate color
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
        if (this.newCollectionCategoryInput) this.newCollectionCategoryInput.value = "";
        if (this.newCollectionDescriptionInput) this.newCollectionDescriptionInput.value = "";
        if (this.newCollectionColorInput) this.newCollectionColorInput.value = this.defaultCollectionColor; // Reset color picker
        
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

    handleSaveCollection() { 
        if (!this.newCollectionNameInput) {
            alert("Playlist name input not found.");
            return;
        }
        const name = this.newCollectionNameInput.value.trim();
        const category = this.newCollectionCategoryInput ? this.newCollectionCategoryInput.value.trim() : "";
        const description = this.newCollectionDescriptionInput ? this.newCollectionDescriptionInput.value.trim() : "";
        let color = this.newCollectionColorInput ? this.newCollectionColorInput.value : this.defaultCollectionColor;

        if (!name) {
            alert("Playlist name is required.");
            return;
        }

        let collections = this.getCollections();
        const isEditing = this.dialogMode === 'edit';
        const originalName = this.editingCollectionName;

        if ((!isEditing || (isEditing && name !== originalName)) && collections.some(c => c.name === name)) {
            alert("A playlist with this name already exists.");
            return;
        }

        if (isEditing) {
            const collectionToUpdate = collections.find(c => c.name === originalName);
            if (collectionToUpdate) {
                collectionToUpdate.name = name;
                collectionToUpdate.category = category;
                collectionToUpdate.description = description;
                collectionToUpdate.color = (color && color !== this.defaultCollectionColor && color !=='#000000') ? color : (collectionToUpdate.color || this._generateRandomHexColor());
            } else {
                alert("Error: Could not find the playlist to update.");
                this.closeDialog(); 
                return;
            }
        } else { 
            // Creating new collection
            if (!color || color === this.defaultCollectionColor || color === '#000000') { // Ensure a distinct color if default wasn't changed
                color = this._generateRandomHexColor();
            }
            collections.push({ name, category, description, color, songs: [] });
        }

        this.saveCollections(collections); // This will also ensure colors for older collections if any were missed by _ensureCollectionColors
        this.renderDrawerCollections(); 
        this.closeDialog(); 
    }

    handleConfirmAddToCollection() {
        if (!this.currentSongIdToCollect) {
            console.error("CollectionManager: No song selected to add/remove from collections.");
            this.closeDialog();
            return;
        }
        const songIdStr = String(this.currentSongIdToCollect);
        let collections = this.getCollections();
        let changed = false;

        this.dialogSelectionChanges.additions.forEach(collectionName => {
            const collection = collections.find(c => c.name === collectionName);
            if (collection) {
                if (!collection.songs) collection.songs = [];
                if (!collection.songs.includes(songIdStr)) {
                    collection.songs.push(songIdStr);
                    changed = true;
                    document.dispatchEvent(new CustomEvent('collectionChanged', {
                        detail: { collectionName, songId: songIdStr, action: 'added' }
                    }));
                }
            }
        });

        this.dialogSelectionChanges.removals.forEach(collectionName => {
            const collection = collections.find(c => c.name === collectionName);
            if (collection && collection.songs && collection.songs.includes(songIdStr)) {
                collection.songs = collection.songs.filter(id => id !== songIdStr);
                changed = true;
                document.dispatchEvent(new CustomEvent('collectionChanged', {
                    detail: { collectionName, songId: songIdStr, action: 'removed' }
                }));
            }
        });

        if (changed) {
            this.saveCollections(collections);
        }
        this.closeDialog();
    }

    renderDrawerCollections() {
        if (!this.drawerListElement) {
            console.error("CollectionManager: Drawer list element not found. Cannot render collections.");
            return;
        }
        const collections = this.getCollections();
        this.drawerListElement.innerHTML = ""; 

        if (collections.length === 0) {
            const noCollectionsLi = document.createElement("li");
            noCollectionsLi.innerHTML = `<span class="no-collections-message" style="padding: 10px; color: var(--text-color-secondary); font-size: 0.9em;">No playlists yet. Right-click to create one.</span>`;
            this.drawerListElement.appendChild(noCollectionsLi);
        } else {
            collections.forEach((collection) => {
                const listItem = document.createElement("li");
                const link = document.createElement("a");
                link.href = `#collection-detail/${encodeURIComponent(collection.name)}`;
                link.className = "drawer-link local-collection-link"; 
                link.dataset.page = "collection-detail";
                link.dataset.collectionName = collection.name;
                link.draggable = false;
                const initial = collection.name.charAt(0).toUpperCase();
                const color = collection.color || this.defaultCollectionColor; // Use default if no color

                // Inner HTML for the link
                link.innerHTML = `
                    <span class="collection-initial" style="background-color: ${color};">
                        ${initial}
                    </span>
                    <span class="link-text">${collection.name}</span>
                `;
                
                listItem.appendChild(link);
                this.drawerListElement.appendChild(listItem);
            });
        }

        if (this.navigationManager) {
            this.navigationManager.init(); 
        }
    }

    removeSongFromCollection(songId, collectionName) {
        if (!songId || !collectionName) {
            console.error("CollectionManager: songId and collectionName are required to remove a song.");
            return false;
        }
        const songIdStr = String(songId);
        let collections = this.getCollections();
        const collectionIndex = collections.findIndex(c => c.name === collectionName);

        if (collectionIndex > -1) {
            const collection = collections[collectionIndex];
            if (collection.songs && collection.songs.includes(songIdStr)) {
                collection.songs = collection.songs.filter(id => id !== songIdStr);
                collections[collectionIndex] = collection;
                this.saveCollections(collections);
                console.log(`CollectionManager: Song ${songIdStr} removed from collection ${collectionName}.`);
                
                document.dispatchEvent(new CustomEvent('collectionChanged', {
                    detail: {
                        collectionName: collectionName,
                        songId: songIdStr,
                        action: 'removed'
                    }
                }));
                return true; 
            } else {
                console.warn(`CollectionManager: Song ${songIdStr} not found in collection ${collectionName}.`);
            }
        } else {
            console.warn(`CollectionManager: Collection ${collectionName} not found.`);
        }
        return false; 
    }

    deleteCollection(collectionName) {
        let collections = this.getCollections();
        collections = collections.filter(c => c.name !== collectionName);
        this.saveCollections(collections);
        console.log(`Playlist "${collectionName}" deleted.`);
        this.renderDrawerCollections(); 
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

    _handleContextMenuClick(event) {
        if (!this.contextMenuElement) return;
        const actionElement = event.target.closest('li[data-action]');
        if (!actionElement) return;

        const action = actionElement.dataset.action;
        const collectionName = this.contextMenuElement.currentTargetCollectionName;
        this.contextMenuElement.style.display = "none";

        switch (action) {
            case "create_collection":
                this.openDialog(null, 'create_direct');
                break;
            case "edit_collection":
                if (collectionName) {
                    this.openDialog(null, 'edit', collectionName);
                } else {
                    console.warn("CollectionManager: Edit action clicked but no playlist was targeted.");
                }
                break;
            case "delete_collection":
                if (collectionName) {
                    if (confirm(`Are you sure you want to delete the playlist "${collectionName}"? This cannot be undone.`)) {
                        this.deleteCollection(collectionName);
                    }
                } else {
                    console.warn("CollectionManager: Delete action clicked but no playlist was targeted.");
                }
                break;
        }
    }

    handleAddToCollectionButtonClick(songId) {
        if (songId) {
            this.openDialog(songId, 'add_song');
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
