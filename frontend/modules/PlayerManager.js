/**
 * PlayerManager.js
 * 音乐播放器管理器，支持播放控制、高潮检测、封面关键色提取、节奏动画等
 */

// 假设有鼓点检测和高潮检测算法
// 可用如 music-beat-detector、music-tempo、ml5.js pitch detection等库、或简单实现
import { pauseEditorAndResetButton } from './LyricsEditor.js'; // Import the function
import UIManager from "./UIManager.js";
const ALLOWED_PLAY_MODE = ["list-loop", "single-loop", "random"];
const PLAY_MODE_MAPPED_ICON = ["repeat", "repeat_one", "shuffle"];
class PlayerManager {
  constructor({
    playlist = [],
    backgroundElement,
    coverImgElement,
    onColorChange,
    audioElement = null,
  }) {
    this.playlist = playlist;
    this.backgroundElement = backgroundElement;
    this.coverImgElement = coverImgElement;
    this.onColorChange = onColorChange;
    this.audio = audioElement || new Audio();
    this.currentIndex = 0;
    this.currentLoadedTrack = {};
    this.mode = "list-loop"; // 'list-loop', 'single-loop', 'random'
    this.isPlaying = false;
    this.audioCtx = null;
    this.analyser = null;
    this.source = null;
    this.animationFrame = null;
    this.beatLastTime = 0;
    this.climaxDetected = false;
    this.theme = this.getTheme();
    this.isAnimating = false;
    this.lyricsEditorAudioRef = null; // Reference to LyricsEditor audio
    this.init();
  }

  init() {
    if (!this.audio) {
      this.audio = new Audio();
    }

    // 绑定播放器UI元素
    this.playerFooter = document.getElementById("main-player");
    this.playerContent = document.getElementById("player-content");
    this.playerPlayPauseButton = document.getElementById(
      "player-play-pause-button"
    );
    this.playerPrevButton = document.getElementById("player-prev-button");
    this.playerNextButton = document.getElementById("player-next-button");
    this.playerProgressBar = document.getElementById("player-progress-bar");
    this.playerCurrentTime = document.getElementById("player-current-time");
    this.playerDuration = document.getElementById("player-duration");
    this.playerTrackTitle = document.getElementById("player-track-title");
    this.playerTrackArtist = document.getElementById("player-track-artist");
    this.playerAlbumArt = document.getElementById("player-album-art");
    this.playerPlaybackModeButton = document.getElementById(
      "player-playback-mode-button"
    );
    this.playerVolumeButton = document.getElementById("player-volume-button");
    this.playerVolumeSlider = document.getElementById("player-volume-slider");
    this.playerHideButton = document.getElementById("player-hide-button");
    this.playerShowButton = document.getElementById("player-show-button");

    // 播放/暂停按钮
    if (this.playerPlayPauseButton) {
      this.playerPlayPauseButton.addEventListener("click", () => {
        this.togglePlay();
      });

      const icon = this.playerPlayPauseButton.querySelector(".material-icons");

      // 根据 audio 事件更新播放按钮图标
      const updatePlayPauseIcon = () => {
        if (icon) {
          icon.textContent = this.audio.paused ? "play_arrow" : "pause_arrow";
        }
      };

      this.audio.addEventListener("play", updatePlayPauseIcon);
      this.audio.addEventListener("pause", updatePlayPauseIcon);
      this.audio.addEventListener("ended", updatePlayPauseIcon);

      // 初始化时设置一次
      updatePlayPauseIcon();
    }

    // 上一曲
    if (this.playerPrevButton) {
      this.playerPrevButton.addEventListener("click", () => {
        this.prev();
      });
    }

    // 下一曲
    if (this.playerNextButton) {
      this.playerNextButton.addEventListener("click", () => {
        this.next();
      });
    }

    // 进度条拖动
    if (this.playerProgressBar) {
      this.playerProgressBar.addEventListener("input", (e) => {
        const value = Number(e.target.value);
        if (this.audio.duration) {
          this.audio.currentTime = value / 100;
        }
      });
    }

    // 音量调节
    if (this.playerVolumeSlider) {
      this.playerVolumeSlider.addEventListener("input", (e) => {
        const value = Number(e.target.value);
        const normalizedVolume = value / 100;
        
        // 使用volumeGainNode来控制音量，而不是直接设置audio.volume
        if (this.volumeGainNode) {
          this.volumeGainNode.gain.setValueAtTime(normalizedVolume, this.audioCtx.currentTime);
        }
        
        // 保存音量设置到localStorage
        localStorage.setItem('player_volume', normalizedVolume);
      });
    }

    // 播放模式切换
    if (this.playerPlaybackModeButton) {
      this.playerPlaybackModeButton.addEventListener("click", () => {
        let idx = ALLOWED_PLAY_MODE.indexOf(this.mode);
        idx = (idx + 1) % ALLOWED_PLAY_MODE.length;
        this.setMode(ALLOWED_PLAY_MODE[idx]);
      });
    }

    // 隐藏/显示播放器
    if (this.playerHideButton && this.playerShowButton && this.playerContent) {
      this.playerHideButton.addEventListener("click", () => {
        this.playerContent.classList.add("hidden");
        this.playerShowButton.classList.remove("hidden");
      });
      this.playerShowButton.addEventListener("click", () => {
        if (!this.isPlaying && this.playlist.length > 0) {
          // 随机选择一首歌
          const randomIndex = Math.floor(Math.random() * this.playlist.length);
          this.loadTrack(randomIndex);
          this.play();
          // 等封面加载完再显示播放器
          if (this.coverImgElement) {
            this.coverImgElement.onload = () => {
              this.playerContent.classList.remove("hidden");
              this.playerShowButton.classList.add("hidden");
              this.coverImgElement.onload = null; // 防止多次触发
            };
            // 重新设置src以触发onload
            this.coverImgElement.src =
              "." + this.playlist[randomIndex].cover_path;
          } else {
            this.playerContent.classList.remove("hidden");
            this.playerShowButton.classList.add("hidden");
          }
        } else if (this.playlist.length === 0) {
          if (this.playerTrackTitle)
            this.playerTrackTitle.textContent = "库中还没有歌曲~";
          this.playerContent.classList.remove("hidden");
          this.playerShowButton.classList.add("hidden");
        } else {
          this.playerContent.classList.remove("hidden");
          this.playerShowButton.classList.add("hidden");
        }
      });
    }

    // 音频时间更新
    this.audio.addEventListener("timeupdate", () => {
      if (this.playerProgressBar && this.audio.duration) {
        // 设置进度条最大值为音乐总时长
        this.playerProgressBar.max = this.audio.duration * 100;
        this.playerProgressBar.value = this.audio.currentTime * 100;
      }
      if (this.playerCurrentTime) {
        const min = Math.floor(this.audio.currentTime / 60);
        const sec = Math.floor(this.audio.currentTime % 60)
          .toString()
          .padStart(2, "0");
        this.playerCurrentTime.textContent = `${min}:${sec}`;
      }
    });

    // 音频元数据加载
    this.audio.addEventListener("loadedmetadata", () => {
      if (this.playerDuration) {
        const min = Math.floor(this.audio.duration / 60);
        const sec = Math.floor(this.audio.duration % 60)
          .toString()
          .padStart(2, "0");
        this.playerDuration.textContent = `${min}:${sec}`;
      }
      if (this.playerProgressBar) {
        this.playerProgressBar.max = this.audio.duration * 100;
        this.playerProgressBar.value = 0;
      }
    });

    // 切换曲目时更新UI
    this.audio.addEventListener("loadeddata", () => {
      if (this.playlist[this.currentIndex]) {
        if (this.playerTrackTitle)
          this.playerTrackTitle.textContent =
            this.playlist[this.currentIndex].title || "";
        if (this.playerTrackArtist)
          this.playerTrackArtist.textContent =
            this.playlist[this.currentIndex].artist || "";
        if (this.playerAlbumArt)
          this.playerAlbumArt.src =
            "." + this.playlist[this.currentIndex].cover_path;
      }
    });
    const savedMode = localStorage.getItem("player_mode");

    const savedPlayerVisible = localStorage.getItem("playerVisible") === "true";

    if (savedPlayerVisible && this.isPlaying) {
      this.playerShowButton.click();
    } else {
      this.playerHideButton.click();
    }

    this.setMode(savedMode);
    this.setupAudioContext();
    this.setupThemeListener();
    this.loadTrack(this.currentIndex);
    this.audio.addEventListener("ended", () => this.handleTrackEnd());
    // Register as a global function if it doesn't exist
    if (!window.requestVisualizationFrame) {
      const visualizerCallbacks = new Map();
      let visualizerActive = false;
      let lastVisualizerHandle = 0;

      window.requestVisualizationFrame = (callback) => {
        const handle = ++lastVisualizerHandle;

        if (visualizerActive) {
          // If visualizer is active, queue to visualizer RAF
          visualizerCallbacks.set(handle, callback);
          return handle;
        } else {
          // Fallback to standard RAF
          return requestAnimationFrame(callback);
        }
      };

      window.cancelVisualizationFrame = (handle) => {
        if (visualizerActive) {
          visualizerCallbacks.delete(handle);
        } else {
          cancelAnimationFrame(handle);
        }
      };

      // This will be called from PlayerManager's visualizer RAF
      window._processVisualizerCallbacks = (timestamp) => {
        for (const [_, callback] of visualizerCallbacks) {
          callback(timestamp);
        }
        visualizerCallbacks.clear();
      };

      // Called when visualizer starts/stops
      window._setVisualizerActive = (active) => {
        visualizerActive = active;
      };
    }
  }
  getCurrentTime(){
    if(this.audio && this.audio.currentTime) {
      return this.audio.currentTime;
    }
  }
  setPlayList(playlist) {
    this.playlist = playlist;
    this.currentIndex = 0;
  }
  setupAudioContext() {
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;
    
    // 创建增益节点用于响度归一化
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.value = 1.0; // 初始增益为1
    
    // 创建增益节点用于音量控制
    this.volumeGainNode = this.audioCtx.createGain();
    this.volumeGainNode.gain.value = 1.0; // 初始音量为1
    
    this.source = this.audioCtx.createMediaElementSource(this.audio);
    
    // 重新设置音频节点连接链：source -> normalization -> volume -> analyser -> destination
    this.source.connect(this.gainNode);
    this.gainNode.connect(this.volumeGainNode);
    this.volumeGainNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);
    
    // 设置初始音量
    const savedVolume = localStorage.getItem('player_volume');
    if (savedVolume !== null) {
      const volume = parseFloat(savedVolume);
      this.volumeGainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);
      if (this.playerVolumeSlider) {
        this.playerVolumeSlider.value = volume * 100;
      }
    }
  }

  // 计算音频的LUFS值
  async calculateLUFS() {
    if (!this.audio.src) return -14; // 如果没有音频源，返回目标LUFS值
    
    const audioData = await this.getAudioData();
    if (!audioData) return -14;
    
    // 简化的LUFS计算
    // 实际的LUFS计算需要考虑K加权滤波和门限处理
    // 这里使用RMS作为简化的替代方案
    const rms = this.calculateRMS(audioData);
    // 将RMS转换为近似LUFS值
    // 这是一个简化的转换，实际LUFS计算更复杂
    const lufs = 20 * Math.log10(rms) - 23;
    
    return lufs;
  }

  // 获取音频数据
  async getAudioData() {
    try {
      const response = await fetch(this.audio.src);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
      
      // 合并所有声道
      const numberOfChannels = audioBuffer.numberOfChannels;
      const length = audioBuffer.length;
      const mergedData = new Float32Array(length);
      
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          mergedData[i] += channelData[i] / numberOfChannels;
        }
      }
      
      return mergedData;
    } catch (error) {
      console.error('Error getting audio data:', error);
      return null;
    }
  }

  // 计算RMS值
  calculateRMS(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }

  // 应用响度归一化
  async applyLoudnessNormalization() {
    const targetLUFS = -14; // 目标LUFS值
    const maxGainDB = 6; // 最大增益限制(dB)
    
    const currentLUFS = await this.calculateLUFS();
    
    // 计算需要的增益
    let gainDB = targetLUFS - currentLUFS;
    
    // 限制最大增益
    gainDB = Math.min(gainDB, maxGainDB);
    
    // 将dB转换为线性增益
    const linearGain = Math.pow(10, gainDB / 20);
    
    // 应用增益
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(linearGain, this.audioCtx.currentTime);
    }
  }

  setupThemeListener() {
    const observer = new MutationObserver(() => {
      const newTheme = this.getTheme();
      if (newTheme !== this.theme) {
        this.theme = newTheme;
        this.extractCoverColor();
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  getTheme() {
    if (document.body.classList.contains("dark-theme")) return "dark";
    if (document.body.classList.contains("light-theme")) return "light";
    return "light";
  }

  loadTrack(index) {
    if (!this.playlist[index]) return;
    this.currentLoadedTrack = this.playlist[index];
    this.currentIndex = index;
    this.audio.src = "." + this.playlist[index].audio_path;
    if (this.coverImgElement) {
      this.coverImgElement.src = "." + this.playlist[index].cover_path;
      this.coverImgElement.onload = () => this.extractCoverColor();
    }
    this.climaxDetected = false;
    
    // 在音频加载完成后应用响度归一化
    this.audio.addEventListener('loadeddata', () => {
      this.applyLoudnessNormalization().catch(err => 
        console.error('Error applying loudness normalization:', err)
      );
    }, { once: true }); // 只执行一次
  }
  findTrackById(id) {
    return this.playlist.findIndex((track) => track.music_id === id);
  }
  playTrackById(id) {
    const trackIndex = this.findTrackById(id); // Renamed to avoid conflict
    if (trackIndex !== -1) {
      this.loadTrack(trackIndex);
      this.play();
    }
    return trackIndex;
  }

  setLyricsEditorAudio(audioElement) {
    this.lyricsEditorAudioRef = audioElement;
  }

  play() {
    // Pause LyricsEditor audio if it's playing
    if (this.lyricsEditorAudioRef && !this.lyricsEditorAudioRef.paused) {
        pauseEditorAndResetButton(); // This function is imported from LyricsEditor.js
    }

    this.audioCtx.resume(); // Ensure AudioContext is resumed
    this.audio.play().catch(e => console.error("Error playing main audio:", e));
    this.isPlaying = true;
    this.startVisualizer();
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this.stopVisualizer();
  }

  playTrackFromCard(trackInfoString) {
    if (!trackInfoString) {
      console.warn("playTrackFromCard called with no trackInfoString.");
      return;
    }
    try {
      const trackInfo = JSON.parse(trackInfoString);
      if (this.playerTrackTitle) {
        this.playerTrackTitle.textContent = trackInfo.title || "Unknown Title";
      }
      if (this.playerTrackArtist) {
        this.playerTrackArtist.textContent = trackInfo.author || trackInfo.artist_name || "Unknown Artist";
      }
      
      this.playTrackById(trackInfo.music_id); // This should load and play the track
      
      UIManager.setPlayerVisibility(true); // Make player visible

      // Update the main player's play/pause button icon to 'pause'
      if (this.playerPlayPauseButton) {
        const icon = this.playerPlayPauseButton.querySelector(".material-icons");
        if (icon) {
          icon.textContent = "pause_arrow"; 
        }
      }
    } catch (e) {
      console.error("Failed to parse track info for playTrackFromCard:", e);
      UIManager.showToast("Error playing track: Invalid track data.", "error");
    }
  }
  
  // Allow external modules (like LyricsEditor) to pause the main player.
  pauseTrack() {
    this.pause();
  }

  togglePlay() {
    this.isPlaying ? this.pause() : this.play();
  }

  next() {
    let nextIndex;
    if (this.mode === "random") {
      do {
        nextIndex = Math.floor(Math.random() * this.playlist.length);
      } while (nextIndex === this.currentIndex && this.playlist.length > 1);
    } else if (this.mode === "single-loop") {
      nextIndex = this.currentIndex;
    } else {
      nextIndex = (this.currentIndex + 1) % this.playlist.length;
    }
    this.loadTrack(nextIndex);
    this.play();
  }

  prev() {
    let prevIndex;
    if (this.mode === "random") {
      do {
        prevIndex = Math.floor(Math.random() * this.playlist.length);
      } while (prevIndex === this.currentIndex && this.playlist.length > 1);
    } else if (this.mode === "single-loop") {
      prevIndex = this.currentIndex;
    } else {
      prevIndex =
        (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    }
    this.loadTrack(prevIndex);
    this.play();
  }

  setMode(mode) {
    if (ALLOWED_PLAY_MODE.includes(mode)) {
      this.mode = mode;
      localStorage.setItem("player_mode", mode);
      // 切换播放模式图标
      if (this.playerPlaybackModeButton) {
        const icon =
          this.playerPlaybackModeButton.querySelector(".material-icons");
        if (icon) {
          const idx = ALLOWED_PLAY_MODE.indexOf(mode);
          icon.textContent = PLAY_MODE_MAPPED_ICON[idx];
        }
      }
    }
  }

  handleTrackEnd() {
    if (this.mode === "single-loop") {
      this.audio.currentTime = 0;
      this.play();
    } else {
      this.next();
    }
  }
  getCurrentTrack() {
    return this.currentLoadedTrack || null;
  }
  extractCoverColor() {
    if (!this.coverImgElement.complete) return;
    const colorThief = new ColorThief();
    let color = [200, 200, 200];
    try {
      color = colorThief.getColor(this.coverImgElement);
    } catch (e) {}
    color = this.adjustColorForTheme(color, this.theme);
    if (this.onColorChange) this.onColorChange(color);
    this.setBackgroundBandsColor(color);
  }

  adjustColorForTheme(color, theme) {
    // color: [r,g,b]
    let [r, g, b] = color;
    if (theme === "dark") {
      r = Math.floor(r * 0.6);
      g = Math.floor(g * 0.6);
      b = Math.floor(b * 0.6);
    } else {
      r = Math.min(255, Math.floor(r * 1.2));
      g = Math.min(255, Math.floor(g * 1.2));
      b = Math.min(255, Math.floor(b * 1.2));
    }
    return [r, g, b];
  }

  setBackgroundBandsColor(color) {
    if (!this.backgroundElement) return;
    const bands = this.backgroundElement.querySelectorAll(".color-band");
    bands.forEach((band, i) => {
      band.style.opacity = 0;
      const factor = 1 - i * 0.15;
      const [r, g, b] = color.map((c) =>
        Math.max(0, Math.min(255, Math.floor(c * factor)))
      );
      // 目标颜色为下一个 band 的颜色（如果有），否则为 var(--secondary-bg-color)
      let nextColor;
      if (i < bands.length - 1) {
        const nextFactor = 1 - (i + 1) * 0.15;
        const [nr, ng, nb] = color.map((c) =>
          Math.max(0, Math.min(255, Math.floor(c * nextFactor)))
        );
        nextColor = `rgb(${nr},${ng},${nb})`;
      } else {
        nextColor = "var(--secondary-bg-color)";
      }
      band.style.background = `linear-gradient(45deg, rgb(${r},${g},${b}), ${nextColor})`;
      setTimeout(() => {
        band.style.opacity = 1;
      }, 300);
    });
  }

  startVisualizer() {
    if (this.animationFrame) return;
    window._setVisualizerActive(true);
    const bands = this.backgroundElement
      ? this.backgroundElement.querySelectorAll(".color-band")
      : [];
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // 鼓点检测变量
    let lastBeatTime = 0;
    const beatCooldown = 200; // ms
    const shortHistory = [];
    const longHistory = [];
    const shortWindowSize = 4;
    const longWindowSize = 30;

    // 用于计算低频索引（假设采样率为 44100Hz）
    const sampleRate = this.audioCtx.sampleRate || 44100;
    const nyquist = sampleRate / 2;
    const lowFreqStart = Math.floor((40 / nyquist) * bufferLength);
    const lowFreqEnd = Math.floor((150 / nyquist) * bufferLength);

    const animate = (now) => {
      this.analyser.getByteFrequencyData(dataArray);

      // 计算低频能量（均方根 RMS）
      let bassSum = 0;
      for (let i = lowFreqStart; i <= lowFreqEnd; i++) {
        const norm = dataArray[i] / 255;
        bassSum += norm * norm;
      }
      const lowFreqCount = lowFreqEnd - lowFreqStart + 1;
      const bassRMS = bassSum / lowFreqCount;

      // 鼓点检测：低频能量突变
      shortHistory.push(bassRMS);
      longHistory.push(bassRMS);
      if (shortHistory.length > shortWindowSize) shortHistory.shift();
      if (longHistory.length > longWindowSize) longHistory.shift();

      const shortAvg =
        shortHistory.reduce((a, b) => a + b, 0) / shortHistory.length;
      const longAvg =
        longHistory.reduce((a, b) => a + b, 0) / longHistory.length;

      const ratio = longAvg > 0 ? shortAvg / longAvg : 0;
      const beatThreshold = 1.8;

      if (
        ratio > beatThreshold &&
        (!lastBeatTime || now - lastBeatTime > beatCooldown)
      ) {
        lastBeatTime = now;
        this.triggerBeatAnimation(bands);
      }

      // 用低频驱动 band 缩放
      bands.forEach((band, i) => {
        const scale = 0.4 + bassRMS * (0.6 + i * 0.1);
        band.style.transform = `scale(${scale.toFixed(3)})`;
      });

      window._processVisualizerCallbacks(now);

      this.animationFrame = requestAnimationFrame(animate);
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  stopVisualizer() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
      window._setVisualizerActive(false);
    }
    // 恢复band动画
    if (this.backgroundElement) {
      const bands = this.backgroundElement.querySelectorAll(".color-band");
      bands.forEach((band) => {
        band.style.transform = "";
      });
    }
    this.triggerClimaxAnimation(false);
  }

  triggerBeatAnimation(bands) {
    if (this.isAnimating) return;
    this.isAnimating = true;

    bands.forEach((band, i) => {
      band.classList.add("beat");
    });

    setTimeout(() => {
      bands.forEach((band) => band.classList.remove("beat"));
      this.isAnimating = false;
    }, 200);
  }

  triggerClimaxAnimation(isClimax) {
    if (!this.backgroundElement) return;
    if (isClimax) {
      // 添加明暗闪烁动画
      this.backgroundElement.classList.add("climax-flash");
    } else {
      this.backgroundElement.classList.remove("climax-flash");
    }
  }
}

export default PlayerManager;