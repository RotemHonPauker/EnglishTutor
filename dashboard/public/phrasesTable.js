// Needs localDb.js and ttsStorage.js loaded first.

const tableBody = document.getElementById('table-body');

let allPhrases = [];

// ===== Multi-select (picking phrases to practice manually) =====
// Reached through the Practice tab's "🎯 Practice" scope picker
// (practiceSession.js's selectPhrasesFromScopePicker). Feeds
// startManualPracticeFromSelection — there's no bulk "Move to..." anymore.

let selectMode = false;
let selectedPhraseIds = new Set();

// Slot filtering (picking one of this space's slots, or "Unlabeled") lives
// in slots.js as part of the Practice-tab slots scroll; phraseMatchesSlotFilter
// is defined there, renderTable below just calls it.

async function loadTable() {
    if (typeof isDictionarySpace === 'function' && isDictionarySpace()) {
        if (typeof loadDictionaryEntries === 'function') await loadDictionaryEntries(activeSpaceId);
        return;
    }
    allPhrases = await getPhrases(activeSpaceId);
    if (typeof renderPracticeSlotsScroll === 'function') await renderPracticeSlotsScroll();
    renderTable();
}

function renderTable() {
    stopCurrentAudio();

    if (typeof isDictionarySpace === 'function' && isDictionarySpace()) {
        if (typeof renderDictionaryCards === 'function') renderDictionaryCards();
        return;
    }

    const sorted = allPhrases
        .filter(phraseMatchesSlotFilter)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Bridge spaces show actual language codes on the level badge (variant_2
    // is a different language there, not a step up); other types keep
    // "Level 1"/"Level 2".
    const activeSpace = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    const isBridge = activeSpace?.space_type === 'bridge';
    const targetCode = isBridge && typeof codeForLanguage === 'function' ? codeForLanguage(activeSpace.target_language) : null;
    const bridgeCode = isBridge && typeof codeForLanguage === 'function' ? codeForLanguage(activeSpace.bridge_language) : null;

    tableBody.innerHTML = sorted.map(p => {
        const slotColor = p.slot_color || null;
        const cardStyle = slotColor ? `border-color:${slotColor};` : '';
        const contrastColor = slotColor ? getContrastColor(slotColor) : null;
        const badgeStyle = slotColor ? `background:${slotColor}; color:${contrastColor};` : '';
        const badgeLabel = p.slot_name ? escapeHtml(p.slot_name) : 'Assign to slot';
        const level = p.level === 2 ? 2 : 1;
        const displayedVariant = level === 2 ? p.variant_2 : p.variant_1;
        const levelBadgeLabel = isBridge ? (level === 2 ? bridgeCode : targetCode) : `Level ${level}`;
        const levelBadgeTitle = isBridge ? 'Tap to switch language' : 'Tap to switch level';
        const isSelected = selectedPhraseIds.has(p.id);
        // Past the 7-unit cap, every unselected card's checkbox disables —
        // a hard stop while selecting, not a trim once practice starts.
        const selectionBlocked = selectMode && !isSelected && (selectedUnitTotal() + unitsForPhraseId(p.id) > selectionCap());
        const cardClasses = ['phrase-card', slotColor ? 'has-color' : '', isSelected ? 'selected' : '', selectionBlocked ? 'selection-blocked' : ''].filter(Boolean).join(' ');
        return `
        <div class="${cardClasses}" style="${cardStyle}" ${selectMode && !selectionBlocked ? `onclick="toggleCardSelection('${p.id}')"` : ''}>
            <div class="phrase-card-header">
                ${selectMode
                    ? `<input type="checkbox" class="phrase-select-checkbox" ${isSelected ? 'checked' : ''} ${selectionBlocked ? 'disabled' : ''} onclick="event.stopPropagation(); toggleCardSelection('${p.id}')">`
                    : `<div class="phrase-card-icons">
                    <button title="Delete phrase" onclick="deletePhraseRow('${p.id}')">🗑️</button>
                    <button title="Edit phrase" onclick="editPhraseRow('${p.id}')">✏️</button>
                    <button title="Move to another space" onclick="openMovePhraseModalForPhrase('${p.id}')">⇄</button>
                </div>`}
                <div class="phrase-card-badges">
                    ${isCardOld(p) ? `<button class="old-badge" title="Created over a month ago — tap to delete" onclick="deletePhraseRow('${p.id}')" ${selectMode ? 'disabled' : ''}>🕓 Old</button>` : ''}
                    <button class="level-badge level-${level}" style="${badgeStyle}" title="${levelBadgeTitle}" onclick="toggleLevel('${p.id}')" ${selectMode ? 'disabled' : ''}>${levelBadgeLabel}</button>
                    <button class="slot-badge" style="${badgeStyle}" onclick="openSlotPicker('${p.id}')" ${selectMode ? 'disabled' : ''}>${badgeLabel}</button>
                </div>
            </div>
            <div class="phrase-card-main">
                <div class="phrase-source" dir="auto">${escapeHtml(p.source_text || '')}</div>
                <div class="phrase-variant"><button class="tts-btn" title="Play" onclick="playPhraseAudio('${p.id}', ${level}, this)" ${selectMode ? 'disabled' : ''}>🔊</button> ${escapeHtml(displayedVariant || '')}</div>
            </div>
        </div>
    `;
    }).join('');
}

// Shared with dictionary.js's playDictionaryAudio, so a word's audio and a
// phrase's audio can never both be "playing" at once.
let currentlyPlayingAudio = null;
let currentlyPlayingBtn = null;

function stopCurrentAudio() {
    if (currentlyPlayingAudio) {
        currentlyPlayingAudio.pause();
        currentlyPlayingAudio.currentTime = 0;
    }
    if (currentlyPlayingBtn) {
        currentlyPlayingBtn.textContent = '🔊';
        currentlyPlayingBtn.classList.remove('playing');
    }
    currentlyPlayingAudio = null;
    currentlyPlayingBtn = null;
}

function startPlayback(url, btnEl) {
    const audio = new Audio(url);
    currentlyPlayingAudio = audio;
    currentlyPlayingBtn = btnEl;
    btnEl.textContent = '⏹️';
    btnEl.classList.add('playing');
    audio.addEventListener('ended', () => {
        if (currentlyPlayingAudio === audio) stopCurrentAudio();
    });
    audio.play();
}

// getOrCreatePhraseAudioUrl (ttsStorage.js) checks this device's own
// IndexedDB cache first, and only calls Gemini TTS the first time a given
// phrase+variant is played on this device.
async function playPhraseAudio(phraseId, variant, btnEl) {
    if (currentlyPlayingBtn === btnEl && currentlyPlayingAudio) {
        stopCurrentAudio();
        return;
    }
    stopCurrentAudio();

    const phrase = allPhrases.find(p => p.id === phraseId);
    if (!phrase) return;

    const originalContent = btnEl.textContent;
    btnEl.disabled = true;
    btnEl.textContent = '⏳';
    try {
        const url = await getOrCreatePhraseAudioUrl(phrase, variant);
        btnEl.disabled = false;
        btnEl.textContent = originalContent;
        startPlayback(url, btnEl);
    } catch (err) {
        alert(err.code === 'NO_API_KEY' ? 'No Gemini API key set yet.' : 'Failed to play audio');
        btnEl.disabled = false;
        btnEl.textContent = originalContent;
    }
}

let pendingDeleteId = null;
let pendingDeleteType = 'phrase'; // 'phrase' | 'dictionary'

function editPhraseRow(id) {
    const phrase = allPhrases.find(p => p.id === id);
    if (!phrase) return;
    if (typeof startEditingPhrase === 'function') startEditingPhrase(phrase);
}

function deletePhraseRow(id) {
    const phrase = allPhrases.find(p => p.id === id);
    const preview = phrase ? (phrase.source_text || '').slice(0, 60) : '';
    pendingDeleteId = id;
    pendingDeleteType = 'phrase';
    document.getElementById('delete-modal-text').innerHTML =
        `Delete this phrase? This can't be undone.${preview ? `<span class="preview">"${escapeHtml(preview)}"</span>` : ''}`;
    document.getElementById('delete-modal-overlay').style.display = 'flex';
}

function closeDeleteModal() {
    pendingDeleteId = null;
    document.getElementById('delete-modal-overlay').style.display = 'none';
}

// Handles both phrase and dictionary-entry deletion (see deleteDictionaryRow
// in dictionary.js, which opens the same modal with pendingDeleteType set).
async function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    const type = pendingDeleteType;
    try {
        if (type === 'dictionary') {
            await deleteDictionaryEntry(id);
            if (typeof deleteTtsBlobForDictionaryEntry === 'function') await deleteTtsBlobForDictionaryEntry(id);
        } else {
            await deletePhrase(id);
            await deleteTtsBlobsForPhrase(id);
        }
        closeDeleteModal();
        await loadTable();
    } catch (err) {
        closeDeleteModal();
        alert(type === 'dictionary' ? 'Failed to delete word' : 'Failed to delete phrase');
    }
}

async function updatePhraseSlotAssignment(id, slotId) {
    try {
        await updatePhraseSlot({ id, slotId: slotId || null });
        await loadTable();
    } catch (err) {
        alert('Failed to update time slot');
    }
}

async function toggleLevel(id) {
    const phrase = allPhrases.find(p => p.id === id);
    if (!phrase) return;
    const wasLevel = phrase.level === 2 ? 2 : 1;
    const nextLevel = wasLevel === 1 ? 2 : 1;
    phrase.level = nextLevel;
    renderTable();
    try {
        const updated = await updatePhraseLevel({ id, level: nextLevel });
        phrase.level = updated.level;
        renderTable();
    } catch (err) {
        phrase.level = wasLevel;
        renderTable();
        alert('Failed to update level');
    }
}

// ===== Slot picker (opened by tapping a card's slot badge) =====

let slotPickerPhraseId = null;
let slotPickerSelectedSlot = null;

function openSlotPicker(phraseId) {
    const phrase = allPhrases.find(p => p.id === phraseId);
    if (!phrase) return;
    slotPickerPhraseId = phraseId;
    slotPickerSelectedSlot = phrase.slot_id || null;
    renderSlotPickerList();
    document.getElementById('slot-picker-modal-overlay').style.display = 'flex';
}

function closeSlotPicker() {
    slotPickerPhraseId = null;
    slotPickerSelectedSlot = null;
    document.getElementById('slot-picker-modal-overlay').style.display = 'none';
}

function renderSlotPickerList() {
    const noneChip = `<div class="tag-chip none ${!slotPickerSelectedSlot ? 'selected' : ''}" onclick="selectPickerSlot(null)">—</div>`;
    const chips = (typeof slots !== 'undefined' ? slots : []).map(s => {
        const contrast = getContrastColor(s.color);
        const selected = slotPickerSelectedSlot === s.id;
        return `<div class="tag-chip ${selected ? 'selected' : ''}" style="background:${s.color || '#333'}; color:${contrast}" onclick="selectPickerSlot('${s.id}')">${escapeHtml(s.name)}</div>`;
    }).join('');
    document.getElementById('slot-picker-list').innerHTML = noneChip + chips;
}

function selectPickerSlot(slotId) {
    slotPickerSelectedSlot = slotId;
    renderSlotPickerList();
}

async function confirmSlotPick() {
    if (!slotPickerPhraseId) return;
    const phraseId = slotPickerPhraseId;
    const slotId = slotPickerSelectedSlot;
    closeSlotPicker();
    await updatePhraseSlotAssignment(phraseId, slotId);
}

// ===== Select mode =====

function toggleSelectMode() {
    selectMode = !selectMode;
    if (!selectMode) selectedPhraseIds.clear();
    updateSelectModeUI();
    renderTable();
}

function exitSelectMode() {
    selectMode = false;
    selectedPhraseIds.clear();
    updateSelectModeUI();
    renderTable();
}

function resetSelectMode() {
    exitSelectMode();
}

// Mirrors practiceSession.js's countUnitsForPhrase (a multi-sentence phrase
// is several units); falls back to 1 if that file hasn't loaded.
function unitsForPhraseId(id) {
    const p = allPhrases.find(ph => ph.id === id);
    if (!p) return 1;
    return typeof countUnitsForPhrase === 'function' ? countUnitsForPhrase(p) : 1;
}

function selectedUnitTotal() {
    let total = 0;
    selectedPhraseIds.forEach(id => { total += unitsForPhraseId(id); });
    return total;
}

// Same cap practiceSession.js targets (PRACTICE_SESSION_TARGET_UNITS = 7),
// read from there so the two numbers can't drift apart.
function selectionCap() {
    return typeof PRACTICE_SESSION_TARGET_UNITS === 'number' ? PRACTICE_SESSION_TARGET_UNITS : 7;
}

function toggleCardSelection(id) {
    if (selectedPhraseIds.has(id)) {
        selectedPhraseIds.delete(id);
    } else {
        if (selectedUnitTotal() + unitsForPhraseId(id) > selectionCap()) return;
        selectedPhraseIds.add(id);
    }
    updateSelectModeUI();
    renderTable();
}

function updateSelectModeUI() {
    const toolbar = document.getElementById('table-toolbar');
    if (toolbar) toolbar.style.display = selectMode ? 'none' : 'flex';
    const bar = document.getElementById('selection-action-bar');
    const count = selectedPhraseIds.size;
    if (bar) bar.style.display = selectMode ? 'flex' : 'none';
    const countEl = document.getElementById('selection-count');
    if (countEl) countEl.textContent = `${count} selected`;
    const startBtn = document.getElementById('start-practice-from-selection-btn');
    if (startBtn) startBtn.disabled = count === 0;
}

// ===== Move a phrase to another space (one card at a time, via "⇄") =====

let moveModalPhraseIds = [];

function openMovePhraseModalForPhrase(id) {
    openMovePhraseModalForIds([id]);
}

function openMovePhraseModalForIds(ids) {
    if (!ids.length) return;
    moveModalPhraseIds = ids;
    renderMovePhraseList();
    const title = document.getElementById('move-phrase-modal-title');
    const count = ids.length;
    if (title) title.textContent = count === 1 ? 'Move to...' : `Move ${count} phrases to...`;
    document.getElementById('move-phrase-modal-overlay').style.display = 'flex';
}

function closeMovePhraseModal() {
    document.getElementById('move-phrase-modal-overlay').style.display = 'none';
    moveModalPhraseIds = [];
}

// A dictionary space does word lookups, not phrase capture, so it's never a valid target.
function renderMovePhraseList() {
    const container = document.getElementById('move-phrase-list');
    const candidates = (typeof spaces !== 'undefined' ? spaces : [])
        .filter(s => s.id !== activeSpaceId && s.space_type !== 'dictionary');
    container.innerHTML = candidates.length
        ? candidates.map(s => `<div class="tag-chip" onclick="confirmBulkMove('${s.id}')">${escapeHtml(s.name)}</div>`).join('')
        : `<div class="tag-name">No other phrase space to move these into.</div>`;
}

async function confirmBulkMove(targetSpaceId) {
    const ids = moveModalPhraseIds;
    closeMovePhraseModal();
    try {
        await bulkMovePhrases({ ids, targetSpaceId });
        exitSelectMode();
        await loadTable();
    } catch (err) {
        alert('Failed to move phrases — try again.');
    }
}

// Unlike the other practice scopes (random from the space / a time slot),
// a manual selection is practiced in full, with no 7-unit cap.
function startPracticeFromSelection() {
    if (typeof startManualPracticeFromSelection === 'function') startManualPracticeFromSelection();
}