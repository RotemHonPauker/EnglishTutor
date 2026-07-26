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

function getContrastColor(hex) {
    if (!hex) return '#ccc';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
}

function getTagColor(tagId) {
    if (!tagId) return null;
    const tag = tags.find(t => t.id === tagId);
    return (tag && tag.color) || null;
}

function buildMainTagSelect(phrase, currentMainId) {
    const mainTags = tags.filter(t => !t.parent_id);
    const opts = mainTags.map(mt => `
        <option value="${mt.id}" ${mt.id === currentMainId ? 'selected' : ''}>${mt.name}</option>
    `).join('');
    const color = getTagColor(currentMainId);
    const style = color ? `background-color:${color}; color:${getContrastColor(color)}; border-color:${color};` : '';
    return `
        <select class="tag-select main-tag-select" style="${style}" onchange="onMainTagChange('${phrase.id}', this)">
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
    const color = getTagColor(currentMainId);
    const style = color ? `background:${color}; color:${getContrastColor(color)}; border-color:${color};` : '';
    return `
        <select class="tag-select subtag-select" style="${style}" onchange="updateSubtag('${phrase.id}', this.value)" onblur="resetTagSelectsIfEmpty('${phrase.id}', this)" ${!currentMainId ? 'disabled' : ''}>
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
    const color = getTagColor(mainId);

    if (color) {
        const contrast = getContrastColor(color);
        [mainSelectEl, subtagSelect].forEach(el => {
            el.style.backgroundColor = color;
            el.style.color = contrast;
            el.style.borderColor = color;
        });
    } else {
        [mainSelectEl, subtagSelect].forEach(el => {
            el.style.backgroundColor = '';
            el.style.color = '';
            el.style.borderColor = '';
        });
    }

    subtagSelect.innerHTML = `<option value="">—</option>${subtagOptionsHtml(mainId, null)}`;
    subtagSelect.disabled = !mainId;

    if (mainId) {
        subtagSelect.focus();
        if (typeof subtagSelect.showPicker === 'function') subtagSelect.showPicker();
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
                <button class="review-btn" title="Review this phrase" onclick="selectPhraseForReview('${p.id}')">📝</button>
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

// --- VIEW SWITCHING (tab bar) ---

function showView(view, btnEl) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) {
        btnEl.classList.add('active');
    } else {
        document.querySelector(`.tab-btn[data-view="${view}"]`).classList.add('active');
    }
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

// --- BOT PROMPT DIFF PROPOSAL ---

// Word-level LCS diff — old/new are tokenized on whitespace boundaries (kept
// as tokens) so the result reflows as normal text, not a line-by-line block.
function diffWords(oldText, newText) {
    const oldTokens = oldText.split(/(\s+)/);
    const newTokens = newText.split(/(\s+)/);
    const n = oldTokens.length, m = newTokens.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = oldTokens[i] === newTokens[j]
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const parts = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (oldTokens[i] === newTokens[j]) {
            parts.push({ type: 'same', text: oldTokens[i] });
            i++; j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            parts.push({ type: 'del', text: oldTokens[i] });
            i++;
        } else {
            parts.push({ type: 'add', text: newTokens[j] });
            j++;
        }
    }
    while (i < n) { parts.push({ type: 'del', text: oldTokens[i] }); i++; }
    while (j < m) { parts.push({ type: 'add', text: newTokens[j] }); j++; }
    return parts;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderDiffHtml(parts) {
    return parts.map(part => {
        // A del/ins token that's pure whitespace (e.g. a blank line collapsing
        // into a single newline) is otherwise invisible — nothing to see in an
        // empty strikethrough or underline. Mark it explicitly so a lost or
        // added line break can actually be noticed before approving.
        if ((part.type === 'del' || part.type === 'add') && /^\s+$/.test(part.text)) {
            const visible = escapeHtml(part.text).replace(/\n/g, '¶\n');
            const tag = part.type === 'del' ? 'del' : 'ins';
            return `<${tag} class="ws-diff">${visible}</${tag}>`;
        }
        const escaped = escapeHtml(part.text);
        if (part.type === 'del') return `<del>${escaped}</del>`;
        if (part.type === 'add') return `<ins>${escaped}</ins>`;
        return escaped;
    }).join('');
}

function addBotPromptProposal(proposal) {
    const div = document.createElement('div');
    div.className = 'message assistant bot-prompt-proposal';

    const label = document.createElement('div');
    label.className = 'proposal-label';
    label.textContent = 'Suggested bot prompt change';

    const diffBox = document.createElement('div');
    diffBox.className = 'diff-box';
    diffBox.innerHTML = renderDiffHtml(diffWords(proposal.oldContent, proposal.newContent));

    const actions = document.createElement('div');
    actions.className = 'proposal-actions';

    const discardBtn = document.createElement('button');
    discardBtn.textContent = 'Discard';
    discardBtn.onclick = async () => {
        discardBtn.disabled = true;
        try {
            await fetch('/bot-prompt/discard', { method: 'POST' });
        } finally {
            div.remove();
        }
    };

    const approveBtn = document.createElement('button');
    approveBtn.className = 'primary';
    approveBtn.textContent = 'Approve & commit';
    approveBtn.onclick = async () => {
        approveBtn.disabled = true;
        discardBtn.disabled = true;
        approveBtn.textContent = 'Saving...';
        try {
            const res = await fetch('/bot-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: proposal.newContent })
            });
            if (!res.ok) throw new Error('save failed');
            actions.innerHTML = '<span class="approved-label">✓ Committed</span>';
        } catch (err) {
            approveBtn.disabled = false;
            discardBtn.disabled = false;
            approveBtn.textContent = 'Approve & commit';
            addMessage('system', 'Failed to save bot prompt.');
        }
    };

    actions.appendChild(discardBtn);
    actions.appendChild(approveBtn);

    div.appendChild(label);
    div.appendChild(diffBox);
    div.appendChild(actions);

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

async function selectPhraseForReview(id) {
    const phrase = allPhrases.find(p => p.id === id);
    if (!phrase) return;

    // Every selection starts a clean conversation — no leftover context from
    // whatever was reviewed (or left mid-discussion) before, whether or not
    // that previous phrase was ever approved.
    await fetch('/reset');
    chat.innerHTML = '';

    // Show something friendly in the chat bubble, but send the backend a
    // strict, parseable instruction — the review prompt only ever loads a
    // phrase in response to this exact format.
    addMessage('user', phrase.hebrew_text || '(phrase)');

    try {
        const res = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `SELECT_PHRASE:${id}` })
        });
        const data = await res.json();
        addMessage('assistant', data.reply);
        if (data.botPromptProposal) addBotPromptProposal(data.botPromptProposal);
        loadTable();
    } catch (err) {
        addMessage('system', 'Something went wrong loading that phrase.');
    }
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
        if (data.botPromptProposal) addBotPromptProposal(data.botPromptProposal);
        loadTable(); // refresh table after every message
    } catch (err) {
        addMessage('system', 'Something went wrong. Try again.');
    }
}

function startSession() {
    addMessage('assistant', "Welcome! 👋 I'm your phrase review assistant.\n\nTo get started, just click the button next to any phrase in the table to select it, and I'll load it up for you to review and refine.");
}

// --- PROMPT MODAL ---

let currentPromptEndpoint = null;
let originalPromptContent = '';

async function openPromptModal(title, endpoint) {
    currentPromptEndpoint = endpoint;
    const res = await fetch(endpoint);
    const data = await res.json();
    originalPromptContent = data.content;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('prompt-editor').value = data.content;
    showPromptEditView();
    document.getElementById('prompt-modal-overlay').style.display = 'flex';
}

function closePromptModal() {
    document.getElementById('prompt-modal-overlay').style.display = 'none';
    currentPromptEndpoint = null;
    showPromptEditView(); // reset controls for the next time this modal opens
}

// Textarea visible, editable. "Review changes" moves to the diff view below.
function showPromptEditView() {
    document.getElementById('prompt-editor').style.display = '';
    document.getElementById('prompt-diff-preview').style.display = 'none';

    const cancelBtn = document.getElementById('modal-cancel-btn');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = closePromptModal;

    const primaryBtn = document.getElementById('modal-primary-btn');
    primaryBtn.disabled = false;
    primaryBtn.textContent = 'Review changes';
    primaryBtn.onclick = showPromptDiffView;
}

// Same compact word-diff used for chat-proposed changes, so a manual edit and
// an LLM-proposed one are reviewed identically before anything is committed.
function showPromptDiffView() {
    const newContent = document.getElementById('prompt-editor').value;
    const diffPreview = document.getElementById('prompt-diff-preview');
    diffPreview.innerHTML = renderDiffHtml(diffWords(originalPromptContent, newContent));

    document.getElementById('prompt-editor').style.display = 'none';
    diffPreview.style.display = 'block';

    const cancelBtn = document.getElementById('modal-cancel-btn');
    cancelBtn.textContent = 'Back to edit';
    cancelBtn.onclick = showPromptEditView;

    const primaryBtn = document.getElementById('modal-primary-btn');
    primaryBtn.textContent = 'Confirm & commit';
    primaryBtn.onclick = confirmSavePrompt;
}

async function confirmSavePrompt() {
    const content = document.getElementById('prompt-editor').value;
    const primaryBtn = document.getElementById('modal-primary-btn');
    primaryBtn.disabled = true;
    primaryBtn.textContent = 'Saving...';
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
        primaryBtn.disabled = false;
        primaryBtn.textContent = 'Confirm & commit';
    }
}

window.onload = async () => {
    await loadTags();
    await loadTable();
    startSession();
};