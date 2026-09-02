const tableBody = document.getElementById('table-body');

let allPhrases = [];

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
    const sorted = allPhrases
        .filter(phraseMatchesTagFilter)
        .filter(phraseMatchesLearnedFilter)
        .filter(phraseMatchesDateFilter)
        // Newest first within whatever's shown — with the date scroll
        // already narrowing to a specific day/week, there's no separate
        // sort control anymore; this is just the fixed within-bucket order.
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    document.getElementById('phrase-count').textContent = sorted.length;

    tableBody.innerHTML = sorted.map(p => {
        const tag = tags.find(t => t.id === p.tag_id);
        const tagColor = tag ? tag.color : null;
        const cardTextColor = tagColor ? getContrastColor(tagColor) : null;
        const cardStyle = tagColor ? `background:${tagColor}; border-color:${tagColor}; color:${cardTextColor};` : '';
        const badgeStyle = tagColor
            ? `background:${cardTextColor === '#ffffff' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}; color:${cardTextColor};`
            : '';
        const badgeLabel = tag ? tag.name : '—';
        const isLearned = !!p.learned_at;
        const cardClasses = ['phrase-card', tagColor ? 'has-color' : '', isLearned ? 'learned' : ''].filter(Boolean).join(' ');
        return `
        <div class="${cardClasses}" style="${cardStyle}">
            <div class="phrase-card-header">
                <div class="phrase-card-icons">
                    <button class="learned-btn ${isLearned ? 'active' : ''}" title="${isLearned ? 'Learned — tap to unmark' : 'Mark as learned'}" onclick="toggleLearned('${p.id}')">👑</button>
                    <button title="Delete phrase" onclick="deletePhraseRow('${p.id}')">🗑</button>
                </div>
                <button class="tag-badge" style="${badgeStyle}" onclick="openTagPicker('${p.id}')">${badgeLabel}</button>
            </div>
            <div class="phrase-card-main">
                <div class="phrase-hebrew">${p.hebrew_text || ''}</div>
                <div class="phrase-variant"><button class="tts-btn" title="Play" onclick="playPhraseAudio('${p.id}', 1, this)">🔊</button> ${p.variant_1 || ''}</div>
                <div class="phrase-variant"><button class="tts-btn" title="Play" onclick="playPhraseAudio('${p.id}', 2, this)">🔊</button> ${p.variant_2 || ''}</div>
            </div>
        </div>
    `;
    }).join('');
}

// Lazy playback: uses the already-cached URL (loaded with the phrase) if
// there is one, otherwise asks the server to generate it once, then plays.
// Subsequent plays of the same variant never call the server again.
async function playPhraseAudio(phraseId, variant, btnEl) {
    const phrase = allPhrases.find(p => p.id === phraseId);
    if (!phrase) return;

    const existingUrl = variant === 1 ? phrase.tts_url_variant1 : phrase.tts_url_variant2;
    if (existingUrl) {
        new Audio(existingUrl).play();
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
        new Audio(data.url).play();
    } catch (err) {
        alert('Failed to play audio');
    } finally {
        btnEl.disabled = false;
        btnEl.textContent = originalContent;
    }
}

let pendingDeleteId = null;

function deletePhraseRow(id) {
    const phrase = allPhrases.find(p => p.id === id);
    const preview = phrase ? (phrase.hebrew_text || '').slice(0, 60) : '';
    pendingDeleteId = id;
    document.getElementById('delete-modal-text').innerHTML =
        `Delete this phrase? This can't be undone.${preview ? `<span class="preview">"${preview}"</span>` : ''}`;
    document.getElementById('delete-modal-overlay').style.display = 'flex';
}

function closeDeleteModal() {
    pendingDeleteId = null;
    document.getElementById('delete-modal-overlay').style.display = 'none';
}

async function confirmDeletePhrase() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    try {
        const res = await fetch(`/phrases/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete phrase');
        closeDeleteModal();
        await loadTable();
    } catch (err) {
        closeDeleteModal();
        alert('Failed to delete phrase');
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

// Optimistic-ish toggle: flips the local flag immediately so the crown and
// card shading respond right away, re-rendering from the server's answer
// only to correct it if the request actually failed.
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
        // Roll back on failure.
        phrase.learned_at = nextLearned ? null : new Date().toISOString();
        renderTable();
        alert('Failed to update learned status');
    }
}