// Needs localDb.js and ttsStorage.js loaded first.

let spaces = [];
let activeSpaceId = localStorage.getItem('activeSpaceId') || null;

// Called once on startup, before anything space-dependent loads. Falls
// back to the first space if the stored active id no longer exists.
async function loadSpaces() {
    spaces = await getSpaces();

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
    label.style.fontStyle = (active && active.space_type === 'dictionary') ? 'italic' : 'normal';
    if (typeof renderSpaceRulesForm === 'function') renderSpaceRulesForm();
}

// Reloads everything scoped to a space (phrase table, time slots), same as
// a fresh page load would, without reloading the page.
async function setActiveSpace(id) {
    activeSpaceId = id;
    persistActiveSpace();
    if (typeof applyDictionaryModeUI === 'function') applyDictionaryModeUI();
    renderSpaceHeader();
    closeSpacePicker();
    if (typeof resetSlotScroll === 'function') resetSlotScroll();
    if (typeof resetSelectMode === 'function') resetSelectMode();
    // A practice session's queue holds actual phrase objects, not ids — it
    // can't stay valid against a different activeSpaceId, so just close it.
    if (typeof closePracticeSession === 'function') closePracticeSession();
    if (typeof resetCaptureLog === 'function') resetCaptureLog();
    if (typeof resetTranscriptsTab === 'function') await resetTranscriptsTab();
    await loadTable();
    if (typeof loadSlotsScreen === 'function') await loadSlotsScreen();
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
    const ordered = [...spaces].sort((a, b) => {
        const aDict = a.space_type === 'dictionary' ? 0 : 1;
        const bDict = b.space_type === 'dictionary' ? 0 : 1;
        return aDict - bDict;
    });
    list.innerHTML = ordered.map(s => `
        <div class="space-picker-item ${s.id === activeSpaceId ? 'active' : ''}" onclick="requestSpaceSwitch('${s.id}')">
            <div class="space-picker-item-icons">
                <button class="space-picker-icon-btn" onclick="event.stopPropagation(); showDeleteSpaceForm('${s.id}')" title="Delete">🗑️</button>
                ${s.space_type === 'dictionary' ? '' : `<button class="space-picker-icon-btn" onclick="event.stopPropagation(); showRenameSpaceForm('${s.id}')" title="Rename">✏️</button>`}
                <button class="space-picker-icon-btn" onclick="event.stopPropagation(); showMigrateSpaceForm('${s.id}')" title="Migrate into another space">⇄</button>
            </div>
            <span class="space-picker-item-name${s.space_type === 'dictionary' ? ' space-picker-item-name--dictionary' : ''}">${escapeHtml(s.name)}</span>
        </div>
    `).join('');
}

function showRenameSpaceForm(id) {
    const space = spaces.find(s => s.id === id);
    if (!space) return;
    const form = document.getElementById('space-picker-new-form');
    form.innerHTML = `
        <input id="rename-space-name-input" type="text" value="${escapeHtml(space.name)}" autocomplete="off" />
        <div class="form-buttons">
            <button onclick="document.getElementById('space-picker-new-form').innerHTML = ''">Cancel</button>
            <button class="primary" onclick="submitRenameSpace('${id}')">Save</button>
        </div>
    `;
}

async function submitRenameSpace(id) {
    const name = document.getElementById('rename-space-name-input').value.trim();
    if (!name) return;

    let updated;
    try {
        updated = await updateSpace({ id, name });
    } catch (err) {
        alert(err.message || 'Failed to rename space');
        return;
    }

    const idx = spaces.findIndex(s => s.id === id);
    if (idx !== -1) spaces[idx] = updated;

    document.getElementById('space-picker-new-form').innerHTML = '';
    renderSpacePickerList();
    renderSpaceHeader();
}

function showDeleteSpaceForm(id) {
    const space = spaces.find(s => s.id === id);
    if (!space) return;
    const form = document.getElementById('space-picker-new-form');
    form.innerHTML = `
        <div class="tag-name">
            Delete "${escapeHtml(space.name)}" — its phrases, time slots and transcripts included? This cannot be undone.
        </div>
        <div class="form-buttons">
            <button onclick="document.getElementById('space-picker-new-form').innerHTML = ''">Cancel</button>
            <button class="primary danger" onclick="submitDeleteSpace('${id}')">Delete</button>
        </div>
    `;
}

async function submitDeleteSpace(id) {
    // Grabbed before the delete so this device's cached audio for them can
    // be cleared afterward — deleteSpace() only touches localDb's tables.
    let phrasesInSpace = [];
    let dictionaryEntriesInSpace = [];
    try {
        phrasesInSpace = await getPhrases(id);
    } catch (err) {
        // Non-fatal — worst case a few orphaned cache entries remain.
    }
    try {
        dictionaryEntriesInSpace = await getDictionaryEntries(id);
    } catch (err) {
        // Same non-fatal reasoning as above.
    }

    try {
        await deleteSpace(id);
    } catch (err) {
        alert(err.message || 'Failed to delete space');
        return;
    }

    for (const phrase of phrasesInSpace) {
        await deleteTtsBlobsForPhrase(phrase.id);
    }
    for (const entry of dictionaryEntriesInSpace) {
        if (typeof deleteTtsBlobForDictionaryEntry === 'function') await deleteTtsBlobForDictionaryEntry(entry.id);
    }

    // Push the updated slot picture to the notify Worker so it doesn't
    // keep notifying for a space that no longer exists.
    if (typeof syncSlotsToNotifyServer === 'function') syncSlotsToNotifyServer();

    document.getElementById('space-picker-new-form').innerHTML = '';
    await loadSpaces();
    if (!spaces.some(s => s.id === activeSpaceId)) {
        await setActiveSpace(spaces[0]?.id || null);
    } else {
        renderSpacePickerList();
    }
}

// Space type decides what the language fields mean: Progression is two
// levels of one target language; Bridge adds a third, reference-only
// language; Dictionary is a standalone word-lookup list.

const SPACE_TYPE_DESCRIPTIONS = {
    progression: 'Practice one language at two levels of fluency: simple and advanced. Good for steady, ongoing vocabulary building in a single target language.',
    bridge: 'Translate into your target language, plus a separate reference language. Useful when you\'re starting a new language and want extra help from another one you know.',
    dictionary: 'Look up individual words and save their definitions, synonyms, and an example sentence.'
};

function openSpaceCreateModal() {
    closeSpacePicker();
    renderSpaceCreateForm();
    document.getElementById('space-create-modal-overlay').style.display = 'flex';
}

function closeSpaceCreateModal() {
    document.getElementById('space-create-modal-overlay').style.display = 'none';
    document.getElementById('space-create-form').innerHTML = '';
}

function renderSpaceCreateForm() {
    const form = document.getElementById('space-create-form');
    form.innerHTML = `
        <div class="space-create-field">
            <label class="space-create-label" for="new-space-type">Type</label>
            <select id="new-space-type" onchange="onNewSpaceTypeChange()">
                <option value="progression">Progression (Level 1 / Level 2)</option>
                <option value="bridge">Bridge (with a reference language)</option>
                <option value="dictionary">Dictionary</option>
            </select>
            <div id="new-space-type-description" class="space-create-description"></div>
        </div>
        <div class="space-create-field">
            <label class="space-create-label" for="new-space-source-lang">Source language</label>
            <select id="new-space-source-lang" onchange="onNewSpaceLanguageChange()">${languageOptionsHtml('Hebrew')}</select>
        </div>
        <div class="space-create-field">
            <label class="space-create-label" for="new-space-target-lang">Target language</label>
            <select id="new-space-target-lang" onchange="onNewSpaceLanguageChange()">${languageOptionsHtml('English')}</select>
        </div>
        <div class="space-create-field" id="new-space-bridge-field" style="display:none">
            <label class="space-create-label" for="new-space-bridge-lang">Bridge language</label>
            <select id="new-space-bridge-lang">${languageOptionsHtml('English')}</select>
        </div>
        <div class="space-create-field">
            <label class="space-create-label" for="new-space-name-input">Name</label>
            <input id="new-space-name-input" type="text" placeholder="Space name" autocomplete="off" />
        </div>
        <div class="form-buttons">
            <button onclick="closeSpaceCreateModal()">Cancel</button>
            <button class="primary" onclick="submitNewSpace()">Create</button>
        </div>
    `;
    updateSpaceTypeDescription();
}

function updateSpaceTypeDescription() {
    const type = document.getElementById('new-space-type')?.value;
    const el = document.getElementById('new-space-type-description');
    if (el) el.textContent = SPACE_TYPE_DESCRIPTIONS[type] || '';
}

function onNewSpaceTypeChange() {
    const type = document.getElementById('new-space-type').value;
    const bridgeField = document.getElementById('new-space-bridge-field');
    if (bridgeField) bridgeField.style.display = type === 'bridge' ? '' : 'none';
    updateSpaceTypeDescription();
    updateSuggestedSpaceName();
}

function onNewSpaceLanguageChange() {
    updateSuggestedSpaceName();
}

// A dictionary space's name is locked to "Dictionary (XX→YY)" so it can't
// drift out of sync with the selected languages.
function updateSuggestedSpaceName() {
    const type = document.getElementById('new-space-type')?.value;
    const nameInput = document.getElementById('new-space-name-input');
    if (!nameInput) return;
    if (type === 'dictionary') {
        const sourceCode = codeForLanguage(document.getElementById('new-space-source-lang').value);
        const targetCode = codeForLanguage(document.getElementById('new-space-target-lang').value);
        nameInput.value = `Dictionary (${sourceCode}→${targetCode})`;
        nameInput.disabled = true;
    } else {
        if (nameInput.disabled) nameInput.value = '';
        nameInput.disabled = false;
    }
}

async function submitNewSpace() {
    const name = document.getElementById('new-space-name-input').value.trim();
    if (!name) return;
    const spaceType = document.getElementById('new-space-type').value;
    const sourceLanguage = document.getElementById('new-space-source-lang').value;
    const targetLanguage = document.getElementById('new-space-target-lang').value;
    const bridgeLanguage = spaceType === 'bridge' ? document.getElementById('new-space-bridge-lang').value : undefined;

    let space;
    try {
        space = await createSpace({ name, spaceType, sourceLanguage, targetLanguage, bridgeLanguage });
    } catch (err) {
        alert(err.message || 'Failed to create space');
        return;
    }

    spaces.push(space);
    closeSpaceCreateModal();
    await setActiveSpace(space.id);
}

// ===== Space migration =====

let migrateSourceSpaceId = null;

function showMigrateSpaceForm(id) {
    const source = spaces.find(s => s.id === id);
    if (!source) return;
    migrateSourceSpaceId = id;
    // Only spaces of the same type and language pair are valid targets —
    // otherwise data is lost or phrases end up mixed with a different pair.
    const candidates = spaces.filter(s =>
        s.id !== id &&
        s.space_type === source.space_type &&
        s.source_language === source.source_language &&
        s.target_language === source.target_language &&
        (source.space_type !== 'bridge' || s.bridge_language === source.bridge_language)
    );
    const form = document.getElementById('space-picker-new-form');

    if (!candidates.length) {
        form.innerHTML = `
            <div class="tag-name">No other space with the same type and languages to migrate "${escapeHtml(source.name)}" into.</div>
            <div class="form-buttons">
                <button onclick="document.getElementById('space-picker-new-form').innerHTML = ''">Close</button>
            </div>
        `;
        return;
    }

    form.innerHTML = `
        <div class="tag-name">Migrate "${escapeHtml(source.name)}" into:</div>
        <div class="tag-picker-chip-list">
            ${candidates.map(s => `<div class="tag-chip" onclick="confirmMigrateSpaceTarget('${s.id}')">${escapeHtml(s.name)}</div>`).join('')}
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

function renderMigrateSpaceConfirm(source, target) {
    const form = document.getElementById('space-picker-new-form');
    form.innerHTML = `
        <div class="tag-name">
            Move all phrases and transcripts from "${escapeHtml(source.name)}" into "${escapeHtml(target.name)}", and delete "${escapeHtml(source.name)}"?
            This cannot be undone.
        </div>
        <div id="migrate-space-error" class="form-error" style="display:none"></div>
        <div class="form-buttons">
            <button onclick="showMigrateSpaceForm('${source.id}')">Back</button>
            <button class="primary" onclick="submitMigrateSpace('${source.id}', '${target.id}')">Confirm migration</button>
        </div>
    `;
}

async function submitMigrateSpace(sourceId, targetId) {
    try {
        await migrateSpace({ sourceId, targetId });
    } catch (err) {
        const errEl = document.getElementById('migrate-space-error');
        if (errEl) {
            errEl.style.display = 'block';
            errEl.textContent = err.message || 'Failed to migrate space';
        } else {
            alert(err.message || 'Failed to migrate space');
        }
        return;
    }

    if (typeof syncSlotsToNotifyServer === 'function') syncSlotsToNotifyServer();

    document.getElementById('space-picker-new-form').innerHTML = '';
    migrateSourceSpaceId = null;
    await loadSpaces();
    if (!spaces.some(s => s.id === activeSpaceId)) {
        await setActiveSpace(spaces[0]?.id || null);
    } else {
        renderSpacePickerList();
        await loadTable();
    }
}