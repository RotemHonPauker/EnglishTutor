const editorLog = document.getElementById('editor-log');
const input = document.getElementById('input');

input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
});

// Mobile keyboards have no real Shift key, so !e.shiftKey is always true
// there — Enter would always send, with no way to type a line break. On
// touch devices, let Enter behave normally (newline); the Send button is
// the only way to send.
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isTouchDevice) {
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
    editorLog.appendChild(div);
    editorLog.scrollTop = editorLog.scrollHeight;
}

// --- PROMPT DIFF ---

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

// --- PROMPT PROPOSAL ---

const PROMPT_KIND_CONFIG = {
    translation: {
        label: 'Suggested translation prompt change',
        saveEndpoint: '/translation-prompt',
        discardEndpoint: '/translation-prompt/discard',
        failMessage: 'Failed to save translation prompt.'
    },
    editor: {
        label: 'Suggested editor prompt change',
        saveEndpoint: '/editor-prompt',
        discardEndpoint: '/editor-prompt/discard',
        failMessage: 'Failed to save editor prompt.'
    }
};

function addPromptProposal(kind, proposal) {
    const config = PROMPT_KIND_CONFIG[kind];
    const div = document.createElement('div');
    div.className = 'message assistant translation-prompt-proposal';

    const label = document.createElement('div');
    label.className = 'proposal-label';
    label.textContent = config.label;

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
            await fetch(config.discardEndpoint, { method: 'POST' });
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
            const res = await fetch(config.saveEndpoint, {
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
            addMessage('system', config.failMessage);
        }
    };

    actions.appendChild(discardBtn);
    actions.appendChild(approveBtn);

    div.appendChild(label);
    div.appendChild(diffBox);
    div.appendChild(actions);

    editorLog.appendChild(div);
    editorLog.scrollTop = editorLog.scrollHeight;
}

// A single place to apply whatever an /editor response contains, reused by
// every entry point (phrase review, free typing, and both prompt-edit flows)
// so none of them can forget to render a proposal that came back alongside
// the reply.
function handleEditorReply(data) {
    addMessage('assistant', data.reply);
    if (data.translationPromptProposal) addPromptProposal('translation', data.translationPromptProposal);
    if (data.editorPromptProposal) addPromptProposal('editor', data.editorPromptProposal);
}

// --- SENDING MESSAGES ---

async function selectPhraseForReview(id) {
    const phrase = allPhrases.find(p => p.id === id);
    if (!phrase) return;

    showView('editor');

    // Every selection starts a clean conversation — no leftover context from
    // whatever was reviewed (or left mid-discussion) before, whether or not
    // that previous phrase was ever approved.
    await fetch('/reset');
    editorLog.innerHTML = '';

    // Show something friendly in the log, but send the backend a strict,
    // parseable instruction — the editor prompt only ever loads a phrase in
    // response to this exact format.
    addMessage('user', phrase.hebrew_text || '(phrase)');

    try {
        const res = await fetch('/editor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `SELECT_PHRASE:${id}` })
        });
        const data = await res.json();
        handleEditorReply(data);
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
        const res = await fetch('/editor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        handleEditorReply(data);
        loadTable(); // refresh table after every message
    } catch (err) {
        addMessage('system', 'Something went wrong. Try again.');
    }
}

// --- EDITOR TAB ENTRY (home screen) ---

// Entering the Editor tab directly (not via a phrase's review button) always
// starts a clean slate and shows the 3 things this can do. Reset lives here,
// not in showView(), so selectPhraseForReview's own reset+load isn't
// duplicated when it calls showView('editor') internally.
async function enterEditorTab(btnEl) {
    showView('editor', btnEl);
    await fetch('/reset');
    editorLog.innerHTML = '';
    showEditorHome();
}

function showEditorHome() {
    const div = document.createElement('div');
    div.className = 'message assistant editor-home';

    const text = document.createElement('div');
    text.innerHTML = marked.parse("What would you like to do?").trim();

    const actions = document.createElement('div');
    actions.className = 'editor-home-actions';

    const editPhraseBtn = document.createElement('button');
    editPhraseBtn.textContent = 'Edit a phrase';
    editPhraseBtn.onclick = () => showView('table');

    const editTranslationBtn = document.createElement('button');
    editTranslationBtn.textContent = 'Edit translation prompt';
    editTranslationBtn.onclick = () => startPromptEditFlow('EDIT_TRANSLATION_PROMPT', 'Edit translation prompt');

    const editEditorPromptBtn = document.createElement('button');
    editEditorPromptBtn.textContent = 'Edit editor prompt';
    editEditorPromptBtn.onclick = () => startPromptEditFlow('EDIT_EDITOR_PROMPT', 'Edit editor prompt');

    actions.appendChild(editPhraseBtn);
    actions.appendChild(editTranslationBtn);
    actions.appendChild(editEditorPromptBtn);

    div.appendChild(text);
    div.appendChild(actions);
    editorLog.appendChild(div);
    editorLog.scrollTop = editorLog.scrollHeight;
}

async function startPromptEditFlow(triggerMessage, userFacingLabel) {
    addMessage('user', userFacingLabel);
    try {
        const res = await fetch('/editor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: triggerMessage })
        });
        const data = await res.json();
        handleEditorReply(data);
    } catch (err) {
        addMessage('system', 'Something went wrong.');
    }
}