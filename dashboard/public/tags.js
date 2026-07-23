let tags = [];
let editingTagId = null;

// --- LOAD ---
async function loadTags() {
    const res = await fetch('/tags');
    tags = await res.json();
    renderSidebar();
}

// --- RENDER ---
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

// --- FORM ---
function showAddMainTag() {
    renderForm({ mode: 'add-main' });
}

function startAddSubtag(parentId) {
    renderForm({ mode: 'add-sub', parentId });
}

function startEdit(id) {
    const tag = tags.find(t => t.id === id);
    renderForm({ mode: 'edit', tag });
}

function startMerge(id, parentId) {
    renderMergeForm({ id, parentId });
}

let mergeTargetId = null;
let mergeSiblings = [];

function renderMergeForm({ id, parentId }) {
    mergeTargetId = null;
    mergeSiblings = tags.filter(t => t.parent_id === parentId && t.id !== id);
    const formContainer = document.getElementById('tag-form');
    const subtag = tags.find(t => t.id === id);

    if (!mergeSiblings.length) {
        formContainer.innerHTML = `
            <div class="tag-form-inner">
                <div class="tag-name">No other subtags under this tag to merge "${subtag.name}" into.</div>
                <div class="form-buttons">
                    <button onclick="cancelForm()">Close</button>
                </div>
            </div>
        `;
        return;
    }

    formContainer.innerHTML = `
        <div class="tag-form-inner">
            <div class="tag-name">Merge "${subtag.name}" into:</div>
            <div class="merge-autocomplete">
                <input id="merge-search-input" type="text" placeholder="Type to search subtags..."
                    autocomplete="off"
                    oninput="filterMergeOptions(this.value)"
                    onfocus="showMergeDropdown()"
                    onblur="hideMergeDropdown()" />
                <div class="merge-dropdown" id="merge-dropdown"></div>
            </div>
            <div class="form-buttons">
                <button onclick="cancelForm()">Cancel</button>
                <button class="primary" onclick="submitMerge('${id}', '${parentId}')">Save</button>
            </div>
        </div>
    `;

    renderMergeDropdown(mergeSiblings);
}

function renderMergeDropdown(options) {
    const dropdown = document.getElementById('merge-dropdown');
    dropdown.innerHTML = options.length
        ? options.map(s => `
            <div class="merge-dropdown-item" data-id="${s.id}" onmousedown="selectMergeTarget('${s.id}')">
                ${s.name}
            </div>
        `).join('')
        : `<div class="merge-dropdown-empty">No matches</div>`;
}

function filterMergeOptions(query) {
    mergeTargetId = null;
    const filtered = mergeSiblings.filter(s =>
        s.name.toLowerCase().includes(query.trim().toLowerCase())
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

function selectMergeTarget(id) {
    mergeTargetId = id;
    const target = mergeSiblings.find(s => s.id === id);
    document.getElementById('merge-search-input').value = target.name;
    hideMergeDropdown();
}

function submitMerge(sourceId, parentId) {
    if (!mergeTargetId) return;
    const source = tags.find(t => t.id === sourceId);
    const target = tags.find(t => t.id === mergeTargetId);
    renderMergeConfirm(source, target, parentId);
}

function renderMergeConfirm(source, target, parentId) {
    const formContainer = document.getElementById('tag-form');
    formContainer.innerHTML = `
        <div class="tag-form-inner">
            <div class="tag-name">
                Move all phrases from "${source.name}" into "${target.name}" and delete "${source.name}"?
                This cannot be undone.
            </div>
            <div class="form-buttons">
                <button onclick="startMerge('${source.id}', '${parentId}')">Back</button>
                <button class="primary" onclick="confirmMerge('${source.id}', '${target.id}')">Confirm merge</button>
            </div>
        </div>
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
        alert(data.error || 'Failed to merge subtags');
        return;
    }

    cancelForm();
    await loadTags();
    if (typeof loadTable === 'function') loadTable();
}

const COLORS = [
    '#8DB600', '#875692', '#E25822', '#A1CAF1',
    '#BE0032', '#C2B280', '#848482', '#008856',
    '#E68FAC', '#0067A5', '#F99379', '#654522',
    '#F6A600', '#B3446C', '#DCD300', '#882D17'
     
];

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

function selectColor(color) {
    document.getElementById('selected-color').value = color;
    document.querySelectorAll('.color-circle').forEach(el => {
        el.classList.toggle('selected', el.dataset.color === color);
    });
}

function cancelForm() {
    document.getElementById('tag-form').innerHTML = '';
}

// --- CRUD ---
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

async function deleteTag(id) {
    await fetch(`/tags/${id}`, { method: 'DELETE' });
    await loadTags();
}