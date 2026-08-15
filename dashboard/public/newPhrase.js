const newPhraseLog = document.getElementById('new-phrase-log');
const newPhraseInput = document.getElementById('new-phrase-input');
let newPhraseMode = 'capture';

// Was previously declared in editor.js and shared as a global from there —
// now self-contained here since editor.js no longer exists.
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

newPhraseInput.addEventListener('input', () => {
    newPhraseInput.style.height = 'auto';
    newPhraseInput.style.height = newPhraseInput.scrollHeight + 'px';
});

newPhraseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isTouchDevice) {
        e.preventDefault();
        submitNewPhrase();
    }
});

function setNewPhraseMode(mode, btnEl) {
    newPhraseMode = mode;
    document.querySelectorAll('#new-phrase-mode-toggle .mode-toggle-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
    newPhraseInput.placeholder = mode === 'check'
        ? 'Type a phrase in English (or mixed English/Hebrew)...'
        : 'Type a Hebrew phrase...';
}

// Entering the New tab always starts with a clean, empty log — any
// previously translated phrases shown there this session are cleared.
function enterNewPhraseTab(btnEl) {
    showView('new', btnEl);
    resetNewPhraseLog();
}

// Shared by enterNewPhraseTab (fires when the tab is clicked) and space
// switching (spacesState.js calls this directly, since enterNewPhraseTab
// won't fire if the user is already sitting on the New tab when they
// switch spaces from the header).
function resetNewPhraseLog() {
    newPhraseLog.innerHTML = '';
    const captureBtn = document.querySelector('#new-phrase-mode-toggle .mode-toggle-btn[data-mode="capture"]');
    if (captureBtn) setNewPhraseMode('capture', captureBtn);
}

async function submitNewPhrase() {
    const text = newPhraseInput.value.trim();
    if (!text) return;

    const sendBtn = document.getElementById('new-phrase-send');
    newPhraseInput.value = '';
    newPhraseInput.style.height = 'auto';
    newPhraseInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    try {
        const res = await fetch('/phrases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hebrewText: text, spaceId: activeSpaceId, mode: newPhraseMode })
        });
        if (!res.ok) throw new Error('Failed to translate phrase');
        const phrase = await res.json();
        addNewPhraseResult(phrase);
        loadTable(); // so it's already there if the user switches to the table
    } catch (err) {
        addNewPhraseError();
    } finally {
        newPhraseInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
        newPhraseInput.focus();
    }
}

function addNewPhraseResult(phrase) {
    const div = document.createElement('div');
    div.className = 'new-phrase-item';
    div.innerHTML = `
        <div class="phrase-hebrew">${phrase.hebrew_text || ''}</div>
        <div class="phrase-variant">${phrase.variant_1 || ''}</div>
        <div class="phrase-variant">${phrase.variant_2 || ''}</div>
    `;
    newPhraseLog.appendChild(div);
    newPhraseLog.scrollTop = newPhraseLog.scrollHeight;
}

function addNewPhraseError() {
    const div = document.createElement('div');
    div.className = 'new-phrase-item error';
    div.textContent = "Couldn't translate that — try again.";
    newPhraseLog.appendChild(div);
    newPhraseLog.scrollTop = newPhraseLog.scrollHeight;
}