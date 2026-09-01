let mergeTargetId = null;
let mergeCandidates = [];

// ===== State: Merge search =====

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

// ===== Render Merge Dropdown =====

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

// ===== State: Merge confirmation =====
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