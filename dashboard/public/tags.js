// ===== State =====

let tags = [];

const COLORS = [
    '#AD1457', '#D81B60', '#E67C73', '#F4511E', 
    '#F09300', '#F6BF26', '#7CB342', '#0B8043', 
    '#009688', '#33B679', '#039BE5', '#3F51B5', 
    '#B39DDB', '#9E69AF', '#8E24AA', '#795548'
];

// editModalTagId: the tag currently being acted on (null while adding a new one).
let editModalTagId = null;

// Merge-flow state — only meaningful while the merge step of the edit
// modal is open.
let mergeTargetId = null;
let mergeCandidates = [];

// ===== Load =====

async function loadTags() {
    const res = await fetch(`/tags?spaceId=${activeSpaceId}`);
    tags = await res.json();
    if (typeof renderTable === 'function') renderTable();
    renderSidebar();
    if (typeof renderAnalyticsChart === 'function') renderAnalyticsChart();
}

function renderSidebar() {
    const container = document.getElementById('tag-list');

    container.innerHTML = tags.map(tag => {
        const contrast = getContrastColor(tag.color);
        return `
            <div class="tag-chip main-chip" style="background:${tag.color || '#333'}; color:${contrast}" onclick="openTagEditModal('${tag.id}')">${tag.name} <span class="tag-phrase-count">${getPhraseCountForTag(tag)}</span></div>
        `;
    }).join('');
}

// Relies on allPhrases (from phrasesTable.js) already being loaded —
// loadTable() re-renders the sidebar after refreshing it, so counts stay
// in sync.
function getPhraseCountForTag(tag) {
    if (typeof allPhrases === 'undefined') return 0;
    return allPhrases.filter(p => p.tag_id === tag.id).length;
}

// ===== Tag edit modal: open/close =====

function openTagEditModal(tagId) {
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;
    editModalTagId = tagId;
    document.getElementById('tag-edit-modal-title').textContent = tag.name;
    renderTagEditActions();
    document.getElementById('tag-edit-modal-overlay').style.display = 'flex';
}

function openAddTagModal() {
    editModalTagId = null;
    document.getElementById('tag-edit-modal-title').textContent = 'New tag';
    renderAddTagForm();
    document.getElementById('tag-edit-modal-overlay').style.display = 'flex';
}

function closeTagEditModal() {
    editModalTagId = null;
    mergeTargetId = null;
    mergeCandidates = [];
    document.getElementById('tag-edit-modal-overlay').style.display = 'none';
}

// A red error line inside the modal body. An optional extra button (e.g.
// "Merge into...") can be shown beneath the message.
function showTagEditError(message, extraButtonHtml = '') {
    const err = document.getElementById('tag-edit-modal-error');
    if (!err) return;
    err.style.display = 'block';
    err.innerHTML = message + (extraButtonHtml ? `<div class="form-buttons" style="margin-top:8px">${extraButtonHtml}</div>` : '');
}

// ===== Tag edit modal: 3-button action list (Edit / Merge / Delete) =====

function renderTagEditActions() {
    const body = document.getElementById('tag-edit-modal-body');
    body.innerHTML = `
        <div class="tag-edit-actions">
            <button onclick="renderTagEditEdit()">✎ Edit</button>
            <button onclick="renderTagEditMerge()">⇄ Merge into...</button>
            <button class="danger" onclick="handleTagEditDelete()">🗑 Delete</button>
        </div>
        <div id="tag-edit-modal-error" class="form-error" style="display:none"></div>
    `;
    document.getElementById('tag-edit-modal-footer').innerHTML = `
        <button onclick="closeTagEditModal()">Cancel</button>
    `;
}

// Deletes immediately. If the server blocks it (tag still has phrases
// linked), show the reason in red, with a quick "Merge into..." shortcut.
async function handleTagEditDelete() {
    const id = editModalTagId;
    const res = await fetch(`/tags/${id}`, { method: 'DELETE' });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showTagEditError(
            data.error || 'Failed to delete tag',
            `<button class="primary" onclick="renderTagEditMerge()">Merge into...</button>`
        );
        return;
    }

    closeTagEditModal();
    await loadTags();
}

// ===== Tag edit modal: edit name + color =====

function renderTagEditEdit() {
    const tag = tags.find(t => t.id === editModalTagId);
    const usedColors = tags.filter(t => t.color).map(t => t.color);

    const body = document.getElementById('tag-edit-modal-body');
    body.innerHTML = `
        <div class="tag-form-inner">
            <input id="tag-edit-name-input" type="text" placeholder="Tag name"
                value="${tag.name}" autocomplete="off" />
            <div class="color-grid">
                ${COLORS.map(c => {
                    const taken = usedColors.includes(c) && c !== tag.color;
                    return `
                        <div class="color-circle ${tag.color === c ? 'selected' : ''} ${taken ? 'disabled' : ''}"
                            style="background:${c}"
                            onclick="${taken ? '' : `selectColor('${c}')`}"
                            data-color="${c}">
                        </div>
                    `;
                }).join('')}
            </div>
            <input type="hidden" id="selected-color" value="${tag.color || ''}" />
        </div>
        <div id="tag-edit-modal-error" class="form-error" style="display:none"></div>
    `;
    document.getElementById('tag-edit-modal-footer').innerHTML = `
        <button onclick="closeTagEditModal()">Cancel</button>
        <button class="primary" onclick="submitTagEdit()">Save</button>
    `;
}

async function submitTagEdit() {
    const name = document.getElementById('tag-edit-name-input').value.trim();
    if (!name) return;
    const colorEl = document.getElementById('selected-color');
    const color = colorEl ? colorEl.value : null;

    const res = await fetch(`/tags/${editModalTagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
    });

    if (!res.ok) {
        showTagEditError('Failed to save tag.');
        return;
    }

    closeTagEditModal();
    await loadTags();
}

// ===== Tag edit modal: add tag =====

function renderAddTagForm() {
    const usedColors = tags.filter(t => t.color).map(t => t.color);
    const body = document.getElementById('tag-edit-modal-body');
    body.innerHTML = `
        <div class="tag-form-inner">
            <input id="tag-edit-name-input" type="text" placeholder="Tag name" autocomplete="off" />
            <div class="color-grid">
                ${COLORS.map(c => {
                    const taken = usedColors.includes(c);
                    return `
                        <div class="color-circle ${taken ? 'disabled' : ''}"
                            style="background:${c}"
                            onclick="${taken ? '' : `selectColor('${c}')`}"
                            data-color="${c}">
                        </div>
                    `;
                }).join('')}
            </div>
            <input type="hidden" id="selected-color" value="" />
        </div>
        <div id="tag-edit-modal-error" class="form-error" style="display:none"></div>
    `;
    document.getElementById('tag-edit-modal-footer').innerHTML = `
        <button onclick="closeTagEditModal()">Cancel</button>
        <button class="primary" onclick="submitAddTag()">Add</button>
    `;
}

async function submitAddTag() {
    const name = document.getElementById('tag-edit-name-input').value.trim();
    if (!name) return;
    const colorEl = document.getElementById('selected-color');
    const color = colorEl ? colorEl.value : null;

    const res = await fetch('/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, spaceId: activeSpaceId })
    });

    if (!res.ok) {
        showTagEditError('Failed to add tag.');
        return;
    }

    closeTagEditModal();
    await loadTags();
}

// Shared by the edit and add forms.
function selectColor(color) {
    document.getElementById('selected-color').value = color;
    document.querySelectorAll('.color-circle').forEach(el => {
        el.classList.toggle('selected', el.dataset.color === color);
    });
}

// ===== Tag edit modal: merge flow =====
// Flat tags now, so every other tag in the space is a valid merge target.

function renderTagEditMerge() {
    mergeTargetId = null;
    const tag = tags.find(t => t.id === editModalTagId);
    mergeCandidates = tags.filter(t => t.id !== editModalTagId);
    const body = document.getElementById('tag-edit-modal-body');

    if (!mergeCandidates.length) {
        body.innerHTML = `
            <div class="tag-name">No other tags to merge "${tag.name}" into.</div>
            <div id="tag-edit-modal-error" class="form-error" style="display:none"></div>
        `;
        document.getElementById('tag-edit-modal-footer').innerHTML = `
            <button onclick="closeTagEditModal()">Cancel</button>
        `;
        return;
    }

    body.innerHTML = `
        <div class="tag-name">Merge "${tag.name}" into:</div>
        <div class="merge-autocomplete">
            <input id="merge-search-input" type="text" placeholder="Type to search tags..."
                autocomplete="off"
                oninput="filterMergeOptions(this.value)"
                onfocus="showMergeDropdown()"
                onblur="hideMergeDropdown()" />
            <div class="merge-dropdown" id="merge-dropdown"></div>
        </div>
        <div id="tag-edit-modal-error" class="form-error" style="display:none"></div>
    `;
    document.getElementById('tag-edit-modal-footer').innerHTML = `
        <button onclick="closeTagEditModal()">Cancel</button>
        <button class="primary" onclick="submitMerge()">Save</button>
    `;

    renderMergeDropdown(mergeCandidates);
}

function filterMergeOptions(query) {
    mergeTargetId = null;
    const filtered = mergeCandidates.filter(t =>
        t.name.toLowerCase().includes(query.trim().toLowerCase())
    );
    renderMergeDropdown(filtered);
    showMergeDropdown();
}

function showMergeDropdown() {
    document.getElementById('merge-dropdown').classList.add('open');
}

function hideMergeDropdown() {
    setTimeout(() => {
        document.getElementById('merge-dropdown')?.classList.remove('open');
    }, 150);
}

function submitMerge() {
    if (!mergeTargetId) return;
    const source = tags.find(t => t.id === editModalTagId);
    const target = tags.find(t => t.id === mergeTargetId);
    renderMergeConfirm(source, target);
}

function renderMergeDropdown(options) {
    const dropdown = document.getElementById('merge-dropdown');
    dropdown.innerHTML = options.length
        ? options.map(t => `
            <div class="merge-dropdown-item" data-id="${t.id}" onmousedown="selectMergeTarget('${t.id}')">
                ${t.name}
            </div>
        `).join('')
        : `<div class="merge-dropdown-empty">No matches</div>`;
}

function selectMergeTarget(id) {
    mergeTargetId = id;
    const target = mergeCandidates.find(t => t.id === id);
    document.getElementById('merge-search-input').value = target.name;
    hideMergeDropdown();
}

// "Back" returns to the search step of this same action (not a full modal
// close) since it's a second step within one flow.
function renderMergeConfirm(source, target) {
    const body = document.getElementById('tag-edit-modal-body');
    body.innerHTML = `
        <div class="tag-name">
            Move all phrases from "${source.name}" into "${target.name}" and delete "${source.name}"?
            This cannot be undone.
        </div>
        <div id="tag-edit-modal-error" class="form-error" style="display:none"></div>
    `;
    document.getElementById('tag-edit-modal-footer').innerHTML = `
        <button onclick="renderTagEditMerge()">Back</button>
        <button class="primary" onclick="confirmMerge('${source.id}', '${target.id}')">Confirm merge</button>
    `;
}

async function confirmMerge(sourceId, targetId) {
    const res = await fetch('/tags/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, targetId })
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showTagEditError(data.error || 'Failed to merge tags');
        return;
    }

    closeTagEditModal();
    await loadTags();
    if (typeof loadTable === 'function') loadTable();
}