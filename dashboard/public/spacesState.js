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
    const dot = document.getElementById('space-health-dot');
    if (active && active.space_type === 'dictionary') {
        label.textContent = `📖 ${active.name}`;
        if (dot) dot.style.display = 'none';
        return;
    }
    label.textContent = active ? active.name : 'Select a space';
    if (dot) dot.style.display = '';
    renderSpaceHealthIndicator();
    if (typeof renderSpaceRulesForm === 'function') renderSpaceRulesForm();
}

// A lightweight, purely visual nudge — never enforced anywhere. Compares
// this space's phrases from the last 7 days against a loose 2–3/week
// target. Depends on allPhrases (from phrasesTable.js), so this is also
// called from loadTable() whenever that data refreshes.
function renderSpaceHealthIndicator() {
    const dot = document.getElementById('space-health-dot');
    if (!dot) return;

    if (!getActiveSpace() || typeof allPhrases === 'undefined') {
        dot.className = 'space-health-dot';
        dot.title = '';
        return;
    }

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentCount = allPhrases.filter(p => new Date(p.created_at) >= weekAgo).length;

    let level, label;
    if (recentCount >= 3) { level = 'good'; label = 'Active this week'; }
    else if (recentCount >= 1) { level = 'low'; label = 'Below the weekly goal (2–3 phrases)'; }
    else { level = 'none'; label = 'No activity this week'; }

    dot.className = `space-health-dot health-${level}`;
    dot.title = label;
}

// Switching spaces reloads everything that's scoped to a space — the tag
// list and the phrase table — same as a fresh page load would, just
// without actually reloading the page.
async function setActiveSpace(id) {
    activeSpaceId = id;
    persistActiveSpace();
    if (typeof applyDictionaryModeUI === 'function') applyDictionaryModeUI();
    renderSpaceHeader();
    closeSpacePicker();
    if (typeof resetTagFilter === 'function') resetTagFilter();
    if (typeof resetLearnedFilter === 'function') resetLearnedFilter();
    if (typeof resetDateScroll === 'function') resetDateScroll();
    // Only matters if the user is currently sitting on the Add tab — but
    // it's safe to call regardless (it just clears an off-screen log), and
    // it's the only way to catch that case, since the tab's own enter-tab
    // reset won't fire without an actual tab click.
    if (typeof resetCaptureLog === 'function') resetCaptureLog();
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
    migrateSourceSpaceId = null;
}

function renderSpacePickerList() {
    const list = document.getElementById('space-picker-list');
    const spaceRows = spaces.map(s => `
        <div class="space-picker-row">
            <div class="space-picker-item ${s.id === activeSpaceId ? 'active' : ''}" onclick="requestSpaceSwitch('${s.id}')">
                ${s.space_type === 'dictionary' ? '📖 ' : ''}${s.name}
            </div>
            <button class="space-picker-edit-btn" onclick="event.stopPropagation(); showRenameSpaceForm('${s.id}')" title="Rename">✎</button>
            <button class="space-picker-edit-btn" onclick="event.stopPropagation(); showMigrateSpaceForm('${s.id}')" title="Migrate into another space">⇄</button>
        </div>
    `).join('');
    list.innerHTML = spaceRows;
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

// Space type decides what the language fields mean: Progression is the
// original model (Level 1/2 = two levels of the same target language);
// Bridge adds a third, reference-only language shown alongside the main
// translation; Dictionary is a standalone word-lookup list rather than a
// phrase-practice space. All three still just live in `spaces` — the type
// only changes how Setup/Add/Practice interpret that space's rows.
function showNewSpaceForm() {
    newSpaceNameEdited = false;
    const form = document.getElementById('space-picker-new-form');
    form.innerHTML = `
        <select id="new-space-type" onchange="onNewSpaceTypeChange()">
            <option value="progression">Progression (Level 1 / Level 2)</option>
            <option value="bridge">Bridge (with a reference language)</option>
            <option value="dictionary">Dictionary</option>
        </select>
        <select id="new-space-source-lang" onchange="onNewSpaceLanguageChange()">${languageOptionsHtml('Hebrew')}</select>
        <select id="new-space-target-lang" onchange="onNewSpaceLanguageChange()">${languageOptionsHtml('English')}</select>
        <select id="new-space-bridge-lang" style="display:none">${languageOptionsHtml('English')}</select>
        <input id="new-space-name-input" type="text" placeholder="Space name" autocomplete="off" oninput="newSpaceNameEdited = true" />
        <div class="form-buttons">
            <button onclick="document.getElementById('space-picker-new-form').innerHTML = ''">Cancel</button>
            <button class="primary" onclick="submitNewSpace()">Create</button>
        </div>
    `;
}

function onNewSpaceTypeChange() {
    const type = document.getElementById('new-space-type').value;
    const bridgeSelect = document.getElementById('new-space-bridge-lang');
    if (bridgeSelect) bridgeSelect.style.display = type === 'bridge' ? '' : 'none';
    updateSuggestedSpaceName();
}

function onNewSpaceLanguageChange() {
    updateSuggestedSpaceName();
}

// Only Dictionary spaces get an auto-filled name (so a picker full of
// dictionaries stays distinguishable by language pair without typing) —
// and only until the person actually types their own, tracked with a
// simple flag rather than trying to guess intent from the input's value.
let newSpaceNameEdited = false;

function updateSuggestedSpaceName() {
    const type = document.getElementById('new-space-type')?.value;
    if (type !== 'dictionary' || newSpaceNameEdited) return;
    const nameInput = document.getElementById('new-space-name-input');
    if (!nameInput) return;
    const sourceCode = codeForLanguage(document.getElementById('new-space-source-lang').value);
    const targetCode = codeForLanguage(document.getElementById('new-space-target-lang').value);
    nameInput.value = `Dictionary (${sourceCode}→${targetCode})`;
}

async function submitNewSpace() {
    const name = document.getElementById('new-space-name-input').value.trim();
    if (!name) return;
    const spaceType = document.getElementById('new-space-type').value;
    const sourceLanguage = document.getElementById('new-space-source-lang').value;
    const targetLanguage = document.getElementById('new-space-target-lang').value;
    const bridgeLanguage = spaceType === 'bridge' ? document.getElementById('new-space-bridge-lang').value : undefined;

    const res = await fetch('/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, spaceType, sourceLanguage, targetLanguage, bridgeLanguage })
    });

    if (!res.ok) {
        alert('Failed to create space');
        return;
    }

    newSpaceNameEdited = false;
    const space = await res.json();
    spaces.push(space);
    await setActiveSpace(space.id);
}

// ===== Space migration =====
// Moves everything from one space into another, then deletes the source —
// the space-level equivalent of merging a tag into another. Reuses the
// same tag-chip/form-button styling as the tag merge flow, just rendered
// into the space picker's own form slot instead of the tag edit modal.

let migrateSourceSpaceId = null;

function showMigrateSpaceForm(id) {
    const source = spaces.find(s => s.id === id);
    if (!source) return;
    migrateSourceSpaceId = id;
    const candidates = spaces.filter(s => s.id !== id);
    const form = document.getElementById('space-picker-new-form');

    if (!candidates.length) {
        form.innerHTML = `
            <div class="tag-name">No other space to migrate "${source.name}" into.</div>
            <div class="form-buttons">
                <button onclick="document.getElementById('space-picker-new-form').innerHTML = ''">Close</button>
            </div>
        `;
        return;
    }

    form.innerHTML = `
        <div class="tag-name">Migrate "${source.name}" into:</div>
        <div class="tag-picker-chip-list">
            ${candidates.map(s => `<div class="tag-chip" onclick="confirmMigrateSpaceTarget('${s.id}')">${s.name}</div>`).join('')}
        </div>
        <div class="form-buttons">
            <button onclick="document.getElementById('space-picker-new-form').innerHTML = ''">Cancel</button>
        </div>
    `;
}

function confirmMigrateSpaceTarget(targetId) {
    const source = spaces.find(s => s.id === migrateSourceSpaceId);
    const target = spaces.find(s => s.id === targetId);
    if (!source || !target) return;
    renderMigrateSpaceConfirm(source, target);
}

// "Back" returns to the target-picking step of this same flow, same
// two-step pattern as the tag merge confirmation.
function renderMigrateSpaceConfirm(source, target) {
    const form = document.getElementById('space-picker-new-form');
    form.innerHTML = `
        <div class="tag-name">
            Move all phrases, tags, and transcripts from "${source.name}" into "${target.name}", and delete "${source.name}"?
            This cannot be undone.
        </div>
        <div id="migrate-space-error" class="form-error" style="display:none"></div>
        <div class="form-buttons">
            <button onclick="showMigrateSpaceForm('${source.id}')">Back</button>
            <button class="primary" onclick="submitMigrateSpace('${source.id}', '${target.id}', false)">Confirm migration</button>
        </div>
    `;
}

async function submitMigrateSpace(sourceId, targetId, dropSourceTranscripts) {
    const res = await fetch('/spaces/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, targetId, dropSourceTranscripts })
    });

    if (res.ok) {
        document.getElementById('space-picker-new-form').innerHTML = '';
        migrateSourceSpaceId = null;
        await loadSpaces();
        // If the space we were sitting on was the one just migrated away,
        // land on whatever space remains instead of a now-nonexistent id.
        if (!spaces.some(s => s.id === activeSpaceId)) {
            await setActiveSpace(spaces[0]?.id || null);
        } else {
            // Otherwise we're still on the same space id — but if it was
            // the migration's target, its tags/phrases just changed under
            // it. Refresh both instead of leaving the stale pre-migration
            // view up until the next manual reload.
            renderSpacePickerList();
            await loadTags();
            await loadTable();
        }
        return;
    }

    const data = await res.json().catch(() => ({}));
    if (data.error === 'too_many_transcripts') {
        renderMigrateTranscriptOverflow(sourceId, targetId, data.sourceCount, data.targetCount);
        return;
    }

    const errEl = document.getElementById('migrate-space-error');
    if (errEl) {
        errEl.style.display = 'block';
        errEl.textContent = data.error || 'Failed to migrate space';
    } else {
        alert(data.error || 'Failed to migrate space');
    }
}

// The server blocked the migration because combined transcripts would
// exceed the hard cap — offer to drop the source's own transcripts and
// proceed, or back out and let them be cleaned up manually first.
function renderMigrateTranscriptOverflow(sourceId, targetId, sourceCount, targetCount) {
    const source = spaces.find(s => s.id === sourceId);
    const target = spaces.find(s => s.id === targetId);
    const form = document.getElementById('space-picker-new-form');
    form.innerHTML = `
        <div class="tag-name">
            Too many transcripts to migrate — "${target.name}" already has ${targetCount}, and "${source.name}" would add ${sourceCount} more.
            "${source.name}"'s transcripts will be deleted rather than moved if you continue.
        </div>
        <div class="form-buttons">
            <button onclick="document.getElementById('space-picker-new-form').innerHTML = ''">Wait — I'll clean up manually</button>
            <button class="primary danger" onclick="submitMigrateSpace('${sourceId}', '${targetId}', true)">Delete & migrate</button>
        </div>
    `;
}