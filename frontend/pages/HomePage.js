// frontend/pages/HomePage.js

import SongCardRenderer from "../modules/SongCardRenderer.js";

class HomePage {
  constructor() {
    this.initialized = false; // To prevent multiple listener attachments
    this.handleLibraryChange = this.handleLibraryChange.bind(this);
  }
  #songCardList = [];

  init(appState, managers) {
      if (this.initialized) return;
      document.addEventListener('library-changed', () => this.handleLibraryChange(appState, managers));
      this.initialized = true;
  }

  handleLibraryChange(appState, managers) {
      console.log('Library changed, reloading HomePage');
      // To reload, we can call onLoad again. We need the mainContentElement.
      const mainContentElement = document.getElementById('main-content');
      if (mainContentElement && mainContentElement.querySelector('#home-page')) {
          this.onLoad(mainContentElement, null, appState, managers);
      }
  }
  getHTML() {
    return `
       <div id="home-page">
           <div class="home-page-header">
            <div class="home-page-header-content">My Library</div>
            <div class="home-page-header-search-container">
                <span class="material-icons search-icon">search</span>
                <input type="text" id="downloaded-search-bar" class="home-page-header-search"></input>
            </div>
            
           </div>
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

  async #fetchLibrary(appState, managers) {
    // If library is already initialized, no need to fetch again.
    if (appState.inited) {
        return appState.library;
    }

    try {
        const response = await managers.webSocketManager.sendWebSocketCommand("get_downloaded_music", {});
        const libraryData = response.data?.library || [];
        appState.library = libraryData;
        appState.inited = true; // Mark as initialized
        managers.playerManager.setPlayList(libraryData);
        return libraryData;
    } catch (error) {
        console.error("Failed to load library:", error);
        // In case of error, return an empty array to prevent crashes
        return [];
    }
  }

  async onLoad(mainContentElement, subPageId, appState, managers) {
    this.init(appState, managers); // Ensure listeners are attached
    console.log("HomePage loaded");

    const homeLoadingMessage = mainContentElement.querySelector("#home-loading-message");
    const songCardGrid = mainContentElement.querySelector("#song-card-grid");
    const noSongsMessage = mainContentElement.querySelector("#no-songs-message");

    if (homeLoadingMessage) homeLoadingMessage.style.display = "block";
    if (songCardGrid) songCardGrid.style.display = "none";
    if (noSongsMessage) noSongsMessage.style.display = "none";

    const libraryData = await this.#fetchLibrary(appState, managers);

    if (homeLoadingMessage) homeLoadingMessage.style.display = "none";

    this.#songCardList = [];
    if (songCardGrid) songCardGrid.innerHTML = ""; // Clear previous content

    if (libraryData && libraryData.length > 0) {
        libraryData.forEach((track) => {
            const isFavorite = managers.favoriteManager ? managers.favoriteManager.isFavorite(track.music_id) : false;
            const cardElement = document.createElement("div");
            cardElement.innerHTML = SongCardRenderer.render(track, "library", { isFavorite });
            const songCard = cardElement.firstElementChild;
            this.#songCardList.push(songCard);
            songCardGrid.appendChild(songCard);
        });
        songCardGrid.style.display = "grid";
        noSongsMessage.style.display = "none";
    } else {
        songCardGrid.style.display = "none";
        noSongsMessage.style.display = "block";
    }

    const searchInput = mainContentElement.querySelector(
      "#downloaded-search-bar"
    );
    if (searchInput) {
      let debounceTimer;

      // 使用 this.#songCardList 中的数据进行过滤
      const filterSongCards = () => {
        const query = searchInput.value.trim().toLowerCase();

        // 如果查询为空，显示所有卡片
        if (!query) {
          this.#songCardList.forEach((card) => {
            card.style.display = "";
          });
          return;
        }

        // 创建正则表达式以支持多语言匹配
        const regex = new RegExp(query.replace(/[\s\u3000]/g, ".*"), "i");

        this.#songCardList.forEach((card) => {
          const trackData = card.dataset.trackInfo
            ? JSON.parse(card.dataset.trackInfo)
            : {};

          const fields = [
            trackData.title,
            trackData.album,
            trackData.author,
            trackData.description,
            trackData.lyrics,
          ];

          const match = fields.some(
            (field) =>
              typeof field === "string" &&
              regex.test(field.replace(/[\s\u3000]/g, "")) // 去除空格和全角空格
          );

          card.style.display = match ? "" : "none";
        });

        // 控制无结果提示信息显示
        const visibleCards = this.#songCardList.filter(
          (card) => card.style.display !== "none"
        );
        songCardGrid.style.display = visibleCards.length > 0 ? "grid" : "none";
        noSongsMessage.style.display =
          visibleCards.length > 0 ? "none" : "block";
      };

      // 添加输入事件监听器，并添加防抖
      searchInput.addEventListener("input", (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          filterSongCards();
        }, 200); // 延迟 200ms，避免频繁触发
      });

      // 初始化时调用一次
      filterSongCards();
    }
    // Focus logic, if any, previously handled by NavigationManager for 'home'
    if (appState.focusElementAfterLoad) {
      const elementToFocus = document.querySelector(
        appState.focusElementAfterLoad
      );
      if (elementToFocus && mainContentElement.contains(elementToFocus)) {
        setTimeout(() => elementToFocus.focus(), 50);
      }
      delete appState.focusElementAfterLoad; // Clear it if it was meant for this page
    }
  }

  // Add any other page-specific methods here
}

export default HomePage;
