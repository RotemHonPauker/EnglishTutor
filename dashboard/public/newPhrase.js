const newPhraseLog = document.getElementById('new-phrase-log');
const newPhraseInput = document.getElementById('new-phrase-input');

newPhraseInput.addEventListener('input', () => {
    newPhraseInput.style.height = 'auto';
    newPhraseInput.style.height = newPhraseInput.scrollHeight + 'px';
});

// See editor.js for why this check exists: mobile keyboards have no real
// Shift key, so Enter would otherwise always send instead of ever inserting
// a newline.
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

newPhraseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isTouchDevice) {
        e.preventDefault();
        submitNewPhrase();
    }
});

// Entering the New tab always starts with a clean, empty log — any
// previously translated phrases shown there this session are cleared, same
// as how entering the Editor tab directly resets its own conversation.
function enterNewPhraseTab(btnEl) {
    showView('new', btnEl);
    newPhraseLog.innerHTML = '';
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
            body: JSON.stringify({ hebrewText: text })
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