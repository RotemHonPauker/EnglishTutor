let spaces = [];
let activeSpaceId = localStorage.getItem('activeSpaceId') || null;

// Called once on startup, before anything space-dependent (tags, phrases)
// loads. If there's no valid active space yet (first-ever visit, or a
// stored id that no longer exists), falls back to the first space returned.
async function loadSpaces() {
    const res = await fetch('/spaces');
    spaces = await res.json();

    const stillExists = spaces.some(s => s.id === activeSpaceId);
    if (!stillExists) {
        activeSpaceId = spaces[0]?.id || null;
        persistActiveSpace();
    }

    renderSpaceHeader();
}

function persistActiveSpace() {
    if (activeSpaceId) {
        localStorage.setItem('activeSpaceId', activeSpaceId);
    } else {
        localStorage.removeItem('activeSpaceId');
    }
}

function getActiveSpace() {
    return spaces.find(s => s.id === activeSpaceId) || null;
}

function renderSpaceHeader() {
    const label = document.getElementById('space-header-name');
    if (!label) return;
    const active = getActiveSpace();
    label.textContent = active ? active.name : 'Select a space';
}

// Switching spaces reloads everything that's scoped to a space — the tag
// list and the phrase table — same as a fresh page load would, just
// without actually reloading the page.
async function setActiveSpace(id) {
    activeSpaceId = id;
    persistActiveSpace();
    renderSpaceHeader();
    closeSpacePicker();
    if (typeof resetTagFilter === 'function') resetTagFilter();
    // These only matter if the user is currently sitting on that tab — but
    // they're safe to call regardless (they just clear an off-screen log),
    // and it's the only way to catch that case, since the tab's own
    // enter-tab reset won't fire without an actual tab click.
    if (typeof resetEditorConversation === 'function') await resetEditorConversation();
    if (typeof resetNewPhraseLog === 'function') resetNewPhraseLog();
    await loadTags();
    await loadTable();
}

// ===== Space picker modal =====

function openSpacePicker() {
    renderSpacePickerList();
    document.getElementById('space-picker-modal-overlay').style.display = 'flex';
}

function closeSpacePicker() {
    document.getElementById('space-picker-modal-overlay').style.display = 'none';
    document.getElementById('space-picker-new-form').innerHTML = '';
}

function renderSpacePickerList() {
    const list = document.getElementById('space-picker-list');
    list.innerHTML = spaces.map(s => `
        <div class="space-picker-row">
            <div class="space-picker-item ${s.id === activeSpaceId ? 'active' : ''}" onclick="setActiveSpace('${s.id}')">
                ${s.name}
            </div>
            <button class="space-picker-edit-btn" onclick="event.stopPropagation(); showRenameSpaceForm('${s.id}')" title="Rename">✎</button>
        </div>
    `).join('');
}

function showRenameSpaceForm(id) {
    const space = spaces.find(s => s.id === id);
    if (!space) return;
    const form = document.getElementById('space-picker-new-form');
    form.innerHTML = `
        <input id="rename-space-name-input" type="text" value="${space.name}" autocomplete="off" />
        <div class="form-buttons">
            <button onclick="document.getElementById('space-picker-new-form').innerHTML = ''">Cancel</button>
            <button class="primary" onclick="submitRenameSpace('${id}')">Save</button>
        </div>
    `;
}

async function submitRenameSpace(id) {
    const name = document.getElementById('rename-space-name-input').value.trim();
    if (!name) return;

    const res = await fetch(`/spaces/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });

    if (!res.ok) {
        alert('Failed to rename space');
        return;
    }

    const updated = await res.json();
    const idx = spaces.findIndex(s => s.id === id);
    if (idx !== -1) spaces[idx] = updated;

    document.getElementById('space-picker-new-form').innerHTML = '';
    renderSpacePickerList();
    renderSpaceHeader();
}

function showNewSpaceForm() {
    const form = document.getElementById('space-picker-new-form');
    form.innerHTML = `
        <input id="new-space-name-input" type="text" placeholder="Space name" autocomplete="off" />
        <label class="new-space-order-toggle">
            <input type="checkbox" id="new-space-has-order" />
            This space cares about order (e.g. chapters or parts of a longer text)
        </label>
        <div class="new-space-order-note">This can't be changed after the space is created.</div>
        <div class="form-buttons">
            <button onclick="document.getElementById('space-picker-new-form').innerHTML = ''">Cancel</button>
            <button class="primary" onclick="submitNewSpace()">Create</button>
        </div>
    `;
}

async function submitNewSpace() {
    const name = document.getElementById('new-space-name-input').value.trim();
    if (!name) return;
    const hasOrder = document.getElementById('new-space-has-order').checked;

    const res = await fetch('/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, hasOrder })
    });

    if (!res.ok) {
        alert('Failed to create space');
        return;
    }

    const space = await res.json();
    spaces.push(space);
    await setActiveSpace(space.id);
}