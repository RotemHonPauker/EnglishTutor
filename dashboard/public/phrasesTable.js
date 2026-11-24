// Needs remoteDb.js and ttsStorage.js loaded first.

const tableBody = document.getElementById('table-body');

let allPhrases = [];

// ===== Multi-select (for the bulk "Move to..." action) =====

let selectMode = false;
let selectedPhraseIds = new Set();

// Slot filtering itself — picking exactly one of this context's own slots
// (or "Unlabeled") to narrow the list down to — now lives in slots.js, as
// part of the same Practice-tab slots scroll that shows today's
// cross-context schedule (renderPracticeSlotsScroll/selectSlotBucket).
// phraseMatchesSlotFilter is defined there; renderTable below just calls
// it.

async function loadTable() {
    if (typeof isDictionarySpace === 'function' && isDictionarySpace()) {
        if (typeof loadDictionaryEntries === 'function') await loadDictionaryEntries(activeSpaceId);
        return;
    }
    allPhrases = await getPhrases(activeSpaceId);
    // Recomputes that scroll's per-slot phrase counts too, not just its
    // today's-schedule display — they depend on allPhrases, which just
    // changed.
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
        // Newest first within whichever slot is selected — with the
        // slots scroll already narrowing to one slot (or Unlabeled),
        // there's no separate sort control needed.
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Bridge spaces show the actual language codes on the badge (there's
    // no "advanced version" concept there — variant_2 is a different
    // language entirely, not a step up); every other type keeps "Level 1"/
    // "Level 2". Looked up once per render, not per card.
    const activeSpace = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    const isBridge = activeSpace?.space_type === 'bridge';
    const targetCode = isBridge && typeof codeForLanguage === 'function' ? codeForLanguage(activeSpace.target_language) : null;
    const bridgeCode = isBridge && typeof codeForLanguage === 'function' ? codeForLanguage(activeSpace.bridge_language) : null;

    tableBody.innerHTML = sorted.map(p => {
        // getPhrases (localDb.js) already joins each phrase onto its own
        // slot's name/color — no separate lookup against a global list
        // needed here. The slot's color is just a border accent on the
        // card now, not a full background fill (Rotem's own call — with
        // the card list already narrowed to one slot at a time via the
        // slot scroll, every card on screen shares the same color anyway,
        // so filling the whole card in it added nothing but noise).
        const slotColor = p.slot_color || null;
        const cardStyle = slotColor ? `border-color:${slotColor};` : '';
        const contrastColor = slotColor ? getContrastColor(slotColor) : null;
        const badgeStyle = slotColor ? `background:${slotColor}; color:${contrastColor};` : '';
        // A card with no slot at all needs an obvious call to action, not
        // just a blank dash — tapping this badge opens the same slot
        // picker either way (openSlotPicker below).
        const badgeLabel = p.slot_name ? escapeHtml(p.slot_name) : 'Assign to slot';
        const level = p.level === 2 ? 2 : 1;
        const displayedVariant = level === 2 ? p.variant_2 : p.variant_1;
        const levelBadgeLabel = isBridge ? (level === 2 ? bridgeCode : targetCode) : `Level ${level}`;
        const levelBadgeTitle = isBridge ? 'Tap to switch language' : 'Tap to switch level';
        const isSelected = selectedPhraseIds.has(p.id);
        const cardClasses = ['phrase-card', slotColor ? 'has-color' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
        return `
        <div class="${cardClasses}" style="${cardStyle}" ${selectMode ? `onclick="toggleCardSelection('${p.id}')"` : ''}>
            <div class="phrase-card-header">
                ${selectMode
                    ? `<input type="checkbox" class="phrase-select-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleCardSelection('${p.id}')">`
                    : `<div class="phrase-card-icons">
                    <button title="Delete phrase" onclick="deletePhraseRow('${p.id}')">🗑️</button>
                    <button title="Edit phrase" onclick="editPhraseRow('${p.id}')">✏️</button>
                </div>`}
                <div class="phrase-card-badges">
                    <button class="level-badge level-${level}" style="${badgeStyle}" title="${levelBadgeTitle}" onclick="toggleLevel('${p.id}')" ${selectMode ? 'disabled' : ''}>${levelBadgeLabel}</button>
                    <button class="slot-badge" style="${badgeStyle}" onclick="openSlotPicker('${p.id}')" ${selectMode ? 'disabled' : ''}>${badgeLabel}</button>
                </div>
            </div>
            <div class="phrase-card-main">
                <div class="phrase-source" dir="auto">${escapeHtml(p.source_text || '')}</div>
                <div class="phrase-variant"><button class="tts-btn" title="Play" onclick="playPhraseAudio('${p.id}', ${level}, this)" ${selectMode ? 'disabled' : ''}>🔊</button> ${escapeHtml(displayedVariant || '')}</div>
                ${isCardOld(p) ? `<div class="card-old-notice">🕓 Created over a month ago</div>` : ''}
            </div>
        </div>
    `;
    }).join('');
}

// Only one phrase plays at a time. Tracked here (not per-button) so a new
// play always stops whatever else was going, and so a re-render (slot
// change, filter, etc.) never leaves audio playing with no visible way to
// stop it — see the reset at the top of renderTable().
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

// Lazy audio generation, now fully on-device: getOrCreatePhraseAudioUrl
// (ttsStorage.js) checks THIS browser's IndexedDB cache first, and only
// calls Gemini TTS the first time a given phrase+variant is played on
// this particular device — see ttsStorage.js for why that's now per-
// device rather than shared (no server disk to share it from anymore).
// Tapping the same button again while it's playing stops it — no overlay,
// no modal, just the button itself toggling between 🔊 and ⏹️, so the
// screen underneath is always free to scroll.
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
let pendingDeleteType = 'phrase'; // 'phrase' | 'dictionary' — set by whichever delete* function opened the modal

// Hands off to captureTab.js — editing happens in the Add tab, not here.
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

// Handles both phrase and dictionary-entry deletion — see deleteDictionaryRow
// (dictionary.js), which opens the same modal with pendingDeleteType set.
async function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    const type = pendingDeleteType;
    try {
        if (type === 'dictionary') {
            await deleteDictionaryEntry(id);
        } else {
            await deletePhrase(id);
            // Clears this device's cached audio for the phrase too — see
            // ttsStorage.js. A phrase that's gone has nothing for that
            // cache entry to point back to.
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

// Simple binary toggle.
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

// Only this context's own slots are offered — same `slots` global
// (slots.js) the Schedule tab itself reads from.
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

// ===== Select mode (toolbar "Select" toggle) =====
// Swaps each card's icon row for a checkbox and makes the whole card
// tappable; the level/slot badges and the audio button are disabled while
// it's active so a stray tap during selection can't retag/replay/relevel
// something by accident. Exists purely to feed the bulk "Move to..."
// action below — there's nothing else to do with a selection right now.

function toggleSelectMode() {
    selectMode = !selectMode;
    if (!selectMode) selectedPhraseIds.clear();
    updateSelectModeUI();
    renderTable();
}

// Always turns select mode off — used by the selection bar's own Cancel
// button and by anything that invalidates a selection outright (switching
// spaces, a bulk move having just gone through).
function exitSelectMode() {
    selectMode = false;
    selectedPhraseIds.clear();
    updateSelectModeUI();
    renderTable();
}

// Called on space switch (spacesState.js), same as resetSlotScroll — a
// selection of specific phrase ids from the space you're leaving has
// nothing to do with the one you're entering.
function resetSelectMode() {
    exitSelectMode();
}

function toggleCardSelection(id) {
    if (selectedPhraseIds.has(id)) selectedPhraseIds.delete(id);
    else selectedPhraseIds.add(id);
    updateSelectModeUI();
    renderTable();
}

function updateSelectModeUI() {
    const btn = document.getElementById('select-mode-btn');
    if (btn) {
        btn.textContent = selectMode ? 'Cancel' : 'Select';
        btn.classList.toggle('active', selectMode);
    }
    const bar = document.getElementById('selection-action-bar');
    const count = selectedPhraseIds.size;
    if (bar) bar.style.display = selectMode && count > 0 ? 'flex' : 'none';
    const countEl = document.getElementById('selection-count');
    if (countEl) countEl.textContent = `${count} selected`;
}

// ===== Move selected phrases to another space (bulk, from the selection bar) =====
// A direct space_id update (bulkMovePhrases) — no retranslation, no Add-tab
// round trip. Level carries over unchanged; a slot doesn't, since it
// belongs to one specific context's own schedule (see localDb.js's
// bulkMovePhrases).

function openMovePhraseModal() {
    if (!selectedPhraseIds.size) return;
    renderMovePhraseList();
    const title = document.getElementById('move-phrase-modal-title');
    const count = selectedPhraseIds.size;
    if (title) title.textContent = `Move ${count} phrase${count === 1 ? '' : 's'} to...`;
    document.getElementById('move-phrase-modal-overlay').style.display = 'flex';
}

function closeMovePhraseModal() {
    document.getElementById('move-phrase-modal-overlay').style.display = 'none';
}

// Only other Progression/Bridge spaces are valid targets — a dictionary
// space does word lookups, not phrase capture, so moved phrases have
// nowhere sensible to land there.
function renderMovePhraseList() {
    const container = document.getElementById('move-phrase-list');
    const candidates = (typeof spaces !== 'undefined' ? spaces : [])
        .filter(s => s.id !== activeSpaceId && s.space_type !== 'dictionary');
    container.innerHTML = candidates.length
        ? candidates.map(s => `<div class="tag-chip" onclick="confirmBulkMove('${s.id}')">${escapeHtml(s.name)}</div>`).join('')
        : `<div class="tag-name">No other phrase context to move these into.</div>`;
}

async function confirmBulkMove(targetSpaceId) {
    const ids = [...selectedPhraseIds];
    closeMovePhraseModal();
    try {
        await bulkMovePhrases({ ids, targetSpaceId });
        exitSelectMode();
        await loadTable();
    } catch (err) {
        alert('Failed to move phrases — try again.');
    }
}

// ===== Start a practice session from a manual selection =====
// The selection bar's other action besides "Move to...". Unlike the other
// two practice scopes (random from the context / specific time slots —
// see practiceSession.js), a manual pick is practiced in full, exactly as
// selected, with no 7-unit cap — the deliberate choice of phrases IS the
// scope here, not a sample to be trimmed.
function startPracticeFromSelection() {
    if (typeof startManualPracticeFromSelection === 'function') startManualPracticeFromSelection();
}