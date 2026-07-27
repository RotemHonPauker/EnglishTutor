let migrateTargetMainId = null;

// ===== State: Migrate — pick a new main tag =====
// Moves the subtag itself under a different main tag (its parent_id),
// leaving every phrase currently tagged with it untouched — unlike Merge,
// which moves phrases into a different subtag and deletes the source.

function renderTagEditMigrate() {
    const tag = tags.find(t => t.id === editModalTagId);
    const mainTags = tags.filter(t => !t.parent_id && t.id !== tag.parent_id);
    migrateTargetMainId = null;
    const body = document.getElementById('tag-edit-modal-body');

    if (!mainTags.length) {
        body.innerHTML = `
            <div class="tag-name">No other main tags to move "${tag.name}" under.</div>
            <div id="tag-edit-modal-error" class="form-error" style="display:none"></div>
        `;
        document.getElementById('tag-edit-modal-footer').innerHTML = `
            <button onclick="closeTagEditModal()">Cancel</button>
        `;
        return;
    }

    body.innerHTML = `
        <div class="tag-name">Move "${tag.name}" under:</div>
        <div class="tag-picker-chip-list">
            ${mainTags.map(mt => {
                const contrast = getContrastColor(mt.color);
                return `<div class="tag-chip" style="background:${mt.color || '#333'}; color:${contrast}" onclick="selectMigrateTarget('${mt.id}')">${mt.name}</div>`;
            }).join('')}
        </div>
        <div id="tag-edit-modal-error" class="form-error" style="display:none"></div>
    `;
    document.getElementById('tag-edit-modal-footer').innerHTML = `
        <button onclick="closeTagEditModal()">Cancel</button>
    `;
}

function selectMigrateTarget(mainId) {
    migrateTargetMainId = mainId;
    const tag = tags.find(t => t.id === editModalTagId);
    const target = tags.find(t => t.id === mainId);
    renderMigrateConfirm(tag, target);
}

// ===== State: Migrate confirmation =====
// "Back" returns to the main-tag picker step of this same action, same
// two-step pattern used by the Merge flow.

function renderMigrateConfirm(tag, target) {
    const body = document.getElementById('tag-edit-modal-body');
    body.innerHTML = `
        <div class="tag-name">Move "${tag.name}" to under "${target.name}"? Phrases already tagged with it keep their tag — only its main tag changes.</div>
        <div id="tag-edit-modal-error" class="form-error" style="display:none"></div>
    `;
    document.getElementById('tag-edit-modal-footer').innerHTML = `
        <button onclick="renderTagEditMigrate()">Back</button>
        <button class="primary" onclick="confirmMigrate('${target.id}')">Confirm move</button>
    `;
}

async function confirmMigrate(targetMainId) {
    const tag = tags.find(t => t.id === editModalTagId);
    const res = await fetch(`/tags/${editModalTagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tag.name, parentId: targetMainId })
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showTagEditError(data.error || 'Failed to migrate subtag.');
        return;
    }

    closeTagEditModal();
    await loadTags();
    if (typeof loadTable === 'function') loadTable();
}