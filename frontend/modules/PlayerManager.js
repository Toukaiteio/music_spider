/**
 * PlayerManager.js
 * 音乐播放器管理器，支持播放控制、高潮检测、封面关键色提取、节奏动画等
 */

// 假设有鼓点检测和高潮检测算法
// 可用如 music-beat-detector、music-tempo、ml5.js pitch detection等库、或简单实现
import { pauseEditorAndResetButton } from './LyricsEditor.js';
import UIManager from "./UIManager.js";
import TrackAdapter from './TrackAdapter.js';
import WebSocketManager from "./WebSocketManager.js";

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
    this.stateChangeCallbacks = new Set();
    this.audioCtx = null;
    this.analyser = null;
    this.source = null;
    this.animationFrame = null;
    this.beatLastTime = 0;
    this.climaxDetected = false;
    this.theme = this.getTheme();
    this.isAnimating = false;
    this.lyricsEditorAudioRef = null; // Reference to LyricsEditor audio

    // Preference Tracking
    this.lastReportTime = Date.now();
    this.heartbeatTimer = null;
    this.heartbeatInterval = 30000; // 30 seconds

    this.init();
  }

  reportListening(action) {
    const track = this.getCurrentTrack();
    if (!track || !track.music_id) return;

    const now = Date.now();
    const duration = (now - this.lastReportTime) / 1000;
    this.lastReportTime = now;

    const payload = {
      music_id: track.music_id,
      action: action,
      duration: action === 'start' ? 0 : duration,
      track_info: {
        title: track.title,
        artist: TrackAdapter.getArtist(track),
        album: track.album,
        source: track.source,
        language: track.language // Might be undefined, that's okay
      }
    };

    WebSocketManager.getInstance().sendWebSocketCommand('report_listening_event', payload)
      .catch(err => console.error('[PlayerManager] Failed to report preference event:', err));
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.lastReportTime = Date.now();
    this.heartbeatTimer = setInterval(() => {
      this.reportListening('heartbeat');
    }, this.heartbeatInterval);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
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
          icon.textContent = this.audio.paused ? "play_arrow" : "pause";
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

        // 使用volumeGainNode来控制音量，确保AudioContext已恢复
        if (this.volumeGainNode && this.audioCtx.state !== 'suspended') {
          this.volumeGainNode.gain.setValueAtTime(normalizedVolume, this.audioCtx.currentTime);
        } else if (this.volumeGainNode) {
          // 如果AudioContext被挂起，先恢复再设置音量
          this.audioCtx.resume().then(() => {
            this.volumeGainNode.gain.setValueAtTime(normalizedVolume, this.audioCtx.currentTime);
          });
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
        this._collapsePlayer();
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
              this._expandPlayer();
              this.coverImgElement.onload = null; // 防止多次触发
            };
            // 重新设置src以触发onload
            this.coverImgElement.src =
              "." + this.playlist[randomIndex].cover_path;
          } else {
            this._expandPlayer();
          }
        } else if (this.playlist.length === 0) {
          if (this.playerTrackTitle)
            this.playerTrackTitle.textContent = "库中还没有歌曲~";
          this._expandPlayer();
        } else {
          this._expandPlayer();
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
      // Update circular progress on show button
      const showButtonProgress = document.querySelector("#player-show-button .progress-bar");
      if (showButtonProgress && this.audio.duration) {
        const percentage = (this.audio.currentTime / this.audio.duration) * 100;
        showButtonProgress.style.strokeDasharray = `${percentage}, 100`;
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
      const track = this.currentLoadedTrack || this.playlist[this.currentIndex];
      if (track) {
        if (this.playerTrackTitle)
          this.playerTrackTitle.textContent = track.title || "";
        if (this.playerTrackArtist)
          this.playerTrackArtist.textContent = TrackAdapter.getArtist(track) || "Unknown Artist";
        if (this.playerAlbumArt)
          this.playerAlbumArt.src = TrackAdapter.getCoverUrl(track);
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
  // ---- 播放器展开/收起辅助方法 ----
  // 用统一入口同步管理 player-collapsed、playerContent.hidden、playerShowButton.hidden，
  // 确保三者始终保持一致，避免状态漂移。
  _expandPlayer() {
    if (this.playerFooter) this.playerFooter.classList.remove('player-collapsed');
    if (this.playerContent) this.playerContent.classList.remove('hidden');
    if (this.playerShowButton) this.playerShowButton.classList.add('hidden');
    localStorage.setItem('playerVisible', 'true');
  }

  _collapsePlayer() {
    if (this.playerFooter) this.playerFooter.classList.add('player-collapsed');
    if (this.playerContent) this.playerContent.classList.add('hidden');
    if (this.playerShowButton) this.playerShowButton.classList.remove('hidden');
    localStorage.setItem('playerVisible', 'false');
  }

  getCurrentTime() {
    if (this.audio && this.audio.currentTime) {
      return this.audio.currentTime;
    }
  }
  setPlayList(playlist) {
    this.playlist = playlist;
    this.currentIndex = 0;
  }

  // 智能跑马灯检测：仅在文本溢出时开启滚动
  checkMarquee(elementId) {
    const scroller = document.getElementById(elementId);
    if (!scroller) return;
    const textContainer = scroller.querySelector('.marquee-text');
    const innerText = textContainer.firstElementChild;

    // 重置状态
    scroller.classList.remove('can-scroll');
    textContainer.style.animation = 'none';

    // 强制同步布局检查
    requestAnimationFrame(() => {
      // 在 inline-block 模式下，innerText.offsetWidth 代表内容的实际渲染宽度
      if (innerText.offsetWidth > scroller.offsetWidth) {
        scroller.classList.add('can-scroll');
        const text = innerText.textContent;
        textContainer.setAttribute('data-content', text);
        // 让动画即刻生效
        textContainer.style.animation = '';
      }
    });
  }
  setupAudioContext() {
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;

    // 创建智能增益节点（用于响度均衡）
    this.smartGainNode = this.audioCtx.createGain();
    this.smartGainNode.gain.value = 1.0;

    // 创建用户音量控制节点
    this.volumeGainNode = this.audioCtx.createGain();
    this.volumeGainNode.gain.value = 0.2;


    this.source = this.audioCtx.createMediaElementSource(this.audio);

    // 音频节点连接链：source -> smartGain -> volume -> analyser -> destination
    this.source.connect(this.smartGainNode);
    this.smartGainNode.connect(this.volumeGainNode);
    this.volumeGainNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    // 音频间响度均衡相关变量
    this.targetLoudness = -23; // EBU R128 标准目标响度
    this.trackLoudnessCache = new Map(); // 缓存后端获取的响度数据

    // 响度均衡强度设置 (0-1, 0=关闭, 1=最大)
    this.loudnessNormalizationStrength = parseFloat(localStorage.getItem('loudness_normalization_strength') || '0.8');

    // WebSocket连接用于获取响度数据
    this.websocket = null;
    this.connectWebSocket();

    // 设置初始音量
    const savedVolume = localStorage.getItem('player_volume');
    const volume = (savedVolume !== null) ? parseFloat(savedVolume) : 0.2;
    this.volumeGainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);
    if (this.playerVolumeSlider) {
      this.playerVolumeSlider.value = volume * 100;
    }

  }

  // WebSocket连接管理
  connectWebSocket() {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      this.websocket = new WebSocket('ws://localhost:8765');

      this.websocket.onopen = () => {
        console.log('Loudness WebSocket connected');
      };

      this.websocket.onmessage = (event) => {
        this.handleWebSocketMessage(event.data);
      };

      this.websocket.onclose = () => {
        console.log('Loudness WebSocket disconnected');
        // 尝试重连
        setTimeout(() => this.connectWebSocket(), 3000);
      };

      this.websocket.onerror = (error) => {
        console.error('Loudness WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
    }
  }

  // 处理WebSocket消息
  handleWebSocketMessage(data) {
    try {
      const message = JSON.parse(data);
      if (message.cmd_id && message.cmd_id.startsWith('loudness_')) {
        this.handleLoudnessResponse(message);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  // 处理响度数据响应
  handleLoudnessResponse(message) {
    if (message.code === 200 && message.data.has_loudness_data) {
      const { music_id, gain_adjustment } = message.data;

      // 缓存响度数据
      this.trackLoudnessCache.set(music_id, message.data);

      // 如果是当前播放的音频，立即应用增益
      const currentTrack = this.getCurrentTrack();
      if (currentTrack && currentTrack.music_id === music_id) {
        this.applyLoudnessGain(gain_adjustment);
      }
    }
  }

  // 应用响度增益
  applyLoudnessGain(gainAdjustment) {
    if (!this.smartGainNode || this.loudnessNormalizationStrength === 0) {
      return;
    }

    // 应用响度均衡强度设置
    const adjustedGain = 1.0 + (gainAdjustment - 1.0) * this.loudnessNormalizationStrength;

    // 平滑应用增益
    this.smartGainNode.gain.setTargetAtTime(
      adjustedGain,
      this.audioCtx.currentTime,
      0.1 // 100ms平滑过渡
    );

    console.log(`Applied loudness gain: ${adjustedGain.toFixed(2)}`);
  }

  // 从后端获取响度数据
  async fetchLoudnessData(musicId) {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot fetch loudness data');
      return;
    }

    // 检查缓存
    if (this.trackLoudnessCache.has(musicId)) {
      const cachedData = this.trackLoudnessCache.get(musicId);
      if (cachedData.has_loudness_data) {
        this.applyLoudnessGain(cachedData.gain_adjustment);
        return;
      }
    }

    // 从后端获取
    const message = {
      cmd: 'get_loudness_data',
      cmd_id: `loudness_${Date.now()}`,
      music_id: musicId
    };

    this.websocket.send(JSON.stringify(message));
  }

  // 重置响度分析（切换歌曲时调用）
  resetLoudnessAnalysis() {
    // 重置增益为默认值
    if (this.smartGainNode) {
      this.smartGainNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
    }

    // 获取当前音频的响度数据
    const currentTrack = this.getCurrentTrack();
    if (currentTrack && currentTrack.music_id) {
      this.fetchLoudnessData(currentTrack.music_id);
    }
  }

  // 设置响度均衡强度
  setLoudnessNormalizationStrength(strength) {
    this.loudnessNormalizationStrength = Math.max(0, Math.min(1, strength));
    localStorage.setItem('loudness_normalization_strength', this.loudnessNormalizationStrength.toString());
  }

  // 获取响度均衡强度
  getLoudnessNormalizationStrength() {
    return this.loudnessNormalizationStrength;
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

    const audioPath = TrackAdapter.getAudioPath(this.playlist[index]);
    if (audioPath) {
      this.audio.src = audioPath;
    } else {
      console.warn('[PlayerManager] Track has no local audio_path:', this.playlist[index]);
    }

    if (this.coverImgElement) {
      this.coverImgElement.src = TrackAdapter.getCoverUrl(this.playlist[index]);
      this.coverImgElement.onload = () => {
        this.extractCoverColor();
        // 更新 UI 后检查跑马灯
        this.checkMarquee('title-scroller');
        this.checkMarquee('artist-scroller');
      };
    }
    this.climaxDetected = false;
    // 重置响度分析
    this.resetLoudnessAnalysis();
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
    this.notifyStateChange();
    this.startVisualizer();
    
    // Preference Tracking
    this.reportListening('start');
    this.startHeartbeat();
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this.notifyStateChange();
    this.stopVisualizer();

    // Preference Tracking
    this.reportListening('pause');
    this.stopHeartbeat();
  }

  playTrackFromCard(trackInfoString) {
    if (!trackInfoString) {
      console.warn("playTrackFromCard called with no trackInfoString.");
      return;
    }
    try {
      const rawTrack = JSON.parse(trackInfoString);
      const track = TrackAdapter.normalize(rawTrack);

      if (this.playerTrackTitle) this.playerTrackTitle.textContent = track.title || "Unknown Title";
      if (this.playerTrackArtist) this.playerTrackArtist.textContent = TrackAdapter.getArtist(track) || "Unknown Artist";

      // 先尝试在 playlist 中找该曲（playlist 有完整本地路径）
      const playlistIndex = this.findTrackById(track.music_id);
      if (playlistIndex !== -1) {
        this.loadTrack(playlistIndex);
        this.play();
      } else {
        // playlist 中没有（下载完成但尚未刷新 playlist）：
        // 直接用适配器解析出的路径播放
        const audioPath = TrackAdapter.getAudioPath(track);
        if (audioPath) {
          this.audio.src = audioPath;
          this.currentLoadedTrack = track;
          if (this.coverImgElement) {
            this.coverImgElement.src = TrackAdapter.getCoverUrl(track);
            this.coverImgElement.onload = () => this.extractCoverColor();
          }
          this.play();
        } else {
          console.warn('[PlayerManager] Track not in playlist and no audio_path:', track);
          UIManager.showToast('Cannot play: track not yet downloaded.', 'warning');
        }
      }

      UIManager.setPlayerVisibility(true);

      if (this.playerPlayPauseButton) {
        const icon = this.playerPlayPauseButton.querySelector(".material-icons");
        if (icon) icon.textContent = "pause";
      }

      // 检查跑马灯
      this.checkMarquee('title-scroller');
      this.checkMarquee('artist-scroller');
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
    this.reportListening('end');
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
    if (!this.coverImgElement || !this.coverImgElement.complete) return;
    const colorThief = new ColorThief();
    try {
      // 1. 扩大采样至 10 个关键色
      const palette = colorThief.getPalette(this.coverImgElement, 10);
      if (!palette || palette.length < 1) return;

      // 2. 环境色彩过滤器：过滤掉过于接近白色或灰色的颜色
      const filteredPalette = palette.filter(color => {
        const [r, g, b] = color;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = (max - min) / (max || 1);
        const brightness = max / 255;
        // 剔除高亮度低饱和度的杂色
        return !(brightness > 0.8 && saturation < 0.2);
      });

      // 3. 核心优化：权重倾斜。按照亮度升序排列，让“深色”排在最前面
      filteredPalette.sort((a, b) => {
        const brightA = (a[0] * 299 + a[1] * 587 + a[2] * 114) / 1000;
        const brightB = (b[0] * 299 + b[1] * 587 + b[2] * 114) / 1000;
        return brightA - brightB;
      });

      const finalPalette = filteredPalette.length >= 2 ? filteredPalette : palette;
      
      const color1 = this.adjustColorForTheme(finalPalette[0], this.theme);
      const color2 = this.adjustColorForTheme(finalPalette[1] || finalPalette[0], this.theme);

      // 构建渐变背景
      const gradient = `linear-gradient(135deg, rgba(${color1[0]}, ${color1[1]}, ${color1[2]}, 0.85), rgba(${color2[0]}, ${color2[1]}, ${color2[2]}, 0.85))`;
      if (this.playerFooter) {
        this.playerFooter.style.setProperty('--player-bg-gradient', gradient);
      }

      if (this.onColorChange) this.onColorChange(color1);
      this.setBackgroundBandsColor(color1);
    } catch (e) {
      console.error("ColorThief failed:", e);
    }
  }

  adjustColorForTheme(color, theme) {
    let [r, g, b] = color;
    if (theme === "dark") {
      // 计算原始亮度 (0-255)
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      
      // 动态压暗系数：如果颜色本身很亮，压暗力度加大 (0.2x)；如果已经很深，保持温和 (0.4x)
      const factor = brightness > 150 ? 0.2 : 0.35;
      
      r = Math.floor(r * factor);
      g = Math.floor(g * factor);
      b = Math.floor(b * factor);
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

      // 不再需要实时分析，响度数据由后端提供

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

    // 重置帧计数
    this.frameCount = 0;
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

// 在 PlayerManager 类的定义之外，但在同一文件内

/**
 * 订阅播放器状态变化。
 * @param {function} callback 当播放状态改变时调用的回调函数。
 */
PlayerManager.prototype.onStateChange = function (callback) {
  this.stateChangeCallbacks.add(callback);
};

/**
 * 取消订阅播放器状态变化。
 * @param {function} callback 要移除的回调函数。
 */
PlayerManager.prototype.offStateChange = function (callback) {
  this.stateChangeCallbacks.delete(callback);
};

/**
 * 通知所有订阅者状态已改变。
 */
PlayerManager.prototype.notifyStateChange = function () {
  const state = {
    isPlaying: this.isPlaying,
    track: this.getCurrentTrack()
  };
  for (const callback of this.stateChangeCallbacks) {
    callback(state);
  }
};

export default PlayerManager;