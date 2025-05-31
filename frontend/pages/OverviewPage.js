class OverviewPage {
    constructor() {
        this.mockData = {
            diskUsage: [
                { filesystem: '/dev/sda1', total: '100GB', used: '50GB', free: '50GB', mountPoint: '/' },
                { filesystem: '/dev/sdb1', total: '1TB', used: '250GB', free: '750GB', mountPoint: '/data' },
            ],
            cpuUsage: {
                currentLoad: '45%', // Example overall load
                cores: [ // Optional: individual core loads
                    { core: 1, load: '60%' },
                    { core: 2, load: '30%' },
                ]
            },
            gpuUsage: [
                {
                    id: 'GPU 0',
                    name: 'NVIDIA GeForce RTX 3080',
                    utilization: '75%',
                    memoryTotal: '10GB',
                    memoryUsed: '4GB',
                    temperature: '65°C',
                    powerDraw: '200W'
                },
                {
                    id: 'GPU 1',
                    name: 'AMD Radeon RX 6800',
                    utilization: '50%',
                    memoryTotal: '16GB',
                    memoryUsed: '6GB',
                    temperature: '55°C',
                    powerDraw: '180W'
                }
            ],
            networkUsage: {
                uploadSpeed: '15 Mbps',
                downloadSpeed: '100 Mbps',
                interfaces: [
                    { name: 'eth0', upload: '10 Mbps', download: '80 Mbps', dataSent: '5GB', dataReceived: '50GB' },
                    { name: 'wlan0', upload: '5 Mbps', download: '20 Mbps', dataSent: '1GB', dataReceived: '10GB' },
                ]
            },
            userAndTaskStats: {
                onlineUsers: 5,
                totalTasksExecuted: 1500,
                successfulTasks: 1450,
                failedTasks: 40,
                runningTasks: 10,
            },
            downloadTaskHistory: [
                { id: 'task123', fileName: 'ubuntu.iso', source: 'HTTP', status: 'Completed', timestamp: '2023-10-26 10:00', size: '4.5GB', progress: '100%' },
                { id: 'task124', fileName: 'large_dataset.zip', source: 'FTP', status: 'Downloading', timestamp: '2023-10-26 10:05', size: '10GB', progress: '65%' },
                { id: 'task125', fileName: 'project_files.tar.gz', source: 'SFTP', status: 'Failed', timestamp: '2023-10-26 09:30', size: '1.2GB', progress: '0%' },
            ]
        };
        this.dynamicMockData = null; // Will be a deep copy of mockData
        this.updateIntervals = []; // To store interval IDs
        this.mainContentElement = null; // To store mainContentElement for updates
        this.charts = { gpuCharts: {} }; // Initialize gpuCharts as an object
        this.maxChartDataPoints = 30; // Max data points for line charts

        const isDark = document.body.classList.contains('dark-theme');
        this.chartThemeColors = {
            gridColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
            ticksColor: isDark ? '#b0b0b0' : '#555', // Lighter grey for dark, darker for light
            legendColor: isDark ? '#e0e0e0' : '#333',
            tooltipBackgroundColor: isDark ? 'rgba(28, 28, 28, 0.92)' : 'rgba(250, 250, 250, 0.92)',
            tooltipTitleColor: isDark ? '#e8e8e8' : '#2c2c2c',
            tooltipBodyColor: isDark ? '#d8d8d8' : '#4c4c4c',

            // Static dataset colors (can be used directly or made theme-dependent if desired)
            // Using slightly more vibrant and distinct colors
            cpuLineColor: 'rgba(54, 162, 235, 1)',    // Blue
            cpuFillColor: 'rgba(54, 162, 235, 0.2)',

            gpuLineColor: 'rgba(255, 99, 132, 1)',     // Red
            gpuFillColor: 'rgba(255, 99, 132, 0.2)',

            networkUploadLineColor: 'rgba(75, 192, 192, 1)', // Teal
            networkUploadFillColor: 'rgba(75, 192, 192, 0.2)',

            networkDownloadLineColor: 'rgba(153, 102, 255, 1)', // Purple
            networkDownloadFillColor: 'rgba(153, 102, 255, 0.2)',
        };
    }

    // Deep copies an object
    _deepCopy(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    startDynamicDataUpdates() {
        this.dynamicMockData = this._deepCopy(this.mockData);

        const generalUpdateInterval = setInterval(() => {
            // CPU Usage
            let newCpuLoad = Math.floor(Math.random() * 80) + 10; // 10-89%
            this.dynamicMockData.cpuUsage.currentLoad = newCpuLoad + "%";
            this.dynamicMockData.cpuUsage.cores.forEach(core => {
                // Ensure load is a string with '%'
                core.load = Math.max(5, Math.min(95, Math.floor(Math.random() * 50 + newCpuLoad * 0.25))) + "%";
            });

            // GPU Usage
            this.dynamicMockData.gpuUsage.forEach(gpu => {
                gpu.utilization = (Math.floor(Math.random() * 70) + 10) + "%"; // 10-79%
                let currentTemp = parseInt(gpu.temperature); // Use parseInt without radix for simplicity here
                gpu.temperature = (Math.floor(Math.random() * 10) - 5 + currentTemp) + "°C"; // Fluctuate by +/- 5°C
                gpu.temperature = Math.max(30, Math.min(95, parseInt(gpu.temperature))) + "°C"; // Keep in reasonable bounds
            });

            // Network Usage
            this.dynamicMockData.networkUsage.uploadSpeed = (Math.random() * 20 + 1).toFixed(1) + " Mbps"; // 1.0 - 20.9 Mbps
            this.dynamicMockData.networkUsage.downloadSpeed = (Math.random() * 150 + 5).toFixed(1) + " Mbps"; // 5.0 - 154.9 Mbps
            // Interface data is static in this example, no need to update table rows dynamically unless new interfaces appear

            // User & Task Statistics
            this.dynamicMockData.userAndTaskStats.totalTasksExecuted += Math.floor(Math.random() * 5) + 1;
            if (Math.random() < 0.8) { // 80% chance of success
                this.dynamicMockData.userAndTaskStats.successfulTasks++;
            } else {
                this.dynamicMockData.userAndTaskStats.failedTasks++;
            }
            // Simulate running tasks fluctuation
            this.dynamicMockData.userAndTaskStats.runningTasks = Math.max(0, this.dynamicMockData.userAndTaskStats.runningTasks + (Math.floor(Math.random() * 3) -1)); // +-1 or 0


            // Update UI elements (basic example, full re-render or chart updates would be more complex)
            this.updateCpuDisplay();
            this.updateCpuChart(); // Update CPU chart
            this.updateGpuCharts(); // Update GPU charts
            this.updateNetworkChart(); // Update Network chart
            this.updateStatsDisplay(); // User & Task stats still direct DOM
        }, 2500); // Update every 2.5 seconds

        this.updateIntervals.push(generalUpdateInterval);

        const downloadTaskInterval = setInterval(() => {
            const downloadingTasks = this.dynamicMockData.downloadTaskHistory.filter(task => task.status === 'Downloading');
            if (downloadingTasks.length > 0) {
                const taskToUpdate = downloadingTasks[Math.floor(Math.random() * downloadingTasks.length)];
                let currentProgress = parseInt(taskToUpdate.progress);
                currentProgress += Math.floor(Math.random() * 10) + 5; // Increment progress
                if (currentProgress >= 100) {
                    taskToUpdate.progress = '100%';
                    taskToUpdate.status = 'Completed';
                } else {
                    taskToUpdate.progress = currentProgress + '%';
                }
            } else if (Math.random() < 0.1) { // 10% chance to add a new dummy task if no tasks are downloading
                const newTaskId = 'task' + (this.dynamicMockData.downloadTaskHistory.length + 100 + Math.floor(Math.random()*1000));
                const newDummyTask = {
                    id: newTaskId,
                    fileName: `new_file_${Math.floor(Math.random()*100)}.zip`,
                    source: 'HTTP', status: 'Downloading',
                    timestamp: new Date().toLocaleTimeString(), // Simple timestamp
                    size: (Math.random()*20+1).toFixed(1)+'GB',
                    progress: (Math.floor(Math.random()*20))+'%'
                };
                this.dynamicMockData.downloadTaskHistory.unshift(newDummyTask); // Add to top
                if(this.dynamicMockData.downloadTaskHistory.length > 10) { // Keep history size manageable
                    this.dynamicMockData.downloadTaskHistory.pop();
                }
            }
            this.updateDownloadHistoryDisplay();
        }, 3000); // Update download tasks every 3 seconds

        this.updateIntervals.push(downloadTaskInterval);
    }

    onUnload() {
        this.updateIntervals.forEach(intervalId => clearInterval(intervalId));
        this.updateIntervals = [];

        // Destroy general charts
        ['cpuUsageChart', 'networkUsageChart'].forEach(chartName => {
            if (this.charts[chartName] && typeof this.charts[chartName].destroy === 'function') {
                this.charts[chartName].destroy();
            }
        });

        // Destroy GPU charts
        Object.values(this.charts.gpuCharts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });

        this.charts = { gpuCharts: {} }; // Reset charts object

        if (window.overviewPageModuleInstance === this) {
            delete window.overviewPageModuleInstance;
        }
        console.log("OverviewPage unloaded, dynamic updates stopped and charts destroyed.");
    }

    // Chart update methods
    _updateLineChart(chart, newDataLabel, newDataValue) {
        if (!chart) return;
        chart.data.labels.push(newDataLabel);
        chart.data.datasets[0].data.push(newDataValue);

        if (chart.data.labels.length > this.maxChartDataPoints) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }
        chart.update('none'); // 'none' for no animation, or 'quiet'
    }

    _updateMultiLineChart(chart, newDataLabel, newValuesArray) { // newValuesArray is an array of values for each dataset
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
        chart.update('none');
    }


    updateCpuChart() {
        const now = new Date().toLocaleTimeString().split(" ")[0]; // hh:mm:ss
        const load = parseFloat(this.dynamicMockData.cpuUsage.currentLoad);
        this._updateLineChart(this.charts.cpuUsageChart, now, load);

        // Update per-core progress bars (if still desired alongside chart)
        const cpuCoreBarsContainer = this.mainContentElement.querySelector('#cpu-core-bars-container');
        if (cpuCoreBarsContainer) {
            this.dynamicMockData.cpuUsage.cores.forEach((core, index) => {
                const allCoreBars = cpuCoreBarsContainer.querySelectorAll('.progress-bar');
                if (allCoreBars[index]) {
                    allCoreBars[index].style.width = core.load;
                    allCoreBars[index].textContent = `Core ${core.core}: ${core.load}`;
                     if(allCoreBars[index].parentElement) {
                        allCoreBars[index].parentElement.title = `Core ${core.core}: ${core.load}`;
                    }
                }
            });
        }
    }

    updateGpuCharts() {
        const now = new Date().toLocaleTimeString().split(" ")[0];
        this.dynamicMockData.gpuUsage.forEach((gpuData, index) => {
            const chart = this.charts.gpuCharts[`gpuUsageChart_${index}`]; // Access through gpuCharts
            const utilization = parseFloat(gpuData.utilization);
            this._updateLineChart(chart, now, utilization);

            // Update temperature in the table if it's still there
            const gpuTable = this.mainContentElement.querySelectorAll('.data-table.gpu-specific-table')[index];
            if (gpuTable) {
                 const tempCell = gpuTable.querySelector('tbody tr:nth-child(4) td:last-child');
                 if (tempCell) tempCell.textContent = gpuData.temperature;
            }
        });
    }

    updateNetworkChart() {
        const now = new Date().toLocaleTimeString().split(" ")[0];
        const uploadSpeed = parseFloat(this.dynamicMockData.networkUsage.uploadSpeed);
        const downloadSpeed = parseFloat(this.dynamicMockData.networkUsage.downloadSpeed);
        this._updateMultiLineChart(this.charts.networkUsageChart, now, [uploadSpeed, downloadSpeed]);

        // Update interface table if needed (e.g., dataSent/Received)
        const networkInterfacesTableBody = this.mainContentElement.querySelector('#network-interfaces-table tbody');
        if (networkInterfacesTableBody) {
            this.dynamicMockData.networkUsage.interfaces.forEach((ifaceData, index) => {
                const row = networkInterfacesTableBody.rows[index];
                if (row) {
                    // row.cells[1].textContent = ifaceData.upload; // These are now in the chart
                    // row.cells[2].textContent = ifaceData.download;
                    row.cells[3].textContent = ifaceData.dataSent;
                    row.cells[4].textContent = ifaceData.dataReceived;
                }
            });
        }
    }

    updateStatsDisplay() { // This one remains as direct DOM update
        if (!this.mainContentElement) return;
        const stats = this.dynamicMockData.userAndTaskStats;
        const onlineUsersEl = this.mainContentElement.querySelector('#online-users-count');
        if (onlineUsersEl) onlineUsersEl.textContent = stats.onlineUsers;
        const totalTasksEl = this.mainContentElement.querySelector('#total-tasks-executed');
        if (totalTasksEl) totalTasksEl.textContent = stats.totalTasksExecuted;
        const successfulTasksEl = this.mainContentElement.querySelector('#successful-tasks-count');
        if (successfulTasksEl) successfulTasksEl.textContent = stats.successfulTasks;
        const failedTasksEl = this.mainContentElement.querySelector('#failed-tasks-count');
        if (failedTasksEl) failedTasksEl.textContent = stats.failedTasks;
        const runningTasksEl = this.mainContentElement.querySelector('#running-tasks-count');
        if (runningTasksEl) runningTasksEl.textContent = stats.runningTasks;
    }

    updateDownloadHistoryDisplay() {
        if (!this.mainContentElement) return;
        const downloadHistoryTableBody = this.mainContentElement.querySelector('#download-history-table tbody');
        if (!downloadHistoryTableBody) return;

        // For simplicity, re-rendering the whole table body for now.
        // A more optimized version would update specific rows/cells.
        downloadHistoryTableBody.innerHTML = ''; // Clear existing rows
        this.dynamicMockData.downloadTaskHistory.forEach(task => {
            const row = downloadHistoryTableBody.insertRow();
            row.insertCell().textContent = task.id;
            row.insertCell().textContent = task.fileName;
            row.insertCell().textContent = task.source;
            row.insertCell().textContent = task.status;
            row.insertCell().textContent = task.timestamp;
            row.insertCell().textContent = task.size;

            const progressCell = row.insertCell();
            const progressContainer = document.createElement('div');
            progressContainer.className = 'progress-bar-container';
            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            progressBar.style.width = task.progress;
            progressBar.textContent = task.progress;
            // Add color based on status
            if (task.status === 'Completed') progressBar.style.backgroundColor = 'var(--success-color, #28a745)';
            else if (task.status === 'Failed') progressBar.style.backgroundColor = 'var(--error-color, #dc3545)';
            else progressBar.style.backgroundColor = 'var(--accent-color)';

            progressContainer.appendChild(progressBar);
            progressCell.appendChild(progressContainer);
        });
    }


    getHTML() {
        return `
            <div id="overview-page">
                <h2>System Overview</h2>

                <div class="overview-section" id="disk-usage-section">
                    <h3>Disk Usage</h3>
                    <table class="data-table" id="disk-usage-table">
                        <thead><tr><th>Filesystem</th><th>Total</th><th>Used</th><th>Free</th><th>Mount Point</th></tr></thead>
                        <tbody><!-- Data will be injected here --></tbody>
                    </table>
                </div>

                <div class="overview-section" id="cpu-usage-section">
                    <h3>CPU Usage</h3>
                    <!-- <p>Current Load: <span id="cpu-current-load">N/A</span></p> -->
                    <div class="chart-container" style="height:250px; width:100%; margin-bottom: 10px;">
                        <canvas id="cpuUsageChart"></canvas>
                    </div>
                    <div id="cpu-core-bars-container"></div> <!-- For core-specific progress bars, kept for now -->
                </div>

                <div class="overview-section" id="gpu-usage-section">
                    <h3>GPU Usage</h3>
                    <div id="gpu-charts-container">
                        <!-- GPU Canvases will be added here by JS if simple, or use static IDs -->
                    </div>
                    <div id="gpu-usage-tables-container" style="margin-top:15px;"></div> <!-- Tables for other GPU stats like temp, memory -->
                </div>

                <div class="overview-section" id="network-usage-section">
                    <h3>Network Usage</h3>
                    <!-- <p>Upload: <span id="network-upload-speed">N/A</span> | Download: <span id="network-download-speed">N/A</span></p> -->
                    <div class="chart-container" style="height:250px; width:100%; margin-bottom: 10px;">
                        <canvas id="networkUsageChart"></canvas>
                    </div>
                    <table class="data-table" id="network-interfaces-table">
                        <thead><tr><th>Interface</th><th>Total Upload</th><th>Total Download</th><th>Data Sent</th><th>Data Received</th></tr></thead>
                        <tbody><!-- Data will be injected here --></tbody>
                    </table>
                </div>

                <div class="overview-section" id="stats-section">
                    <h3>User & Task Statistics</h3>
                    <p>Online Users: <span id="online-users-count">N/A</span></p>
                    <p>Total Tasks Executed: <span id="total-tasks-executed">N/A</span></p>
                    <p>Successful Tasks: <span id="successful-tasks-count">N/A</span></p>
                    <p>Failed Tasks: <span id="failed-tasks-count">N/A</span></p>
                    <p>Running Tasks: <span id="running-tasks-count">N/A</span></p>
                </div>

                <div class="overview-section" id="download-history-section">
                    <h3>Download Task History</h3>
                    <table class="data-table" id="download-history-table">
                        <thead><tr><th>ID</th><th>File Name</th><th>Source</th><th>Status</th><th>Timestamp</th><th>Size</th><th>Progress</th></tr></thead>
                        <tbody><!-- Data will be injected here --></tbody>
                    </table>
                </div>
            </div>
        `;
    }

    onLoad(mainContentElement, subPageId, appState, managers) {
        this.mainContentElement = mainContentElement; // Store for updates
        this.dynamicMockData = this._deepCopy(this.mockData); // Initial data load from dynamic copy
        window.overviewPageModuleInstance = this; // Expose instance for testing

        // Populate Disk Usage (Disk usage is static in this example, so use dynamicMockData or mockData)
        const diskUsageTableBody = mainContentElement.querySelector('#disk-usage-table tbody');
        this.dynamicMockData.diskUsage.forEach(disk => {
            const row = diskUsageTableBody.insertRow();
            row.insertCell().textContent = disk.filesystem;
            row.insertCell().textContent = disk.total;
            row.insertCell().textContent = disk.used;
            row.insertCell().textContent = disk.free;
            row.insertCell().textContent = disk.mountPoint;
        });

        // Chart Initializations
        this._initCpuChart(mainContentElement);
        this._initGpuCharts(mainContentElement);
        this._initNetworkChart(mainContentElement);

        // Populate static or less frequently updated parts of CPU (core bars)
        const cpuCoreBarsContainer = mainContentElement.querySelector('#cpu-core-bars-container');
        cpuCoreBarsContainer.innerHTML = '';
        if (this.dynamicMockData.cpuUsage.cores) {
            this.dynamicMockData.cpuUsage.cores.forEach(core => {
                const coreBarContainer = document.createElement('div');
                coreBarContainer.className = 'progress-bar-container';
                coreBarContainer.title = `Core ${core.core}: ${core.load}`;
                const coreBar = document.createElement('div');
                coreBar.className = 'progress-bar';
                coreBar.style.width = core.load;
                coreBar.textContent = `Core ${core.core}: ${core.load}`;
                coreBarContainer.appendChild(coreBar);
                cpuCoreBarsContainer.appendChild(coreBarContainer);
            });
        }

        // Populate GPU tables (non-chart data like memory, temp, power)
        const gpuUsageTablesContainer = mainContentElement.querySelector('#gpu-usage-tables-container');
        gpuUsageTablesContainer.innerHTML = '';
        this.dynamicMockData.gpuUsage.forEach((gpu, index) => {
            // Add canvas for chart if not already in HTML structure defined by getHTML
            const gpuChartsContainer = mainContentElement.querySelector('#gpu-charts-container');
            if(gpuChartsContainer.querySelector(`#gpuUsageChart_${index}`) == null){
                const canvas = document.createElement('canvas');
                canvas.id = `gpuUsageChart_${index}`;
                canvas.height = 100; // Smaller height for individual GPU charts
                const chartContainer = document.createElement('div');
                chartContainer.className = 'chart-container';
                chartContainer.style.marginBottom = '10px';
                chartContainer.appendChild(canvas);
                gpuChartsContainer.appendChild(chartContainer);
            }

            // Create table for additional GPU info
            const gpuTable = document.createElement('table');
            gpuTable.className = 'data-table gpu-specific-table';
            gpuTable.innerHTML = `
                <caption>${gpu.name} (${gpu.id}) - Details</caption>
                <thead>
                    <tr><th>Metric</th><th>Value</th></tr>
                </thead>
                <tbody>
                    <tr><td>Memory Total</td><td>${gpu.memoryTotal}</td></tr>
                    <tr><td>Memory Used</td><td>${gpu.memoryUsed}</td></tr>
                    <tr><td class="gpu-temperature-label">Temperature</td><td>${gpu.temperature}</td></tr>
                    <tr><td>Power Draw</td><td>${gpu.powerDraw}</td></tr>
                </tbody>
            `;
            // Note: GPU utilization is now in the chart, so no progress bar here.
            gpuUsageTablesContainer.appendChild(gpuTable);
        });


        // Populate Network Interfaces Table (Data Sent/Received - speeds are in chart)
        const networkInterfacesTableBody = mainContentElement.querySelector('#network-interfaces-table tbody');
        networkInterfacesTableBody.innerHTML = '';
        this.dynamicMockData.networkUsage.interfaces.forEach(iface => {
            const row = networkInterfacesTableBody.insertRow();
            row.insertCell().textContent = iface.name;
            row.insertCell().textContent = "N/A"; // Upload speed from chart
            row.insertCell().textContent = "N/A"; // Download speed from chart
            row.insertCell().textContent = iface.dataSent;
            row.insertCell().textContent = iface.dataReceived;
        });

        // Populate User & Task Statistics (remains direct DOM update)
        mainContentElement.querySelector('#online-users-count').textContent = this.dynamicMockData.userAndTaskStats.onlineUsers;
        mainContentElement.querySelector('#total-tasks-executed').textContent = this.dynamicMockData.userAndTaskStats.totalTasksExecuted;
        mainContentElement.querySelector('#successful-tasks-count').textContent = this.dynamicMockData.userAndTaskStats.successfulTasks;
        mainContentElement.querySelector('#failed-tasks-count').textContent = this.dynamicMockData.userAndTaskStats.failedTasks;
        mainContentElement.querySelector('#running-tasks-count').textContent = this.dynamicMockData.userAndTaskStats.runningTasks;

        // Populate Download Task History - initial population
        this.updateDownloadHistoryDisplay(); // Initial population of download history table

        // Start dynamic updates which will also populate charts with initial data points
        this.startDynamicDataUpdates();
    }

    // Chart Initialization Methods
    _initCpuChart(mainContentElement) {
        const cpuCtx = mainContentElement.querySelector('#cpuUsageChart').getContext('2d');
        this.charts.cpuUsageChart = new Chart(cpuCtx, {
            type: 'line',
            data: {
                labels: [], // Time labels
                datasets: [{
                    label: 'CPU Load %',
                    data: [], // CPU load data
                    borderColor: this.chartThemeColors.cpuLineColor,
                    backgroundColor: this.chartThemeColors.cpuFillColor,
                    tension: 0.2,
                    fill: true
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { min: 0, max: 100, ticks: { color: this.chartThemeColors.ticksColor }, grid: { color: this.chartThemeColors.gridColor } },
                    x: { ticks: { color: this.chartThemeColors.ticksColor }, grid: { color: this.chartThemeColors.gridColor } }
                },
                plugins: {
                    legend: { labels: { color: this.chartThemeColors.legendColor } },
                    tooltip: {
                        backgroundColor: this.chartThemeColors.tooltipBackgroundColor,
                        titleColor: this.chartThemeColors.tooltipTitleColor,
                        bodyColor: this.chartThemeColors.tooltipBodyColor,
                    }
                }
            }
        });
    }

    _initGpuCharts(mainContentElement) {
        const gpuChartsContainer = mainContentElement.querySelector('#gpu-charts-container');
        this.dynamicMockData.gpuUsage.forEach((gpu, index) => {
            let canvas = mainContentElement.querySelector(`#gpuUsageChart_${index}`);
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.id = `gpuUsageChart_${index}`;
                const chartContainerDiv = document.createElement('div');
                chartContainerDiv.className='chart-container';
                // Height is now controlled by CSS: #gpu-charts-container .chart-container
                // chartContainerDiv.style.height='150px';
                chartContainerDiv.style.width='100%';
                chartContainerDiv.style.marginBottom = '10px';
                chartContainerDiv.appendChild(canvas);
                gpuChartsContainer.appendChild(chartContainerDiv);
            }
            const gpuCtx = canvas.getContext('2d');
            this.charts.gpuCharts[`gpuUsageChart_${index}`] = new Chart(gpuCtx, { // Store in gpuCharts
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: `${gpu.name} Utilization %`,
                        data: [],
                        borderColor: this.chartThemeColors.gpuLineColor,
                        backgroundColor: this.chartThemeColors.gpuFillColor,
                        tension: 0.2,
                        fill: true
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                        y: { min: 0, max: 100, ticks: { color: this.chartThemeColors.ticksColor }, grid: { color: this.chartThemeColors.gridColor } },
                        x: { ticks: { color: this.chartThemeColors.ticksColor }, grid: { color: this.chartThemeColors.gridColor } }
                    },
                    plugins: {
                        legend: { display: true, labels: { color: this.chartThemeColors.legendColor, boxWidth: 20 }, position: 'top' },
                        tooltip: {
                            backgroundColor: this.chartThemeColors.tooltipBackgroundColor,
                            titleColor: this.chartThemeColors.tooltipTitleColor,
                            bodyColor: this.chartThemeColors.tooltipBodyColor,
                        }
                    }
                }
            });
        });
    }

    _initNetworkChart(mainContentElement) {
        const networkCtx = mainContentElement.querySelector('#networkUsageChart').getContext('2d');
        this.charts.networkUsageChart = new Chart(networkCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Upload Speed (Mbps)',
                        data: [],
                        borderColor: this.chartThemeColors.networkUploadLineColor,
                        backgroundColor: this.chartThemeColors.networkUploadFillColor,
                        tension: 0.2,
                        fill: true
                    },
                    {
                        label: 'Download Speed (Mbps)',
                        data: [],
                        borderColor: this.chartThemeColors.networkDownloadLineColor,
                        backgroundColor: this.chartThemeColors.networkDownloadFillColor,
                        tension: 0.2,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { min: 0, ticks: { color: this.chartThemeColors.ticksColor }, grid: { color: this.chartThemeColors.gridColor } }, // Max will be auto
                    x: { ticks: { color: this.chartThemeColors.ticksColor }, grid: { color: this.chartThemeColors.gridColor } }
                },
                plugins: {
                    legend: { labels: { color: this.chartThemeColors.legendColor } },
                    tooltip: {
                        backgroundColor: this.chartThemeColors.tooltipBackgroundColor,
                        titleColor: this.chartThemeColors.tooltipTitleColor,
                        bodyColor: this.chartThemeColors.tooltipBodyColor,
                    }
                }
            }
        });
    }
}
