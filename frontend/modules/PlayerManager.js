/**
 * PlayerManager.js
 * 音乐播放器管理器，支持播放控制、高潮检测、封面关键色提取、节奏动画等
 */

// 假设有鼓点检测和高潮检测算法
// 可用如 music-beat-detector、music-tempo、ml5.js pitch detection等库，或简单实现

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

      const icon =
        this.playerPlayPauseButton.querySelector(".material-icons");

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
          this.audio.currentTime = value;
        }
      });
    }

    // 音量调节
    if (this.playerVolumeSlider) {
      this.playerVolumeSlider.addEventListener("input", (e) => {
        const value = Number(e.target.value);
        this.audio.volume = value / 100;
      });
    }

    // 播放模式切换
    if (this.playerPlaybackModeButton) {
      this.playerPlaybackModeButton.addEventListener("click", () => {
        const modes = ["list-loop", "single-loop", "random"];
        let idx = modes.indexOf(this.mode);
        idx = (idx + 1) % modes.length;
        this.setMode(modes[idx]);
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
        this.playerProgressBar.max = this.audio.duration;
        this.playerProgressBar.value = this.audio.currentTime;
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
        this.playerProgressBar.max = this.audio.duration;
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
  }
  setPlayList(playlist) {
    this.playlist = playlist;
    this.currentIndex = 0;
  }
  setupAudioContext() {
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.source = this.audioCtx.createMediaElementSource(this.audio);
    this.source.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);
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
    this.currentIndex = index;
    this.audio.src = "." + this.playlist[index].audio_path;
    if (this.coverImgElement) {
      this.coverImgElement.src = "." + this.playlist[index].cover_path;
      this.coverImgElement.onload = () => this.extractCoverColor();
    }
    this.climaxDetected = false;
  }
  findTrackById(id) {
    return this.playlist.findIndex((track) => track.music_id === id);
  }
  playTrackById(id) {
    const track = this.findTrackById(id);
    if (track !== -1) {
      this.loadTrack(track);
      this.play();
    }
    return track;
  }
  play() {
    this.audioCtx.resume();
    this.audio.play();
    this.isPlaying = true;
    this.startVisualizer();
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this.stopVisualizer();
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
    const modes = ["list-loop", "single-loop", "random"];
    const icons = ["repeat", "repeat_one", "shuffle"];
    if (modes.includes(mode)) {
      this.mode = mode;
      localStorage.setItem("player_mode", mode);
      // 切换播放模式图标
      if (this.playerPlaybackModeButton) {
        const icon =
          this.playerPlaybackModeButton.querySelector(".material-icons");
        if (icon) {
          const idx = modes.indexOf(mode);
          icon.textContent = icons[idx];
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
      band.style.transition = "opacity 0.3s ease";
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
        setTimeout(() => {
          band.style.transition = "none";
        }, 300);
      }, 300);
    });
  }

  startVisualizer() {
    if (this.animationFrame) return;

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

      this.animationFrame = requestAnimationFrame(animate);
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  stopVisualizer() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
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
