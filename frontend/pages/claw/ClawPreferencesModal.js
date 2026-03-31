// frontend/pages/claw/ClawPreferencesModal.js

export class ClawPreferencesModal {
    constructor(managers) {
        this.managers = managers;
    }

    getHTML() {
        return `
            <!-- Preferences Stats Modal -->
            <div id="claw-preferences-modal" class="modal-overlay" style="display:none; z-index: 1000; position: fixed; top:0; left:0; width:100%; height:100%; align-items:center; justify-content:center;">
                <div class="modal-content claw-settings-content" style="display: flex; flex-direction: column; border-radius: 16px; overflow: hidden; max-width: 85vw;">
                    <div class="modal-header" style="padding: 16px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.1);">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="material-icons" style="color: #4ade80">insights</span>
                            <h2 style="margin: 0; font-size: 1rem; font-weight: 500;">Listening Insights</h2>
                        </div>
                        <button id="claw-preferences-close" class="icon-button" style="padding: 4px;"><span class="material-icons" style="font-size: 20px;">close</span></button>
                    </div>
                    <div id="claw-preferences-content" class="modal-body" style="flex: 1; padding: 24px; overflow-y: auto; background: rgba(20,20,25, 0.5);">
                        <div style="display:flex; align-items:center; justify-content:center; height:100%; color:rgba(255,255,255,0.3);">
                            <div class="claw-spinner"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setup(container) {
        const btn = document.getElementById('claw-preferences-button');
        const modal = document.getElementById('claw-preferences-modal');
        const closeBtn = document.getElementById('claw-preferences-close');
        if (!btn || !modal) return;

        btn.addEventListener('click', async () => {
            modal.style.display = 'flex';
            await this.render();
        });

        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        // Removed the problematic container argument dependencies from previous nested functions
    }

    async render() {
        const contentEl = document.getElementById('claw-preferences-content');
        if (!contentEl) return;

        contentEl.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; height:100%; color:rgba(255,255,255,0.3);">
                <div class="claw-spinner"></div>
            </div>
        `;

        try {
            const resp = await this.managers.webSocketManager.sendWebSocketCommand('get_user_preferences', {});
            // If the code is missing or there's an error, we display it gracefully
            if (resp.code !== 0 && resp.code !== undefined) {
                // If there is no user preferences, it might return empty or error.
            }
            let data = resp.data || {};

            const topArtists = Object.entries(data.top_artists || {}).sort((a,b) => b[1]-a[1]).slice(0, 5);
            const topLangs = Object.entries(data.top_languages || {}).sort((a,b) => b[1]-a[1]).slice(0, 5);
            const totalHours = ((data.total_listening_time_seconds || 0) / 3600).toFixed(1);
            
            let html = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
                    <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 12px; text-align: center; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5); text-transform: uppercase; margin-bottom: 8px; font-weight: 600; letter-spacing: 0.5px;">Total Listening</div>
                        <div style="font-size: 2.5rem; font-weight: 700; color: #4ade80;">${totalHours} <span style="font-size: 1rem; font-weight: 500; color: rgba(255,255,255,0.4);">hrs</span></div>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 12px; text-align: center; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5); text-transform: uppercase; margin-bottom: 8px; font-weight: 600; letter-spacing: 0.5px;">Peak Hours</div>
                        <div style="font-size: 1.5rem; font-weight: 600; color: #fff; margin-top: 10px;">${(data.peak_listening_hours || []).map(h => String(h).padStart(2, '0')+':00').join(', ') || 'N/A'}</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                    <section style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column;">
                        <h3 style="font-size: 1rem; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; color: #fff;">
                            <span class="material-icons" style="font-size: 20px; color: var(--icon-color, #007aff)">person</span>
                            Top Artists
                        </h3>
                        <div style="flex: 1; min-height: 250px; position: relative;">
                            ${topArtists.length ? '<canvas id="claw-artists-chart"></canvas>' : '<div style="color: rgba(255,255,255,0.2); font-size: 0.9rem; padding: 10px; text-align: center; margin-top: 50px;">No data yet</div>'}
                        </div>
                    </section>

                    <section style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column;">
                        <h3 style="font-size: 1rem; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; color: #fff;">
                            <span class="material-icons" style="font-size: 20px; color: #ffcc00">language</span>
                            Languages
                        </h3>
                        <div style="flex: 1; min-height: 250px; position: relative;">
                            ${topLangs.length ? '<canvas id="claw-languages-chart"></canvas>' : '<div style="color: rgba(255,255,255,0.2); font-size: 0.9rem; padding: 10px; text-align: center; margin-top: 50px;">No data yet</div>'}
                        </div>
                    </section>
                </div>

                <section style="margin-top: 30px;">
                    <h3 style="font-size: 1rem; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; color: #fff;">
                        <span class="material-icons" style="font-size: 20px; color: #94a3b8">history</span>
                        Recent Activity
                    </h3>
                    <div style="display: flex; flex-direction: column; gap: 6px; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                        ${(data.recent_history || []).reverse().slice(0, 10).map((h, i) => `
                            <div style="display: flex; align-items: center; gap: 16px; font-size: 0.85rem; padding: 10px 12px; border-radius: 8px; background: ${i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}; transition: background 0.2s;">
                                <span style="color: #64748b; width: 65px; font-weight: 500;">${new Date(h.timestamp*1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                <span style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #f1f5f9; font-weight: 500;">${this._esc(h.title)} <span style="color: #94a3b8; font-weight: 400;">— ${this._esc(h.artist)}</span></span>
                                <span style="padding: 4px 8px; border-radius: 6px; background: ${h.action === 'start' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.08)'}; color: ${h.action === 'start' ? '#4ade80' : '#cbd5e1'}; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.5px;">${(h.action || '').toUpperCase()}</span>
                            </div>
                        `).join('')}
                        ${(data.recent_history || []).length === 0 ? '<div style="color: rgba(255,255,255,0.3); padding: 16px; text-align: center;">No recent activity</div>' : ''}
                    </div>
                </section>
            `;
            contentEl.innerHTML = html;

            if (topArtists.length && window.Chart) {
                const ctx = document.getElementById('claw-artists-chart').getContext('2d');
                new window.Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: topArtists.map(a => a[0].length > 15 ? a[0].substring(0, 15) + '...' : a[0]),
                        datasets: [{
                            label: 'Listening Time (mins)',
                            data: topArtists.map(a => Math.round(a[1]/60)),
                            backgroundColor: 'rgba(74, 222, 128, 0.7)',
                            borderColor: 'rgba(74, 222, 128, 1)',
                            borderWidth: 1,
                            borderRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        indexAxis: 'y',
                        plugins: {
                            legend: { display: false },
                            tooltip: { theme: 'dark' }
                        },
                        scales: {
                            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)' } },
                            y: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.8)' } }
                        }
                    }
                });
            }

            if (topLangs.length && window.Chart) {
                const ctx = document.getElementById('claw-languages-chart').getContext('2d');
                new window.Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: topLangs.map(l => l[0].toUpperCase()),
                        datasets: [{
                            data: topLangs.map(l => l[1]),
                            backgroundColor: [
                                'rgba(250, 204, 21, 0.8)',
                                'rgba(96, 165, 250, 0.8)',
                                'rgba(248, 113, 113, 0.8)',
                                'rgba(167, 139, 250, 0.8)',
                                'rgba(52, 211, 153, 0.8)'
                            ],
                            borderColor: 'rgba(30, 30, 34, 1)', // match modal bg
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'right', labels: { color: 'rgba(255,255,255,0.7)', padding: 15 } }
                        },
                        cutout: '70%'
                    }
                });
            }

        } catch (e) {
            contentEl.innerHTML = `<div style="color: #fc8181; text-align: center; padding: 40px; background: rgba(252, 129, 129, 0.1); border-radius: 12px; border: 1px solid rgba(252, 129, 129, 0.2); margin: 20px;">
                <span class="material-icons" style="font-size: 48px; margin-bottom: 16px; display: block; opacity: 0.8;">error_outline</span>
                Error loading insights: ${this._esc(e.message)}
            </div>`;
        }
    }

    _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
