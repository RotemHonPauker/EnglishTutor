// ===== Shared modal state =====
// editModalTagId: for existing-tag actions, the tag being acted on.
//                 for "add subtag", the main tag it will belong to.
// editModalIsMain: whether editModalTagId refers to a main tag (affects
//                  whether a color grid is shown and which 3rd action shows).
let editModalTagId = null;
let editModalIsMain = false;

// ===== Render Sidebar =====

function renderSidebar() {
    const container = document.getElementById('tag-list');
    const mainTags = tags.filter(t => !t.parent_id);

    container.innerHTML = mainTags.map(mainTag => {
        const contrast = getContrastColor(mainTag.color);
        const subtags = tags.filter(t => t.parent_id === mainTag.id);
        const subChips = subtags.map(sub => `
            <div class="tag-chip" style="background:${mainTag.color || '#333'}; color:${contrast}" onclick="openTagEditModal('${sub.id}')">${sub.name}</div>
        `).join('');

        return `
            <div class="tag-filter-group">
                <div class="tag-chip main-chip" style="background:${mainTag.color || '#333'}; color:${contrast}" onclick="openTagEditModal('${mainTag.id}')">${mainTag.name}</div>
                <div class="subtag-list">
                    ${subChips}
                </div>
            </div>
        `;
    }).join('');
}

// ===== Tag Edit Modal: open/close =====

function openTagEditModal(tagId) {
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;
    editModalTagId = tagId;
    editModalIsMain = !tag.parent_id;
    document.getElementById('tag-edit-modal-title').textContent = tag.name;
    renderTagEditActions();
    document.getElementById('tag-edit-modal-overlay').style.display = 'flex';
}

function openAddMainTagModal() {
    editModalTagId = null;
    editModalIsMain = true;
    document.getElementById('tag-edit-modal-title').textContent = 'New main tag';
    renderAddMainTagForm();
    document.getElementById('tag-edit-modal-overlay').style.display = 'flex';
}

function closeTagEditModal() {
    editModalTagId = null;
    editModalIsMain = false;
    mergeTargetId = null;
    mergeSiblings = [];
    document.getElementById('tag-edit-modal-overlay').style.display = 'none';
}

// ===== Tag Edit Modal: error display =====
// A red error line inside the modal body, matching the old red form-error
// styling. An optional extra button (e.g. "Migrate / Merge") can be shown
// beneath the message.
function showTagEditError(message, extraButtonHtml = '') {
    const err = document.getElementById('tag-edit-modal-error');
    if (!err) return;
    err.style.display = 'block';
    err.innerHTML = message + (extraButtonHtml ? `<div class="form-buttons" style="margin-top:8px">${extraButtonHtml}</div>` : '');
}

// ===== State: 3-button action list =====

function renderTagEditActions() {
    const body = document.getElementById('tag-edit-modal-body');
    const thirdBtn = editModalIsMain
        ? `<button onclick="renderTagEditAddSubtag()">+ Add subtag</button>`
        : `<button onclick="renderTagEditMerge()">⇄ Merge into...</button>`;
    const migrateBtn = editModalIsMain
        ? ''
        : `<button onclick="renderTagEditMigrate()">⇅ Migrate to main tag...</button>`;
    body.innerHTML = `
        <div class="tag-edit-actions">
            <button onclick="renderTagEditEdit()">✎ Edit</button>
            ${thirdBtn}
            ${migrateBtn}
            <button class="danger" onclick="handleTagEditDelete()">🗑 Delete</button>
        </div>
        <div id="tag-edit-modal-error" class="form-error" style="display:none"></div>
    `;
    document.getElementById('tag-edit-modal-footer').innerHTML = `
        <button onclick="closeTagEditModal()">Cancel</button>
    `;
}

// ===== State: Delete =====
// Deletes immediately, same as before. If the server blocks it (e.g. a
// subtag still has phrases attached), show the reason in red — with a
// quick "Migrate / Merge" shortcut for subtags, same as the old flow.
async function handleTagEditDelete() {
    const id = editModalTagId;
    const res = await fetch(`/tags/${id}`, { method: 'DELETE' });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const isSub = !editModalIsMain;
        showTagEditError(
            data.error || 'Failed to delete tag',
            isSub ? `<button class="primary" onclick="renderTagEditMerge()">Migrate / Merge</button>` : ''
        );
        return;
    }

    closeTagEditModal();
    await loadTags();
}

// ===== State: Edit name (+ color for main tags) =====

function renderTagEditEdit() {
    const tag = tags.find(t => t.id === editModalTagId);
    const isMain = editModalIsMain;
    const usedColors = tags.filter(t => !t.parent_id && t.color).map(t => t.color);
    const currentColor = isMain ? tag.color : null;

    const body = document.getElementById('tag-edit-modal-body');
    body.innerHTML = `
        <div class="tag-form-inner">
            <input id="tag-edit-name-input" type="text" placeholder="Tag name"
                value="${tag.name}" autocomplete="off" />
            ${isMain ? `
                <div class="color-grid">
                    ${COLORS.map(c => {
                        const taken = usedColors.includes(c) && c !== currentColor;
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
            ` : ''}
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

// ===== State: Add subtag =====

function renderTagEditAddSubtag() {
    const body = document.getElementById('tag-edit-modal-body');
    body.innerHTML = `
        <div class="tag-form-inner">
            <input id="tag-edit-name-input" type="text" placeholder="Subtag name" autocomplete="off" />
        </div>
        <div id="tag-edit-modal-error" class="form-error" style="display:none"></div>
    `;
    document.getElementById('tag-edit-modal-footer').innerHTML = `
        <button onclick="closeTagEditModal()">Cancel</button>
        <button class="primary" onclick="submitAddSubtag()">Save</button>
    `;
}

async function submitAddSubtag() {
    const name = document.getElementById('tag-edit-name-input').value.trim();
    if (!name) return;

    const res = await fetch('/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: null, parentId: editModalTagId })
    });

    if (!res.ok) {
        showTagEditError('Failed to add subtag.');
        return;
    }

    closeTagEditModal();
    await loadTags();
}

// ===== State: Add main tag =====

function renderAddMainTagForm() {
    const usedColors = tags.filter(t => !t.parent_id && t.color).map(t => t.color);
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
        <button class="primary" onclick="submitAddMainTag()">Add</button>
    `;
}

async function submitAddMainTag() {
    const name = document.getElementById('tag-edit-name-input').value.trim();
    if (!name) return;
    const colorEl = document.getElementById('selected-color');
    const color = colorEl ? colorEl.value : null;

    const res = await fetch('/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, parentId: null })
    });

    if (!res.ok) {
        showTagEditError('Failed to add tag.');
        return;
    }

    closeTagEditModal();
    await loadTags();
}

// ===== Shared: color picker (used by edit and both "add" forms) =====

function selectColor(color) {
    document.getElementById('selected-color').value = color;
    document.querySelectorAll('.color-circle').forEach(el => {
        el.classList.toggle('selected', el.dataset.color === color);
    });
}