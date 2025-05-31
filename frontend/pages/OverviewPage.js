class OverviewPage {
  constructor() {
    this.updateIntervals = []; // To store interval IDs
    this.mainContentElement = null; // To store mainContentElement for updates
    this.charts = { gpuCharts: {} }; // Initialize gpuCharts as an object
    this.maxChartDataPoints = 30; // Max data points for line charts

    const isDark = document.body.classList.contains("dark-theme");
    this.chartThemeColors = {
      gridColor: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.08)",
      ticksColor: isDark ? "#b0b0b0" : "#555", // Lighter grey for dark, darker for light
      legendColor: isDark ? "#e0e0e0" : "#333",
      tooltipBackgroundColor: isDark
        ? "rgba(28, 28, 28, 0.92)"
        : "rgba(250, 250, 250, 0.92)",
      tooltipTitleColor: isDark ? "#e8e8e8" : "#2c2c2c",
      tooltipBodyColor: isDark ? "#d8d8d8" : "#4c4c4c",

      // Static dataset colors (can be used directly or made theme-dependent if desired)
      // Using slightly more vibrant and distinct colors
      cpuLineColor: "rgba(54, 162, 235, 1)", // Blue
      cpuFillColor: "rgba(54, 162, 235, 0.2)",

      gpuLineColor: "rgba(255, 99, 132, 1)", // Red
      gpuFillColor: "rgba(255, 99, 132, 0.2)",

      networkUploadLineColor: "rgba(75, 192, 192, 1)", // Teal
      networkUploadFillColor: "rgba(75, 192, 192, 0.2)",

      networkDownloadLineColor: "rgba(153, 102, 255, 1)", // Purple
      networkDownloadFillColor: "rgba(153, 102, 255, 0.2)",

      onlineUsersLineColor: isDark
        ? "rgba(173, 122, 255, 1)"
        : "rgba(153, 102, 255, 0.8)",
      onlineUsersFillColor: isDark
        ? "rgba(173, 122, 255, 0.3)"
        : "rgba(153, 102, 255, 0.2)",

      taskSuccessfulColor: isDark
        ? "rgba(40, 167, 69, 0.85)"
        : "rgba(40, 167, 69, 0.7)", // Darker Green
      taskFailedColor: isDark
        ? "rgba(220, 53, 69, 0.85)"
        : "rgba(220, 53, 69, 0.7)", // Darker Red
      taskRunningColor: isDark
        ? "rgba(23, 162, 184, 0.85)"
        : "rgba(23, 162, 184, 0.7)", // Darker Info Blue/Teal

      taskSuccessfulBorderColor: isDark
        ? "rgba(40, 167, 69, 1)"
        : "rgba(40, 167, 69, 1)",
      taskFailedBorderColor: isDark
        ? "rgba(220, 53, 69, 1)"
        : "rgba(220, 53, 69, 1)",
      taskRunningBorderColor: isDark
        ? "rgba(23, 162, 184, 1)"
        : "rgba(23, 162, 184, 1)",
    };
  }

  // Deep copies an object
  onUnload() {
    this.updateIntervals.forEach((intervalId) => clearInterval(intervalId));
    this.updateIntervals = [];

    // Destroy general charts
    [
      "cpuUsageChart",
      "networkUsageChart",
      "onlineUsersChart",
      "taskExecutionChart",
    ].forEach((chartName) => {
      if (
        this.charts[chartName] &&
        typeof this.charts[chartName].destroy === "function"
      ) {
        this.charts[chartName].destroy();
      }
    });

    // Destroy GPU charts
    Object.values(this.charts.gpuCharts).forEach((chart) => {
      if (chart && typeof chart.destroy === "function") {
        chart.destroy();
      }
    });

    this.charts = { gpuCharts: {} }; // Reset charts object

    // Clear the data update interval
    if (this.dataUpdateInterval) {
      clearInterval(this.dataUpdateInterval);
      this.dataUpdateInterval = null;
    }

    if (window.overviewPageModuleInstance === this) {
      delete window.overviewPageModuleInstance;
    }
    console.log(
      "OverviewPage unloaded, dynamic updates stopped and charts destroyed."
    );
  }

  // Chart update methods - These will be refactored or used by updateUIWithData
  _updateLineChart(chart, newDataLabel, newDataValue) {
    if (!chart) return;
    chart.data.labels.push(newDataLabel);
    chart.data.datasets[0].data.push(newDataValue);

    if (chart.data.labels.length > this.maxChartDataPoints) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update("none"); // 'none' for no animation, or 'quiet'
  }

  _updateMultiLineChart(chart, newDataLabel, newValuesArray) {
    // newValuesArray is an array of values for each dataset
    if (!chart) return;
    chart.data.labels.push(newDataLabel);
    chart.data.datasets.forEach((dataset, index) => {
      dataset.data.push(newValuesArray[index]);
      if (dataset.data.length > this.maxChartDataPoints) {
        dataset.data.shift();
      }
    });

    if (chart.data.labels.length > this.maxChartDataPoints) {
      chart.data.labels.shift();
    }
    chart.update("none");
  }

  // updateCpuChart, updateGpuCharts, updateNetworkChart, updateStatsDisplay, updateDownloadHistoryDisplay
  // will be replaced by updateUIWithData or their logic incorporated into it.

  getHTML() {
    return `
            <div id="overview-page">
                <h2>System Overview</h2>

                <div class="overview-section" id="system-info-section">
                    <h3>System Information</h3>
                    <p><strong>OS:</strong> <span id="sysinfo-os">N/A</span></p>
                    <p><strong>Hostname:</strong> <span id="sysinfo-hostname">N/A</span></p>
                    <p><strong>Uptime:</strong> <span id="sysinfo-uptime">N/A</span></p>
                </div>

                <div class="overview-section-container">
                    <div class="overview-section" id="disk-usage-section">
                        <h3>Disk Usage</h3>
                        <table class="data-table" id="disk-usage-table">
                            <thead><tr><th>Filesystem</th><th>Total</th><th>Used</th><th>Free</th><th>Mount Point</th></tr></thead>
                            <tbody><!-- Data will be injected by updateUIWithData --></tbody>
                        </table>
                    </div>
                    <div class="overview-section" id="task-section">
                        <div class="chart-container" style="height: 300px; max-width: 300px; margin: 15px auto;">
                            <canvas id="taskExecutionChart"></canvas>
                        </div>
                         <p style="text-align: center; margin-top: 5px;">Total Tasks Executed: <span id="total-tasks-executed">N/A</span></p>
                    </div>
                </div>
                <div class="overview-section" id="cpu-usage-section">
                    <h3>CPU Usage</h3>
                    <div class="chart-container" style="height:250px; width:100%; margin-bottom: 10px;">
                        <canvas id="cpuUsageChart"></canvas>
                    </div>
                    <div id="cpu-core-bars-container">
                        <!-- Per-core bars will be populated by updateUIWithData -->
                    </div>
                    <p><strong>Logical Cores:</strong> <span id="cpu-logical-cores">N/A</span></p>
                    <p><strong>Physical Cores:</strong> <span id="cpu-physical-cores">N/A</span></p>
                </div>

                <div class="overview-section" id="gpu-usage-section">
                    <h3>GPU Usage</h3>
                    <div id="gpu-charts-container">
                        <!-- GPU Canvases will be added here by JS or updateUIWithData -->
                    </div>
                    <div id="gpu-usage-tables-container" style="margin-top:15px;">
                        <!-- GPU tables will be populated by updateUIWithData -->
                    </div>
                </div>

                <div class="overview-section" id="network-usage-section">
                    <h3>Network Usage</h3>
                    <div class="chart-container" style="height:250px; width:100%; margin-bottom: 10px;">
                        <canvas id="networkUsageChart"></canvas>
                    </div>
                    <table class="data-table" id="network-interfaces-table">
                        <thead><tr><th>Interface</th><th>Upload Speed</th><th>Download Speed</th><th>Data Sent</th><th>Data Received</th></tr></thead>
                        <tbody><!-- Data will be injected by updateUIWithData --></tbody>
                    </table>
                </div>

                <div class="overview-section" id="stats-section">
                    <h3>User Statistics</h3>
                    <div class="chart-container" style="height: 250px; margin-bottom: 15px;">
                        <canvas id="onlineUsersChart"></canvas>
                    </div>
                </div>

                <!-- <div class="overview-section" id="download-history-section">
                    <h3>Download Task History</h3>
                    <table class="data-table" id="download-history-table">
                        <thead><tr><th>ID</th><th>File Name</th><th>Source</th><th>Status</th><th>Timestamp</th><th>Size</th><th>Progress</th></tr></thead>
                        <tbody></tbody>
                    </table>
                </div> -->
            </div>
        `;
  }

  onLoad(mainContentElement, subPageId, appState, managers) {
    this.mainContentElement = mainContentElement;
    window.overviewPageModuleInstance = this; // Expose instance for testing
    console.log(managers);
    this.websocketManager = managers.webSocketManager;
    // Initialize charts with empty data
    this._initCpuChart(mainContentElement);
    this._initGpuCharts(mainContentElement, []); // Pass empty array for initial GPU data
    this._initNetworkChart(mainContentElement);
    this._initOnlineUsersChart(mainContentElement);
    this._initTaskExecutionChart(mainContentElement);

    // Initial data fetch
    this.fetchSystemOverviewData();

    // Setup periodic updates
    const updateIntervalSeconds = 5; // e.g., every 5 seconds
    this.dataUpdateInterval = setInterval(
      () => this.fetchSystemOverviewData(),
      updateIntervalSeconds * 1000
    );
    this.updateIntervals.push(this.dataUpdateInterval);
  }

  // Chart Initialization Methods
  _initCpuChart(mainContentElement) {
    const canvasElement = mainContentElement
      .querySelector("#cpuUsageChart");
    if (canvasElement.chartInstance) {
      canvasElement.chartInstance.destroy(); // 销毁旧实例
    }
    const cpuCtx = canvasElement
      .getContext("2d");
    if(this.charts.cpuUsageChart) this.charts.cpuUsageChart.destroy();
    this.charts.cpuUsageChart = new Chart(cpuCtx, {
      type: "line",
      data: {
        labels: [], // Time labels - will be populated by updates
        datasets: [
          {
            label: "CPU Load %",
            data: [], // CPU load data - will be populated by updates
            borderColor: this.chartThemeColors.cpuLineColor,
            backgroundColor: this.chartThemeColors.cpuFillColor,
            tension: 0.2,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: { color: this.chartThemeColors.ticksColor },
            grid: { color: this.chartThemeColors.gridColor },
          },
          x: {
            ticks: { color: this.chartThemeColors.ticksColor },
            grid: { color: this.chartThemeColors.gridColor },
          },
        },
        plugins: {
          legend: { labels: { color: this.chartThemeColors.legendColor } },
          tooltip: {
            backgroundColor: this.chartThemeColors.tooltipBackgroundColor,
            titleColor: this.chartThemeColors.tooltipTitleColor,
            bodyColor: this.chartThemeColors.tooltipBodyColor,
          },
        },
      },
    });
  }

  _initGpuCharts(mainContentElement, gpuDataArray) {
    // gpuDataArray for initial setup if needed, otherwise pass []
    const gpuChartsContainer = mainContentElement.querySelector(
      "#gpu-charts-container"
    );
    gpuChartsContainer.innerHTML = ""; // Clear previous charts if any during re-init or dynamic add/remove
    this.charts.gpuCharts = {}; // Reset

    gpuDataArray.forEach((gpu, index) => {
      const canvasId = `gpuUsageChart_${index}`;
      let canvas = mainContentElement.querySelector(`#${canvasId}`);
      if (!canvas) {
        const chartContainerDiv = document.createElement("div");
        chartContainerDiv.className = "chart-container";
        chartContainerDiv.style.width = "100%";
        chartContainerDiv.style.marginBottom = "10px";
        // Set a fixed height for individual GPU chart containers for consistency.
        // This can also be done via CSS for `.gpu-charts-container .chart-container`
        chartContainerDiv.style.height = "180px";

        canvas = document.createElement("canvas");
        canvas.id = canvasId;
        chartContainerDiv.appendChild(canvas);
        gpuChartsContainer.appendChild(chartContainerDiv);
      }

      const gpuCtx = canvas.getContext("2d");
      this.charts.gpuCharts[canvasId] = new Chart(gpuCtx, {
        type: "line",
        data: {
          labels: [], // Time labels - populated by updates
          datasets: [
            {
              label: `${gpu.name || "GPU " + index} Utilization %`, // Use name if available
              data: [], // Utilization data - populated by updates
              borderColor: this.chartThemeColors.gpuLineColor,
              backgroundColor: this.chartThemeColors.gpuFillColor,
              tension: 0.2,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              min: 0,
              max: 100,
              ticks: { color: this.chartThemeColors.ticksColor },
              grid: { color: this.chartThemeColors.gridColor },
            },
            x: {
              ticks: { color: this.chartThemeColors.ticksColor },
              grid: { color: this.chartThemeColors.gridColor },
            },
          },
          plugins: {
            legend: {
              display: true,
              labels: {
                color: this.chartThemeColors.legendColor,
                boxWidth: 20,
              },
              position: "top",
            },
            tooltip: {
              backgroundColor: this.chartThemeColors.tooltipBackgroundColor,
              titleColor: this.chartThemeColors.tooltipTitleColor,
              bodyColor: this.chartThemeColors.tooltipBodyColor,
            },
          },
        },
      });
    });
    if (gpuDataArray.length === 0) {
      gpuChartsContainer.innerHTML =
        '<p style="text-align:center; color: var(--text-secondary)">No GPU data available.</p>';
    }
  }

  _initNetworkChart(mainContentElement) {
    const networkCtx = mainContentElement
      .querySelector("#networkUsageChart")
      .getContext("2d");
    if(this.charts.networkUsageChart) this.charts.networkUsageChart.destroy();
    this.charts.networkUsageChart = new Chart(networkCtx, {
      type: "line",
      data: {
        labels: [], // Time labels - populated by updates
        datasets: [
          {
            label: "Upload Speed (Mbps)",
            data: [], // Upload data - populated by updates
            borderColor: this.chartThemeColors.networkUploadLineColor,
            backgroundColor: this.chartThemeColors.networkUploadFillColor,
            tension: 0.2,
            fill: true,
          },
          {
            label: "Download Speed (Mbps)",
            data: [], // Download data - populated by updates
            borderColor: this.chartThemeColors.networkDownloadLineColor,
            backgroundColor: this.chartThemeColors.networkDownloadFillColor,
            tension: 0.2,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            ticks: { color: this.chartThemeColors.ticksColor },
            grid: { color: this.chartThemeColors.gridColor },
          }, // Max will be auto for Y axis
          x: {
            ticks: { color: this.chartThemeColors.ticksColor },
            grid: { color: this.chartThemeColors.gridColor },
          },
        },
        plugins: {
          legend: { labels: { color: this.chartThemeColors.legendColor } },
          tooltip: {
            backgroundColor: this.chartThemeColors.tooltipBackgroundColor,
            titleColor: this.chartThemeColors.tooltipTitleColor,
            bodyColor: this.chartThemeColors.tooltipBodyColor,
          },
        },
      },
    });
  }

  _initOnlineUsersChart(mainContentElement) {
    const onlineUsersCtx = mainContentElement
      .querySelector("#onlineUsersChart")
      .getContext("2d");
    if ( this.charts.onlineUsersChart) this.charts.onlineUsersChart.destroy();
    this.charts.onlineUsersChart = new Chart(onlineUsersCtx, {
      type: "line",
      data: {
        labels: [], // Time labels - populated by updates
        datasets: [
          {
            label: "Online Users",
            data: [], // User count data - populated by updates
            borderColor: this.chartThemeColors.onlineUsersLineColor,
            backgroundColor: this.chartThemeColors.onlineUsersFillColor,
            fill: true,
            tension: 0.2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: { color: this.chartThemeColors.legendColor },
          },
          tooltip: {
            backgroundColor: this.chartThemeColors.tooltipBackgroundColor,
            titleColor: this.chartThemeColors.tooltipTitleColor,
            bodyColor: this.chartThemeColors.tooltipBodyColor,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: this.chartThemeColors.gridColor },
            ticks: { color: this.chartThemeColors.ticksColor, stepSize: 10 }, // Adjust stepSize as needed
          },
          x: {
            grid: { color: this.chartThemeColors.gridColor },
            ticks: { color: this.chartThemeColors.ticksColor },
          },
        },
      },
    });
  }

  _initTaskExecutionChart(mainContentElement) {
    const taskCtx = mainContentElement
      .querySelector("#taskExecutionChart")
      .getContext("2d");
    if(this.charts.taskExecutionChart)  this.charts.taskExecutionChart.destroy();
    this.charts.taskExecutionChart = new Chart(taskCtx, {
      type: "doughnut",
      data: {
        labels: ["Successful", "Failed", "Running"],
        datasets: [
          {
            label: "Task Status",
            data: [0, 0, 0], // Initial empty data, populated by updates
            backgroundColor: [
              this.chartThemeColors.taskSuccessfulColor,
              this.chartThemeColors.taskFailedColor,
              this.chartThemeColors.taskRunningColor,
            ],
            borderColor: [
              this.chartThemeColors.taskSuccessfulBorderColor,
              this.chartThemeColors.taskFailedBorderColor,
              this.chartThemeColors.taskRunningBorderColor,
            ],
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          animateScale: true,
          animateRotate: true,
        },
        plugins: {
          legend: {
            display: true,
            position: "bottom",
            labels: { color: this.chartThemeColors.legendColor },
          },
          tooltip: {
            backgroundColor: this.chartThemeColors.tooltipBackgroundColor,
            titleColor: this.chartThemeColors.tooltipTitleColor,
            bodyColor: this.chartThemeColors.tooltipBodyColor,
            callbacks: {
              label: function (context) {
                let label = context.label || "";
                if (label) {
                  label += ": ";
                }
                if (context.parsed !== null) {
                  label += context.parsed;
                  const total = context.dataset.data.reduce(
                    (acc, value) => acc + value,
                    0
                  );
                  if (total > 0) {
                    const percentage =
                      ((context.parsed / total) * 100).toFixed(1) + "%";
                    label += ` (${percentage})`;
                  }
                }
                return label;
              },
            },
          },
          // Title is removed from here, will be handled by a separate HTML element if needed
          // or dynamically set in updateUIWithData if chart title needs to be data-driven.
        },
      },
    });
  }

  // updateOnlineUsersChart and updateTaskExecutionChart will be effectively replaced by updateUIWithData logic.

  async fetchSystemOverviewData() {
    if (!this.websocketManager) {
      console.error("this.websocketManager not initialized");
      // Optionally, display an error to the user on the UI
      // For example, by setting a state that getHTML() can use to show an error message.
      return;
    }
    try {
      const data = await this.websocketManager.sendWebSocketCommand(
        "get_system_overview",
        {}
      );
      if (data) {
        this.updateUIWithData(data);
      } else {
        console.warn(
          "Received null or undefined data from get_system_overview"
        );
        // Handle cases where data might be unexpectedly null/undefined
        // For example, show a "No data received" or "Error fetching data" message.
      }
    } catch (error) {
      console.error("Error fetching system overview data:", error);
      // Display a user-friendly error message on the page
      if (this.mainContentElement) {
        const errorDisplay =
          this.mainContentElement.querySelector("#system-info-os") || // pick a prominent spot
          this.mainContentElement.querySelector("h2");
        if (errorDisplay) {
          errorDisplay.textContent = "Error fetching system data. Retrying...";
        }
      }
    }
  }

  updateUIWithData(data) {
    if (!this.mainContentElement || !data || data.code !== 0) {
      console.warn(
        "Skipping UI update: main content element or data not available.",
        { mainElement: this.mainContentElement, dataAvailable: !!data }
      );
      return;
    }
    data = data.data;
    const now = new Date().toLocaleTimeString().split(" ")[0]; // hh:mm:ss for chart updates

    // System Info
    if (data.systemInfo) {
      const osEl = this.mainContentElement.querySelector("#sysinfo-os");
      if (osEl) osEl.textContent = data.systemInfo.os || "N/A";
      const hostnameEl =
        this.mainContentElement.querySelector("#sysinfo-hostname");
      if (hostnameEl)
        hostnameEl.textContent = data.systemInfo.hostname || "N/A";
      const uptimeEl = this.mainContentElement.querySelector("#sysinfo-uptime");
      if (uptimeEl) uptimeEl.textContent = data.systemInfo.uptime || "N/A";
    }

    // Disk Usage
    if (data.diskUsage) {
      const diskUsageTableBody = this.mainContentElement.querySelector(
        "#disk-usage-table tbody"
      );
      if (diskUsageTableBody) {
        diskUsageTableBody.innerHTML = ""; // Clear existing rows
        data.diskUsage.forEach((disk) => {
          const row = diskUsageTableBody.insertRow();
          row.insertCell().textContent = disk.filesystem;
          row.insertCell().textContent = disk.total;
          row.insertCell().textContent = disk.used;
          row.insertCell().textContent = disk.free;
          row.insertCell().textContent = disk.mountPoint;
        });
      }
    }

    // CPU Usage
    if (data.cpuUsage) {
      // Update CPU Load Chart
      if (
        this.charts.cpuUsageChart &&
        data.cpuUsage.currentLoad !== undefined
      ) {
        this._updateLineChart(
          this.charts.cpuUsageChart,
          now,
          data.cpuUsage.currentLoad
        );
      }

      // Update Per-Core Progress Bars
      const cpuCoreBarsContainer = this.mainContentElement.querySelector(
        "#cpu-core-bars-container"
      );
      if (cpuCoreBarsContainer) {
        cpuCoreBarsContainer.innerHTML = ""; // Clear existing bars
        if (data.cpuUsage.cores && data.cpuUsage.cores.length > 0) {
          data.cpuUsage.cores.forEach((core) => {
            const coreBarContainer = document.createElement("div");
            coreBarContainer.className = "progress-bar-container";
            coreBarContainer.title = `Core ${core.core}: ${core.load}%`;
            const coreBar = document.createElement("div");
            coreBar.className = "progress-bar";
            coreBar.style.width = `${core.load}%`;
            coreBar.textContent = `Core ${core.core}: ${core.load}%`;
            coreBarContainer.appendChild(coreBar);
            cpuCoreBarsContainer.appendChild(coreBarContainer);
          });
        } else {
          cpuCoreBarsContainer.innerHTML =
            '<p style="text-align:center; color: var(--text-secondary)">No per-core data available.</p>';
        }
      }
      const logicalCoresEl =
        this.mainContentElement.querySelector("#cpu-logical-cores");
      if (logicalCoresEl)
        logicalCoresEl.textContent = data.cpuUsage.logicalCores || "N/A";
      const physicalCoresEl = this.mainContentElement.querySelector(
        "#cpu-physical-cores"
      );
      if (physicalCoresEl)
        physicalCoresEl.textContent = data.cpuUsage.physicalCores || "N/A";
    }

    // GPU Usage
    const gpuChartsContainer = this.mainContentElement.querySelector(
      "#gpu-charts-container"
    );
    const gpuUsageTablesContainer = this.mainContentElement.querySelector(
      "#gpu-usage-tables-container"
    );

    if (gpuChartsContainer) gpuChartsContainer.innerHTML = ""; // Clear previous content
    if (gpuUsageTablesContainer) gpuUsageTablesContainer.innerHTML = ""; // Clear previous content

    if (data.gpuUsage && data.gpuUsage.length > 0) {
      // Re-initialize GPU charts with new data structure (if GPU count changes) or update existing ones.
      // For simplicity, we can re-initialize if the number of GPUs has changed.
      // A more optimized approach would be to match by ID if available.
      if (Object.keys(this.charts.gpuCharts).length !== data.gpuUsage.length) {
        this._initGpuCharts(this.mainContentElement, data.gpuUsage); // Re-init if count differs
      }

      data.gpuUsage.forEach((gpu, index) => {
        const chartId = `gpuUsageChart_${index}`;
        const chart = this.charts.gpuCharts[chartId];
        if (chart && gpu.utilization !== undefined) {
          this._updateLineChart(chart, now, gpu.utilization);
        } else if (!chart) {
          // If chart wasn't initialized (e.g. dynamic add), initialize it.
          // This assumes _initGpuCharts can handle being called with a single GPU object or needs adjustment.
          // For now, we rely on the check above that re-initializes all on count change.
          console.warn(`GPU chart ${chartId} not found for update.`);
        }

        // Populate GPU Info Table
        if (gpuUsageTablesContainer) {
          const gpuTable = document.createElement("table");
          gpuTable.className = "data-table gpu-specific-table";
          gpuTable.innerHTML = `
                    <caption>${gpu.name || `GPU ${index}`} (${
            gpu.id || "N/A"
          }) - Details</caption>
                    <thead><tr><th>Metric</th><th>Value</th></tr></thead>
                    <tbody>
                        <tr><td>Memory Total</td><td>${
                          gpu.memoryTotal || "N/A"
                        }</td></tr>
                        <tr><td>Memory Used</td><td>${
                          gpu.memoryUsed || "N/A"
                        }</td></tr>
                        <tr><td class="gpu-temperature-label">Temperature</td><td>${
                          gpu.temperature !== undefined
                            ? gpu.temperature + "°C"
                            : "N/A"
                        }</td></tr>
                        <tr><td>Power Draw</td><td>${
                          gpu.powerDraw !== undefined
                            ? gpu.powerDraw + "W"
                            : "N/A"
                        }</td></tr>
                    </tbody>
                `;
          gpuUsageTablesContainer.appendChild(gpuTable);
        }
      });
    } else {
      if (gpuChartsContainer)
        gpuChartsContainer.innerHTML =
          '<p style="text-align:center; color: var(--text-secondary)">No GPU data available.</p>';
      if (gpuUsageTablesContainer) gpuUsageTablesContainer.innerHTML = ""; // Clear if it had content
    }

    // Network Usage
    if (data.networkUsage) {
      if (
        this.charts.networkUsageChart &&
        data.networkUsage.uploadSpeed !== undefined &&
        data.networkUsage.downloadSpeed !== undefined
      ) {
        this._updateMultiLineChart(this.charts.networkUsageChart, now, [
          data.networkUsage.uploadSpeed,
          data.networkUsage.downloadSpeed,
        ]);
      }

      const networkInterfacesTableBody = this.mainContentElement.querySelector(
        "#network-interfaces-table tbody"
      );
      if (networkInterfacesTableBody) {
        networkInterfacesTableBody.innerHTML = ""; // Clear existing rows
        if (
          data.networkUsage.interfaces &&
          data.networkUsage.interfaces.length > 0
        ) {
          data.networkUsage.interfaces.forEach((iface) => {
            const row = networkInterfacesTableBody.insertRow();
            row.insertCell().textContent = iface.name;
            row.insertCell().textContent = `${iface.uploadSpeed} Mbps`; // Assuming speed is in Mbps from backend
            row.insertCell().textContent = `${iface.downloadSpeed} Mbps`;
            row.insertCell().textContent = iface.dataSent;
            row.insertCell().textContent = iface.dataReceived;
          });
        } else {
          const row = networkInterfacesTableBody.insertRow();
          const cell = row.insertCell();
          cell.colSpan = 5;
          cell.textContent = "No network interface data available.";
          cell.style.textAlign = "center";
        }
      }
    }

    // User & Task Stats
    if (data.userAndTaskStats) {
      const stats = data.userAndTaskStats;
      // Update Online Users Chart
      if (this.charts.onlineUsersChart && stats.onlineUsers !== undefined) {
        this._updateLineChart(
          this.charts.onlineUsersChart,
          now,
          stats.onlineUsers
        );
      }

      // Update Task Execution Donut Chart
      if (this.charts.taskExecutionChart) {
        this.charts.taskExecutionChart.data.datasets[0].data = [
          stats.successfulTasks || 0,
          stats.failedTasks || 0,
          stats.runningTasks || 0,
        ];
        this.charts.taskExecutionChart.update("none");
      }

      const totalTasksEl = this.mainContentElement.querySelector(
        "#total-tasks-executed"
      );
      if (totalTasksEl)
        totalTasksEl.textContent = stats.totalTasksExecuted || "0";
    }

    // Download Task History
    if (data.downloadTaskHistory) {
      const downloadHistoryTableBody = this.mainContentElement.querySelector(
        "#download-history-table tbody"
      );
      if (downloadHistoryTableBody) {
        downloadHistoryTableBody.innerHTML = ""; // Clear existing rows
        if (data.downloadTaskHistory.length > 0) {
          data.downloadTaskHistory.forEach((task) => {
            const row = downloadHistoryTableBody.insertRow();
            row.insertCell().textContent = task.id;
            row.insertCell().textContent = task.fileName;
            row.insertCell().textContent = task.source;
            row.insertCell().textContent = task.status;
            row.insertCell().textContent = task.timestamp; // Assuming timestamp is a string
            row.insertCell().textContent = task.size;

            const progressCell = row.insertCell();
            const progressContainer = document.createElement("div");
            progressContainer.className = "progress-bar-container";
            const progressBar = document.createElement("div");
            progressBar.className = "progress-bar";
            const progressPercent = parseFloat(task.progress); // Assuming progress is a number 0-100
            progressBar.style.width = `${progressPercent}%`;
            progressBar.textContent = `${progressPercent}%`;

            if (task.status === "Completed")
              progressBar.style.backgroundColor =
                "var(--success-color, #28a745)";
            else if (task.status === "Failed")
              progressBar.style.backgroundColor = "var(--error-color, #dc3545)";
            else progressBar.style.backgroundColor = "var(--accent-color)";

            progressContainer.appendChild(progressBar);
            progressCell.appendChild(progressContainer);
          });
        } else {
          const row = downloadHistoryTableBody.insertRow();
          const cell = row.insertCell();
          cell.colSpan = 7; // Number of columns in the table
          cell.textContent = "No download task history available.";
          cell.style.textAlign = "center";
        }
      }
    }
  }
}

export default OverviewPage;
