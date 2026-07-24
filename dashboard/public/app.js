const chat = document.getElementById('chat');
const input = document.getElementById('input');
const tableBody = document.getElementById('table-body');

let currentFilter = null;
let sortAsc = false;
let allPhrases = [];

// --- TABLE ---

async function loadTable() {
    const url = currentFilter ? `/phrases?status=${currentFilter}` : '/phrases';
    const res = await fetch(url);
    allPhrases = await res.json();
    renderTable();
}

const DEFAULT_TAG_COLOR = '#ccc';

function getTagColor(tagId) {
    if (!tagId) return null;
    const tag = tags.find(t => t.id === tagId);
    return (tag && tag.color) || null;
}

function buildMainTagSelect(phrase, currentMainId) {
    const mainTags = tags.filter(t => !t.parent_id);
    const opts = mainTags.map(mt => `
        <option value="${mt.id}" ${mt.id === currentMainId ? 'selected' : ''} style="color:${mt.color || DEFAULT_TAG_COLOR}">${mt.name}</option>
    `).join('');
    const color = getTagColor(currentMainId) || DEFAULT_TAG_COLOR;

    return `
        <select class="tag-select main-tag-select" style="color:${color}" onchange="onMainTagChange('${phrase.id}', this)">
            <option value="">—</option>
            ${opts}
        </select>
    `;
}

function subtagOptionsHtml(mainId, selectedSubtagId) {
    if (!mainId) return '';
    const color = getTagColor(mainId) || DEFAULT_TAG_COLOR;
    return tags.filter(t => t.parent_id === mainId).map(s => `
        <option value="${s.id}" ${s.id === selectedSubtagId ? 'selected' : ''} style="color:${color}">${s.name}</option>
    `).join('');
}

function buildSubtagSelect(phrase, currentMainId) {
    // Subtags inherit their parent main tag's color rather than having their own.
    const color = getTagColor(currentMainId) || DEFAULT_TAG_COLOR;
    return `
        <select class="tag-select subtag-select" style="color:${color}" onchange="updateSubtag('${phrase.id}', this.value)" onblur="resetTagSelectsIfEmpty('${phrase.id}', this)" ${!currentMainId ? 'disabled' : ''}>
            <option value="">—</option>
            ${subtagOptionsHtml(currentMainId, phrase.subtag_id)}
        </select>
    `;
}

// If the user opened the subtag picker (after choosing a main tag) and then
// clicked/tabbed away without actually picking one, snap both dropdowns back
// to what's really saved — so an abandoned selection can never look like a
// committed main-tag-only state.
function resetTagSelectsIfEmpty(phraseId, subtagSelectEl) {
    if (subtagSelectEl.value !== '') return; // a real choice was made — updateSubtag already handled it
    const phrase = allPhrases.find(p => p.id === phraseId);
    if (!phrase) return;
    const subtag = tags.find(t => t.id === phrase.subtag_id);
    const currentMainId = subtag ? subtag.parent_id : '';
    const row = subtagSelectEl.closest('tr');
    const cells = row.querySelectorAll('td');
    cells[3].innerHTML = buildMainTagSelect(phrase, currentMainId);
    cells[4].innerHTML = buildSubtagSelect(phrase, currentMainId);
}

// Picking a main tag never saves anything by itself — it only repopulates
// and opens the subtag dropdown. The PATCH only fires from updateSubtag,
// once an actual subtag is chosen.
function onMainTagChange(phraseId, mainSelectEl) {
    const mainId = mainSelectEl.value;
    const row = mainSelectEl.closest('tr');
    const subtagSelect = row.querySelector('.subtag-select');
    const color = getTagColor(mainId) || DEFAULT_TAG_COLOR;

    mainSelectEl.style.color = color;
    subtagSelect.innerHTML = `<option value="">—</option>${subtagOptionsHtml(mainId, null)}`;
    subtagSelect.style.color = color;
    subtagSelect.disabled = !mainId;

    if (mainId) {
        subtagSelect.focus();
        if (typeof subtagSelect.showPicker === 'function') {
            subtagSelect.showPicker();
        }
    }
}

function statusLabel(status) {
    return status === 'approved' ? 'Approved' : 'Unapproved';
}

function renderTable() {
    const sorted = [...allPhrases].sort((a, b) => {
        const da = new Date(a.created_at);
        const db = new Date(b.created_at);
        return sortAsc ? da - db : db - da;
    });

    tableBody.innerHTML = sorted.map(p => {
        const subtag = tags.find(t => t.id === p.subtag_id);
        const currentMainId = subtag ? subtag.parent_id : '';
        return `
        <tr>
            <td>${p.hebrew_text || ''}</td>
            <td>${p.variant_1 || ''}</td>
            <td>${p.variant_2 || ''}</td>
            <td>${buildMainTagSelect(p, currentMainId)}</td>
            <td>${buildSubtagSelect(p, currentMainId)}</td>
            <td><span class="status-badge ${p.status} clickable" onclick="toggleStatus('${p.id}', '${p.status}')">${statusLabel(p.status)}</span></td>
            <td>${new Date(p.created_at).toLocaleDateString('en-GB')}</td>
            <td class="delete-cell">
                <button class="delete-btn" title="Delete phrase" onclick="deletePhraseRow('${p.id}')">🗑</button>
            </td>
        </tr>
    `;
    }).join('');
}

async function deletePhraseRow(id) {
    const phrase = allPhrases.find(p => p.id === id);
    const preview = phrase ? (phrase.hebrew_text || '').slice(0, 40) : '';
    if (!confirm(`Delete this phrase?${preview ? `\n"${preview}"` : ''}`)) return;

    try {
        const res = await fetch(`/phrases/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete phrase');
        await loadTable();
    } catch (err) {
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
    const header = document.querySelector('th.sortable');
    header.textContent = `Date ${sortAsc ? '↑' : '↓'}`;
    renderTable();
}

// --- CHAT ---

input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
});

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    if (role === 'assistant') {
        div.innerHTML = marked.parse(text).trim();
    } else {
        div.textContent = text;
    }
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    addMessage('user', text);
    input.value = '';
    input.style.height = 'auto';

    try {
        const res = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        addMessage('assistant', data.reply);
        loadTable(); // refresh table after every message
    } catch (err) {
        addMessage('system', 'Something went wrong. Try again.');
    }
}

async function startSession() {
    const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'start' })
    });
    const data = await res.json();
    addMessage('assistant', data.reply);
}

async function resetSession() {
    await fetch('/reset');
    chat.innerHTML = '';
    addMessage('system', 'Session reset.');
    await startSession();
}

// --- PROMPT MODAL ---

let currentPromptEndpoint = null;

async function openPromptModal(title, endpoint) {
    currentPromptEndpoint = endpoint;
    const res = await fetch(endpoint);
    const data = await res.json();
    document.getElementById('modal-title').textContent = title;
    document.getElementById('prompt-editor').value = data.content;
    document.getElementById('prompt-modal-overlay').style.display = 'flex';
}

function closePromptModal() {
    document.getElementById('prompt-modal-overlay').style.display = 'none';
    currentPromptEndpoint = null;
}

async function savePrompt() {
    const content = document.getElementById('prompt-editor').value;
    try {
        await fetch(currentPromptEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        addMessage('system', 'Prompt saved and committed.');
        closePromptModal();
    } catch (err) {
        addMessage('system', 'Failed to save prompt.');
    }
}

window.onload = async () => {
    await loadTags();
    await loadTable();
    await startSession();
};