// frontend/pages/HomePage.js

import SongCardRenderer from "../modules/SongCardRenderer.js";

class HomePage {
  constructor() {
    // Page-specific initialization if any
  }
  #songCardList = [];
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

  onLoad(mainContentElement, subPageId, appState, managers) {
    console.log("HomePage loaded");

    const homeLoadingMessage = mainContentElement.querySelector(
      "#home-loading-message"
    );
    const songCardGrid = mainContentElement.querySelector("#song-card-grid");
    const noSongsMessage =
      mainContentElement.querySelector("#no-songs-message");

    if (homeLoadingMessage) homeLoadingMessage.style.display = "block";
    if (songCardGrid) songCardGrid.style.display = "none";
    if (noSongsMessage) noSongsMessage.style.display = "none";

    managers.webSocketManager
      .sendWebSocketCommand("get_downloaded_music", {})
      .then((response) => {
        if (homeLoadingMessage) homeLoadingMessage.style.display = "none";
        appState.inited = true;
        const libraryData =
          response.data && response.data.library ? response.data.library : [];
        appState.library = libraryData;
        managers.playerManager.setPlayList(libraryData);
        if (this.#songCardList.length > 0) this.#songCardList = [];
        if (libraryData && libraryData.length > 0) {
          if (songCardGrid) {
            songCardGrid.innerHTML = ""; // Clear previous content
            libraryData.forEach((track) => {
              // const musicId = track.music_id; // Not directly used for rendering card here
              // let imageUrl = "placeholder_cover_1.png"; // Handled by SongCardRenderer
              // if (track.preview_cover && typeof track.preview_cover === 'string' && track.preview_cover.trim() !== '') {
              //     imageUrl = track.preview_cover;
              // }
              // const trackTitle = track.title || "Unknown Title"; // Handled by SongCardRenderer
              const isFavorite = managers.favoriteManager
                ? managers.favoriteManager.isFavorite(track.music_id)
                : false;
              const domParser = document.createElement("div");
              domParser.innerHTML = SongCardRenderer.render(track, "library", {
                isFavorite,
              });
              this.#songCardList.push(domParser.firstElementChild);
              songCardGrid.appendChild(domParser.firstElementChild);
            });
            songCardGrid.style.display = "grid";
          }
          if (noSongsMessage) noSongsMessage.style.display = "none";
        } else {
          if (songCardGrid) songCardGrid.style.display = "none";
          if (noSongsMessage) noSongsMessage.style.display = "block";
        }
      })
      .catch((error) => {
        console.error("Failed to load library:", error);
        if (homeLoadingMessage) {
          homeLoadingMessage.innerHTML =
            '<p style="color: red;">Failed to load your library. Please try again later.</p>';
          homeLoadingMessage.style.display = "block";
        }
        if (songCardGrid) songCardGrid.style.display = "none";
        if (noSongsMessage) noSongsMessage.style.display = "none";
      });
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
