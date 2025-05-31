// --- Test Utilities (Keep these as they are useful) ---
function assertEquals(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message} - Expected: '${expected}', Found: '${actual}'`);
    }
}
function assertIncludes(collection, item, message) {
    if (!collection || !collection.includes(item)) { // Added check for collection being defined
        throw new Error(`${message} - Expected collection to include: '${item}'`);
    }
}
function assertNotNull(element, message) {
    if (!element) {
        throw new Error(message);
    }
}
function assertTableHasNRows(tableSelector, expectedRows, message) {
    const table = document.querySelector(tableSelector);
    assertNotNull(table, `Table ${tableSelector} not found.`);
    const bodyRows = table.querySelectorAll('tbody tr');
    assertEquals(bodyRows.length, expectedRows, message || `Table ${tableSelector} row count mismatch.`);
}
function getCellContent(tableSelector, rowIndex, cellIndex, message) {
    const table = document.querySelector(tableSelector);
    assertNotNull(table, `Table ${tableSelector} not found for getCellContent.`);
    const rows = table.querySelectorAll('tbody tr');
    if (rowIndex >= rows.length) {
        throw new Error(`Row index ${rowIndex} out of bounds for table ${tableSelector}. ${message || ''}`);
    }
    const cells = rows[rowIndex].querySelectorAll('td');
    if (cellIndex >= cells.length) {
        throw new Error(`Cell index ${cellIndex} out of bounds for row ${rowIndex} in table ${tableSelector}. ${message || ''}`);
    }
    return cells[cellIndex].textContent.trim();
}


// --- Mock WebSocketManager ---
let mockSendWebSocketCommand; // To be configured by each test scenario

// Ensure WebSocketManager is part of window for global access if not using modules
if (!window.WebSocketManager) {
    window.WebSocketManager = {
        getInstance: () => ({
            sendWebSocketCommand: mockSendWebSocketCommand // This will be our mock function
        })
    };
} else {
    // If it exists, attempt to monkey-patch it carefully.
    // This is less ideal than proper module mocking but necessary for browser script tests.
    const originalGetInstance = window.WebSocketManager.getInstance;
    window.WebSocketManager.getInstance = () => {
        const originalInstance = originalGetInstance.call(window.WebSocketManager);
        return {
            ...originalInstance, // Spread original methods if any are needed
            sendWebSocketCommand: mockSendWebSocketCommand // Override with our mock
        };
    };
}


// --- Sample Data for Tests ---
const SAMPLE_OVERVIEW_DATA_FULL = {
    systemInfo: { os: "TestOS", hostname: "TestHost", uptime: "1d 2h 3m" },
    diskUsage: [
        { filesystem: "/dev/sda1", total: "100GB", used: "50GB", free: "50GB", mountPoint: "/" },
        { filesystem: "/dev/sdb1", total: "1TB", used: "250GB", free: "750GB", mountPoint: "/data" },
    ],
    cpuUsage: {
        currentLoad: 45.5,
        cores: [ { core: 1, load: 60 }, { core: 2, load: 30 } ],
        logicalCores: 4,
        physicalCores: 2,
    },
    gpuUsage: [
        { id: "GPU 0", name: "NVIDIA Test RTX 4090", utilization: 75.2, memoryTotal: "24GB", memoryUsed: "8GB", temperature: 65, powerDraw: 200 },
        { id: "GPU 1", name: "AMD Test RX 7900XTX", utilization: 50.1, memoryTotal: "20GB", memoryUsed: "6GB", temperature: 55, powerDraw: 180 },
    ],
    networkUsage: {
        uploadSpeed: 15.6, // Mbps
        downloadSpeed: 100.2, // Mbps
        interfaces: [
            { name: "eth0", uploadSpeed: "10.0 Mbps", downloadSpeed: "80.0 Mbps", dataSent: "5GB", dataReceived: "50GB" },
            { name: "wlan0", uploadSpeed: "5.0 Mbps", downloadSpeed: "20.0 Mbps", dataSent: "1GB", dataReceived: "10GB" },
        ],
    },
    userAndTaskStats: {
        onlineUsers: 5,
        totalTasksExecuted: 1500,
        successfulTasks: 1400,
        failedTasks: 50,
        runningTasks: 50,
    },
    downloadTaskHistory: [
        { id: "task1", fileName: "file1.zip", source: "HTTP", status: "Completed", timestamp: "2023-01-01 10:00", size: "1GB", progress: 100 },
        { id: "task2", fileName: "file2.iso", source: "FTP", status: "Failed", timestamp: "2023-01-01 11:00", size: "2GB", progress: 0 },
    ],
};

const SAMPLE_OVERVIEW_DATA_NO_GPU = {
    ...SAMPLE_OVERVIEW_DATA_FULL,
    gpuUsage: [],
};

const SAMPLE_OVERVIEW_DATA_MINIMAL = {
    systemInfo: { os: "MinOS", hostname: "MinHost", uptime: "0d 0h 1m" },
    diskUsage: [ { filesystem: "/root", total: "10GB", used: "1GB", free: "9GB", mountPoint: "/" } ],
    cpuUsage: { currentLoad: 10, cores: [ { core: 1, load: 10 } ], logicalCores: 1, physicalCores: 1 },
    gpuUsage: [],
    networkUsage: { uploadSpeed: 1, downloadSpeed: 5, interfaces: [ { name: "lo", uploadSpeed: "0 Mbps", downloadSpeed: "0 Mbps", dataSent: "1MB", dataReceived: "1MB" } ] },
    userAndTaskStats: { onlineUsers: 1, totalTasksExecuted: 10, successfulTasks: 8, failedTasks: 1, runningTasks: 1 },
    downloadTaskHistory: [],
};


async function runOverviewPageTests() {
    console.log("Starting OverviewPage tests with WebSocket mocking...");

    // Test 1: Full data scenario
    console.log("Test Scenario 1: Full Data Load");
    mockSendWebSocketCommand = jest.fn().mockResolvedValue(SAMPLE_OVERVIEW_DATA_FULL);

    // Navigate and allow page to load/render with mocked data
    try {
        await window.test.navigateTo('overview', 'System Overview', '#overview');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for async updates
        console.log("Navigated to Overview Page (Full Data).");

        // --- Assertions for Full Data ---
        // System Info
        assertEquals(document.querySelector('#sysinfo-os').textContent, SAMPLE_OVERVIEW_DATA_FULL.systemInfo.os, "OS info mismatch");
        assertEquals(document.querySelector('#sysinfo-hostname').textContent, SAMPLE_OVERVIEW_DATA_FULL.systemInfo.hostname, "Hostname info mismatch");
        assertEquals(document.querySelector('#sysinfo-uptime').textContent, SAMPLE_OVERVIEW_DATA_FULL.systemInfo.uptime, "Uptime info mismatch");
        console.log("PASS: System Info (Full Data) correct.");

        // Disk Usage
        assertTableHasNRows('#disk-usage-table', SAMPLE_OVERVIEW_DATA_FULL.diskUsage.length, "Disk usage row count");
        assertEquals(getCellContent('#disk-usage-table', 0, 0), SAMPLE_OVERVIEW_DATA_FULL.diskUsage[0].filesystem, "Disk 0 filesystem");
        assertEquals(getCellContent('#disk-usage-table', 1, 4), SAMPLE_OVERVIEW_DATA_FULL.diskUsage[1].mountPoint, "Disk 1 mountpoint");
        console.log("PASS: Disk Usage (Full Data) correct.");

        // CPU Usage (core bars and counts)
        const coreBarContainers = document.querySelectorAll('#cpu-core-bars-container .progress-bar-container');
        assertEquals(coreBarContainers.length, SAMPLE_OVERVIEW_DATA_FULL.cpuUsage.cores.length, "CPU core bar count");
        if (coreBarContainers.length > 0) {
            assertEquals(coreBarContainers[0].title, `Core ${SAMPLE_OVERVIEW_DATA_FULL.cpuUsage.cores[0].core}: ${SAMPLE_OVERVIEW_DATA_FULL.cpuUsage.cores[0].load}%`, "CPU core 0 title");
        }
        assertEquals(document.querySelector('#cpu-logical-cores').textContent, String(SAMPLE_OVERVIEW_DATA_FULL.cpuUsage.logicalCores), "CPU Logical Cores");
        assertEquals(document.querySelector('#cpu-physical-cores').textContent, String(SAMPLE_OVERVIEW_DATA_FULL.cpuUsage.physicalCores), "CPU Physical Cores");
        console.log("PASS: CPU Usage (Full Data) correct.");

        // GPU Usage
        const gpuTables = document.querySelectorAll('#gpu-usage-tables-container .data-table.gpu-specific-table');
        assertEquals(gpuTables.length, SAMPLE_OVERVIEW_DATA_FULL.gpuUsage.length, "GPU table count");
        if (gpuTables.length > 0) {
            assertIncludes(gpuTables[0].querySelector('caption').textContent, SAMPLE_OVERVIEW_DATA_FULL.gpuUsage[0].name, "GPU 0 name in caption");
            // Check one data point, e.g., temperature
             const tempCell = Array.from(gpuTables[0].querySelectorAll('tbody td')).find(td => td.textContent === 'Temperature').nextElementSibling;
             assertEquals(tempCell.textContent, `${SAMPLE_OVERVIEW_DATA_FULL.gpuUsage[0].temperature}°C`, "GPU 0 Temperature");
        }
        console.log("PASS: GPU Usage (Full Data) correct.");

        // Network Interfaces
        assertTableHasNRows('#network-interfaces-table', SAMPLE_OVERVIEW_DATA_FULL.networkUsage.interfaces.length, "Network interface row count");
        assertEquals(getCellContent('#network-interfaces-table', 0, 0), SAMPLE_OVERVIEW_DATA_FULL.networkUsage.interfaces[0].name, "Net I/F 0 Name");
        assertEquals(getCellContent('#network-interfaces-table', 1, 3), SAMPLE_OVERVIEW_DATA_FULL.networkUsage.interfaces[1].dataSent, "Net I/F 1 Data Sent");
        console.log("PASS: Network Interfaces (Full Data) correct.");

        // Download History
        assertTableHasNRows('#download-history-table', SAMPLE_OVERVIEW_DATA_FULL.downloadTaskHistory.length, "Download history row count");
        if (SAMPLE_OVERVIEW_DATA_FULL.downloadTaskHistory.length > 0) {
            assertEquals(getCellContent('#download-history-table', 0, 1), SAMPLE_OVERVIEW_DATA_FULL.downloadTaskHistory[0].fileName, "Download 0 Filename");
            const progressCell = document.querySelector('#download-history-table tbody tr:first-child td:last-child .progress-bar');
            assertNotNull(progressCell, "Download 0 progress bar not found");
            assertEquals(progressCell.style.width, `${SAMPLE_OVERVIEW_DATA_FULL.downloadTaskHistory[0].progress}%`, "Download 0 progress width");
        }
        console.log("PASS: Download History (Full Data) correct.");

        // User & Task Stats
        assertEquals(document.querySelector('#total-tasks-executed').textContent, String(SAMPLE_OVERVIEW_DATA_FULL.userAndTaskStats.totalTasksExecuted), "Total tasks executed");
        console.log("PASS: User & Task Stats (Full Data) correct.");

        // Verify chart elements were at least created (difficult to check data without framework)
        verifyChartElements(SAMPLE_OVERVIEW_DATA_FULL.gpuUsage.length); // Pass expected GPU count

    } catch (e) {
        console.error("FAIL: Test Scenario 1 (Full Data) failed.", e.message, e.stack);
    }

    // Test 2: No GPU Data Scenario
    console.log("\nTest Scenario 2: No GPU Data");
    mockSendWebSocketCommand = jest.fn().mockResolvedValue(SAMPLE_OVERVIEW_DATA_NO_GPU);
    // Navigate again or force re-load/re-render if OverviewPage doesn't re-fetch on simple navigate
    // For this test, let's assume re-navigation triggers onLoad and thus new data fetch
    try {
        await window.test.navigateTo('overview', 'System Overview - No GPU', '#overview');
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("Navigated to Overview Page (No GPU Data).");

        const gpuContainer = document.querySelector('#gpu-charts-container');
        assertNotNull(gpuContainer, "GPU charts container not found (No GPU).");
        assertEquals(gpuContainer.textContent.trim(), "No GPU data available.", "No GPU data message mismatch.");

        const gpuTablesContainer = document.querySelector('#gpu-usage-tables-container');
        assertNotNull(gpuTablesContainer, "GPU tables container not found (No GPU).");
        assertEquals(gpuTablesContainer.innerHTML.trim(), "", "GPU tables container should be empty when no GPU data.");
        console.log("PASS: No GPU Data scenario handled correctly.");

    } catch (e) {
        console.error("FAIL: Test Scenario 2 (No GPU Data) failed.", e.message, e.stack);
    }

    // Test 3: WebSocket Error Scenario
    console.log("\nTest Scenario 3: WebSocket Error");
    mockSendWebSocketCommand = jest.fn().mockRejectedValue(new Error("Simulated WebSocket Error"));
    try {
        await window.test.navigateTo('overview', 'System Overview - WS Error', '#overview');
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("Navigated to Overview Page (WebSocket Error).");

        // Check for error message display (assuming it's put in #system-info-os or similar)
        const errorDisplay = document.querySelector('#sysinfo-os'); // As per OverviewPage error handling
        assertNotNull(errorDisplay, "Error display element not found (WS Error).");
        assertIncludes(errorDisplay.textContent, "Error fetching system data", "Error message not displayed correctly for WS Error.");
        console.log("PASS: WebSocket Error scenario handled correctly.");

    } catch (e) {
        console.error("FAIL: Test Scenario 3 (WebSocket Error) failed.", e.message, e.stack);
    }

    // Test 4: Minimal Data Scenario (e.g. empty tables should show "no data" messages)
    console.log("\nTest Scenario 4: Minimal Data Load");
    mockSendWebSocketCommand = jest.fn().mockResolvedValue(SAMPLE_OVERVIEW_DATA_MINIMAL);
    try {
        await window.test.navigateTo('overview', 'System Overview - Minimal Data', '#overview');
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("Navigated to Overview Page (Minimal Data).");

        // System Info
        assertEquals(document.querySelector('#sysinfo-os').textContent, SAMPLE_OVERVIEW_DATA_MINIMAL.systemInfo.os, "OS info mismatch (Minimal)");
        // Disk Usage
        assertTableHasNRows('#disk-usage-table', SAMPLE_OVERVIEW_DATA_MINIMAL.diskUsage.length, "Disk usage row count (Minimal)");
        // CPU
        assertEquals(document.querySelectorAll('#cpu-core-bars-container .progress-bar-container').length, SAMPLE_OVERVIEW_DATA_MINIMAL.cpuUsage.cores.length, "CPU core bar count (Minimal)");
        // GPU (should show no data message)
        assertEquals(document.querySelector('#gpu-charts-container').textContent.trim(), "No GPU data available.", "No GPU message (Minimal)");
        // Network Interfaces (check for "no data" if interfaces array was empty, or single row for 'lo')
        if (SAMPLE_OVERVIEW_DATA_MINIMAL.networkUsage.interfaces.length === 0) {
             assertEquals(getCellContent('#network-interfaces-table', 0, 0), "No network interface data available.", "Network 'no data' message (Minimal)");
        } else {
            assertTableHasNRows('#network-interfaces-table', SAMPLE_OVERVIEW_DATA_MINIMAL.networkUsage.interfaces.length, "Network interface row count (Minimal)");
        }
        // Download History (should show no data message)
        assertEquals(getCellContent('#download-history-table', 0, 0), "No download task history available.", "Download history 'no data' message (Minimal)");

        console.log("PASS: Minimal Data scenario handled correctly.");

    } catch (e) {
        console.error("FAIL: Test Scenario 4 (Minimal Data) failed.", e.message, e.stack);
    }


    // --- Original MOCK_DATA_CHECKS based tests (will likely fail or need removal) ---
    // These are now largely superseded by the WebSocket mock driven tests.
    // I will comment them out as they test the old static mock data behavior.
    /*
    const MOCK_DATA_CHECKS = {
        diskUsageRows: 2,
        diskUsageHeaders: ["Filesystem", "Total", "Used", "Free", "Mount Point"],
        cpuCores: 2,
        gpuUsageGpus: 2,
        networkInterfacesRows: 2,
        networkInterfacesHeaders: ["Interface", "Total Upload", "Total Download", "Data Sent", "Data Received"],
        downloadHistoryRows: 3,
        downloadHistoryHeaders: ["ID", "File Name", "Source", "Status", "Timestamp", "Size", "Progress"],
        onlineUsers: 5, // These specific value checks are less relevant now.
        totalTasksExecuted: 1500,
        successfulTasks: 1450,
        failedTasks: 40,
        runningTasks: 10,
    };

    // Helper function for assertions (already defined above)
    function assertEquals(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(`${message} - Expected: '${expected}', Found: '${actual}'`);
        }
    }
    function assertIncludes(collection, item, message) {
        if (!collection.includes(item)) {
            throw new Error(`${message} - Expected collection to include: '${item}'`);
        }
    }
    function assertNotNull(element, message) {
        if (!element) {
            throw new Error(message);
        }
    }

    // Test Section Titles
    try {
        const mainTitleEl = document.querySelector('#overview-page h2');
        assertNotNull(mainTitleEl, "Main title element not found.");
        assertEquals(mainTitleEl.textContent.trim(), "System Overview", "Main title incorrect.");

        const sectionTitleElements = Array.from(document.querySelectorAll('#overview-page .overview-section h3'));
        const sectionTitles = sectionTitleElements.map(h => h.textContent.trim());
        const expectedSections = ["Disk Usage", "CPU Usage", "GPU Usage", "Network Usage", "User & Task Statistics", "Download Task History"];

        assertEquals(sectionTitles.length, expectedSections.length, "Number of section titles mismatch.");
        expectedSections.forEach(title => {
            assertIncludes(sectionTitles, title, `Missing section title: ${title}`);
        });
        console.log("PASS: Section titles are correct.");
    } catch (e) {
        console.error("FAIL: Section titles check failed.", e.message, e.stack);
    }

    // Test Disk Usage Table
    try {
        const diskTable = document.querySelector('#disk-usage-table');
        assertNotNull(diskTable, "Disk usage table not found.");
        const bodyRows = diskTable.querySelectorAll('tbody tr');
        assertEquals(bodyRows.length, MOCK_DATA_CHECKS.diskUsageRows, `Disk Usage table row count mismatch.`);

        const headerCells = Array.from(diskTable.querySelectorAll('thead th')).map(th => th.textContent.trim());
        MOCK_DATA_CHECKS.diskUsageHeaders.forEach((header, index) => {
            assertEquals(headerCells[index], header, `Disk table header mismatch at index ${index}`);
        });
        console.log("PASS: Disk Usage table populated correctly.");
    } catch (e) {
        console.error("FAIL: Disk Usage table check failed.", e.message, e.stack);
    }

    // Test CPU Usage (Core bars only, as main load is in chart)
    try {
        const coreBarContainers = document.querySelectorAll('#cpu-core-bars-container .progress-bar-container');
        assertEquals(coreBarContainers.length, MOCK_DATA_CHECKS.cpuCores, "CPU core progress bar count mismatch.");
        if (coreBarContainers.length > 0) {
            const firstCoreBar = coreBarContainers[0].querySelector('.progress-bar');
            assertNotNull(firstCoreBar, "First CPU core progress bar not found.");
            if (!firstCoreBar.style.width || !firstCoreBar.style.width.endsWith('%')) {
                 throw new Error(`First CPU core bar width not set correctly: ${firstCoreBar.style.width}`);
            }
            assertIncludes(firstCoreBar.textContent, "Core 1", "First CPU core bar text incorrect.");
        }
        console.log("PASS: CPU core progress bars populated correctly.");
    } catch (e) {
        console.error("FAIL: CPU core progress bars check failed.", e.message, e.stack);
    }

    // Test GPU Usage Tables (Details part, utilization is in chart)
    try {
        const gpuTablesContainer = document.querySelector('#gpu-usage-tables-container');
        assertNotNull(gpuTablesContainer, "GPU usage tables container not found.");
        const gpuTables = gpuTablesContainer.querySelectorAll('.data-table.gpu-specific-table');
        assertEquals(gpuTables.length, MOCK_DATA_CHECKS.gpuUsageGpus, `GPU details table count mismatch.`);

        if (gpuTables.length > 0) {
             const firstGpuTable = gpuTables[0];
             const captionEl = firstGpuTable.querySelector('caption');
             assertNotNull(captionEl, "GPU table caption not found for the first GPU details table.");
             assertIncludes(captionEl.textContent, "NVIDIA GeForce RTX 3080", "First GPU table caption content mismatch.");

             // Check for presence of temperature row, for example
             const tempLabelCell = Array.from(firstGpuTable.querySelectorAll('tbody td')).find(td => td.textContent === 'Temperature');
             assertNotNull(tempLabelCell, "Temperature label not found in first GPU details table.");
             const tempValueCell = tempLabelCell.nextElementSibling;
             assertNotNull(tempValueCell, "Temperature value cell not found.");
             assertIncludes(tempValueCell.textContent, "°C", "Temperature value doesn't include °C.");
        }
        console.log("PASS: GPU Usage details table(s) found and structured correctly.");
    } catch (e) {
        console.error("FAIL: GPU Usage details table check failed.", e.message, e.stack);
    }

    // Test Network Interfaces Table (Data Sent/Received part)
    try {
        const networkTable = document.querySelector('#network-interfaces-table');
        assertNotNull(networkTable, "Network interfaces table not found.");
        const bodyRows = networkTable.querySelectorAll('tbody tr');
        assertEquals(bodyRows.length, MOCK_DATA_CHECKS.networkInterfacesRows, `Network Interfaces table row count mismatch.`);

        const headerCells = Array.from(networkTable.querySelectorAll('thead th')).map(th => th.textContent.trim());
        MOCK_DATA_CHECKS.networkInterfacesHeaders.forEach((header, index) => {
            assertEquals(headerCells[index], header, `Network table header mismatch at index ${index}`);
        });
        console.log("PASS: Network Interfaces table populated correctly.");
    } catch (e) {
        console.error("FAIL: Network Interfaces table check failed.", e.message, e.stack);
    }

    // Test Download History Table
    try {
        const historyTable = document.querySelector('#download-history-table');
        assertNotNull(historyTable, "Download history table not found.");
        const bodyRows = historyTable.querySelectorAll('tbody tr');
        assertEquals(bodyRows.length, MOCK_DATA_CHECKS.downloadHistoryRows, `Download History table row count mismatch.`);

        const headerCells = Array.from(historyTable.querySelectorAll('thead th')).map(th => th.textContent.trim());
        MOCK_DATA_CHECKS.downloadHistoryHeaders.forEach((header, index) => {
            assertEquals(headerCells[index], header, `Download history table header mismatch at index ${index}`);
        });
        // Check for progress bar in the last cell of the first row
        if (bodyRows.length > 0) {
            const firstRowProgressCell = bodyRows[0].querySelector('td:last-child .progress-bar');
            assertNotNull(firstRowProgressCell, "Progress bar in download history (first row) not found.");
            if (!firstRowProgressCell.style.width || !firstRowProgressCell.style.width.endsWith('%')) {
                throw new Error(`Download history progress bar width not set correctly: ${firstRowProgressCell.style.width}`);
            }
        }
        console.log("PASS: Download History table populated correctly.");
    } catch (e) {
        console.error("FAIL: Download History table check failed.", e.message, e.stack);
    }

    // Test User & Task Statistics (only Total Tasks Executed, as others are in charts)
    try {
        const totalTasksEl = document.querySelector('#total-tasks-executed');
        assertNotNull(totalTasksEl, "Total tasks executed element not found.");
        // assertEquals(parseInt(totalTasksEl.textContent.trim()), MOCK_DATA_CHECKS.totalTasksExecuted, "Total tasks executed mismatch.");
        // ^ This can be flaky due to dynamic updates. Just check for presence.
        if (isNaN(parseInt(totalTasksEl.textContent.trim()))) {
            throw new Error("Total tasks executed is not a number: " + totalTasksEl.textContent);
        }
        console.log("PASS: User & Task Statistics (Total Tasks) is present and numeric.");
    } catch (e) {
        console.error("FAIL: User & Task Statistics (Total Tasks) check failed.", e.message, e.stack);
    }

    // Verify Chart Elements and Initialization
    verifyChartElements(MOCK_DATA_CHECKS);


    console.log("OverviewPage tests finished.");
    console.log("---------------------------------------------------------------------");
    console.log("To run these tests again, or if they failed due to timing issues:");
    console.log("1. Ensure the application is running and OverviewPage.js mock data matches the test expectations.");
    console.log("2. Open the browser's developer console.");
    console.log("3. Paste the content of this file (or load it as a script if not already done).");
    console.log("4. Execute the command: `runOverviewPageTests()`");
    console.log("---------------------------------------------------------------------");
}


function verifyChartElements(MOCK_DATA_CHECKS_REF) { // Pass MOCK_DATA_CHECKS as a parameter
    try {
        console.log("Verifying chart elements...");
        const cpuCanvas = document.getElementById('cpuUsageChart');
        if (!cpuCanvas || cpuCanvas.tagName !== 'CANVAS') throw new Error("CPU usage chart canvas not found or not a canvas.");
        console.log("PASS: CPU chart canvas found.");

        const networkCanvas = document.getElementById('networkUsageChart');
        if (!networkCanvas || networkCanvas.tagName !== 'CANVAS') throw new Error("Network usage chart canvas not found or not a canvas.");
        console.log("PASS: Network chart canvas found.");

        const gpuContainer = document.getElementById('gpu-charts-container');
        if (!gpuContainer) throw new Error("GPU charts container not found.");
        const gpuCanvases = gpuContainer.querySelectorAll('canvas');

        if (gpuCanvases.length !== MOCK_DATA_CHECKS_REF.gpuUsageGpus) {
            throw new Error(`Expected ${MOCK_DATA_CHECKS_REF.gpuUsageGpus} GPU chart canvases, found ${gpuCanvases.length}.`);
        }
        gpuCanvases.forEach((canvas, index) => {
            if (canvas.tagName !== 'CANVAS') throw new Error(`GPU chart element at index ${index} is not a canvas.`);
            if (!canvas.id.startsWith('gpuUsageChart_')) throw new Error (`GPU chart canvas ID ${canvas.id} does not match expected format.`);
        });
        console.log(`PASS: Found ${gpuCanvases.length} GPU chart canvas(es) with correct IDs.`);

        // Basic check for chart initialization
        if (window.overviewPageModuleInstance && window.overviewPageModuleInstance.charts) {
            if (!window.overviewPageModuleInstance.charts.cpuUsageChart) throw new Error("CPU Chart instance not found on page module.");
            console.log("PASS: CPU Chart instance found on page module.");
            if (!window.overviewPageModuleInstance.charts.networkUsageChart) throw new Error("Network Chart instance not found on page module.");
            console.log("PASS: Network Chart instance found on page module.");

            if (!window.overviewPageModuleInstance.charts.gpuCharts) throw new Error("gpuCharts object not found on page module charts.");
            const numGpuChartInstances = Object.keys(window.overviewPageModuleInstance.charts.gpuCharts).length;
            if (numGpuChartInstances !== MOCK_DATA_CHECKS_REF.gpuUsageGpus) {
                 throw new Error(`Mismatch in number of GPU chart instances on page module. Expected ${MOCK_DATA_CHECKS_REF.gpuUsageGpus}, found ${numGpuChartInstances}.`);
            }
            console.log(`PASS: Found ${numGpuChartInstances} GPU chart instance(s) on page module.`);

            // New checks for Online Users and Task Execution charts
            if (!window.overviewPageModuleInstance.charts.onlineUsersChart) {
                throw new Error("Online Users Chart instance not found on page module.");
            }
            console.log("PASS: Online Users Chart instance appears to be initialized.");

            if (!window.overviewPageModuleInstance.charts.taskExecutionChart) {
                throw new Error("Task Execution Chart instance not found on page module.");
            }
            console.log("PASS: Task Execution Chart instance appears to be initialized.");

            console.log("PASS: All expected chart instances appear to be initialized on the page module.");
        } else {
            console.warn("WARN: Could not verify chart instances on page module. Ensure 'window.overviewPageModuleInstance = this;' is set in OverviewPage.onLoad() for this test.");
        }

    } catch (e) {
        console.error("FAIL: Chart elements verification failed.", e.message, e.stack);
    }
}


// Example of how to define window.test.navigateTo if TestUtils.js is not present
// This is a simplified version for testing purposes.
if (!window.test) {
    window.test = {};
}
if (typeof window.test.navigateTo !== 'function') {
    window.test.navigateTo = function(pageId, title, path, skipPushState = false, subPageId = null) {
        // This basic version assumes app.navigationManager is available globally.
        // In a real app, TestUtils.js would handle this more robustly.
        if (window.app && window.app.navigationManager) {
            return new Promise((resolve, reject) => {
                try {
                    window.app.navigationManager.navigateTo(pageId, title, path, skipPushState, subPageId);
                    // Resolve after a short delay to simulate page load.
                    // A more robust solution would be to wait for a specific element or event.
                    setTimeout(resolve, 500);
                } catch (error) {
                    console.error(`Test navigation to ${pageId} failed:`, error);
                    reject(error);
                }
            });
        } else {
            console.error("window.app.navigationManager is not available for test navigation.");
            return Promise.reject("Navigation manager not found for test.");
        }
    };
    console.warn("Loaded a simplified window.test.navigateTo for OverviewPage tests. For full testing, ensure TestUtils.js is loaded.");
}
