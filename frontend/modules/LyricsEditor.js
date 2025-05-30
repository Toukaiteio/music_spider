// Lyrics Editor Module
// This module contains the HTML structure and JavaScript functions for the lyrics editor tool.

export const lyricsToolHtml = `
<div class="lyrics-tool-container">
  <h4>Lyrics Editor (LRC Format)</h4>
  <div id="lyrics-waveform-placeholder" style="display: flex; align-items: center; margin-bottom: 10px;">
    
    <canvas id="lyrics-editor-waveform-canvas" style="flex-grow: 1;height: 100%;"></canvas>
    <div class="duration-display" style="flex-shrink: 0; font-size: 0.9em;">
      <div id="lyrics-current-time" style="font-size: 0.9em;">0:00.00</div>
      <div id="lyrics-duration" style="font-size: 0.9em;">0:00.00</div>
    </div>

  </div>
  <div id="lyrics-playback-controls-placeholder" style="display: flex; justify-content: center; align-items: center; margin-bottom: 10px;">
    <button id="lyrics-slow-down" class="icon-button" aria-label="Slow Down"><span class="material-icons">fast_rewind</span></button>
    <button id="lyrics-simulate-play" class="icon-button" aria-label="Simulate Play"><span class="material-icons">play_arrow</span></button>
    <button id="lyrics-clip-time" class="icon-button" aria-label="Clip Current Time"><span class="material-icons">add_comment</span></button>
    <button id="lyrics-calibrate-line" class="icon-button" aria-label="Calibrate Line"><span class="material-icons">my_location</span></button>
    <button id="lyrics-delay-all" class="icon-button" aria-label="Delay All"><span class="material-icons">schedule</span></button>
    <button id="lyrics-reset-simulation" class="icon-button" aria-label="Reset Simulation"><span class="material-icons">replay</span></button>
    <button id="lyrics-speed-up" class="icon-button" aria-label="Speed Up"><span class="material-icons">fast_forward</span></button>
    <button id="lyrics-search" class="icon-button" aria-label="Search Lyrics"><span class="material-icons">search</span></button>
  </div>
  <label for="lrc-input-area">LRC Content:</label>
  <textarea id="lrc-input-area" placeholder="[mm:ss.xx]Lyric line 1\n[mm:ss.xx]<00:00.xx>Word <00:00.xx>by <00:00.xx>word..." rows="10"></textarea>
  <div id="lrc-error-message" style="color: var(--error-color, red); margin-top: 5px; min-height: 1.2em; font-size: 0.9em;"></div>
  <label for="lrc-preview-area">Preview:</label>
  <div id="lrc-preview-area">Lyrics preview will appear here.</div>
</div>
`;

let mainPlayerManagerInstance = null;
export const lyricsEditorAudio = new Audio();
let currentPlaybackSpeed = 1.0;
let lyricsEditorPlayButtonIcon = null;

let currentParsedLyrics = [];
let lrcPreviewAreaElement = null;
let lrcErrorDisplayElement = null;
let lrcInputAreaElement = null;

let lastHighlightedLineElement = null;
let lastHighlightedWordElement = null;
let cursorHighlightedLineElement = null; // For editor cursor sync
let currentBlobUrl = null; // To manage Blob URL lifecycle

// Web Audio API related variables
let audioContext = null;
let waveformAudioBuffer = null;
let waveformCanvas = null;
let waveformCanvasCtx = null;

let UIManagerForLyricsEditor = null;
let WebSocketManagerForLyricsEditor = null;
export function setUIManagerForLyricsEditor(uiManager) {
  UIManagerForLyricsEditor = uiManager;
}
export function setWebSocketManagerForLyricsEditor(websocketManager) {
  WebSocketManagerForLyricsEditor = websocketManager;
}

function formatTime(timeInSeconds, showHundredths = false) {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  if (showHundredths) {
    const hundredths = Math.floor(
      (timeInSeconds - Math.floor(timeInSeconds)) * 100
    );
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(
      hundredths
    ).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatLRCClipTime(timeInSeconds) {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  const hundredths = Math.floor(
    (timeInSeconds - Math.floor(timeInSeconds)) * 100
  );
  return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}.${String(hundredths).padStart(2, "0")}]`;
}

export function setMainPlayerManager(instance) {
  mainPlayerManagerInstance = instance;
}

export function pauseEditorAndResetButton() {
  lyricsEditorAudio.pause();
  if (lyricsEditorPlayButtonIcon) {
    lyricsEditorPlayButtonIcon.textContent = "play_arrow";
  }
}

function displayLrcError(errorMessage) {
  if (lrcInputAreaElement) lrcInputAreaElement.classList.add("lrc-input-error");
  if (lrcErrorDisplayElement) lrcErrorDisplayElement.textContent = errorMessage;
}

function clearLrcError() {
  if (lrcInputAreaElement)
    lrcInputAreaElement.classList.remove("lrc-input-error");
  if (lrcErrorDisplayElement) lrcErrorDisplayElement.textContent = "";
}

export function resetPreviewHighlights() {
  if (!lrcPreviewAreaElement) return;
  lrcPreviewAreaElement
    .querySelectorAll(".highlighted-lyric")
    .forEach((el) => el.classList.remove("highlighted-lyric"));
  lrcPreviewAreaElement
    .querySelectorAll(".past-line")
    .forEach((el) => el.classList.remove("past-line"));
  // Do not remove .highlighted-lyric-cursor here, it's handled by updateCursorHighlight
  lastHighlightedLineElement = null;
  lastHighlightedWordElement = null;
  // Call updateCursorHighlight to ensure its state is correct after reset
  if (lrcInputAreaElement && lrcPreviewAreaElement && currentParsedLyrics) {
    updateCursorHighlight(
      lrcInputAreaElement,
      lrcPreviewAreaElement,
      currentParsedLyrics
    );
  }
}

export function updatePreviewHighlight(currentTime) {
  if (
    !lrcPreviewAreaElement ||
    !currentParsedLyrics ||
    currentParsedLyrics.length === 0
  ) {
    return;
  }
  resetPreviewHighlights(); // This will also call updateCursorHighlight

  let currentLineIndex = -1;
  for (let i = 0; i < currentParsedLyrics.length; i++) {
    const line = currentParsedLyrics[i];
    const nextLine = currentParsedLyrics[i + 1];
    if (
      currentTime >= line.time &&
      (!nextLine || currentTime < nextLine.time)
    ) {
      currentLineIndex = i;
      break;
    }
  }
  const lineElements = lrcPreviewAreaElement.querySelectorAll(".lyric-line");
  lineElements.forEach((lineEl, index) => {
    if (index < currentLineIndex) lineEl.classList.add("past-line");
    else lineEl.classList.remove("past-line");
  });
  if (currentLineIndex !== -1) {
    const currentLineData = currentParsedLyrics[currentLineIndex];
    const currentLineElement = lineElements[currentLineIndex];
    if (currentLineElement) {
      currentLineElement.classList.add("highlighted-lyric");
      lastHighlightedLineElement = currentLineElement;
      if (currentLineData.words && currentLineData.words.length > 0) {
        let currentWordIndex = -1;
        for (let j = 0; j < currentLineData.words.length; j++) {
          const word = currentLineData.words[j];
          const nextWord = currentLineData.words[j + 1];
          if (
            currentTime >= word.time &&
            (!nextWord || currentTime < nextWord.time)
          ) {
            currentWordIndex = j;
            break;
          }
        }
        if (currentWordIndex !== -1) {
          const wordElements =
            currentLineElement.querySelectorAll(".lyric-word");
          if (wordElements[currentWordIndex]) {
            currentLineElement.classList.remove("highlighted-lyric");
            wordElements[currentWordIndex].classList.add("highlighted-lyric");
            lastHighlightedWordElement = wordElements[currentWordIndex];
          }
        }
      }
    }
  }
  // After playback highlight is updated, re-evaluate cursor highlight
  if (lrcInputAreaElement && lrcPreviewAreaElement && currentParsedLyrics) {
    updateCursorHighlight(
      lrcInputAreaElement,
      lrcPreviewAreaElement,
      currentParsedLyrics
    );
  }
}

export function loadAudioSource(url) {
  // Revoke the old blob URL if it exists
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  if (url) {
    lyricsEditorAudio.src = url;
    lyricsEditorAudio.load();
    if (url.startsWith("blob:")) {
      currentBlobUrl = url; // Store the new blob URL
    }
  } else {
    // If URL is null or empty, clear the source
    lyricsEditorAudio.removeAttribute("src");
    lyricsEditorAudio.load(); // Important to call load to apply changes
  }

  currentPlaybackSpeed = 1.0;
  lyricsEditorAudio.playbackRate = currentPlaybackSpeed;
  if (lyricsEditorPlayButtonIcon)
    lyricsEditorPlayButtonIcon.textContent = "play_arrow";

  const currentTimeDisplay = document.getElementById("lyrics-current-time");
  const durationDisplay = document.getElementById("lyrics-duration");

  if (currentTimeDisplay) currentTimeDisplay.textContent = formatTime(0, true);
  if (durationDisplay) durationDisplay.textContent = formatTime(0, true); // Reset duration until loadedmetadata

  resetPreviewHighlights();
  if (lyricsEditorAudio.paused) updatePreviewHighlight(0);

  // AudioContext and Waveform setup
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (url) {
    fetch(url)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => audioContext.decodeAudioData(arrayBuffer))
      .then((decodedBuffer) => {
        waveformAudioBuffer = decodedBuffer;
        drawWaveform(waveformAudioBuffer, waveformCanvas, waveformCanvasCtx, 0);
      })
      .catch((e) => {
        console.error("Error loading or decoding audio for waveform:", e);
        waveformAudioBuffer = null; // Clear buffer on error
        drawWaveform(null, waveformCanvas, waveformCanvasCtx, 0); // Draw empty state
      });
  } else {
    waveformAudioBuffer = null;
    drawWaveform(null, waveformCanvas, waveformCanvasCtx, 0); // Draw empty state if no URL
  }
  if (lrcInputAreaElement && lrcPreviewAreaElement && currentParsedLyrics) {
    updateCursorHighlight(
      lrcInputAreaElement,
      lrcPreviewAreaElement,
      currentParsedLyrics
    );
  }
}

export function initLyricsEditorControls(lyricsEditorContainerElement) {
  if (!lyricsEditorContainerElement) {
    console.error(
      "Lyrics editor container element not found for initializing controls."
    );
    return;
  }
  lrcPreviewAreaElement =
    lyricsEditorContainerElement.querySelector("#lrc-preview-area");
  lrcInputAreaElement =
    lyricsEditorContainerElement.querySelector("#lrc-input-area");
  lrcErrorDisplayElement =
    lyricsEditorContainerElement.querySelector("#lrc-error-message");

  waveformCanvas = lyricsEditorContainerElement.querySelector(
    "#lyrics-editor-waveform-canvas"
  );
  if (waveformCanvas) {
    waveformCanvasCtx = waveformCanvas.getContext("2d");
  }

  const playPauseButton = lyricsEditorContainerElement.querySelector(
    "#lyrics-simulate-play"
  );
  const slowDownButton =
    lyricsEditorContainerElement.querySelector("#lyrics-slow-down");
  const speedUpButton =
    lyricsEditorContainerElement.querySelector("#lyrics-speed-up");
  const resetButton = lyricsEditorContainerElement.querySelector(
    "#lyrics-reset-simulation"
  );
  const clipTimeButton =
    lyricsEditorContainerElement.querySelector("#lyrics-clip-time");
  const currentTimeDisplay = lyricsEditorContainerElement.querySelector(
    "#lyrics-current-time"
  );
  const durationDisplay =
    lyricsEditorContainerElement.querySelector("#lyrics-duration");
  const calibrateLineButton = lyricsEditorContainerElement.querySelector(
    "#lyrics-calibrate-line"
  );
  const delayAllButton =
    lyricsEditorContainerElement.querySelector("#lyrics-delay-all");
  const searchButton =
    lyricsEditorContainerElement.querySelector("#lyrics-search");
  let searchInputBox = null;

  if (searchButton) {
    searchButton.addEventListener("click", async (event) => {
      event.preventDefault();

      // 1. 移除已有输入框
      // if (searchInputBox && searchInputBox.parentNode) {
      //   searchInputBox.parentNode.removeChild(searchInputBox);
      //   searchInputBox = null;
      // }
      if (searchInputBox) return;
      // 2. 创建输入框
      searchInputBox = document.createElement("div");
      searchInputBox.style.display = "flex";
      searchInputBox.style.flexDirection = "column";
      searchInputBox.style.gap = "6px";
      searchInputBox.style.marginTop = "4px";
      searchInputBox.style.background = "var(--secondary-bg-color, #ffffff)";
      searchInputBox.style.padding = "12px 16px";
      searchInputBox.style.borderRadius = "6px";
      searchInputBox.style.boxShadow = "0 2px 8px var(--shadow-color, rgba(0,0,0,0.1))";
      searchInputBox.style.zIndex = "10";
      searchInputBox.style.position = "relative";
      searchInputBox.style.maxWidth = "340px";
      searchInputBox.style.border = "1px solid var(--border-color, #e0e0e0)";
      searchInputBox.style.fontFamily = "var(--font-family-primary, 'Roboto', sans-serif)";

      // song name
      const songInput = document.createElement("input");
      songInput.type = "text";
      songInput.placeholder = "Song name (required)";
      songInput.style.fontSize = "0.97em";
      songInput.style.padding = "6px 8px";
      songInput.style.border = "1px solid var(--border-color, #e0e0e0)";
      songInput.style.borderRadius = "4px";
      songInput.style.marginBottom = "2px";
      songInput.style.background = "var(--primary-bg-color, #f4f6f8)";
      songInput.style.color = "var(--text-color-primary, #212121)";
      songInput.style.outlineColor = "var(--accent-color, #ff6f00)";

      // artist
      const artistInput = document.createElement("input");
      artistInput.type = "text";
      artistInput.placeholder = "Artist (optional)";
      artistInput.style.fontSize = "0.97em";
      artistInput.style.padding = "6px 8px";
      artistInput.style.border = "1px solid var(--border-color, #e0e0e0)";
      artistInput.style.borderRadius = "4px";
      artistInput.style.marginBottom = "2px";
      artistInput.style.background = "var(--primary-bg-color, #f4f6f8)";
      artistInput.style.color = "var(--text-color-primary, #212121)";
      artistInput.style.outlineColor = "var(--accent-color, #ff6f00)";

      // 提示
      const tip = document.createElement("div");
      tip.textContent = "More accurate info makes more accurate result.";
      tip.style.fontSize = "0.89em";
      tip.style.color = "var(--text-color-secondary, #5f6368)";
      tip.style.marginBottom = "2px";

      // checkbox
      const metaBox = document.createElement("label");
      metaBox.style.fontSize = "0.93em";
      metaBox.style.display = "flex";
      metaBox.style.alignItems = "center";
      metaBox.style.gap = "4px";
      metaBox.style.color = "var(--text-color-secondary, #5f6368)";
      const metaCheckbox = document.createElement("input");
      metaCheckbox.type = "checkbox";
      metaCheckbox.checked = true;
      metaBox.appendChild(metaCheckbox);
      metaBox.appendChild(
        document.createTextNode("Auto apply searched metadata")
      );

      // 按钮
      const btnRow = document.createElement("div");
      btnRow.style.display = "flex";
      btnRow.style.gap = "8px";
      btnRow.style.marginTop = "4px";
      const applyBtn = document.createElement("button");
      applyBtn.textContent = "Apply";
      applyBtn.style.fontSize = "0.97em";
      applyBtn.style.padding = "4px 16px";
      applyBtn.style.borderRadius = "4px";
      applyBtn.style.border = "none";
      applyBtn.style.background = "var(--accent-color, #ff6f00)";
      applyBtn.style.color = "#fff";
      applyBtn.style.cursor = "pointer";
      applyBtn.style.transition = "background 0.2s";
      applyBtn.onmouseover = () => { applyBtn.style.background = "var(--accent-color-darker, #e65100)"; };
      applyBtn.onmouseout = () => { applyBtn.style.background = "var(--accent-color, #ff6f00)"; };

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      cancelBtn.style.fontSize = "0.97em";
      cancelBtn.style.padding = "4px 16px";
      cancelBtn.style.borderRadius = "4px";
      cancelBtn.style.border = "1px solid var(--border-color, #e0e0e0)";
      cancelBtn.style.background = "var(--primary-bg-color, #f4f6f8)";
      cancelBtn.style.color = "var(--text-color-primary, #212121)";
      cancelBtn.style.cursor = "pointer";
      cancelBtn.style.transition = "background 0.2s";
      cancelBtn.onmouseover = () => { cancelBtn.style.background = "var(--secondary-bg-color, #ffffff)"; };
      cancelBtn.onmouseout = () => { cancelBtn.style.background = "var(--primary-bg-color, #f4f6f8)"; };
      btnRow.appendChild(applyBtn);
      btnRow.appendChild(cancelBtn);

      searchInputBox.appendChild(songInput);
      searchInputBox.appendChild(artistInput);
      searchInputBox.appendChild(tip);
      searchInputBox.appendChild(metaBox);
      searchInputBox.appendChild(btnRow);

      // 自动填充
      let autoSong = "";
      let autoArtist = "";
      try {
        // 尝试从页面获取
        if (
          window.mainPlayerManager &&
          window.mainPlayerManager.getCurrentTrackInfo
        ) {
          const info = window.mainPlayerManager.getCurrentTrackInfo();
          if (info) {
            if (info.title) autoSong = info.title;
            if (info.artist) autoArtist = info.artist;
          }
        }
        // 尝试从页面元素
        if (!autoSong) {
          const el = document.querySelector(
            "[data-song-title], .song-title, #song-title"
          );
          if (el && el.textContent) autoSong = el.textContent.trim();
        }
        if (!autoArtist) {
          const el = document.querySelector("[data-artist], .artist, #artist");
          if (el && el.textContent) autoArtist = el.textContent.trim();
        }
      } catch (e) {}
      if (autoSong) songInput.value = autoSong;
      if (autoArtist) artistInput.value = autoArtist;

      // 插入到按钮后
      searchButton.parentNode.insertBefore(
        searchInputBox,
        searchButton.nextSibling
      );
      songInput.focus();

      // 移除输入框
      function removeBox() {
        if (searchInputBox && searchInputBox.parentNode) {
          searchInputBox.parentNode.removeChild(searchInputBox);
        }
        searchInputBox = null;
      }
      cancelBtn.addEventListener("click", removeBox);

      // 3. 应用逻辑
      applyBtn.addEventListener("click", async () => {
        const song = songInput.value.trim();
        const artist = artistInput.value.trim();
        if (!song) {
          if (
            UIManagerForLyricsEditor &&
            typeof UIManagerForLyricsEditor.showToast === "function"
          ) {
            UIManagerForLyricsEditor.showToast("Song name is required.");
          }
          songInput.focus();
          return;
        }
        // 检查已有歌词
        const hasLyrics =
          lrcInputAreaElement && lrcInputAreaElement.value.trim().length > 0;
        async function doSearch() {
          // 4. 调用websocketManager
          if (
            !WebSocketManagerForLyricsEditor ||
            typeof WebSocketManagerForLyricsEditor.sendWebSocketCommand !==
              "function"
          ) {
            UIManagerForLyricsEditor &&
              UIManagerForLyricsEditor.showToast("WebSocket unavailable.");
            return;
          }
          // loading
          applyBtn.disabled = true;
          applyBtn.textContent = "Searching...";
          try {
            const resp =
              await WebSocketManagerForLyricsEditor.sendWebSocketCommand(
                "try_get_music_lyrics",
                {
                  name: song,
                  artist: artist,
                }
              );
            applyBtn.disabled = false;
            applyBtn.textContent = "Apply";
            if (!resp || typeof resp.code === "undefined") {
              UIManagerForLyricsEditor &&
                UIManagerForLyricsEditor.showToast("No response from server.");
              return;
            }
            if (
              resp.code === 0 &&
              resp.data &&
              resp.data.music_info &&
              resp.data.music_info.lyrics
            ) {
              let lyrics = resp.data.music_info.lyrics;
              // 每行前加[00:00.00]
              const lines = lyrics
                .split(/\r?\n/)
                .map((line) => `[00:00.00]${line}`);
              lrcInputAreaElement.value = lines.join("\n");
              lrcInputAreaElement.dispatchEvent(
                new Event("input", { bubbles: true })
              );
              // 应用metadata
              if (metaCheckbox.checked && resp.data.music_info) {
                const info = resp.data.music_info;
                if (info.title) {
                  // 尝试填充页面
                  const el = document.querySelector('[name="title"]');
                  if (el) el.value = info.title;
                }
                if (info.artist) {
                  const el = document.querySelector('[name="artist"]');
                  if (el) el.value = info.artist;
                }
                if (info.album) {
                  const el = document.querySelector('[name="album"]');
                  if (el) el.value = info.album.name;
                }
                // if (info.description) {
                //   const el = document.querySelector('[name="description"]');
                //   if (el) el.textContent = info.description;
                // }
                if (info.artwork && info.online_artwork) {
                  const coverInput = document.querySelector('input#cover-local-path');
                  if (coverInput) coverInput.value = info.artwork;
                  const coverImg = document.querySelector('img.cover-preview-image');
                  if (coverImg) {
                    coverImg.referrerPolicy = "no-referrer";
                    coverImg.src = info.online_artwork;
                  }
                }
              }
              removeBox();
            } else if (resp.code === 1) {
              UIManagerForLyricsEditor &&
                UIManagerForLyricsEditor.showToast(
                  resp.msg || "No lyrics found."
                );
            } else {
              UIManagerForLyricsEditor &&
                UIManagerForLyricsEditor.showToast("Unknown error.");
            }
          } catch (e) {
            applyBtn.disabled = false;
            applyBtn.textContent = "Apply";
            UIManagerForLyricsEditor &&
              UIManagerForLyricsEditor.showToast("Network error.");
          }
        }
        if (
          hasLyrics &&
          UIManagerForLyricsEditor &&
          typeof UIManagerForLyricsEditor.showConfirmationDialog === "function"
        ) {
          UIManagerForLyricsEditor.showConfirmationDialog(
            "This will overwrite current lyrics. Continue?",
            () => {
              doSearch();
            },
            null
          );
        } else {
          doSearch();
        }
      });

      // 回车快捷键
      songInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") applyBtn.click();
        else if (e.key === "Escape") cancelBtn.click();
      });
      artistInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") applyBtn.click();
        else if (e.key === "Escape") cancelBtn.click();
      });
    });
  }
  let delayInputBox = null;

  if (delayAllButton && lrcInputAreaElement) {
    delayAllButton.addEventListener("click", (event) => {
      event.preventDefault();
      // If already exists or LRC invalid, do nothing
      if (
        delayInputBox ||
        (lrcErrorDisplayElement && lrcErrorDisplayElement.textContent)
      )
        return;
      delayInputBox = document.createElement("div");
      delayInputBox.style.display = "flex";
      delayInputBox.style.alignItems = "center";
      delayInputBox.style.gap = "8px";
      delayInputBox.style.marginTop = "6px";
      delayInputBox.style.background = "var(--secondary-bg-color, #ffffff)";
      delayInputBox.style.padding = "10px 14px";
      delayInputBox.style.borderRadius = "6px";
      delayInputBox.style.boxShadow = "0 2px 8px var(--shadow-color, rgba(0,0,0,0.1))";
      delayInputBox.style.border = "1px solid var(--border-color, #e0e0e0)";
      delayInputBox.style.fontFamily = "var(--font-family-primary, 'Roboto', sans-serif)";
      delayInputBox.style.maxWidth = "320px";
      delayInputBox.style.zIndex = "10";
      delayInputBox.style.position = "relative";

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "mm:ss.xx or -mm:ss.xx";
      input.style.fontSize = "0.97em";
      input.style.padding = "6px 8px";
      input.style.border = "1px solid var(--border-color, #e0e0e0)";
      input.style.borderRadius = "4px";
      input.style.background = "var(--primary-bg-color, #f4f6f8)";
      input.style.color = "var(--text-color-primary, #212121)";
      input.style.outlineColor = "var(--accent-color, #ff6f00)";
      input.style.flex = "1 1 auto";

      const applyBtn = document.createElement("button");
      applyBtn.textContent = "Apply";
      applyBtn.style.fontSize = "0.97em";
      applyBtn.style.padding = "4px 16px";
      applyBtn.style.borderRadius = "4px";
      applyBtn.style.border = "none";
      applyBtn.style.background = "var(--accent-color, #ff6f00)";
      applyBtn.style.color = "#fff";
      applyBtn.style.cursor = "pointer";
      applyBtn.style.transition = "background 0.2s";
      applyBtn.onmouseover = () => { applyBtn.style.background = "var(--accent-color-darker, #e65100)"; };
      applyBtn.onmouseout = () => { applyBtn.style.background = "var(--accent-color, #ff6f00)"; };

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      cancelBtn.style.fontSize = "0.97em";
      cancelBtn.style.padding = "4px 16px";
      cancelBtn.style.marginLeft = "2px";
      cancelBtn.style.background = "var(--secondary-bg-color, #ffffff)";
      cancelBtn.style.color = "var(--text-color-primary, #212121)";
      cancelBtn.style.border = "1px solid var(--border-color, #e0e0e0)";
      cancelBtn.style.borderRadius = "4px";
      cancelBtn.style.cursor = "pointer";
      cancelBtn.style.transition = "background 0.2s";
      cancelBtn.onmouseover = () => { cancelBtn.style.background = "var(--primary-bg-color, #f4f6f8)"; };
      cancelBtn.onmouseout = () => { cancelBtn.style.background = "var(--secondary-bg-color, #ffffff)"; };

      delayInputBox.appendChild(input);
      delayInputBox.appendChild(applyBtn);
      delayInputBox.appendChild(cancelBtn);

      // Insert below the button
      delayAllButton.parentNode.insertBefore(
        delayInputBox,
        delayAllButton.nextSibling
      );

      // Focus input
      input.focus();

      // Remove input box helper
      function removeBox() {
        if (delayInputBox && delayInputBox.parentNode) {
          delayInputBox.parentNode.removeChild(delayInputBox);
        }
        delayInputBox = null;
      }

      cancelBtn.addEventListener("click", () => {
        removeBox();
      });

      applyBtn.addEventListener("click", () => {
        const val = input.value.trim();
        // Match: optional -, mm:ss.xx or mm:ss.xxx
        const match = val.match(/^(-)?(\d{1,2}):(\d{2})\.(\d{2,3})$/);
        if (!match) {
          if (
            UIManagerForLyricsEditor &&
            typeof UIManagerForLyricsEditor.showToast === "function"
          ) {
            UIManagerForLyricsEditor.showToast(
              "Invalid format. Use mm:ss.xx or -mm:ss.xx"
            );
          }
          return;
        }
        const isNegative = !!match[1];
        const mm = parseInt(match[2], 10);
        const ss = parseInt(match[3], 10);
        const xx = parseInt(match[4], 10);
        const factor = match[4].length === 2 ? 100 : 1000;
        if (isNaN(mm) || isNaN(ss) || isNaN(xx) || mm > 59 || ss > 59) {
          if (
            UIManagerForLyricsEditor &&
            typeof UIManagerForLyricsEditor.showToast === "function"
          ) {
            UIManagerForLyricsEditor.showToast("Invalid time value.");
          }
          return;
        }
        let delta = mm * 60 + ss + xx / factor;
        if (isNegative) delta = -delta;

        // Parse and update all lines
        const lines = lrcInputAreaElement.value.split("\n");
        const timeTagRegex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
        // 行内单个字符时间点 <mm:ss.xx>，只处理长度为7或8的标签
        const inlineTimeTagRegex = /<(\d{1,2}):(\d{2})\.(\d{2,3})>/g;
        let changed = false;
        for (let i = 0; i < lines.length; i++) {
          // 行首时间标签
          const m = lines[i].match(timeTagRegex);
          if (m) {
            let tmm = parseInt(m[1], 10);
            let tss = parseInt(m[2], 10);
            let txx = parseInt(m[3], 10);
            let tfactor = m[3].length === 2 ? 100 : 1000;
            let t = tmm * 60 + tss + txx / tfactor;
            let newT = t + delta;
            if (newT < 0) newT = 0;
            let nmm = Math.floor(newT / 60);
            let nss = Math.floor(newT % 60);
            let nxx = Math.round((newT - Math.floor(newT)) * tfactor);
            // Clamp
            if (nmm > 59) nmm = 59;
            if (nss > 59) nss = 59;
            if (nxx > tfactor - 1) nxx = tfactor - 1;
            const newTag = `[${String(nmm).padStart(2, "0")}:${String(
              nss
            ).padStart(2, "0")}.${String(nxx).padStart(m[3].length, "0")}]`;
            lines[i] = lines[i].replace(timeTagRegex, newTag);
            changed = true;
          }
          // 行内时间标签
          lines[i] = lines[i].replace(
            inlineTimeTagRegex,
            (tag, imm, iss, ixx) => {
              let tmm = parseInt(imm, 10);
              let tss = parseInt(iss, 10);
              let txx = parseInt(ixx, 10);
              let tfactor = ixx.length === 2 ? 100 : 1000;
              let t = tmm * 60 + tss + txx / tfactor;
              let newT = t + delta;
              if (newT < 0) newT = 0;
              let nmm = Math.floor(newT / 60);
              let nss = Math.floor(newT % 60);
              let nxx = Math.round((newT - Math.floor(newT)) * tfactor);
              // Clamp
              if (nmm > 59) nmm = 59;
              if (nss > 59) nss = 59;
              if (nxx > tfactor - 1) nxx = tfactor - 1;
              changed = true;
              return `<${String(nmm).padStart(2, "0")}:${String(nss).padStart(
                2,
                "0"
              )}.${String(nxx).padStart(ixx.length, "0")}>`;
            }
          );
        }
        if (changed) {
          lrcInputAreaElement.value = lines.join("\n");
          lrcInputAreaElement.dispatchEvent(
            new Event("input", { bubbles: true })
          );
        }
        removeBox();
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          applyBtn.click();
        } else if (e.key === "Escape") {
          cancelBtn.click();
        }
      });
    });
  }
  if (calibrateLineButton && lrcInputAreaElement) {
    calibrateLineButton.addEventListener("click", (event) => {
      event.preventDefault();
      const currentTime = lyricsEditorAudio.currentTime;
      const formattedTime = formatLRCClipTime(currentTime);

      // Get cursor position and current line
      const text = lrcInputAreaElement.value;
      const cursorPos = lrcInputAreaElement.selectionStart;
      const lines = text.split("\n");

      let charCount = 0;
      let lineIndex = 0;
      for (; lineIndex < lines.length; lineIndex++) {
        if (cursorPos <= charCount + lines[lineIndex].length) break;
        charCount += lines[lineIndex].length + 1; // +1 for '\n'
      }

      if (lineIndex >= lines.length) lineIndex = lines.length - 1;
      let line = lines[lineIndex] || "";

      const timeTagRegex = /^\[\d{2}:\d{2}\.\d{2,3}\]/;
      const wordTimeTagRegex = /<(\d{2}):(\d{2})\.(\d{2,3})>/g;

      // Parse existing line timestamp if present
      let oldLineTime = 0;
      const existingTimeMatch = line.match(timeTagRegex);
      if (existingTimeMatch) {
        const timeParts = existingTimeMatch[0].match(/(\d{2})/g);
        oldLineTime =
          parseInt(timeParts[0]) * 60 +
          parseInt(timeParts[1]) +
          parseInt(timeParts[2]) / 100;
      }

      // Calculate time difference between new and old line timestamps
      const timeDelta = currentTime - oldLineTime;

      // Handle word timestamps if they exist
      if (line.includes("<") && line.includes(">")) {
        line = line.replace(wordTimeTagRegex, (match, mm, ss, xx) => {
          // Parse existing word timestamp
          const wordTime =
            parseInt(mm) * 60 +
            parseInt(ss) +
            parseInt(xx) / (xx.length === 2 ? 100 : 1000);

          // Calculate new absolute time and format it
          const newWordTime = wordTime + timeDelta;
          const newMinutes = Math.floor(newWordTime / 60);
          const newSeconds = Math.floor(newWordTime % 60);
          const newMillis = Math.round(
            (newWordTime - Math.floor(newWordTime)) * 100
          );

          return `<${String(newMinutes).padStart(2, "0")}:${String(
            newSeconds
          ).padStart(2, "0")}.${String(newMillis).padStart(2, "0")}>`;
        });
      }

      // Update/replace line timestamp
      if (timeTagRegex.test(line)) {
        line = line.replace(timeTagRegex, formattedTime);
      } else {
        line = formattedTime + line;
      }

      lines[lineIndex] = line;

      // Rebuild textarea value and set cursor
      const newText = lines.join("\n");
      let newCursorPos = 0;
      for (let i = 0; i < lineIndex; i++) {
        newCursorPos += lines[i].length + 1;
      }
      // Place cursor after the time tag
      newCursorPos += formattedTime.length;

      lrcInputAreaElement.value = newText;
      lrcInputAreaElement.selectionStart = newCursorPos;
      lrcInputAreaElement.selectionEnd = newCursorPos;
      lrcInputAreaElement.dispatchEvent(new Event("input", { bubbles: true }));
      lrcInputAreaElement.focus();
    });
  }
  if (lrcInputAreaElement) {
    lrcInputAreaElement.addEventListener("input", (event) => {
      const lrcText = event.target.value;
      const result = parseLRC(lrcText);
      if (result.error) {
        displayLrcError(result.error.message);
        currentParsedLyrics = result.lyrics || [];
      } else {
        clearLrcError();
        currentParsedLyrics = result.lyrics;
      }
      renderLyricsPreview(currentParsedLyrics, lrcPreviewAreaElement);
      if (lyricsEditorAudio.paused) {
        updatePreviewHighlight(lyricsEditorAudio.currentTime);
      }
      // Update cursor highlight after input
      updateCursorHighlight(
        lrcInputAreaElement,
        lrcPreviewAreaElement,
        currentParsedLyrics
      );
    });
    // Event listeners for cursor highlight
    lrcInputAreaElement.addEventListener("focus", () =>
      updateCursorHighlight(
        lrcInputAreaElement,
        lrcPreviewAreaElement,
        currentParsedLyrics
      )
    );
    lrcInputAreaElement.addEventListener("blur", () => {
      if (cursorHighlightedLineElement) {
        cursorHighlightedLineElement.classList.remove(
          "highlighted-lyric-cursor"
        );
        cursorHighlightedLineElement = null;
      }
    });
    lrcInputAreaElement.addEventListener("keyup", () =>
      updateCursorHighlight(
        lrcInputAreaElement,
        lrcPreviewAreaElement,
        currentParsedLyrics
      )
    );
    lrcInputAreaElement.addEventListener("mouseup", () =>
      updateCursorHighlight(
        lrcInputAreaElement,
        lrcPreviewAreaElement,
        currentParsedLyrics
      )
    );
  }

  if (lrcPreviewAreaElement && lrcInputAreaElement) {
    lrcPreviewAreaElement.addEventListener("click", (event) => {
      const clickedLineElement = event.target.closest(".lyric-line");
      if (clickedLineElement) {
        let clickedLineText = "";
        // Attempt to reconstruct text exactly as it would be from .text or .words
        // This needs to match how renderLyricsPreview constructs the line.
        // If words are used, concatenate them. Otherwise, use textContent of the p element.
        const wordSpans = clickedLineElement.querySelectorAll(".lyric-word");
        if (wordSpans.length > 0) {
          wordSpans.forEach((span) => (clickedLineText += span.textContent)); // Includes spaces from rendering
          clickedLineText = clickedLineText.trim(); // Trim trailing space if any
        } else {
          clickedLineText = clickedLineElement.textContent.trim();
        }

        const fullLrcTextInEditor = lrcInputAreaElement.value;
        const linesInEditor = fullLrcTextInEditor.split("\n");

        for (let i = 0; i < linesInEditor.length; i++) {
          const editorLine = linesInEditor[i];
          // Match based on text content after the timestamp
          const timeTagMatch = editorLine.match(/^\[\d{2}:\d{2}\.\d{2,3}\]/);
          if (timeTagMatch) {
            const textPartInEditor = editorLine
              .substring(timeTagMatch[0].length)
              .trim();
            // Compare with the potentially word-span reconstructed text
            if (textPartInEditor === clickedLineText) {
              const startIndex = fullLrcTextInEditor.indexOf(editorLine);
              const endIndex = startIndex + editorLine.length;

              lrcInputAreaElement.focus();
              lrcInputAreaElement.setSelectionRange(startIndex, endIndex);

              // Scroll into view
              const textLines =
                fullLrcTextInEditor.substring(0, startIndex).split("\n")
                  .length - 1;
              const avgLineHeight =
                lrcInputAreaElement.scrollHeight / editorAllLines.length;
              lrcInputAreaElement.scrollTop = Math.max(
                0,
                textLines * avgLineHeight - lrcInputAreaElement.clientHeight / 2
              ); // Center it
              break;
            }
          }
        }
      }
    });
  }

  if (playPauseButton) {
    lyricsEditorPlayButtonIcon =
      playPauseButton.querySelector(".material-icons");
    playPauseButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (lyricsEditorAudio.paused) {
        if (
          mainPlayerManagerInstance &&
          typeof mainPlayerManagerInstance.pauseTrack === "function"
        ) {
          mainPlayerManagerInstance.pauseTrack();
        }
        lyricsEditorAudio
          .play()
          .catch((e) => console.error("Error playing lyrics editor audio:", e));
        if (lyricsEditorPlayButtonIcon)
          lyricsEditorPlayButtonIcon.textContent = "pause";
      } else {
        lyricsEditorAudio.pause();
        if (lyricsEditorPlayButtonIcon)
          lyricsEditorPlayButtonIcon.textContent = "play_arrow";
      }
    });
  }
  if (slowDownButton) {
    slowDownButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (lyricsEditorAudio.playbackRate > 0.5) {
        currentPlaybackSpeed = Math.max(
          0.5,
          lyricsEditorAudio.playbackRate - 0.25
        );
        lyricsEditorAudio.playbackRate = currentPlaybackSpeed;
      }
    });
  }
  if (speedUpButton) {
    speedUpButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (lyricsEditorAudio.playbackRate < 4.0) {
        currentPlaybackSpeed = Math.min(
          4.0,
          lyricsEditorAudio.playbackRate + 0.25
        );
        lyricsEditorAudio.playbackRate = currentPlaybackSpeed;
      }
    });
  }
  if (clipTimeButton && lrcInputAreaElement) {
    clipTimeButton.addEventListener("click", (event) => {
      event.preventDefault();
      const currentTime = lyricsEditorAudio.currentTime;
      const formattedTime = formatLRCClipTime(currentTime);
      const cursorPosition = lrcInputAreaElement.selectionStart;
      const text = lrcInputAreaElement.value;
      let textToInsert = formattedTime;
      if (cursorPosition > 0 && text.charAt(cursorPosition - 1) !== "\n") {
        textToInsert = "\n" + formattedTime;
      }
      lrcInputAreaElement.value =
        text.slice(0, cursorPosition) +
        textToInsert +
        text.slice(lrcInputAreaElement.selectionEnd);
      const newCursorPosition = cursorPosition + textToInsert.length;
      lrcInputAreaElement.selectionStart = newCursorPosition;
      lrcInputAreaElement.selectionEnd = newCursorPosition;
      lrcInputAreaElement.dispatchEvent(new Event("input", { bubbles: true }));
      lrcInputAreaElement.focus();
    });
  }
  if (resetButton) {
    resetButton.addEventListener("click", (event) => {
      event.preventDefault();
      pauseEditorAndResetButton();
      lyricsEditorAudio.currentTime = 0;
      if (currentTimeDisplay)
        currentTimeDisplay.textContent = formatTime(0, true);
      currentPlaybackSpeed = 1.0;
      lyricsEditorAudio.playbackRate = currentPlaybackSpeed;
      resetPreviewHighlights(); // Will call updateCursorHighlight
      updatePreviewHighlight(0); // Will call updateCursorHighlight again
      drawWaveform(waveformAudioBuffer, waveformCanvas, waveformCanvasCtx, 0);
    });
  }
  if (lyricsEditorPlayButtonIcon)
    lyricsEditorPlayButtonIcon.textContent = lyricsEditorAudio.paused
      ? "play_arrow"
      : "pause";
  lyricsEditorAudio.addEventListener("ended", () => {
    if (lyricsEditorPlayButtonIcon)
      lyricsEditorPlayButtonIcon.textContent = "play_arrow";
    if (currentTimeDisplay)
      currentTimeDisplay.textContent = formatTime(0, true);
    resetPreviewHighlights(); // Will call updateCursorHighlight
    updatePreviewHighlight(0); // Will call updateCursorHighlight again
    drawWaveform(waveformAudioBuffer, waveformCanvas, waveformCanvasCtx, 0);
  });

  if (currentTimeDisplay && durationDisplay) {
    lyricsEditorAudio.addEventListener("loadedmetadata", () => {
      durationDisplay.textContent = formatTime(
        lyricsEditorAudio.duration,
        true
      );
      drawWaveform(waveformAudioBuffer, waveformCanvas, waveformCanvasCtx, 0);
      updatePreviewHighlight(lyricsEditorAudio.currentTime); // Will call updateCursorHighlight
    });
    lyricsEditorAudio.addEventListener("timeupdate", () => {
      currentTimeDisplay.textContent = formatTime(
        lyricsEditorAudio.currentTime,
        true
      );
      drawWaveform(
        waveformAudioBuffer,
        waveformCanvas,
        waveformCanvasCtx,
        lyricsEditorAudio.currentTime
      );
      updatePreviewHighlight(lyricsEditorAudio.currentTime);
    });
  }

  // Waveform click/drag interaction
  if (waveformCanvas) {
    let isDraggingWaveform = false;

    const handleWaveformInteraction = (event) => {
      if (!lyricsEditorAudio.duration || !waveformAudioBuffer) return;

      const rect = waveformCanvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const ratio = x / rect.width;

      // Calculate the window bounds
      const windowDuration = 5; // seconds
      const halfWindow = windowDuration / 2;
      let startTime = Math.max(0, lyricsEditorAudio.currentTime - halfWindow);
      let endTime = Math.min(
        lyricsEditorAudio.duration,
        lyricsEditorAudio.currentTime + halfWindow
      );

      // Calculate the clicked time within the window
      const clickedTime = startTime + ratio * windowDuration;
      const boundedTime = Math.max(
        0,
        Math.min(clickedTime, lyricsEditorAudio.duration)
      );

      lyricsEditorAudio.currentTime = boundedTime;

      if (currentTimeDisplay) {
        currentTimeDisplay.textContent = formatTime(boundedTime, true);
      }

      drawWaveform(
        waveformAudioBuffer,
        waveformCanvas,
        waveformCanvasCtx,
        boundedTime
      );

      if (lyricsEditorAudio.paused) {
        updatePreviewHighlight(boundedTime);
      }
    };

    waveformCanvas.addEventListener("mousedown", (event) => {
      isDraggingWaveform = true;
      handleWaveformInteraction(event); // Handle click as well
      // Resume AudioContext if suspended (common browser policy)
      if (audioContext && audioContext.state === "suspended") {
        audioContext.resume();
      }
    });
    waveformCanvas.addEventListener("mousemove", (event) => {
      if (isDraggingWaveform) {
        handleWaveformInteraction(event);
      }
    });
    waveformCanvas.addEventListener("mouseup", () => {
      isDraggingWaveform = false;
    });
    waveformCanvas.addEventListener("mouseleave", () => {
      isDraggingWaveform = false;
    });
  }
  // Initial cursor highlight update
  updateCursorHighlight(
    lrcInputAreaElement,
    lrcPreviewAreaElement,
    currentParsedLyrics
  );
}

function updateCursorHighlight(
  lrcInputArea,
  lrcPreviewArea,
  localCurrentParsedLyrics
) {
  if (
    !lrcInputArea ||
    !lrcPreviewArea ||
    !localCurrentParsedLyrics ||
    localCurrentParsedLyrics.length === 0
  ) {
    if (cursorHighlightedLineElement) {
      cursorHighlightedLineElement.classList.remove("highlighted-lyric-cursor");
      cursorHighlightedLineElement = null;
    }
    return;
  }

  const cursorPosition = lrcInputArea.selectionStart;
  const textLines = lrcInputArea.value.substring(0, cursorPosition).split("\n");
  const currentLineNumberInEditor = textLines.length; // 1-based

  // Remove previous cursor highlight
  if (cursorHighlightedLineElement) {
    cursorHighlightedLineElement.classList.remove("highlighted-lyric-cursor");
    cursorHighlightedLineElement = null;
  }

  if (document.activeElement !== lrcInputArea) {
    // Only apply if textarea has focus
    return;
  }

  // Find the corresponding line in parsedLyrics. This is a bit tricky due to potential
  // differences in empty lines or lines without timestamps in the editor.
  // We'll try to find a match based on the line number that has a timestamp.
  let editorLineCounter = 0; // Counts lines with actual lyric content in editor
  let matchedLyricIndex = -1;

  const editorAllLines = lrcInputArea.value.split("\n");

  for (let i = 0; i < currentLineNumberInEditor; i++) {
    const editorLineText = editorAllLines[i];
    // A simple check: does it look like an LRC line (starts with '[xx:xx.xx]')?
    if (/^\[\d{2}:\d{2}\.\d{2,3}\]/.test(editorLineText.trim())) {
      editorLineCounter++;
    }
  }

  // Now, editorLineCounter is the 1-based index of the LRC line the cursor is on or after.
  // We need to find the (editorLineCounter - 1)-th element in `localCurrentParsedLyrics`
  if (
    editorLineCounter > 0 &&
    editorLineCounter <= localCurrentParsedLyrics.length
  ) {
    matchedLyricIndex = editorLineCounter - 1;
  }

  if (matchedLyricIndex !== -1) {
    const previewLineElements = lrcPreviewArea.querySelectorAll(".lyric-line");
    const targetPreviewElement = previewLineElements[matchedLyricIndex];

    if (targetPreviewElement) {
      // Only apply if not the same as playback highlight and textarea has focus
      if (!targetPreviewElement.classList.contains("highlighted-lyric")) {
        targetPreviewElement.classList.add("highlighted-lyric-cursor");
        cursorHighlightedLineElement = targetPreviewElement;
        // Scroll into view if needed
        // targetPreviewElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }
}

function drawWaveform(audioBuffer, canvas, ctx, currentTime) {
  if (!canvas || !ctx) return;
  const style = getComputedStyle(canvas);
  const styleWidth = parseInt(style.width, 10);
  const styleHeight = parseInt(style.height, 10);
  if (canvas.width !== styleWidth || canvas.height !== styleHeight) {
    canvas.width = styleWidth;
    canvas.height = styleHeight;
  }
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  if (!audioBuffer) {
    ctx.fillStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--text-color-secondary")
        .trim() || "#777";
    ctx.textAlign = "center";
    ctx.fillText("No audio loaded or error decoding.", width / 2, height / 2);
    return;
  }

  // Define 5-second window
  const windowDuration = 5; // seconds
  const halfWindow = windowDuration / 2;

  // Calculate start and end times
  let startTime = Math.max(0, currentTime - halfWindow);
  let endTime = Math.min(audioBuffer.duration, currentTime + halfWindow);

  // Handle edge cases
  if (currentTime < halfWindow) {
    endTime = Math.min(windowDuration, audioBuffer.duration);
  } else if (currentTime > audioBuffer.duration - halfWindow) {
    startTime = Math.max(0, audioBuffer.duration - windowDuration);
  }

  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // Get colors from CSS variables
  const waveformColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--text-color-secondary")
      .trim() || "#cccccc";
  const playedColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent-color")
      .trim() || "#ff6f00";
  const needleColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent-color-darker")
      .trim() || "#e65100";

  // Calculate sample range
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const totalSamples = endSample - startSample;
  const sampleCount = 350; // Fixed number of sample points
  const step = Math.max(1, Math.floor(totalSamples / sampleCount));

  const spacing = width / sampleCount;
  const halfHeight = height / 2;
  const scaleY = height / 2;

  // Calculate center position (current time)
  const centerX = width * ((currentTime - startTime) / windowDuration);

  // First draw the played (highlighted) section
  ctx.strokeStyle = playedColor;
  ctx.beginPath();

  let hasData = false;

  for (let i = 0; i < sampleCount; i++) {
    let min = 1.0;
    let max = -1.0;
    const sampleIndex = startSample + Math.floor(i * step);

    if (sampleIndex >= data.length) break;

    // Get min/max values for this sample block
    for (let j = 0; j < step && sampleIndex + j < data.length; j++) {
      const datum = data[sampleIndex + j];
      if (datum < min) min = datum;
      if (datum > max) max = datum;
      hasData = true;
    }

    const x = i * spacing;

    // Only draw the played section (before current time)
    if (x < centerX) {
      ctx.moveTo(x, halfHeight - max * scaleY);
      ctx.lineTo(x, halfHeight - min * scaleY);
    }
  }
  ctx.stroke();

  // Then draw the future section (gray)
  ctx.strokeStyle = waveformColor;
  ctx.beginPath();

  for (let i = 0; i < sampleCount; i++) {
    let min = 1.0;
    let max = -1.0;
    const sampleIndex = startSample + Math.floor(i * step);

    if (sampleIndex >= data.length) break;

    for (let j = 0; j < step && sampleIndex + j < data.length; j++) {
      const datum = data[sampleIndex + j];
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }

    const x = i * spacing;

    // Only draw the future section (after current time)
    if (x >= centerX) {
      ctx.moveTo(x, halfHeight - max * scaleY);
      ctx.lineTo(x, halfHeight - min * scaleY);
    }
  }
  ctx.stroke();

  // Draw needle cursor (triangle shape pointing downward)
  ctx.fillStyle = needleColor;
  ctx.beginPath();
  ctx.moveTo(centerX, height - 15); // Point at bottom
  ctx.lineTo(centerX - 5, height); // Left corner
  ctx.lineTo(centerX + 5, height); // Right corner
  ctx.closePath();
  ctx.fill();

  // If no data (silent section), draw a line
  if (!hasData) {
    ctx.strokeStyle = waveformColor;
    ctx.beginPath();
    ctx.moveTo(0, halfHeight);
    ctx.lineTo(width, halfHeight);
    ctx.stroke();
  }
}
export function parseLRC(lrcString) {
  const lines = lrcString.trim().split("\n");
  const parsedLyrics = [];
  const timeTagRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
  const wordTimeTagRegex = /<(\d{2}):(\d{2})\.(\d{2,3})>/g;
  let lastLineTime = -1;

  for (let i = 0; i < lines.length; i++) {
    const lineStr = lines[i].trim();
    if (!lineStr) continue;

    const lineMatch = lineStr.match(timeTagRegex);
    if (!lineMatch) {
      if (lineStr.startsWith("[") || lineStr.includes("]")) {
        return {
          lyrics: parsedLyrics,
          error: {
            message: `Invalid line timestamp format. Expected [mm:ss.xx].`,
            lineNumber: i + 1,
          },
        };
      }
      continue;
    }

    const lineMinutes = parseInt(lineMatch[1], 10);
    const lineSeconds = parseInt(lineMatch[2], 10);
    const lineMillisStr = lineMatch[3];
    const lineMillis = parseInt(lineMillisStr, 10);
    const millisFactor = lineMillisStr.length === 2 ? 100 : 1000;

    if (
      lineMinutes < 0 ||
      lineMinutes > 59 ||
      lineSeconds < 0 ||
      lineSeconds > 59 ||
      lineMillis < 0 ||
      (millisFactor === 100 && lineMillis > 99) ||
      (millisFactor === 1000 && lineMillis > 999)
    ) {
      return {
        lyrics: parsedLyrics,
        error: {
          message: `Invalid time values in line timestamp.`,
          lineNumber: i + 1,
        },
      };
    }

    const lineTime = lineMinutes * 60 + lineSeconds + lineMillis / millisFactor;

    if (lineTime < lastLineTime) {
      return {
        lyrics: parsedLyrics,
        error: {
          message: `Line timestamps not in chronological order.`,
          lineNumber: i + 1,
        },
      };
    }
    lastLineTime = lineTime;

    let textContent = lineStr.substring(lineMatch[0].length).trim();
    const words = [];
    let plainTextOnlyForLine = textContent;
    let lastWordTime = -1;

    if (textContent.includes("<")) {
      plainTextOnlyForLine = "";
      const parts = textContent.split(/(<[^>]+>)/);
      let currentAbsWordTime = lineTime;

      for (const part of parts) {
        if (part.match(wordTimeTagRegex)) {
          const wordMatch = part.match(/<(\d{2}):(\d{2})\.(\d{2,3})>/);
          if (!wordMatch) {
            return {
              lyrics: parsedLyrics,
              error: {
                message: `Invalid word timestamp format.`,
                lineNumber: i + 1,
              },
            };
          }
          const wordMinutes = parseInt(wordMatch[1], 10);
          const wordSeconds = parseInt(wordMatch[2], 10);
          const wordMillisStr = wordMatch[3];
          const wordMillis = parseInt(wordMillisStr, 10);
          const wordMillisFactor = wordMillisStr.length === 2 ? 100 : 1000;

          if (
            wordMinutes < 0 ||
            wordMinutes > 59 ||
            wordSeconds < 0 ||
            wordSeconds > 59 ||
            wordMillis < 0 ||
            (wordMillisFactor === 100 && wordMillis > 99) ||
            (wordMillisFactor === 1000 && wordMillis > 999)
          ) {
            return {
              lyrics: parsedLyrics,
              error: {
                message: `Invalid time values in word timestamp.`,
                lineNumber: i + 1,
              },
            };
          }

          const wordTimeOffset =
            wordMinutes * 60 + wordSeconds + wordMillis / wordMillisFactor;

          if (wordTimeOffset < lastWordTime) {
            return {
              lyrics: parsedLyrics,
              error: {
                message: `Word timestamps not in chronological order within line.`,
                lineNumber: i + 1,
              },
            };
          }

          lastWordTime = wordTimeOffset;
          currentAbsWordTime = lineTime + wordTimeOffset;
        } else if (part.trim()) {
          words.push({ time: currentAbsWordTime, text: part.trim() });
          plainTextOnlyForLine += part.trim() + " ";
        }
      }

      plainTextOnlyForLine = plainTextOnlyForLine.trim();
    }

    parsedLyrics.push({
      time: lineTime,
      text: plainTextOnlyForLine,
      words: words.length > 0 ? words : null,
    });
  }

  return { lyrics: parsedLyrics.sort((a, b) => a.time - b.time), error: null };
}

export function renderLyricsPreview(
  parsedLyricsToRender,
  targetElementSelectorOrElement
) {
  const lyricsToUse = parsedLyricsToRender || currentParsedLyrics;
  if (typeof targetElementSelectorOrElement === "string") {
    lrcPreviewAreaElement = document.querySelector(
      targetElementSelectorOrElement
    );
  } else {
    lrcPreviewAreaElement = targetElementSelectorOrElement;
  }
  if (!lrcPreviewAreaElement) return;
  resetPreviewHighlights(); // This now calls updateCursorHighlight
  lrcPreviewAreaElement.innerHTML = "";

  if (!lyricsToUse || lyricsToUse.length === 0) {
    const errorIsPresent =
      lrcErrorDisplayElement && lrcErrorDisplayElement.textContent !== "";
    lrcPreviewAreaElement.textContent = errorIsPresent
      ? "Fix errors in LRC content to see preview."
      : "No lyrics to display or invalid LRC format.";
    // Ensure cursor highlight is also cleared/updated
    if (lrcInputAreaElement && lrcPreviewAreaElement && currentParsedLyrics) {
      updateCursorHighlight(
        lrcInputAreaElement,
        lrcPreviewAreaElement,
        currentParsedLyrics
      );
    }
    return;
  }

  lyricsToUse.forEach((line) => {
    const p = document.createElement("p");
    p.classList.add("lyric-line");
    p.dataset.time = line.time.toFixed(3);
    if (line.words && line.words.length > 0) {
      line.words.forEach((word) => {
        const span = document.createElement("span");
        span.classList.add("lyric-word");
        span.textContent = word.text + " ";
        span.dataset.time = word.time.toFixed(3);
        p.appendChild(span);
      });
    } else {
      p.textContent = line.text;
    }
    lrcPreviewAreaElement.appendChild(p);
  });
  // After rendering, update the cursor highlight
  if (lrcInputAreaElement && lrcPreviewAreaElement && currentParsedLyrics) {
    updateCursorHighlight(
      lrcInputAreaElement,
      lrcPreviewAreaElement,
      currentParsedLyrics
    );
  }
}
