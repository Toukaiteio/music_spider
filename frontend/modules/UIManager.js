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
                        : task.artwork_url ||
                          task.cover_url ||
                          "placeholder_album_art_2.png"
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
  static showToast(message, type = "info", duration = 3000) {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById("toast-container");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "toast-container";
      toastContainer.style.position = "fixed";
      toastContainer.style.bottom = "20px";
      toastContainer.style.left = "20px"; // Changed from right to left
      toastContainer.style.zIndex = "9999";
      toastContainer.style.display = "flex";
      toastContainer.style.flexDirection = "column";
      toastContainer.style.gap = "10px";
      document.body.appendChild(toastContainer);
    }

    // Create toast element
    const toast = document.createElement("div");
    toast.style.minWidth = "250px";
    toast.style.maxWidth = "350px";
    toast.style.padding = "15px";
    toast.style.borderRadius = "6px";
    toast.style.boxShadow = `0 4px 12px var(--shadow-color)`;
    toast.style.color = "var(--text-color-primary)";
    toast.style.backgroundColor = "var(--secondary-bg-color)";
    toast.style.borderLeft = `4px solid var(--accent-color)`;
    toast.style.display = "flex";
    toast.style.alignItems = "center";
    toast.style.justifyContent = "space-between";
    toast.style.transition = "all 0.3s ease";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";

    // Set different border colors based on type
    switch (type) {
      case "success":
        toast.style.borderLeftColor = "#4CAF50"; // Green for success
        break;
      case "error":
        toast.style.borderLeftColor = "#F44336"; // Red for error
        break;
      case "warning":
        toast.style.borderLeftColor = "#FF9800"; // Orange for warning
        break;
      default: // info
        toast.style.borderLeftColor = "var(--accent-color)";
    }

    // Add icon based on type
    const icon = document.createElement("span");
    icon.className = "material-icons";
    icon.style.marginRight = "10px";
    icon.style.color = toast.style.borderLeftColor;

    switch (type) {
      case "success":
        icon.textContent = "check_circle";
        break;
      case "error":
        icon.textContent = "error";
        break;
      case "warning":
        icon.textContent = "warning";
        break;
      default: // info
        icon.textContent = "info";
    }

    // Create message element
    const messageElement = document.createElement("span");
    messageElement.textContent = message;
    messageElement.style.flex = "1";

    // Create close button
    const closeButton = document.createElement("button");
    closeButton.className = "material-icons";
    closeButton.textContent = "close";
    closeButton.style.background = "transparent";
    closeButton.style.border = "none";
    closeButton.style.color = "var(--icon-color)";
    closeButton.style.cursor = "pointer";
    closeButton.style.marginLeft = "10px";
    closeButton.addEventListener("click", () => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    });

    // Assemble toast
    toast.appendChild(icon);
    toast.appendChild(messageElement);
    toast.appendChild(closeButton);
    toastContainer.appendChild(toast);

    // Animate in
    setTimeout(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    }, 10);

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    return toast;
  }

  // Helper for animating toast position changes
  static _reflowToasts(container) {
    // Animate all toasts to their new positions
    const toasts = Array.from(container.children);
    toasts.forEach((toast, idx) => {
      toast.style.transition =
        "opacity 0.25s, transform 0.35s cubic-bezier(.4,1.4,.6,1)";
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
      const savedDrawerState =
        localStorage.getItem("drawerCollapsed") === "true";
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
      const iconElement = buttonElement.querySelector(".material-icons");
      if (iconElement) {
        iconElement.textContent = isFavorite ? "favorite" : "favorite_border";
      } else {
        console.warn("Favorite button icon element not found.", buttonElement);
      }
    } else {
      console.warn(
        "Favorite button element not provided to updateFavoriteIcon."
      );
    }
  }
  static showConfirmationDialog(msg, onConfirm = null, onCancel = null) {
    // Ensure only one dialog at a time
    if (document.querySelector(".ui-confirmation-dialog-backdrop")) return;

    // Create backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "ui-confirmation-dialog-backdrop";
    backdrop.style.position = "fixed";
    backdrop.style.top = "0";
    backdrop.style.left = "0";
    backdrop.style.width = "100vw";
    backdrop.style.height = "100vh";
    backdrop.style.background = "rgba(0,0,0,0.32)";
    backdrop.style.zIndex = 10000;
    backdrop.style.display = "flex";
    backdrop.style.alignItems = "center";
    backdrop.style.justifyContent = "center";

    // Dialog container
    const dialog = document.createElement("div");
    dialog.className = "ui-confirmation-dialog";
    dialog.style.background = "var(--secondary-bg-color)";
    dialog.style.color = "var(--text-color-primary)";
    dialog.style.borderRadius = "10px";
    dialog.style.boxShadow = "0 4px 12px var(--shadow-color)";
    dialog.style.padding = "28px 24px 16px 24px";
    dialog.style.minWidth = "260px";
    dialog.style.maxWidth = "90vw";
    dialog.style.fontSize = "1rem";
    dialog.style.display = "flex";
    dialog.style.flexDirection = "column";
    dialog.style.alignItems = "center";
    dialog.style.gap = "18px";
    dialog.style.position = "relative";
    dialog.style.border = "1px solid var(--border-color)";

    // Message
    const message = document.createElement("div");
    message.textContent = msg;
    message.style.marginBottom = "12px";
    message.style.textAlign = "center";
    message.style.wordBreak = "break-word";
    message.style.color = "var(--text-color-primary)";

    // Buttons
    const buttonRow = document.createElement("div");
    buttonRow.style.display = "flex";
    buttonRow.style.gap = "18px";
    buttonRow.style.justifyContent = "center";
    buttonRow.style.marginTop = "8px";

    const btnConfirm = document.createElement("button");
    btnConfirm.textContent = "确定";
    btnConfirm.style.background = "var(--accent-color)";
    btnConfirm.style.color = "white";
    btnConfirm.style.border = "none";
    btnConfirm.style.borderRadius = "5px";
    btnConfirm.style.padding = "8px 22px";
    btnConfirm.style.fontSize = "1rem";
    btnConfirm.style.cursor = "pointer";
    btnConfirm.style.transition = "background 0.2s";
    btnConfirm.onmouseenter = () =>
      (btnConfirm.style.background = "var(--accent-color-darker)");
    btnConfirm.onmouseleave = () =>
      (btnConfirm.style.background = "var(--accent-color)");

    const btnCancel = document.createElement("button");
    btnCancel.textContent = "取消";
    btnCancel.style.background = "var(--primary-bg-color)";
    btnCancel.style.color = "var(--text-color-primary)";
    btnCancel.style.border = "1px solid var(--border-color)";
    btnCancel.style.borderRadius = "5px";
    btnCancel.style.padding = "8px 22px";
    btnCancel.style.fontSize = "1rem";
    btnCancel.style.cursor = "pointer";
    btnCancel.style.transition = "background 0.2s, border-color 0.2s";
    btnCancel.onmouseenter = () => {
      btnCancel.style.background = "var(--shadow-color)";
      btnCancel.style.borderColor = "var(--accent-color)";
    };
    btnCancel.onmouseleave = () => {
      btnCancel.style.background = "var(--primary-bg-color)";
      btnCancel.style.borderColor = "var(--border-color)";
    };

    // Remove dialog helper
    const removeDialog = () => {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    };

    btnConfirm.onclick = () => {
      removeDialog();
      if (typeof onConfirm === "function") onConfirm();
    };
    btnCancel.onclick = () => {
      removeDialog();
      if (typeof onCancel === "function") onCancel();
    };

    // Close on backdrop click (but not dialog click)
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        removeDialog();
        if (typeof onCancel === "function") onCancel();
      }
    });

    // Keyboard support: Enter=confirm, Esc=cancel
    const keyHandler = (e) => {
      if (e.key === "Enter") {
        btnConfirm.click();
      } else if (e.key === "Escape") {
        btnCancel.click();
      }
    };
    setTimeout(() => document.addEventListener("keydown", keyHandler), 0);

    // Remove key handler on close
    const cleanup = () => document.removeEventListener("keydown", keyHandler);
    backdrop.addEventListener("transitionend", cleanup);
    btnConfirm.addEventListener("click", cleanup);
    btnCancel.addEventListener("click", cleanup);

    buttonRow.appendChild(btnConfirm);
    buttonRow.appendChild(btnCancel);
    dialog.appendChild(message);
    dialog.appendChild(buttonRow);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    // Focus confirm button for accessibility
    setTimeout(() => btnConfirm.focus(), 0);
  }
}

export default UIManager;
