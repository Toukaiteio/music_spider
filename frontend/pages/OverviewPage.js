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
                    <p>Current Load: <span id="cpu-current-load">N/A</span></p>
                    <div id="cpu-core-bars-container"></div> <!-- For core-specific progress bars -->
                </div>

                <div class="overview-section" id="gpu-usage-section">
                    <h3>GPU Usage</h3>
                    <div id="gpu-usage-tables-container"></div> <!-- Tables for each GPU -->
                </div>

                <div class="overview-section" id="network-usage-section">
                    <h3>Network Usage</h3>
                    <p>Upload: <span id="network-upload-speed">N/A</span> | Download: <span id="network-download-speed">N/A</span></p>
                    <table class="data-table" id="network-interfaces-table">
                        <thead><tr><th>Interface</th><th>Upload</th><th>Download</th><th>Data Sent</th><th>Data Received</th></tr></thead>
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
        // Populate Disk Usage
        const diskUsageTableBody = mainContentElement.querySelector('#disk-usage-table tbody');
        this.mockData.diskUsage.forEach(disk => {
            const row = diskUsageTableBody.insertRow();
            row.insertCell().textContent = disk.filesystem;
            row.insertCell().textContent = disk.total;
            row.insertCell().textContent = disk.used;
            row.insertCell().textContent = disk.free;
            row.insertCell().textContent = disk.mountPoint;
        });

        // Populate CPU Usage
        mainContentElement.querySelector('#cpu-current-load').textContent = this.mockData.cpuUsage.currentLoad;
        const cpuCoreBarsContainer = mainContentElement.querySelector('#cpu-core-bars-container');
        if (this.mockData.cpuUsage.cores) {
            this.mockData.cpuUsage.cores.forEach(core => {
                const coreBarContainer = document.createElement('div');
                coreBarContainer.className = 'progress-bar-container';
                coreBarContainer.title = \`Core \${core.core}: \${core.load}\`; // Tooltip for core load
                const coreBar = document.createElement('div');
                coreBar.className = 'progress-bar';
                coreBar.style.width = core.load;
                coreBar.textContent = \`Core \${core.core}: \${core.load}\`;
                coreBarContainer.appendChild(coreBar);
                cpuCoreBarsContainer.appendChild(coreBarContainer);
            });
        }


        // Populate GPU Usage
        const gpuUsageContainer = mainContentElement.querySelector('#gpu-usage-tables-container');
        this.mockData.gpuUsage.forEach(gpu => {
            const gpuTable = document.createElement('table');
            gpuTable.className = 'data-table gpu-specific-table'; // Add specific class if needed
            gpuTable.innerHTML = \`
                <caption>\${gpu.name} (\${gpu.id})</caption>
                <thead>
                    <tr><th>Metric</th><th>Value</th></tr>
                </thead>
                <tbody>
                    <tr><td>Utilization</td><td>\${gpu.utilization}</td></tr>
                    <tr><td>Memory Total</td><td>\${gpu.memoryTotal}</td></tr>
                    <tr><td>Memory Used</td><td>\${gpu.memoryUsed}</td></tr>
                    <tr><td>Temperature</td><td>\${gpu.temperature}</td></tr>
                    <tr><td>Power Draw</td><td>\${gpu.powerDraw}</td></tr>
                </tbody>
            \`;
            // Optional: Add progress bar for GPU utilization
            const utilizationCell = gpuTable.querySelector('tbody tr:first-child td:last-child');
            const progressContainer = document.createElement('div');
            progressContainer.className = 'progress-bar-container';
            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            progressBar.style.width = gpu.utilization;
            progressBar.textContent = gpu.utilization;
            progressContainer.appendChild(progressBar);
            utilizationCell.innerHTML = ''; // Clear existing text
            utilizationCell.appendChild(progressContainer);

            gpuUsageContainer.appendChild(gpuTable);
        });

        // Populate Network Usage
        mainContentElement.querySelector('#network-upload-speed').textContent = this.mockData.networkUsage.uploadSpeed;
        mainContentElement.querySelector('#network-download-speed').textContent = this.mockData.networkUsage.downloadSpeed;
        const networkInterfacesTableBody = mainContentElement.querySelector('#network-interfaces-table tbody');
        this.mockData.networkUsage.interfaces.forEach(iface => {
            const row = networkInterfacesTableBody.insertRow();
            row.insertCell().textContent = iface.name;
            row.insertCell().textContent = iface.upload;
            row.insertCell().textContent = iface.download;
            row.insertCell().textContent = iface.dataSent;
            row.insertCell().textContent = iface.dataReceived;
        });

        // Populate User & Task Statistics
        mainContentElement.querySelector('#online-users-count').textContent = this.mockData.userAndTaskStats.onlineUsers;
        mainContentElement.querySelector('#total-tasks-executed').textContent = this.mockData.userAndTaskStats.totalTasksExecuted;
        mainContentElement.querySelector('#successful-tasks-count').textContent = this.mockData.userAndTaskStats.successfulTasks;
        mainContentElement.querySelector('#failed-tasks-count').textContent = this.mockData.userAndTaskStats.failedTasks;
        mainContentElement.querySelector('#running-tasks-count').textContent = this.mockData.userAndTaskStats.runningTasks;

        // Populate Download Task History
        const downloadHistoryTableBody = mainContentElement.querySelector('#download-history-table tbody');
        this.mockData.downloadTaskHistory.forEach(task => {
            const row = downloadHistoryTableBody.insertRow();
            row.insertCell().textContent = task.id;
            row.insertCell().textContent = task.fileName;
            row.insertCell().textContent = task.source;
            row.insertCell().textContent = task.status;
            row.insertCell().textContent = task.timestamp;
            row.insertCell().textContent = task.size;

            // Create progress bar for download tasks
            const progressCell = row.insertCell();
            const progressContainer = document.createElement('div');
            progressContainer.className = 'progress-bar-container';
            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            progressBar.style.width = task.progress;
            progressBar.textContent = task.progress;
            progressContainer.appendChild(progressBar);
            progressCell.appendChild(progressContainer);
        });
    }
}
