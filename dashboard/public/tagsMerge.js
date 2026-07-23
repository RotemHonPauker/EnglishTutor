let mergeTargetId = null;
let mergeSiblings = [];

function startMerge(id, parentId) {
    renderMergeForm({ id, parentId });
}

// ===== Render Merge Form =====

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

function submitMerge(sourceId, parentId) {
    if (!mergeTargetId) return;
    const source = tags.find(t => t.id === sourceId);
    const target = tags.find(t => t.id === mergeTargetId);
    renderMergeConfirm(source, target, parentId);
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

// ===== Render Merge Confirmation =====

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