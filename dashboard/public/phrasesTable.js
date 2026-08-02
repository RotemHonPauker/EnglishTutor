const tableBody = document.getElementById('table-body');

let sortAsc = false;
let allPhrases = [];

async function loadTable() {
    const res = await fetch(`/phrases?spaceId=${activeSpaceId}`);
    allPhrases = await res.json();
    renderTable();
    if (typeof renderSidebar === 'function') renderSidebar();
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Coarse age bucket instead of an exact date — the exact date isn't useful
// at a glance, and sorting still uses the real timestamp underneath, so
// nothing is lost, only what's displayed changes.
function getAgeCategory(createdAt) {
    const ageDays = (Date.now() - new Date(createdAt).getTime()) / DAY_MS;
    if (ageDays <= 14) return '2 weeks';
    if (ageDays <= 60) return '2 months';
    return 'Old';
}

function renderTable() {
    const activeSpace = getActiveSpace();
    const showOrder = !!(activeSpace && activeSpace.has_order);

    const sorted = allPhrases
        .filter(phraseMatchesTagFilter)
        .sort((a, b) => {
            if (showOrder) {
                // Reading order (1, 2, 3...) is the natural default here, so
                // the un-toggled state (sortAsc false) maps to ascending —
                // opposite of the date default, which starts newest-first.
                const oa = a.sequence_order ?? Infinity;
                const ob = b.sequence_order ?? Infinity;
                return sortAsc ? ob - oa : oa - ob;
            }
            const da = new Date(a.created_at);
            const db = new Date(b.created_at);
            return sortAsc ? da - db : db - da;
        });

    document.getElementById('phrase-count').textContent = sorted.length;

    const sortBtn = document.getElementById('sort-btn');
    if (sortBtn) {
        sortBtn.textContent = showOrder
            ? `Order ${sortAsc ? '↓' : '↑'}`
            : `Date ${sortAsc ? '↑' : '↓'}`;
    }

    tableBody.innerHTML = sorted.map(p => {
        const subtag = tags.find(t => t.id === p.subtag_id);
        const currentMainId = subtag ? subtag.parent_id : '';
        const mainColor = getTagColor(currentMainId);
        const cardTextColor = mainColor ? getContrastColor(mainColor) : null;
        const cardStyle = mainColor ? `background:${mainColor}; border-color:${mainColor}; color:${cardTextColor};` : '';
        const badgeStyle = mainColor
            ? `background:${cardTextColor === '#ffffff' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}; color:${cardTextColor};`
            : '';
        const orderHtml = showOrder
            ? `<span class="sequence-order-badge" style="${badgeStyle}" onclick="editSequenceOrder(this, '${p.id}')"># ${p.sequence_order ?? '—'}</span>`
            : '';
        return `
        <div class="phrase-card${mainColor ? ' has-color' : ''}" style="${cardStyle}">
            <div class="phrase-card-header">
                <div class="phrase-card-icons">
                    <button title="Review this phrase" onclick="selectPhraseForReview('${p.id}')">✏️</button>
                    <button title="Delete phrase" onclick="deletePhraseRow('${p.id}')">🗑</button>
                </div>
                <button class="tag-badge" style="${badgeStyle}" onclick="openTagPicker('${p.id}')">${subtag ? subtag.name : '—'}</button>
                <div class="phrase-card-right">
                    ${orderHtml}
                    <span class="phrase-date">${getAgeCategory(p.created_at)}</span>
                </div>
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

// Click-to-edit for the sequence-order number: swaps the badge for a small
// number input; Enter or blur submits, Escape cancels without saving.
function editSequenceOrder(badgeEl, phraseId) {
    const phrase = allPhrases.find(p => p.id === phraseId);
    const currentValue = phrase?.sequence_order ?? '';

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'sequence-order-input';
    input.value = currentValue;

    let settled = false;
    const commit = async () => {
        if (settled) return;
        settled = true;
        const parsed = parseInt(input.value, 10);
        if (!Number.isInteger(parsed)) {
            renderTable();
            return;
        }
        try {
            const res = await fetch(`/phrases/${phraseId}/sequence-order`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sequenceOrder: parsed })
            });
            if (!res.ok) throw new Error('Failed to update order');
            await loadTable();
        } catch (err) {
            alert('Failed to update order');
            renderTable();
        }
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { settled = true; renderTable(); }
    });

    badgeEl.replaceWith(input);
    input.focus();
    input.select();
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

async function updateSubtag(id, subtagId) {
    try {
        const res = await fetch(`/phrases/${id}/subtag`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subtagId: subtagId || null })
        });
        if (!res.ok) throw new Error('Failed to update tag');
        await loadTable();
    } catch (err) {
        alert('Failed to update tag');
    }
}

function toggleSort() {
    sortAsc = !sortAsc;
    renderTable();
}