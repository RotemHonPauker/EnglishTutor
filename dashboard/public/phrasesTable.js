const tableBody = document.getElementById('table-body');

let currentFilter = null;
let sortAsc = false;
let allPhrases = [];

async function loadTable() {
    const url = currentFilter ? `/phrases?status=${currentFilter}` : '/phrases';
    const res = await fetch(url);
    allPhrases = await res.json();
    renderTable();
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
    const sorted = allPhrases
        .filter(phraseMatchesTagFilter)
        .sort((a, b) => {
            const da = new Date(a.created_at);
            const db = new Date(b.created_at);
            return sortAsc ? da - db : db - da;
        });

    document.getElementById('phrase-count').textContent = sorted.length;

    tableBody.innerHTML = sorted.map(p => {
        const subtag = tags.find(t => t.id === p.subtag_id);
        const currentMainId = subtag ? subtag.parent_id : '';
        const mainColor = getTagColor(currentMainId);
        const cardTextColor = mainColor ? getContrastColor(mainColor) : null;
        const cardStyle = mainColor ? `background:${mainColor}; border-color:${mainColor}; color:${cardTextColor};` : '';
        const badgeStyle = mainColor
            ? `background:${cardTextColor === '#ffffff' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}; color:${cardTextColor};`
            : '';
        return `
        <div class="phrase-card${mainColor ? ' has-color' : ''}" style="${cardStyle}">
            <div class="phrase-card-main">
                <div class="phrase-hebrew">${p.hebrew_text || ''}</div>
                <div class="phrase-variant">${p.variant_1 || ''}</div>
                <div class="phrase-variant">${p.variant_2 || ''}</div>
            </div>
            <div class="phrase-card-side">
                <button class="tag-badge" style="${badgeStyle}" onclick="openTagPicker('${p.id}')">${subtag ? subtag.name : '—'}</button>
                <span class="status-badge ${p.status} clickable" onclick="toggleStatus('${p.id}', '${p.status}')">${statusLabel(p.status)}</span>
                <span class="phrase-date">${getAgeCategory(p.created_at)}</span>
                <div class="phrase-card-icons">
                    <button title="Review this phrase" onclick="selectPhraseForReview('${p.id}')">📝</button>
                    <button title="Delete phrase" onclick="deletePhraseRow('${p.id}')">🗑</button>
                </div>
            </div>
        </div>
    `;
    }).join('');
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

async function toggleStatus(id, currentStatus) {
    const newStatus = currentStatus === 'approved' ? 'uncategorized' : 'approved';
    try {
        const res = await fetch(`/phrases/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (!res.ok) throw new Error('Failed to update status');
        await loadTable();
    } catch (err) {
        alert('Failed to update status');
    }
}

function filterTable(status, btn) {
    currentFilter = status === 'all' ? null : status;
    document.querySelectorAll('#table-toolbar button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadTable();
}

function toggleSort() {
    sortAsc = !sortAsc;
    document.getElementById('sort-btn').textContent = `Date ${sortAsc ? '↑' : '↓'}`;
    renderTable();
}