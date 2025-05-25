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
                    <img src="${
                      task.cover_path
                        ? "." + task.cover_path
                        : task.artwork_url || "placeholder_album_art_2.png"
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
}

export default UIManager;
