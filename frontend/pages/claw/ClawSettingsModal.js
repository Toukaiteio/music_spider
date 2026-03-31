// frontend/pages/claw/ClawSettingsModal.js

export class ClawSettingsModal {
    constructor(page) {
        this.page = page; // Reference to MusicClawPage instance
        this._editingModelId = null;
    }

    getHTML() {
        return `
            <!-- Settings Modal -->
            <div id="claw-settings-modal" class="modal-overlay" style="display:none; z-index: 1000; position: fixed; top:0; left:0; width:100%; height:100%; align-items:center; justify-content:center;">
                <div class="modal-content claw-settings-content" style="display: flex; flex-direction: column; border-radius: 16px; overflow: hidden;">
                    <div class="modal-header" style="padding: 16px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.1);">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="material-icons" style="color: var(--icon-color)">settings</span>
                            <h2 style="margin: 0; font-size: 1rem; font-weight: 500;">Music Claw Settings</h2>
                        </div>
                        <button id="claw-settings-close" class="icon-button" style="padding: 4px;"><span class="material-icons" style="font-size: 20px;">close</span></button>
                    </div>
                    <div class="modal-body" style="flex: 1; display: flex; overflow: hidden;">
                        
                        <!-- Models List Sidebar -->
                        <div class="claw-settings-sidebar">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding: 0 4px;">
                                <h3 style="margin: 0; font-size: 0.85rem; font-weight: 600; color: rgba(255,255,255,0.6);">MODELS</h3>
                                <button id="claw-settings-add-model" class="icon-button small primary" style="width:24px; height:24px;"><span class="material-icons" style="font-size:16px;">add</span></button>
                            </div>
                            <div id="claw-models-list" style="display: flex; flex-direction: column; gap: 4px;">
                                <!-- Model items rendered here -->
                            </div>
                        </div>

                        <!-- Model Editor Main -->
                        <div class="claw-settings-main">
                            <div id="claw-model-editor-panel" style="display: none; flex-direction: column; height: 100%;">
                                <div style="margin-bottom: 24px;">
                                    <h3 id="claw-model-editor-title" style="margin: 0; font-size: 1.4rem; font-weight: 600;">Edit Model</h3>
                                    <p style="margin: 4px 0 0; color: rgba(255,255,255,0.4); font-size: 0.9rem;">Configure your OpenAI SDK compatible model.</p>
                                </div>

                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                                    <div class="form-group">
                                        <label class="form-label">Provider Name</label>
                                        <input type="text" id="claw-model-provider" placeholder="e.g. OpenAI" class="form-control-premium">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Model Name</label>
                                        <input type="text" id="claw-model-name" placeholder="e.g. gpt-4o" class="form-control-premium">
                                    </div>
                                </div>

                                <div class="form-group" style="margin-bottom: 16px;">
                                    <label class="form-label">Base URL</label>
                                    <input type="text" id="claw-model-base-url" placeholder="https://api.openai.com/v1" class="form-control-premium">
                                </div>

                                <div class="form-group" style="margin-bottom: 16px;">
                                    <label class="form-label">API Keys (Separate by newline for Load Balancing)</label>
                                    <textarea id="claw-model-api-keys" placeholder="sk-..." class="form-control-premium" rows="4" style="font-family: 'Fira Code', monospace; font-size: 13px; -webkit-text-security: disc;"></textarea>
                                </div>

                                <div class="form-group">
                                    <label class="form-label">Failover & Load Balancing</label>
                                    <select id="claw-model-lb-mode" class="form-control-premium" style="appearance: none; background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22rgba(255,255,255,0.4)%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E'); background-repeat: no-repeat; background-position: right 10px center; background-size: 16px;">
                                        <option value="round_robin">Round Robin (Auto rotate)</option>
                                        <option value="fallback">Fallback (Serial switching on failure)</option>
                                    </select>
                                </div>

                                <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: auto; padding-top: 24px;">
                                    <button id="claw-settings-delete-model" class="btn" style="background: rgba(229, 62, 62, 0.15); color: #fc8181; border: 1px solid rgba(229, 62, 62, 0.2); padding: 8px 16px; border-radius: 8px; cursor: pointer;">Delete</button>
                                    <button id="claw-settings-save-model" class="btn primary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500;">Save Changes</button>
                                </div>
                            </div>
                            <div id="claw-model-editor-empty" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: rgba(255,255,255,0.3); text-align: center;">
                                <span class="material-icons" style="font-size: 48px; margin-bottom: 12px;">auto_awesome</span>
                                <p>Select a model from the sidebar to edit<br>or click the plus icon to add a new provider.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setup(container) {
        const btn = document.getElementById('claw-settings-button');
        const modal = document.getElementById('claw-settings-modal');
        const closeBtn = document.getElementById('claw-settings-close');
        if (!btn || !modal) return;

        btn.addEventListener('click', () => {
            this.render();
            modal.style.display = 'flex';
        });

        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        const addBtn = document.getElementById('claw-settings-add-model');
        const saveBtn = document.getElementById('claw-settings-save-model');
        const delBtn = document.getElementById('claw-settings-delete-model');

        addBtn.addEventListener('click', () => {
            this._editingModelId = null;
            this.showModelEditor({
                providerName: 'New Provider',
                model: 'gpt-4o',
                baseUrl: 'https://api.openai.com/v1',
                apiKeys: '',
                lbMode: 'round_robin'
            });
        });

        saveBtn.addEventListener('click', async () => {
            const pName = document.getElementById('claw-model-provider').value.trim();
            const mName = document.getElementById('claw-model-name').value.trim();
            const bUrl = document.getElementById('claw-model-base-url').value.trim();
            const keys = document.getElementById('claw-model-api-keys').value.trim();
            const lbMode = document.getElementById('claw-model-lb-mode').value;

            if (!pName || !mName || !keys) {
                alert("Provider, Model, and at least one API Key are required.");
                return;
            }

            const models = this.page.llmConfig.models || [];
            
            if (this._editingModelId) {
                const md = models.find(m => m.id === this._editingModelId);
                if (md) {
                    md.providerName = pName;
                    md.model = mName;
                    md.baseUrl = bUrl;
                    md.apiKeys = keys;
                    md.lbMode = lbMode;
                }
            } else {
                const newId = 'mdl_' + Date.now();
                models.push({
                    id: newId,
                    providerName: pName,
                    model: mName,
                    baseUrl: bUrl,
                    apiKeys: keys,
                    lbMode: lbMode,
                    adapter: 'openai_sdk'
                });
                this._editingModelId = newId;
                if (!this.page.llmConfig.active_model_id) {
                    this.page.llmConfig.active_model_id = newId;
                }
            }
            
            this.page.llmConfig.models = models;
            await this.page._saveLLMConfig();
            this.render();
            document.getElementById('claw-settings-save-model').textContent = 'Saved!';
            setTimeout(() => document.getElementById('claw-settings-save-model').textContent = 'Save Changes', 1000);
        });

        delBtn.addEventListener('click', async () => {
            if (!this._editingModelId) return;
            if (!confirm('Delete this model?')) return;
            
            let models = this.page.llmConfig.models || [];
            models = models.filter(m => m.id !== this._editingModelId);
            this.page.llmConfig.models = models;
            
            if (this.page.llmConfig.active_model_id === this._editingModelId) {
                this.page.llmConfig.active_model_id = models.length ? models[0].id : '';
            }
            
            await this.page._saveLLMConfig();
            this._editingModelId = null;
            this.render();
        });
    }

    render() {
        const listEl = document.getElementById('claw-models-list');
        const editor = document.getElementById('claw-model-editor-panel');
        const empty = document.getElementById('claw-model-editor-empty');

        const models = this.page.llmConfig.models || [];
        const activeId = this.page.llmConfig.active_model_id;

        if (models.length === 0) {
            listEl.innerHTML = '<div style="color: rgba(255,255,255,0.3); font-size: 0.85rem; padding: 20px; text-align:center;">No models configured.</div>';
            editor.style.display = 'none';
            empty.style.display = 'flex';
            this._editingModelId = null;
            return;
        }

        listEl.innerHTML = models.map(m => {
            const isEditing = this._editingModelId === m.id;
            const isActive = activeId === m.id;
            
            return `
                <div data-id="${this._esc(m.id)}" class="claw-settings-model-item ${isActive ? 'active' : ''} ${isEditing ? 'editing' : ''}" style="padding: 12px; border-radius: 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                    <div style="display:flex; flex-direction:column; gap:2px; flex:1; min-width:0;">
                        <span style="font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${isActive ? '#fff' : 'rgba(255,255,255,0.9)'}">${this._esc(m.providerName)}</span>
                        <span style="font-size: 11px; color: ${isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)'}">${this._esc(m.model)}</span>
                    </div>
                    ${isActive ? 
                        '<span class="material-icons" style="font-size:18px; margin-left:8px;">check_circle</span>' : 
                        '<button class="icon-button small set-active-btn" style="color: rgba(255,255,255,0.3);"><span class="material-icons" style="font-size:18px;">radio_button_unchecked</span></button>'
                    }
                </div>
            `;
        }).join('');

        // Attach events
        listEl.querySelectorAll('.claw-settings-model-item').forEach(item => {
            const id = item.dataset.id;
            item.addEventListener('click', async (e) => {
                if (e.target.closest('.set-active-btn')) {
                    // Set active
                    this.page.llmConfig.active_model_id = id;
                    await this.page._saveLLMConfig();
                    this.render();
                    e.stopPropagation();
                    return;
                }
                const md = models.find(m => m.id === id);
                this._editingModelId = id;
                this.showModelEditor(md);
                this.render(); // update selection visual
            });
        });

        if (!this._editingModelId && activeId) {
            this._editingModelId = activeId;
        }

        if (this._editingModelId) {
            const md = models.find(m => m.id === this._editingModelId);
            if (md) this.showModelEditor(md);
        } else {
            editor.style.display = 'none';
            empty.style.display = 'flex';
        }
    }

    showModelEditor(modelData) {
        document.getElementById('claw-model-editor-panel').style.display = 'flex';
        document.getElementById('claw-model-editor-empty').style.display = 'none';
        
        document.getElementById('claw-model-editor-title').textContent = this._editingModelId ? 'Edit Model' : 'Add New Model';
        document.getElementById('claw-model-provider').value = modelData.providerName || '';
        document.getElementById('claw-model-name').value = modelData.model || '';
        document.getElementById('claw-model-base-url').value = modelData.baseUrl || '';
        document.getElementById('claw-model-api-keys').value = modelData.apiKeys || '';
        document.getElementById('claw-model-lb-mode').value = modelData.lbMode || 'round_robin';
        
        const delBtn = document.getElementById('claw-settings-delete-model');
        if (this._editingModelId) {
            delBtn.style.display = 'block';
        } else {
            delBtn.style.display = 'none';
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
