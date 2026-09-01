// ===== Shared modal state =====
// editModalTagId: the tag currently being acted on (null while adding a new one).
let editModalTagId = null;

// ===== Render Sidebar =====

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

// ===== Tag Edit Modal: open/close =====

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

// ===== Tag Edit Modal: error display =====
// A red error line inside the modal body. An optional extra button (e.g.
// "Merge into...") can be shown beneath the message.
function showTagEditError(message, extraButtonHtml = '') {
    const err = document.getElementById('tag-edit-modal-error');
    if (!err) return;
    err.style.display = 'block';
    err.innerHTML = message + (extraButtonHtml ? `<div class="form-buttons" style="margin-top:8px">${extraButtonHtml}</div>` : '');
}

// ===== State: 3-button action list (Edit / Merge / Delete) =====

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

// ===== State: Delete =====
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

// ===== State: Edit name + color =====

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

// ===== State: Add tag =====

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

// ===== Shared: color picker (used by edit and add forms) =====

function selectColor(color) {
    document.getElementById('selected-color').value = color;
    document.querySelectorAll('.color-circle').forEach(el => {
        el.classList.toggle('selected', el.dataset.color === color);
    });
}