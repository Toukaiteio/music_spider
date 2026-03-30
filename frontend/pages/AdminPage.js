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
            <style>
                .admin-dashboard-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 24px;
                }
                .admin-card {
                    background: rgba(30,30,35,0.7);
                    backdrop-filter: blur(16px);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 16px;
                    padding: 24px;
                    display: flex;
                    flex-direction: column;
                }
                .full-width-section {
                    grid-column: 1 / -1;
                }
                @media (min-width: 1024px) {
                    .admin-dashboard-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
                @media (max-width: 768px) {
                    .crawler-inputs-row {
                        grid-template-columns: 1fr !important;
                    }
                    .crawler-action-row {
                        flex-direction: column !important;
                    }
                    .crawler-action-row input, .crawler-action-row button {
                        width: 100% !important;
                    }
                }
            </style>
            <div id="${this.containerInfo.id}" class="${this.containerInfo.className}" style="padding: 20px 30px; max-width: 1600px; margin: 0 auto; color: #fff; box-sizing: border-box; width: 100%;">
                
                <div class="admin-dashboard-grid">
                    
                    <!-- System Settings -->
                    <div class="admin-card">
                        <h3 style="margin-top: 0; margin-bottom: 20px; font-weight: 600; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
                            <span class="material-icons">settings</span> System Settings
                        </h3>
                        <div class="setting-item" style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap; flex: 1; align-content: flex-start;">
                            <label style="color: rgba(255,255,255,0.8); font-size: 0.95rem;">Allow User Registration:</label>
                            <select id="admin-reg-toggle" style="padding: 10px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff; outline: none; flex: 1; min-width: 150px;">
                                <option value="1">Enabled</option>
                                <option value="0">Disabled</option>
                            </select>
                            <button id="admin-save-cfg-btn" class="dialog-button primary" style="margin: 0; padding: 10px 24px; border-radius: 8px; font-weight: 500;">Save Changes</button>
                        </div>
                    </div>

                    <!-- Crawler Engine -->
                    <div class="admin-card">
                        <h3 style="margin-top: 0; margin-bottom: 20px; font-weight: 600; font-size: 1.2rem; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="material-icons">bug_report</span> Crawler Engine
                            </div>
                            <span id="crawler-stats-badge" style="font-size: 0.75rem; font-weight: 600; background: rgba(255,255,255,0.1); padding: 4px 12px; border-radius: 20px; letter-spacing: 0.5px;">IDLE</span>
                        </h3>
                        
                        <div style="display: flex; flex-direction: column; gap: 16px; flex: 1;">
                            <div class="crawler-inputs-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    <label style="font-size: 0.85rem; color: rgba(255,255,255,0.7);">Source Platform</label>
                                    <select id="crawler-source-select" style="padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff; outline: none;">
                                        <option value="netease">NetEase Cloud Music</option>
                                        <option value="kugou">KuGou Music</option>
                                    </select>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    <label style="font-size: 0.85rem; color: rgba(255,255,255,0.7);">Target Type</label>
                                    <select id="crawler-type-select" style="padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff; outline: none;">
                                        <option value="playlist">Playlist (URL / ID)</option>
                                        <option value="artist">Artist (URL / ID)</option>
                                        <option value="album">Album (URL / ID)</option>
                                    </select>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    <label style="font-size: 0.85rem; color: rgba(255,255,255,0.7);">Quality</label>
                                    <select id="crawler-quality-select" style="padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff; outline: none;">
                                        <option value="lossless">Lossless (highest)</option>
                                        <option value="exhigh">ExHigh</option>
                                        <option value="higher">Higher</option>
                                        <option value="standard">Standard</option>
                                    </select>
                                </div>
                            </div>

                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                <label style="font-size: 0.85rem; color: rgba(255,255,255,0.7);">Target ID or Share URL</label>
                                <div class="crawler-action-row" style="display: flex; gap: 12px;">
                                    <input type="text" id="crawler-target-input" placeholder="e.g. y.music.163.com/v/playlist?id=xxx" style="flex: 1; padding: 10px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: #fff; outline: none;" />
                                    <button id="crawler-add-task-btn" class="dialog-button primary" style="margin: 0; padding: 10px 20px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 6px; flex-shrink: 0; font-weight: 500;">
                                        <span class="material-icons" style="font-size: 18px;">add_task</span> Dispatch
                                    </button>
                                </div>
                            </div>
                            
                            <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 8px 0;" />
                            
                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                <label style="font-size: 0.85rem; color: rgba(255,255,255,0.7); display: flex; justify-content: space-between;">
                                    <span>Background Tasks</span>
                                </label>
                                <div style="overflow-x: auto; max-height: 250px; overflow-y: auto;">
                                    <table class="admin-table" style="width: 100%; border-collapse: collapse; text-align: left;">
                                        <thead>
                                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); font-size: 0.75rem; text-transform: uppercase;">
                                                <th style="padding: 8px 12px;">Pfm</th>
                                                <th style="padding: 8px 12px;">Type</th>
                                                <th style="padding: 8px 12px;">Target</th>
                                                <th style="padding: 8px 12px;">Status</th>
                                                <th style="padding: 8px 12px; text-align: right;">Results</th>
                                                <th style="padding: 8px 12px; text-align: right;">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody id="crawler-tasks-tbody" style="font-size: 0.85rem;">
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- User Management -->
                    <div class="admin-card full-width-section">
                        <h3 style="margin-top: 0; margin-bottom: 20px; font-weight: 600; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
                            <span class="material-icons">people</span> User Management
                        </h3>
                        <div style="overflow-x: auto;">
                            <table class="admin-table" style="width: 100%; border-collapse: collapse; text-align: left;">
                                <thead>
                                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">
                                        <th style="padding: 12px 16px; white-space: nowrap;">ID</th>
                                        <th style="padding: 12px 16px; white-space: nowrap;">Username</th>
                                        <th style="padding: 12px 16px; white-space: nowrap;">Created At</th>
                                        <th style="padding: 12px 16px; white-space: nowrap;">Is Admin</th>
                                        <th style="padding: 12px 16px; text-align: right; white-space: nowrap;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="admin-users-tbody" style="font-size: 0.95rem;">
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    onLoad(container, subPageId, appState, managers) {
        const webSocketManager = managers.webSocketManager;
        
        // Clean up old listener if exists
        if (this._crawlerUpdateListener) {
            document.removeEventListener("crawler_status_update", this._crawlerUpdateListener);
        }
        
        this._crawlerUpdateListener = (e) => {
            // Throttled refresh to avoid blasting the UI
            if (this._throttleTimer) return;
            this._throttleTimer = setTimeout(() => {
                updateCrawlerStatus();
                this._throttleTimer = null;
            }, 500);
        };
        document.addEventListener("crawler_status_update", this._crawlerUpdateListener);

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
                const usersList = res.data.users || [];
                usersList.forEach(u => {
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

        const updateCrawlerStatus = () => {
             webSocketManager.sendWebSocketCommand("get_crawler_status", {}).then((res) => {
                 const badge = document.getElementById("crawler-stats-badge");
                 if (badge && res.data) {
                     let txt = res.data.is_running ? "Engine Active" : "Engine Idle";
                     txt += ` | Pending: ${res.data.queue_size} | Cached: NT(${res.data.crawled_netease}) KG(${res.data.crawled_kugou})`;
                     badge.textContent = txt;
                     badge.style.color = res.data.is_running ? "var(--accent-color)" : "#ccc";
                     
                     const tbody = document.getElementById("crawler-tasks-tbody");
                     if (tbody && res.data.tasks) {
                         tbody.innerHTML = "";
                         res.data.tasks.forEach(task => {
                             const tr = document.createElement("tr");
                             tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
                             
                             let statusColor = "#ccc";
                             if (task.status === "running") statusColor = "var(--primary-color)";
                             if (task.status === "completed") statusColor = "var(--accent-color)";
                             if (task.status === "failed") statusColor = "#ff4d4d";
                             if (task.status === "paused") statusColor = "#f0ad4e";
                             
                             let actionBtns = '';
                             if (task.status === "pending" || task.status === "running") {
                                 actionBtns = `<button class="dialog-button small crawler-pause-btn" data-id="${task.id}" style="padding: 4px 8px; font-size: 0.7rem;">Pause</button>`;
                             } else if (task.status === "paused") {
                                 actionBtns = `<button class="dialog-button small primary crawler-resume-btn" data-id="${task.id}" style="padding: 4px 8px; font-size: 0.7rem;">Resume</button>`;
                             }
                             
                             let targetPreview = task.target;
                             if (targetPreview.length > 25) targetPreview = targetPreview.substring(0, 25) + '...';
                             
                             let previewTooltip = "";
                             if (task.preview && task.preview.length > 0) {
                                 previewTooltip = task.preview.map(p => {
                                     const title = p.title || p.name || "Unknown";
                                     const artist = p.artist ? ` - ${p.artist}` : "";
                                     const hasArt = p.artwork_url ? " [Art]" : " [No Art]";
                                     return `${title}${artist}${hasArt}`;
                                 }).join("\n");
                             }
                             
                             let progressInfo = "-";
                             if (task.total_tracks > 0) {
                                  const pct = Math.round((task.completed_tracks / task.total_tracks) * 100);
                                  progressInfo = `
                                     <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                                         <span style="font-size: 0.75rem; color: rgba(255,255,255,0.7);">${task.completed_tracks}/${task.total_tracks} (${pct}%)</span>
                                         <div style="width: 80px; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                                             <div style="width: ${pct}%; height: 100%; background: var(--accent-color); transition: width 0.3s ease;"></div>
                                         </div>
                                         ${task.failed_tracks > 0 ? `<span style="font-size: 0.65rem; color: #ff4d4d;">${task.failed_tracks} failed</span>` : ''}
                                     </div>
                                  `;
                             } else if (task.results_count > 0) {
                                 progressInfo = `${task.results_count} items`;
                             }

                             tr.innerHTML = `
                                 <td style="padding: 8px 12px; color: rgba(255,255,255,0.8);">${task.source}</td>
                                 <td style="padding: 8px 12px; color: rgba(255,255,255,0.8); text-transform: capitalize;">${task.task_type}</td>
                                 <td style="padding: 8px 12px; color: rgba(255,255,255,0.6);" title="${task.target}">${targetPreview}</td>
                                 <td style="padding: 8px 12px; color: ${statusColor}; font-weight: 600; text-transform: uppercase; font-size: 0.75rem;">${task.status}</td>
                                 <td style="padding: 8px 12px; text-align: right; color: rgba(255,255,255,0.8); white-space: pre-line;" title="${previewTooltip}">${progressInfo}</td>
                                 <td style="padding: 8px 12px; text-align: right;">${actionBtns}</td>
                             `;
                             tbody.appendChild(tr);
                         });
                         
                         if (res.data.tasks.length === 0) {
                             tbody.innerHTML = '<tr><td colspan="6" style="padding: 16px; text-align: center; color: rgba(255,255,255,0.4);">No tasks running</td></tr>';
                         }
                         
                         setTimeout(() => {
                            const btn = document.getElementById("admin-tab-btn");
                            if(btn && !btn.classList.contains("active")) {
                                if(this._crawlerUpdateListener) {
                                    document.removeEventListener("crawler_status_update", this._crawlerUpdateListener);
                                    this._crawlerUpdateListener = null;
                                }
                            }
                        }, 100);
                     }
                 }
             }).catch(e => console.error(e));
        };

        const crawlerTbody = document.getElementById("crawler-tasks-tbody");
        if (crawlerTbody) {
            crawlerTbody.addEventListener("click", (e) => {
                const target = e.target;
                if (target.classList.contains("crawler-pause-btn") || target.classList.contains("crawler-resume-btn")) {
                    const id = target.getAttribute("data-id");
                    const action = target.classList.contains("crawler-pause-btn") ? "pause" : "resume";
                    webSocketManager.sendWebSocketCommand("control_crawler_task", { action: action, task_id: id })
                    .then(() => updateCrawlerStatus())
                    .catch(err => alert(err.message));
                }
            });
        }

        const crawlerBtn = document.getElementById("crawler-add-task-btn");
        if (crawlerBtn) {
            crawlerBtn.addEventListener("click", () => {
                if (crawlerBtn.disabled) return;
                crawlerBtn.disabled = true;
                setTimeout(() => crawlerBtn.disabled = false, 1500);

                const src = document.getElementById("crawler-source-select").value;
                const type = document.getElementById("crawler-type-select").value;
                const target = document.getElementById("crawler-target-input").value;
                const quality = document.getElementById("crawler-quality-select").value;
                if (!target) return managers.uiManager.showToast("Target is required", "error");
                
                webSocketManager.sendWebSocketCommand("add_crawler_task", { task_type: type, source: src, target: target, quality: quality })
                .then((res) => {
                    managers.uiManager.showToast(res.data.message, "success");
                    document.getElementById("crawler-target-input").value = "";
                    updateCrawlerStatus(); // instant refresh
                }).catch(err => managers.uiManager.showToast(err.message, "error"));
            });
        }

        loadConfig();
        loadUsers();
        updateCrawlerStatus();
    }

    onUnload() {
        if (this._crawlerUpdateListener) {
            document.removeEventListener("crawler_status_update", this._crawlerUpdateListener);
            this._crawlerUpdateListener = null;
        }
    }
}

export default AdminPage;
