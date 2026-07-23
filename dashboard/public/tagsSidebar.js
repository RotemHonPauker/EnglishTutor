function showAddMainTag() {
    renderForm({ mode: 'add-main' });
}

// ===== Render Sidebar =====

function renderSidebar() {
    const container = document.getElementById('tag-list');
    const mainTags = tags.filter(t => !t.parent_id);

    container.innerHTML = mainTags.map(mainTag => {
        const subtags = tags.filter(t => t.parent_id === mainTag.id);
        return `
            <div class="main-tag-item">
                <div class="tag-row">
                    <span class="tag-color-dot" style="background:${mainTag.color || '#555'}"></span>
                    <span class="tag-name toggle-subtags" onclick="toggleSubtags('${mainTag.id}')">${mainTag.name}</span>
                    <div class="tag-actions">
                        <button onclick="startEdit('${mainTag.id}')">✎</button>
                        <button onclick="deleteTag('${mainTag.id}')">✕</button>
                    </div>
                </div>
                <div class="subtag-list" id="subtags-${mainTag.id}">
                    ${subtags.map(sub => `
                        <div class="subtag-row">
                            <span class="tag-name">${sub.name}</span>
                            <div class="tag-actions">
                                <button onclick="startEdit('${sub.id}')">✎</button>
                                <button onclick="startMerge('${sub.id}', '${mainTag.id}')" title="Merge into...">⇄</button>
                                <button onclick="deleteTag('${sub.id}')">✕</button>
                            </div>
                        </div>
                    `).join('')}
                    <button class="add-subtag-btn" onclick="startAddSubtag('${mainTag.id}')">+ subtag</button>
                </div>
            </div>
        `;
    }).join('');
}

function toggleSubtags(mainTagId) {
    const subtagList = document.getElementById(`subtags-${mainTagId}`);
    subtagList.classList.toggle('collapsed');
}

function startEdit(id) {
    const tag = tags.find(t => t.id === id);
    renderForm({ mode: 'edit', tag });
}

async function deleteTag(id) {
    const res = await fetch(`/tags/${id}`, { method: 'DELETE' });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        renderDeleteBlocked(id, data.error || 'Failed to delete tag');
        return;
    }

    await loadTags();
}

function startAddSubtag(parentId) {
    renderForm({ mode: 'add-sub', parentId });
}

// ===== Render Form =====

function renderForm({ mode, parentId, tag }) {
    const formContainer = document.getElementById('tag-form');
    const isEdit = mode === 'edit';
    const isMain = mode === 'add-main' || (isEdit && !tag.parent_id);
    const usedColors = tags
        .filter(t => !t.parent_id && t.color)
        .map(t => t.color);

    // if editing, exclude the current tag's own color from "used"
    const currentColor = isEdit ? tag.color : null;

    formContainer.innerHTML = `
        <div class="tag-form-inner">
            <input id="tag-name-input" type="text" placeholder="Tag name" 
                value="${isEdit ? tag.name : ''}" autocomplete="off" />
            ${isMain ? `
                <div class="color-grid">
                    ${COLORS.map(c => {
                        const taken = usedColors.includes(c) && c !== currentColor;
                        return `
                            <div class="color-circle ${isEdit && tag.color === c ? 'selected' : ''} ${taken ? 'disabled' : ''}" 
                                style="background:${c}" 
                                onclick="${taken ? '' : `selectColor('${c}')`}" 
                                data-color="${c}">
                            </div>
                        `;
                    }).join('')}
                </div>
                <input type="hidden" id="selected-color" value="${isEdit ? tag.color || '' : ''}" />
            ` : ''}
            <div class="form-buttons">
                <button onclick="cancelForm()">Cancel</button>
                <button class="primary" onclick="submitForm('${mode}', '${isEdit ? tag.id : ''}', '${parentId || ''}')">
                    ${isEdit ? 'Save' : 'Add'}
                </button>
            </div>
        </div>
    `;
}

function cancelForm() {
    document.getElementById('tag-form').innerHTML = '';
}

async function submitForm(mode, id, parentId) {
    const name = document.getElementById('tag-name-input').value.trim();
    if (!name) return;

    const colorEl = document.getElementById('selected-color');
    const color = colorEl ? colorEl.value : null;

    if (mode === 'edit') {
        await fetch(`/tags/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color })
        });
    } else {
        await fetch('/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color, parentId: parentId || null })
        });
    }

    cancelForm();
    await loadTags();
}

function selectColor(color) {
    document.getElementById('selected-color').value = color;
    document.querySelectorAll('.color-circle').forEach(el => {
        el.classList.toggle('selected', el.dataset.color === color);
    });
}

// ===== Render Delete Blocked Message =====

function renderDeleteBlocked(id, message) {
    const tag = tags.find(t => t.id === id);
    const isSub = !!tag.parent_id;
    const formContainer = document.getElementById('tag-form');

    formContainer.innerHTML = `
        <div class="tag-form-inner">
            <div class="tag-name form-error">${message}</div>
            <div class="form-buttons">
                <button onclick="cancelForm()">Close</button>
                ${isSub ? `<button class="primary" onclick="startMerge('${tag.id}', '${tag.parent_id}')">Migrate / Merge</button>` : ''}
            </div>
        </div>
    `;
}









