const chat = document.getElementById('chat');
const input = document.getElementById('input');
const tableBody = document.getElementById('table-body');

let currentFilter = null;
let sortAsc = false;
let allPhrases = [];
let filterMainIds = new Set();
let filterSubtagIds = new Set();

// --- TABLE ---

async function loadTable() {
    const url = currentFilter ? `/phrases?status=${currentFilter}` : '/phrases';
    const res = await fetch(url);
    allPhrases = await res.json();
    renderTable();
}

// A phrase matches the tag filter if no tag filter is active, if its own
// subtag was picked individually, or if its subtag's parent (main tag) was
// picked as a whole group — multiple selections combine with OR, same as
// picking several statuses would.
function phraseMatchesTagFilter(phrase) {
    if (filterMainIds.size === 0 && filterSubtagIds.size === 0) return true;
    if (filterSubtagIds.has(phrase.subtag_id)) return true;
    const subtag = tags.find(t => t.id === phrase.subtag_id);
    return !!(subtag && filterMainIds.has(subtag.parent_id));
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

function statusLabel(status) {
    return status === 'approved' ? 'Approved' : 'Unapproved';
}

function renderTable() {
    const sorted = allPhrases
        .filter(phraseMatchesTagFilter)
        .sort((a, b) => {
            const da = new Date(a.created_at);
            const db = new Date(b.created_at);
            return sortAsc ? da - db : db - da;
        });

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
                <span class="phrase-date">${new Date(p.created_at).toLocaleDateString('en-GB')}</span>
                <div class="phrase-card-icons">
                    <button title="Review this phrase" onclick="selectPhraseForReview('${p.id}')">📝</button>
                    <button title="Delete phrase" onclick="deletePhraseRow('${p.id}')">🗑</button>
                </div>
            </div>
        </div>
    `;
    }).join('');
}

// --- TAG PICKER MODAL ---

let tagPickerPhraseId = null;
let tagPickerSelectedMain = null;
let tagPickerSelectedSub = null;

function openTagPicker(phraseId) {
    const phrase = allPhrases.find(p => p.id === phraseId);
    if (!phrase) return;
    tagPickerPhraseId = phraseId;
    const subtag = tags.find(t => t.id === phrase.subtag_id);
    tagPickerSelectedMain = subtag ? subtag.parent_id : null;
    tagPickerSelectedSub = phrase.subtag_id || null;
    renderTagPickerMain();
    renderTagPickerSub();
    document.getElementById('tag-picker-modal-overlay').style.display = 'flex';
}

function closeTagPicker() {
    tagPickerPhraseId = null;
    tagPickerSelectedMain = null;
    tagPickerSelectedSub = null;
    document.getElementById('tag-picker-modal-overlay').style.display = 'none';
}

function renderTagPickerMain() {
    const mainTags = tags.filter(t => !t.parent_id);
    const noneChip = `<div class="tag-chip none ${!tagPickerSelectedMain ? 'selected' : ''}" onclick="selectPickerMain(null)">—</div>`;
    const chips = mainTags.map(mt => {
        const contrast = getContrastColor(mt.color);
        const selected = tagPickerSelectedMain === mt.id;
        return `<div class="tag-chip ${selected ? 'selected' : ''}" style="background:${mt.color || '#333'}; color:${contrast}" onclick="selectPickerMain('${mt.id}')">${mt.name}</div>`;
    }).join('');
    document.getElementById('tag-picker-main-list').innerHTML = noneChip + chips;
}

function selectPickerMain(mainId) {
    tagPickerSelectedMain = mainId;
    tagPickerSelectedSub = null;
    renderTagPickerMain();
    renderTagPickerSub();
}

function renderTagPickerSub() {
    const section = document.getElementById('tag-picker-sub-section');
    const container = document.getElementById('tag-picker-sub-list');
    if (!tagPickerSelectedMain) {
        section.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    section.style.display = '';
    const mainTag = tags.find(t => t.id === tagPickerSelectedMain);
    const color = (mainTag && mainTag.color) || DEFAULT_TAG_COLOR;
    const contrast = getContrastColor(color);
    const subtags = tags.filter(t => t.parent_id === tagPickerSelectedMain);
    container.innerHTML = subtags.map(s => {
        const selected = tagPickerSelectedSub === s.id;
        return `<div class="tag-chip ${selected ? 'selected' : ''}" style="background:${color}; color:${contrast}" onclick="selectPickerSub('${s.id}')">${s.name}</div>`;
    }).join('');
}

function selectPickerSub(subId) {
    tagPickerSelectedSub = subId;
    renderTagPickerSub();
}

async function confirmTagPick() {
    if (!tagPickerPhraseId) return;
    // If a main tag is picked but no subtag yet, there's nothing resolvable
    // to save — closing here just leaves the phrase's tag untouched rather
    // than saving a half-made choice.
    if (tagPickerSelectedMain && !tagPickerSelectedSub) {
        closeTagPicker();
        return;
    }
    const phraseId = tagPickerPhraseId;
    const subtagId = tagPickerSelectedSub;
    closeTagPicker();
    await updateSubtag(phraseId, subtagId);
}

// --- TAG FILTER MODAL ---

function openTagFilterModal() {
    renderTagFilterModal();
    document.getElementById('tag-filter-modal-overlay').style.display = 'flex';
}

function closeTagFilterModal() {
    document.getElementById('tag-filter-modal-overlay').style.display = 'none';
}

function renderTagFilterModal() {
    const mainTags = tags.filter(t => !t.parent_id);
    document.getElementById('tag-filter-groups').innerHTML = mainTags.map(mt => {
        const contrast = getContrastColor(mt.color);
        const mainSelected = filterMainIds.has(mt.id);
        const subtags = tags.filter(t => t.parent_id === mt.id);
        const mainChip = `<div class="tag-chip ${mainSelected ? 'selected' : ''}" style="background:${mt.color || '#333'}; color:${contrast}" onclick="toggleFilterMain('${mt.id}')">${mt.name}</div>`;
        const subChips = subtags.map(s => {
            const subSelected = filterSubtagIds.has(s.id);
            return `<div class="tag-chip ${subSelected ? 'selected' : ''}" style="background:${mt.color || '#333'}; color:${contrast}" onclick="toggleFilterSubtag('${s.id}')">${s.name}</div>`;
        }).join('');
        return `
        <div class="tag-filter-group">
            ${mainChip}
            <div class="tag-picker-chip-list">${subChips}</div>
        </div>
    `;
    }).join('');
}

function toggleFilterMain(id) {
    if (filterMainIds.has(id)) filterMainIds.delete(id); else filterMainIds.add(id);
    renderTagFilterModal();
}

function toggleFilterSubtag(id) {
    if (filterSubtagIds.has(id)) filterSubtagIds.delete(id); else filterSubtagIds.add(id);
    renderTagFilterModal();
}

function clearTagFilter() {
    filterMainIds.clear();
    filterSubtagIds.clear();
    renderTagFilterModal();
}

function applyTagFilter() {
    closeTagFilterModal();
    renderActiveFilterChips();
    renderTable();
}

function removeMainFilter(id) {
    filterMainIds.delete(id);
    renderActiveFilterChips();
    renderTable();
}

function removeSubtagFilter(id) {
    filterSubtagIds.delete(id);
    renderActiveFilterChips();
    renderTable();
}

function renderActiveFilterChips() {
    const row = document.getElementById('active-tag-filters');
    const mainChips = [...filterMainIds].map(id => {
        const tag = tags.find(t => t.id === id);
        if (!tag) return '';
        const contrast = getContrastColor(tag.color);
        return `<span class="active-filter-chip" style="background:${tag.color || '#333'}; color:${contrast}">${tag.name}<button onclick="removeMainFilter('${id}')">✕</button></span>`;
    }).join('');
    const subChips = [...filterSubtagIds].map(id => {
        const tag = tags.find(t => t.id === id);
        if (!tag) return '';
        const parentColor = getTagColor(tag.parent_id);
        const contrast = getContrastColor(parentColor);
        return `<span class="active-filter-chip" style="background:${parentColor || '#333'}; color:${contrast}">${tag.name}<button onclick="removeSubtagFilter('${id}')">✕</button></span>`;
    }).join('');
    row.innerHTML = mainChips + subChips;
    row.style.display = (filterMainIds.size || filterSubtagIds.size) ? 'flex' : 'none';
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

    showView('chat');

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