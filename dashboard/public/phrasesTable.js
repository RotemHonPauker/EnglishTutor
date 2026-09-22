const tableBody = document.getElementById('table-body');

let allPhrases = [];

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
        return `<div class="tag-chip ${selected ? 'selected' : ''}" style="background:${t.color || '#333'}; color:${contrast}" onclick="toggleFilterTag('${t.id}')">${t.name}</div>`;
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
        return `<span class="active-filter-chip" style="background:${tag.color || '#333'}; color:${contrast}">${tag.name}<button onclick="removeTagFilter('${id}')">✕</button></span>`;
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
    const res = await fetch(`/phrases?spaceId=${activeSpaceId}`);
    allPhrases = await res.json();
    if (typeof generateDateBuckets === 'function') generateDateBuckets();
    if (typeof renderDateScroll === 'function') renderDateScroll();
    renderTable();
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderAnalyticsChart === 'function') renderAnalyticsChart();
    if (typeof renderSpaceHealthIndicator === 'function') renderSpaceHealthIndicator();
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
        const badgeLabel = tag ? tag.name : '—';
        const isLearned = !!p.learned_at;
        const level = p.level === 2 ? 2 : 1;
        const displayedVariant = level === 2 ? p.variant_2 : p.variant_1;
        const levelBadgeLabel = isBridge ? (level === 2 ? bridgeCode : targetCode) : `Level ${level}`;
        const levelBadgeTitle = isBridge ? 'Tap to switch language' : 'Tap to switch level';
        const cardClasses = ['phrase-card', tagColor ? 'has-color' : '', isLearned ? 'learned' : ''].filter(Boolean).join(' ');
        return `
        <div class="${cardClasses}" style="${cardStyle}">
            <div class="phrase-card-header">
                <div class="phrase-card-icons">
                    <button style="${iconBg ? `background:${iconBg};` : ''}" title="Delete phrase" onclick="deletePhraseRow('${p.id}')">🗑️</button>
                    <button style="${iconBg ? `background:${iconBg};` : ''}" title="Edit phrase" onclick="editPhraseRow('${p.id}')">✏️</button>
                    <button class="learned-btn ${isLearned ? 'active' : ''}" style="${iconBg ? `background:${iconBg};` : ''}" title="${isLearned ? 'Learned — tap to unmark' : 'Mark as learned'}" onclick="toggleLearned('${p.id}')">👑</button>
                </div>
                <div class="phrase-card-badges">
                    <button class="level-badge level-${level}" style="${badgeStyle}" title="${levelBadgeTitle}" onclick="toggleLevel('${p.id}')">${levelBadgeLabel}</button>
                    <button class="tag-badge" style="${badgeStyle}" onclick="openTagPicker('${p.id}')">${badgeLabel}</button>
                </div>
            </div>
            <div class="phrase-card-main">
                <div class="phrase-hebrew" dir="auto">${p.hebrew_text || ''}</div>
                <div class="phrase-variant"><button class="tts-btn" title="Play" onclick="playPhraseAudio('${p.id}', ${level}, this)">🔊</button> ${displayedVariant || ''}</div>
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

// Lazy audio generation: returns the already-cached URL if this variant
// was played before, and only calls the Gemini TTS API (and saves a new
// file) the first time. Reuses the same translate rate limiter, since this
// also calls an external AI API and should be protected the same way.
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

    const existingUrl = variant === 1 ? phrase.tts_url_variant1 : phrase.tts_url_variant2;
    if (existingUrl) {
        startPlayback(existingUrl, btnEl);
        return;
    }

    const originalContent = btnEl.textContent;
    btnEl.disabled = true;
    btnEl.textContent = '⏳';
    try {
        const res = await fetch(`/phrases/${phraseId}/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ variant })
        });
        if (!res.ok) throw new Error('Failed to generate audio');
        const data = await res.json();
        if (variant === 1) phrase.tts_url_variant1 = data.url;
        else phrase.tts_url_variant2 = data.url;
        btnEl.disabled = false;
        btnEl.textContent = originalContent;
        startPlayback(data.url, btnEl);
    } catch (err) {
        alert('Failed to play audio');
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
    const preview = phrase ? (phrase.hebrew_text || '').slice(0, 60) : '';
    pendingDeleteId = id;
    pendingDeleteType = 'phrase';
    document.getElementById('delete-modal-text').innerHTML =
        `Delete this phrase? This can't be undone.${preview ? `<span class="preview">"${preview}"</span>` : ''}`;
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
    const url = type === 'dictionary' ? `/dictionary/${id}` : `/phrases/${id}`;
    try {
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete');
        closeDeleteModal();
        await loadTable();
    } catch (err) {
        closeDeleteModal();
        alert(type === 'dictionary' ? 'Failed to delete word' : 'Failed to delete phrase');
    }
}

async function updatePhraseTagAssignment(id, tagId) {
    try {
        const res = await fetch(`/phrases/${id}/tag`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagId: tagId || null })
        });
        if (!res.ok) throw new Error('Failed to update tag');
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
        const res = await fetch(`/phrases/${id}/level`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level: nextLevel })
        });
        if (!res.ok) throw new Error('Failed to update level');
        const updated = await res.json();
        phrase.level = updated.level;
        renderTable();
    } catch (err) {
        phrase.level = wasLevel;
        renderTable();
        alert('Failed to update level');
    }
}

// Optimistic-ish toggle: flips the local flag immediately so the crown and
// card shading respond right away, re-rendering from the server's answer
// only to correct it if the request actually failed. Independent of level.
async function toggleLearned(id) {
    const phrase = allPhrases.find(p => p.id === id);
    if (!phrase) return;
    const nextLearned = !phrase.learned_at;
    phrase.learned_at = nextLearned ? new Date().toISOString() : null;
    renderTable();
    try {
        const res = await fetch(`/phrases/${id}/learned`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ learned: nextLearned })
        });
        if (!res.ok) throw new Error('Failed to update learned status');
        const updated = await res.json();
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
        return `<div class="tag-chip ${selected ? 'selected' : ''}" style="background:${t.color || '#333'}; color:${contrast}" onclick="selectPickerTag('${t.id}')">${t.name}</div>`;
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