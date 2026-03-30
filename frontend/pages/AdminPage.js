class AdminPage {
    constructor() {
        this.pageId = 'admin-panel';
        this.containerInfo = {
            id: 'admin-panel-container',
            className: 'admin-page-container fade-enter'
        };
        this.cssPath = 'css/pages.css'; // Add basic styles there later if needed
    }

    getHTML() {
        return `
            <div id="${this.containerInfo.id}" class="${this.containerInfo.className}">
                <div class="admin-header">
                    <h2>Admin Dashboard</h2>
                </div>
                
                <div class="admin-section">
                    <h3>System Settings</h3>
                    <div class="setting-item" style="display: flex; gap: 10px; align-items: center; margin-bottom: 20px;">
                        <label>Allow User Registration:</label>
                        <select id="admin-reg-toggle">
                            <option value="1">Enabled</option>
                            <option value="0">Disabled</option>
                        </select>
                        <button id="admin-save-cfg-btn" class="dialog-button primary" style="margin-top: 0">Save</button>
                    </div>
                </div>

                <div class="admin-section">
                    <h3>User Management</h3>
                    <table class="admin-table" style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--border-color);">
                                <th style="padding: 10px;">ID</th>
                                <th style="padding: 10px;">Username</th>
                                <th style="padding: 10px;">Created At</th>
                                <th style="padding: 10px;">Is Admin</th>
                                <th style="padding: 10px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="admin-users-tbody">
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    onLoad(container, webSocketManager) {
        if (!localStorage.getItem("jwt_is_admin")) {
            // Prevent basic bypassing via hash change
            container.innerHTML = "<h3>Access Denied</h4>";
            return;
        }
        
        const tbody = document.getElementById("admin-users-tbody");
        const regToggle = document.getElementById("admin-reg-toggle");
        const saveCfgBtn = document.getElementById("admin-save-cfg-btn");

        const loadConfig = () => {
             webSocketManager.sendWebSocketCommand("get_sys_config", {}).then((res) => {
                 if (res.data.registration_enabled) {
                     regToggle.value = res.data.registration_enabled;
                 }
             }).catch(err => console.error(err));
        };
        
        const loadUsers = () => {
            webSocketManager.sendWebSocketCommand("get_users", {}).then((res) => {
                let html = "";
                res.data.forEach(u => {
                    html += `
                        <tr style="border-bottom: 1px solid var(--border-color);">
                            <td style="padding: 10px;">${u.id}</td>
                            <td style="padding: 10px;">${u.username}</td>
                            <td style="padding: 10px;">${u.created_at}</td>
                            <td style="padding: 10px;">${u.is_admin ? "Yes" : "No"}</td>
                            <td style="padding: 10px;">
                                <button class="dialog-button secondary edit-user-btn" style="margin: 0; padding: 4px 8px;" data-id="${u.id}" data-admin="${u.is_admin}">Toggle Admin</button>
                                <button class="dialog-button secondary reset-pw-btn" style="margin: 0 0 0 5px; padding: 4px 8px;" data-id="${u.id}">Reset Password</button>
                            </td>
                        </tr>
                    `;
                });
                tbody.innerHTML = html;
            }).catch(err => console.error(err));
        };

        saveCfgBtn.addEventListener("click", () => {
            webSocketManager.sendWebSocketCommand("set_sys_config", { key: "registration_enabled", value: regToggle.value })
            .then(() => alert("Saved"))
            .catch(e => alert(e.message));
        });

        tbody.addEventListener("click", (e) => {
            if (e.target.classList.contains("edit-user-btn")) {
                const id = e.target.getAttribute("data-id");
                const isAdmin = e.target.getAttribute("data-admin") === 'true';
                webSocketManager.sendWebSocketCommand("update_user", { user_id: id, is_admin: !isAdmin })
                .then(() => loadUsers())
                .catch(err => alert(err.message));
            } else if (e.target.classList.contains("reset-pw-btn")) {
                const id = e.target.getAttribute("data-id");
                const pw = prompt("Enter new password:");
                if (pw) {
                    webSocketManager.sendWebSocketCommand("update_user", { user_id: id, password: pw })
                    .then(() => alert("Password reset!"))
                    .catch(err => alert(err.message));
                }
            }
        });

        loadConfig();
        loadUsers();
    }
}

export default AdminPage;
