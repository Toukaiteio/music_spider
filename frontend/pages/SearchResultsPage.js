// frontend/pages/SearchResultsPage.js

// Imports for managers and utilities will be added here later as needed

class SearchResultsPage {
    constructor() {
        // Page-specific initialization if any
    }

    getHTML() {
        return `
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
    `;
    }

    onLoad(mainContentElement, subPageId, appState, managers) {
        console.log('SearchResultsPage loaded');

        // The HTML structure is already set by getHTML().
        // SearchManager will be responsible for populating it.
        // This page module ensures the page is visible, then SearchManager fills it.
        
        if (managers.searchManager) {
            // Ensure DOM is updated before displayResults tries to access elements
            // The content was set by mainContentElement.innerHTML = this.getHTML();
            // So, elements like '#search-results-query' are now in the DOM.
            setTimeout(() => managers.searchManager.displayResults(), 0);
        } else {
            console.warn("SearchResultsPage: SearchManager not available, cannot display search results.");
            // Optionally display a message in the mainContent area
            const searchResultsContainer = mainContentElement.querySelector("#search-results-container");
            if (searchResultsContainer) {
                 searchResultsContainer.innerHTML = '<p style="color:red;text-align:center;">Error: Search functionality is currently unavailable.</p>';
            } else {
                 mainContentElement.innerHTML += '<p style="color:red;text-align:center;">Error: Search functionality is currently unavailable.</p>';
            }
        }

        // Focus logic, if any, previously handled by NavigationManager for 'search-results'
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

export default SearchResultsPage;
