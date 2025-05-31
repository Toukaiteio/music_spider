async function runOverviewPageTests() {
    console.log("Starting OverviewPage tests...");

    // Ensure window.test.navigateTo is available
    if (!window.test || typeof window.test.navigateTo !== 'function') {
        console.error("FAIL: window.test.navigateTo is not defined. Ensure TestUtils.js is loaded and initialized.");
        return;
    }

    try {
        await window.test.navigateTo('overview', 'System Overview', '#overview');
        // Simple delay to allow page to render. In a real test framework, use element presence/visibility checks.
        await new Promise(resolve => setTimeout(resolve, 1500)); // Increased delay slightly
        console.log("Navigated to Overview Page.");
    } catch (e) {
        console.error("FAIL: Navigation to Overview Page failed.", e.message);
        return; // Stop tests if navigation fails
    }


    // Mock data checks should align with the mockData in OverviewPage.js
    // Note: The provided MOCK_DATA_CHECKS in the prompt had some values (e.g., cpuLoad, onlineUsers)
    // that differ from the mockData in OverviewPage.js. I'll use values consistent with OverviewPage.js.
    const MOCK_DATA_CHECKS = {
        diskUsageRows: 2,
        diskUsageHeaders: ["Filesystem", "Total", "Used", "Free", "Mount Point"],
        cpuLoad: "45%", // From OverviewPage.js mockData
        cpuCores: 2, // Number of cores
        gpuUsageGpus: 2, // From OverviewPage.js mockData (two GPUs)
        gpuUsageHeaders: ["Metric", "Value"], // Headers for the GPU property table
        networkInterfacesRows: 2,
        networkInterfacesHeaders: ["Interface", "Upload", "Download", "Data Sent", "Data Received"],
        downloadHistoryRows: 3,
        downloadHistoryHeaders: ["ID", "File Name", "Source", "Status", "Timestamp", "Size", "Progress"],
        onlineUsers: 5, // From OverviewPage.js mockData
        totalTasksExecuted: 1500, // From OverviewPage.js mockData
        successfulTasks: 1450,
        failedTasks: 40,
        runningTasks: 10,
    };

    // Helper function for assertions
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

    // Test CPU Usage
    try {
        const cpuLoadEl = document.querySelector('#cpu-current-load');
        assertNotNull(cpuLoadEl, "CPU current load element not found.");
        assertEquals(cpuLoadEl.textContent.trim(), MOCK_DATA_CHECKS.cpuLoad, "CPU load mismatch.");

        const coreBarContainers = document.querySelectorAll('#cpu-core-bars-container .progress-bar-container');
        assertEquals(coreBarContainers.length, MOCK_DATA_CHECKS.cpuCores, "CPU core progress bar count mismatch.");
        if (coreBarContainers.length > 0) {
            const firstCoreBar = coreBarContainers[0].querySelector('.progress-bar');
            assertNotNull(firstCoreBar, "First CPU core progress bar not found.");
            // Check if style.width is set (e.g., "60%")
            if (!firstCoreBar.style.width || !firstCoreBar.style.width.endsWith('%')) {
                 throw new Error(`First CPU core bar width not set correctly: ${firstCoreBar.style.width}`);
            }
            assertIncludes(firstCoreBar.textContent, "Core 1", "First CPU core bar text incorrect.");
        }
        console.log("PASS: CPU Usage section populated correctly.");
    } catch (e) {
        console.error("FAIL: CPU Usage section check failed.", e.message, e.stack);
    }

    // Test GPU Usage Tables
    try {
        const gpuContainer = document.querySelector('#gpu-usage-tables-container');
        assertNotNull(gpuContainer, "GPU usage container not found.");
        const gpuTables = gpuContainer.querySelectorAll('.data-table.gpu-specific-table');
        assertEquals(gpuTables.length, MOCK_DATA_CHECKS.gpuUsageGpus, `GPU table count mismatch.`);

        if (gpuTables.length > 0) {
             const firstGpuTable = gpuTables[0];
             const captionEl = firstGpuTable.querySelector('caption');
             assertNotNull(captionEl, "GPU table caption not found for the first GPU.");
             // Example check for caption content - depends on mock data details
             assertIncludes(captionEl.textContent, "NVIDIA GeForce RTX 3080", "First GPU table caption content mismatch.");

             const headerCells = Array.from(firstGpuTable.querySelectorAll('thead th')).map(th => th.textContent.trim());
             MOCK_DATA_CHECKS.gpuUsageHeaders.forEach((header, index) => {
                assertEquals(headerCells[index], header, `GPU table header mismatch at index ${index} for the first GPU`);
             });
             // Check for progress bar in utilization cell
             const utilizationCell = firstGpuTable.querySelector('tbody tr:first-child td:last-child .progress-bar');
             assertNotNull(utilizationCell, "GPU utilization progress bar not found in the first GPU table.");
             if (!utilizationCell.style.width || !utilizationCell.style.width.endsWith('%')) {
                throw new Error(`First GPU utilization bar width not set correctly: ${utilizationCell.style.width}`);
            }
        }
        console.log("PASS: GPU Usage table(s) found and structured correctly.");
    } catch (e) {
        console.error("FAIL: GPU Usage table check failed.", e.message, e.stack);
    }

    // Test Network Interfaces Table
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

    // Test User & Task Statistics
    try {
        const onlineUsersEl = document.querySelector('#online-users-count');
        assertNotNull(onlineUsersEl, "Online users count element not found.");
        assertEquals(parseInt(onlineUsersEl.textContent.trim()), MOCK_DATA_CHECKS.onlineUsers, "Online users mismatch.");

        const totalTasksEl = document.querySelector('#total-tasks-executed');
        assertNotNull(totalTasksEl, "Total tasks executed element not found.");
        assertEquals(parseInt(totalTasksEl.textContent.trim()), MOCK_DATA_CHECKS.totalTasksExecuted, "Total tasks executed mismatch.");

        const successfulTasksEl = document.querySelector('#successful-tasks-count');
        assertNotNull(successfulTasksEl, "Successful tasks count element not found.");
        assertEquals(parseInt(successfulTasksEl.textContent.trim()), MOCK_DATA_CHECKS.successfulTasks, "Successful tasks mismatch.");

        const failedTasksEl = document.querySelector('#failed-tasks-count');
        assertNotNull(failedTasksEl, "Failed tasks count element not found.");
        assertEquals(parseInt(failedTasksEl.textContent.trim()), MOCK_DATA_CHECKS.failedTasks, "Failed tasks mismatch.");

        const runningTasksEl = document.querySelector('#running-tasks-count');
        assertNotNull(runningTasksEl, "Running tasks count element not found.");
        assertEquals(parseInt(runningTasksEl.textContent.trim()), MOCK_DATA_CHECKS.runningTasks, "Running tasks mismatch.");

        console.log("PASS: User & Task Statistics section populated correctly.");
    } catch (e) {
        console.error("FAIL: User & Task Statistics section check failed.", e.message, e.stack);
    }

    console.log("OverviewPage tests finished.");
    console.log("---------------------------------------------------------------------");
    console.log("To run these tests again, or if they failed due to timing issues:");
    console.log("1. Ensure the application is running and OverviewPage.js mock data matches the test expectations.");
    console.log("2. Open the browser's developer console.");
    console.log("3. Paste the content of this file (or load it as a script if not already done).");
    console.log("4. Execute the command: `runOverviewPageTests()`");
    console.log("---------------------------------------------------------------------");
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
