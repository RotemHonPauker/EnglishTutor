let mergeTargetId = null;
let mergeSiblings = [];

// ===== State: Merge search =====
// Uses editModalTagId (the subtag being merged away) and its parent, found
// via tags[], to list sibling subtags it could be merged into.

function renderTagEditMerge() {
    mergeTargetId = null;
    const tag = tags.find(t => t.id === editModalTagId);
    mergeSiblings = tags.filter(t => t.parent_id === tag.parent_id && t.id !== editModalTagId);
    const body = document.getElementById('tag-edit-modal-body');

    if (!mergeSiblings.length) {
        body.innerHTML = `
            <div class="tag-name">No other subtags under this tag to merge "${tag.name}" into.</div>
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
            <input id="merge-search-input" type="text" placeholder="Type to search subtags..."
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

    renderMergeDropdown(mergeSiblings);
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

function submitMerge() {
    if (!mergeTargetId) return;
    const source = tags.find(t => t.id === editModalTagId);
    const target = tags.find(t => t.id === mergeTargetId);
    renderMergeConfirm(source, target);
}

// ===== Render Merge Dropdown =====

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

function selectMergeTarget(id) {
    mergeTargetId = id;
    const target = mergeSiblings.find(s => s.id === id);
    document.getElementById('merge-search-input').value = target.name;
    hideMergeDropdown();
}

// ===== State: Merge confirmation =====
// "Back" returns to the search step of this same action (not a full modal
// close) since it's a second step within one flow, same as before.

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
        showTagEditError(data.error || 'Failed to merge subtags');
        return;
    }

    closeTagEditModal();
    await loadTags();
    if (typeof loadTable === 'function') loadTable();
}