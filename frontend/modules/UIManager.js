class UIManager {
  // Prevent instantiation
  constructor() {
    throw new Error("UIManager cannot be instantiated");
  }
  static applyTheme(themeName) {
    document.body.classList.remove("light-theme", "dark-theme");
    document.body.classList.add(themeName);
    localStorage.setItem("theme", themeName); // Save preference
    const themeSwitcher = document.getElementById("theme-switcher");
    // Update icon based on theme (optional)
    if (themeSwitcher) {
      const icon = themeSwitcher.querySelector(".material-icons");
      if (icon) {
        icon.textContent =
          themeName === "dark-theme" ? "light_mode" : "dark_mode";
      }
    }
  }
  // Example static method
  static updateTaskQueueProgress(percentage) {
    const progressBar = document.querySelector(
      "#task-queue-button .progress-bar"
    );
    if (progressBar) {
      if (percentage === null || percentage < 0 || isNaN(percentage)) {
        progressBar.style.strokeDasharray = "25, 75";
      } else {
        const cleanPercentage = Math.max(0, Math.min(100, percentage));
        progressBar.style.strokeDasharray = `${cleanPercentage}, 100`;
      }
    }
  }

  // Another static method
  static renderTaskQueue() {
    const taskQueueULElement = document.querySelector(
      "#expanded-task-queue ul"
    );
    const emptyQueueMessage = document.querySelector(
      "#expanded-task-queue .empty-queue-message"
    );

    if (!taskQueueULElement || !emptyQueueMessage) {
      console.error("Task queue elements not found for rendering.");
      return;
    }

    taskQueueULElement.innerHTML = "";

    if (window.appState.downloadQueue.length === 0) {
      emptyQueueMessage.style.display = "block";
      taskQueueULElement.style.display = "none";
    } else {
      emptyQueueMessage.style.display = "none";
      taskQueueULElement.style.display = "block";

      window.appState.downloadQueue.forEach((task) => {
        const listItem = document.createElement("li");
        listItem.className = "task-item";
        listItem.dataset.musicId = task.music_id;

        let progressIconHtml =
          '<span class="material-icons">hourglass_empty</span>';
        if (
          task.status === "downloading" ||
          task.status === "downloading_segments"
        ) {
          progressIconHtml = '<span class="material-icons">downloading</span>';
        } else if (
          task.status === "processing" ||
          task.status === "completed_file" ||
          task.status === "all_segments_downloaded" ||
          task.status === "concatenating_segments"
        ) {
          progressIconHtml = '<span class="material-icons">sync</span>';
        } else if (task.status === "completed_track") {
          progressIconHtml = `<span class="material-icons" style="color: var(--success-color, green);">check_circle</span>`;
        } else if (task.status === "error") {
          progressIconHtml = `<span class="material-icons" style="color: var(--error-color, red);" title="${
            task.statusMessage || "Error"
          }">error</span>`;
        }

        const progressBarHtml = `
                    <div class="task-item-progress-bar-container" style="${
                      task.progressPercent > 0 && task.progressPercent < 100
                        ? ""
                        : "display: none;"
                    }">
                        <div class="task-item-progress-bar" style="width: ${
                          task.progressPercent || 0
                        }%; background-color: var(--primary-color); height: 4px; border-radius: 2px;"></div>
                    </div>
                `;

        listItem.innerHTML = `
                    <img referrerpolicy="no-referrer" src="${
                      task.cover_path
                        ? "." + task.cover_path
                        : (task.artwork_url || task.cover_url || "placeholder_album_art_2.png")
                    }" alt="Cover for ${task.title}" class="task-item-cover">
                    <div class="task-item-info">
                        <h4 class="task-item-title" title="${task.title}">${
          task.title
        }</h4>
                        <p class="task-item-artist">${
                          task.publisher_metadata?.artist ||
                          task.author ||
                          task.artist_name ||
                          "Unknown Artist"
                        }</p>
                        <p class="task-item-description">${
                          task.statusMessage || task.status
                        }</p>
                        ${progressBarHtml}
                    </div>
                    <div class="task-item-progress">
                        ${progressIconHtml}
                    </div>
                `;
        taskQueueULElement.appendChild(listItem);
      });
    }
  }

  static updateMainTaskQueueIcon() {
    const activeDownloads = window.appState.downloadQueue.filter(
      (task) =>
        task.status === "downloading" ||
        task.status === "downloading_segments" ||
        task.status === "concatenating_segments" ||
        task.status === "completed_file" ||
        task.status === "all_segments_downloaded" ||
        task.status === "pending" ||
        task.status === "processing"
    );

    const circularProgressElement = document.querySelector(
      "#task-queue-button .circular-progress"
    );
    if (!circularProgressElement) {
      console.error(
        "Circular progress element for task queue button not found."
      );
      return;
    }

    if (activeDownloads.length > 0) {
      circularProgressElement.classList.remove("hidden");
      let overallProgress = 0;
      const downloadingTasks = activeDownloads;
      overallProgress =
        downloadingTasks.reduce(
          (sum, task) => sum + (task.progressPercent || 0),
          0
        ) / downloadingTasks.length;

      UIManager.updateTaskQueueProgress(overallProgress);
    } else {
      UIManager.updateTaskQueueProgress(0);
      circularProgressElement.classList.add("hidden");
    }
  }
  static setPlayerVisibility(visible) {
    const mainPlayer = document.getElementById("main-player");
    const playerContent = document.getElementById("player-content");
    const playerShowButton = document.getElementById("player-show-button");
    if (!mainPlayer || !playerContent || !playerShowButton) return;

    if (visible) {
      mainPlayer.classList.remove("collapsed-player");
      playerContent.classList.remove("hidden");
      playerShowButton.classList.add("hidden");
      localStorage.setItem("playerVisible", "true");
    } else {
      mainPlayer.classList.add("collapsed-player");
      playerContent.classList.add("hidden");
      playerShowButton.classList.remove("hidden");
      localStorage.setItem("playerVisible", "false");
    }
  }
  static showToast(msg, type = "info",setted_duration = null) {
    // Ensure toast container exists
    let container = document.querySelector(".ui-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "ui-toast-container";
      container.style.position = "fixed";
      container.style.top = "0";
      container.style.left = "50%";
      container.style.transform = "translateX(-50%)";
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.alignItems = "center";
      container.style.zIndex = 9999;
      container.style.width = "auto";
      container.style.pointerEvents = "none";
      document.body.appendChild(container);
    }

    // Theme color mapping
    const typeColors = {
      error: "var(--error-color, #f44336)",
      success: "var(--success-color, #4caf50)",
      warning: "var(--warning-color, #ff9800)",
      info: "var(--info-color, #2196f3)"
    };

    // Calculate duration: 50ms per char, min 3s, max 7s
    const duration = setted_duration || Math.max(3000, Math.min(7000, 50 * msg.length));

    // Create toast element
    const toast = document.createElement("div");
    toast.className = `ui-toast ui-toast-${type}`;
    toast.textContent = msg;
    toast.style.background = typeColors[type] || typeColors.info;
    toast.style.color = "var(--on-primary-color, #fff)";
    toast.style.padding = "12px 24px";
    toast.style.borderRadius = "6px";
    toast.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
    toast.style.fontSize = "1rem";
    toast.style.marginTop = "12px";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-40px)";
    toast.style.transition = "opacity 0.25s, transform 0.35s cubic-bezier(.4,1.4,.6,1)";
    toast.style.pointerEvents = "auto";
    toast.style.cursor = "pointer";
    toast.style.minWidth = "120px";
    toast.style.maxWidth = "calc(100vw - 32px)";
    toast.style.wordBreak = "break-all";

    // Insert toast
    container.appendChild(toast);

    // Force reflow for animation
    void toast.offsetHeight;

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    // Remove toast with animation
    const removeToast = () => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-40px)";
      toast.removeEventListener("click", removeToast);
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
          // Animate remaining toasts upward
          UIManager._reflowToasts(container);
        }
        // Remove container if empty
        if (container && container.children.length === 0) {
          container.parentNode && container.parentNode.removeChild(container);
        }
      }, 350);
    };

    toast.addEventListener("click", removeToast);

    setTimeout(removeToast, duration);

    // Animate toasts when one is removed
    UIManager._reflowToasts(container);
  }

  // Helper for animating toast position changes
  static _reflowToasts(container) {
    // Animate all toasts to their new positions
    const toasts = Array.from(container.children);
    toasts.forEach((toast, idx) => {
      toast.style.transition = "opacity 0.25s, transform 0.35s cubic-bezier(.4,1.4,.6,1)";
      toast.style.marginTop = idx === 0 ? "12px" : "8px";
      // No need to manually set transform here, as each toast animates in/out itself
    });
  }

  static initThemeSwitcher() {
    const themeSwitcher = document.getElementById("theme-switcher");
    if (themeSwitcher) {
      themeSwitcher.addEventListener("click", () => {
        const currentTheme = document.body.classList.contains("dark-theme")
          ? "dark-theme"
          : "light-theme";
        const newTheme =
          currentTheme === "dark-theme" ? "light-theme" : "dark-theme";
        UIManager.applyTheme(newTheme); // applyTheme will also update the icon
      });
    } else {
      console.warn("Theme switcher element (#theme-switcher) not found.");
    }
  }

  static initTaskQueueControls() {
    const taskQueueButton = document.getElementById("task-queue-button");
    const expandedTaskQueue = document.getElementById("expanded-task-queue");

    if (taskQueueButton && expandedTaskQueue) {
      taskQueueButton.addEventListener("click", (event) => {
        event.stopPropagation(); // Prevent the document click listener from immediately closing it
        const isVisible = expandedTaskQueue.classList.toggle("visible");
        expandedTaskQueue.setAttribute("aria-hidden", !isVisible);
      });

      document.addEventListener("click", (event) => {
        // Check if the click is outside the button and the expanded queue
        if (
          expandedTaskQueue.classList.contains("visible") &&
          !taskQueueButton.contains(event.target) &&
          !expandedTaskQueue.contains(event.target)
        ) {
          expandedTaskQueue.classList.remove("visible");
          expandedTaskQueue.setAttribute("aria-hidden", "true");
        }
      });
    } else {
      console.warn("Task queue button or expanded queue element not found.");
    }
  }

  static initDrawerControls() {
    const drawerToggleButton = document.getElementById("drawer-toggle-button");
    const mainDrawer = document.getElementById("main-drawer");
    const drawerToggleIcon = drawerToggleButton
      ? drawerToggleButton.querySelector(".material-icons")
      : null;

    if (drawerToggleButton && mainDrawer && drawerToggleIcon) {
      const setDrawerState = (isCollapsed) => {
        mainDrawer.classList.toggle("collapsed", isCollapsed);
        drawerToggleIcon.textContent = isCollapsed ? "menu_open" : "menu";
        localStorage.setItem("drawerCollapsed", isCollapsed);
      };

      // Load saved state and set initial state
      const savedDrawerState = localStorage.getItem("drawerCollapsed") === "true";
      setDrawerState(savedDrawerState);

      // Add event listener
      drawerToggleButton.addEventListener("click", () => {
        const isCollapsed = mainDrawer.classList.contains("collapsed");
        setDrawerState(!isCollapsed); // Toggle the state
      });
    } else {
      console.warn(
        "Drawer toggle button, main drawer, or toggle icon not found."
      );
    }
  }

  static updateFavoriteIcon(buttonElement, isFavorite) {
    if (buttonElement) {
      const iconElement = buttonElement.querySelector('.material-icons');
      if (iconElement) {
        iconElement.textContent = isFavorite ? 'favorite' : 'favorite_border';
      } else {
        console.warn("Favorite button icon element not found.", buttonElement);
      }
    } else {
      console.warn("Favorite button element not provided to updateFavoriteIcon.");
    }
  }
}

export default UIManager;
