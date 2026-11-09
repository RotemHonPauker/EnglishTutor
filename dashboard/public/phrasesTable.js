// Needs remoteDb.js and ttsStorage.js loaded first.

const tableBody = document.getElementById('table-body');

let allPhrases = [];

// ===== Multi-select (for the bulk "Move to..." action) =====

let selectMode = false;
let selectedPhraseIds = new Set();

// ===== Tag filter =====

let filterTagIds = new Set();

function phraseMatchesTagFilter(phrase) {
    if (filterTagIds.size === 0) return true;
    return filterTagIds.has(phrase.tag_id);
}

function openTagFilterModal() {
    renderTagFilterModal();
    document.getElementById('tag-filter-modal-overlay').style.display = 'flex';
}

function closeTagFilterModal() {
    document.getElementById('tag-filter-modal-overlay').style.display = 'none';
}

function renderTagFilterModal() {
    const noTagChip = `<div class="tag-chip none ${filterTagIds.has(null) ? 'selected' : ''}" onclick="toggleFilterTag(null)">No tag</div>`;
    const chips = tags.map(t => {
        const contrast = getContrastColor(t.color);
        const selected = filterTagIds.has(t.id);
        return `<div class="tag-chip ${selected ? 'selected' : ''}" style="background:${t.color || '#333'}; color:${contrast}" onclick="toggleFilterTag('${t.id}')">${escapeHtml(t.name)}</div>`;
    }).join('');
    document.getElementById('tag-filter-groups').innerHTML = `<div class="tag-picker-chip-list">${noTagChip}${chips}</div>`;
}

function toggleFilterTag(id) {
    if (filterTagIds.has(id)) {
        filterTagIds.delete(id);
    } else {
        filterTagIds.add(id);
    }
    renderTagFilterModal();
}

function clearTagFilter() {
    filterTagIds.clear();
    renderTagFilterModal();
}

// Full reset for contexts outside the filter modal itself (e.g. switching
// spaces) — clears the filter AND updates what's actually visible in the
// table toolbar, not just the modal's own internal state.
function resetTagFilter() {
    filterTagIds.clear();
    renderActiveFilterChips();
}

function applyTagFilter() {
    closeTagFilterModal();
    renderActiveFilterChips();
    if (typeof generateDateBuckets === 'function') generateDateBuckets();
    if (typeof renderDateScroll === 'function') renderDateScroll();
    renderTable();
}

function removeTagFilter(id) {
    filterTagIds.delete(id);
    renderActiveFilterChips();
    if (typeof generateDateBuckets === 'function') generateDateBuckets();
    if (typeof renderDateScroll === 'function') renderDateScroll();
    renderTable();
}

function renderActiveFilterChips() {
    const row = document.getElementById('active-tag-filters');
    row.innerHTML = [...filterTagIds].map(id => {
        if (id === null) {
            return `<span class="active-filter-chip" style="background:#333; color:#ccc">No tag<button onclick="removeTagFilter(null)">✕</button></span>`;
        }
        const tag = tags.find(t => t.id === id);
        if (!tag) return '';
        const contrast = getContrastColor(tag.color);
        return `<span class="active-filter-chip" style="background:${tag.color || '#333'}; color:${contrast}">${escapeHtml(tag.name)}<button onclick="removeTagFilter('${id}')">✕</button></span>`;
    }).join('');
    row.style.display = filterTagIds.size ? 'flex' : 'none';
}

// ===== Learned filter =====

// Cycles through: all -> not-learned -> learned -> all.
let learnedFilter = 'all';

function phraseMatchesLearnedFilter(phrase) {
    if (learnedFilter === 'learned') return !!phrase.learned_at;
    if (learnedFilter === 'unlearned') return !phrase.learned_at;
    return true;
}

function toggleLearnedFilter() {
    learnedFilter = learnedFilter === 'all' ? 'unlearned' : learnedFilter === 'unlearned' ? 'learned' : 'all';
    const btn = document.getElementById('learned-filter-btn');
    if (btn) {
        btn.textContent = learnedFilter === 'all' ? 'All' : learnedFilter === 'unlearned' ? 'Not learned' : '👑 Learned';
        btn.classList.toggle('active', learnedFilter !== 'all');
    }
    if (typeof generateDateBuckets === 'function') generateDateBuckets();
    if (typeof renderDateScroll === 'function') renderDateScroll();
    renderTable();
}

// Called on space switch, alongside resetTagFilter.
function resetLearnedFilter() {
    learnedFilter = 'all';
    const btn = document.getElementById('learned-filter-btn');
    if (btn) {
        btn.textContent = 'All';
        btn.classList.remove('active');
    }
}

async function loadTable() {
    if (typeof isDictionarySpace === 'function' && isDictionarySpace()) {
        if (typeof loadDictionaryEntries === 'function') await loadDictionaryEntries(activeSpaceId);
        return;
    }
    allPhrases = await getPhrases(activeSpaceId);
    if (typeof generateDateBuckets === 'function') generateDateBuckets();
    if (typeof renderDateScroll === 'function') renderDateScroll();
    renderTable();
    if (typeof renderSidebar === 'function') renderSidebar();
}

const DAY_MS = 24 * 60 * 60 * 1000; // also used by practiceDateScroll.js

function renderTable() {
    stopCurrentAudio();

    if (typeof isDictionarySpace === 'function' && isDictionarySpace()) {
        if (typeof renderDictionaryCards === 'function') renderDictionaryCards();
        return;
    }

    const sorted = allPhrases
        .filter(phraseMatchesTagFilter)
        .filter(phraseMatchesLearnedFilter)
        .filter(phraseMatchesDateFilter)
        // Newest first within whatever's shown — with the date scroll
        // already narrowing to a specific day/week, there's no separate
        // sort control anymore; this is just the fixed within-bucket order.
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    document.getElementById('phrase-count').textContent = sorted.length;

    // Bridge spaces show the actual language codes on the badge (there's
    // no "advanced version" concept there — variant_2 is a different
    // language entirely, not a step up); every other type keeps "Level 1"/
    // "Level 2". Looked up once per render, not per card.
    const activeSpace = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    const isBridge = activeSpace?.space_type === 'bridge';
    const targetCode = isBridge && typeof codeForLanguage === 'function' ? codeForLanguage(activeSpace.target_language) : null;
    const bridgeCode = isBridge && typeof codeForLanguage === 'function' ? codeForLanguage(activeSpace.bridge_language) : null;

    tableBody.innerHTML = sorted.map(p => {
        const tag = tags.find(t => t.id === p.tag_id);
        const tagColor = tag ? tag.color : null;
        const cardTextColor = tagColor ? getContrastColor(tagColor) : null;
        const cardStyle = tagColor ? `background:${tagColor}; border-color:${tagColor}; color:${cardTextColor};` : '';
        // Same lighter-overlay technique as the tag badge below — a
        // semi-transparent white/black wash relative to this card's own
        // background, so it reads as "lighter than the card" whatever that
        // card's color is, instead of one fixed gray regardless of tag color.
        const iconBg = tagColor
            ? (cardTextColor === '#ffffff' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)')
            : '';
        const badgeStyle = tagColor
            ? `background:${iconBg}; color:${cardTextColor};`
            : '';
        const badgeLabel = tag ? escapeHtml(tag.name) : '—';
        const isLearned = !!p.learned_at;
        const level = p.level === 2 ? 2 : 1;
        const displayedVariant = level === 2 ? p.variant_2 : p.variant_1;
        const levelBadgeLabel = isBridge ? (level === 2 ? bridgeCode : targetCode) : `Level ${level}`;
        const levelBadgeTitle = isBridge ? 'Tap to switch language' : 'Tap to switch level';
        const isSelected = selectedPhraseIds.has(p.id);
        const cardClasses = ['phrase-card', tagColor ? 'has-color' : '', isLearned ? 'learned' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
        return `
        <div class="${cardClasses}" style="${cardStyle}" ${selectMode ? `onclick="toggleCardSelection('${p.id}')"` : ''}>
            <div class="phrase-card-header">
                ${selectMode
                    ? `<input type="checkbox" class="phrase-select-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleCardSelection('${p.id}')">`
                    : `<div class="phrase-card-icons">
                    <button style="${iconBg ? `background:${iconBg};` : ''}" title="Delete phrase" onclick="deletePhraseRow('${p.id}')">🗑️</button>
                    <button style="${iconBg ? `background:${iconBg};` : ''}" title="Edit phrase" onclick="editPhraseRow('${p.id}')">✏️</button>
                    <button class="learned-btn ${isLearned ? 'active' : ''}" style="${iconBg ? `background:${iconBg};` : ''}" title="${isLearned ? 'Learned — tap to unmark' : 'Mark as learned'}" onclick="toggleLearned('${p.id}')">👑</button>
                </div>`}
                <div class="phrase-card-badges">
                    <button class="level-badge level-${level}" style="${badgeStyle}" title="${levelBadgeTitle}" onclick="toggleLevel('${p.id}')" ${selectMode ? 'disabled' : ''}>${levelBadgeLabel}</button>
                    <button class="tag-badge" style="${badgeStyle}" onclick="openTagPicker('${p.id}')" ${selectMode ? 'disabled' : ''}>${badgeLabel}</button>
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

// Only one phrase plays at a time. Tracked here (not per-button) so a new
// play always stops whatever else was going, and so a re-render (tag
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

async function updatePhraseTagAssignment(id, tagId) {
    try {
        await updatePhraseTag({ id, tagId: tagId || null });
        await loadTable();
    } catch (err) {
        alert('Failed to update tag');
    }
}

// Simple binary toggle, independent of learned state.
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

// Optimistic-ish toggle: flips the local flag immediately so the crown and
// card shading respond right away, re-rendering from the saved result only
// to correct it if the request actually failed. Independent of level.
async function toggleLearned(id) {
    const phrase = allPhrases.find(p => p.id === id);
    if (!phrase) return;
    const nextLearned = !phrase.learned_at;
    phrase.learned_at = nextLearned ? new Date().toISOString() : null;
    renderTable();
    try {
        const updated = await updatePhraseLearned({ id, learned: nextLearned });
        phrase.learned_at = updated.learned_at;
        renderTable();
        if (typeof renderSidebar === 'function') renderSidebar();
    } catch (err) {
        phrase.learned_at = nextLearned ? null : new Date().toISOString();
        renderTable();
        alert('Failed to update learned status');
    }
}

// ===== Tag picker (opened by tapping a card's tag badge) =====

let tagPickerPhraseId = null;
let tagPickerSelectedTag = null;

function openTagPicker(phraseId) {
    const phrase = allPhrases.find(p => p.id === phraseId);
    if (!phrase) return;
    tagPickerPhraseId = phraseId;
    tagPickerSelectedTag = phrase.tag_id || null;
    renderTagPickerList();
    document.getElementById('tag-picker-modal-overlay').style.display = 'flex';
}

function closeTagPicker() {
    tagPickerPhraseId = null;
    tagPickerSelectedTag = null;
    document.getElementById('tag-picker-modal-overlay').style.display = 'none';
}

function renderTagPickerList() {
    const noneChip = `<div class="tag-chip none ${!tagPickerSelectedTag ? 'selected' : ''}" onclick="selectPickerTag(null)">—</div>`;
    const chips = tags.map(t => {
        const contrast = getContrastColor(t.color);
        const selected = tagPickerSelectedTag === t.id;
        return `<div class="tag-chip ${selected ? 'selected' : ''}" style="background:${t.color || '#333'}; color:${contrast}" onclick="selectPickerTag('${t.id}')">${escapeHtml(t.name)}</div>`;
    }).join('');
    document.getElementById('tag-picker-list').innerHTML = noneChip + chips;
}

function selectPickerTag(tagId) {
    tagPickerSelectedTag = tagId;
    renderTagPickerList();
}

async function confirmTagPick() {
    if (!tagPickerPhraseId) return;
    const phraseId = tagPickerPhraseId;
    const tagId = tagPickerSelectedTag;
    closeTagPicker();
    await updatePhraseTagAssignment(phraseId, tagId);
}

// ===== Select mode (toolbar "Select" toggle) =====
// Swaps each card's icon row for a checkbox and makes the whole card
// tappable; the level/tag badges and the audio button are disabled while
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

// Called on space switch (spacesState.js), same as resetTagFilter/
// resetLearnedFilter — a selection of specific phrase ids from the space
// you're leaving has nothing to do with the one you're entering.
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
// round trip. Level and learned status carry over unchanged; tags don't,
// since a tag belongs to one specific space (see remoteDb.js).

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
        : `<div class="tag-name">No other phrase routine to move these into.</div>`;
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