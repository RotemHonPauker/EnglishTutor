const captureLog = document.getElementById('capture-log');
const captureTextInput = document.getElementById('capture-text-input');
let captureMode = 'capture';

const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

captureTextInput.addEventListener('input', () => {
    captureTextInput.style.height = 'auto';
    captureTextInput.style.height = captureTextInput.scrollHeight + 'px';
});

captureTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isTouchDevice) {
        e.preventDefault();
        submitTypedPhrase();
    }
});

// One mode toggle now shared by both the typed and recorded input paths —
// whichever you use, it's translated/checked the same way.
function setCaptureMode(mode, btnEl) {
    captureMode = mode;
    document.querySelectorAll('#capture-mode-toggle .mode-toggle-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
    captureTextInput.placeholder = mode === 'check'
        ? 'Type a phrase in English (or mixed English/Hebrew)...'
        : 'Type a Hebrew phrase...';
}

// Entering the Add tab always starts with a clean, empty log — anything
// shown there this session is cleared.
function enterCaptureTab(btnEl) {
    showView('add', btnEl);
    resetCaptureLog();
}

// Toggles the capture window's content between the normal capture log and
// an inline view of past recording transcripts. Switching either way clears whatever was
// showing before.
let captureViewMode = 'log'; // 'log' | 'transcripts'

function toggleCaptureView() {
    captureViewMode = captureViewMode === 'log' ? 'transcripts' : 'log';
    applyCaptureViewMode();
    if (captureViewMode === 'transcripts') {
        loadTranscripts(); // renders into #capture-log, see the Transcripts section below
    } else {
        captureLog.innerHTML = '';
    }
}

function applyCaptureViewMode() {
    const btn = document.getElementById('capture-history-btn');
    const inputArea = document.getElementById('capture-input-area');
    if (captureViewMode === 'transcripts') {
        if (btn) { btn.textContent = '✏️'; btn.title = 'Back to capture'; }
        if (inputArea) inputArea.classList.add('disabled');
    } else {
        if (btn) { btn.textContent = '📄'; btn.title = 'Recording logs'; }
        if (inputArea) inputArea.classList.remove('disabled');
    }
}

// Shared by enterCaptureTab and space switching (spacesState.js calls this
// directly, since enterCaptureTab won't fire if the user is already
// sitting on this tab when they switch spaces from the header). Always
// lands back on the normal capture log, not the transcripts view.
function resetCaptureLog() {
    captureViewMode = 'log';
    applyCaptureViewMode();
    captureLog.innerHTML = '';
    const captureBtn = document.querySelector('#capture-mode-toggle .mode-toggle-btn[data-mode="capture"]');
    if (captureBtn) setCaptureMode('capture', captureBtn);
}

// ===== Typed input =====

async function submitTypedPhrase() {
    const text = captureTextInput.value.trim();
    if (!text) return;

    const sendBtn = document.getElementById('capture-send-btn');
    captureTextInput.value = '';
    captureTextInput.style.height = 'auto';
    captureTextInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    try {
        const res = await fetch('/phrases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hebrewText: text, spaceId: activeSpaceId, mode: captureMode })
        });
        if (!res.ok) throw new Error('Failed to translate phrase');
        const phrase = await res.json();
        addCaptureResult(phrase);
        loadTable(); // so it's already there if the user switches to Practice
    } catch (err) {
        addCaptureMessage("Couldn't translate that — try again.");
    } finally {
        captureTextInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
        captureTextInput.focus();
    }
}

// ===== Recorded input =====

async function handleRecordingFileSelected(inputEl) {
    const file = inputEl.files[0];
    inputEl.value = ''; // allow picking the same file again later
    if (!file) return;

    const uploadBtn = document.getElementById('recording-upload-btn');
    const originalText = uploadBtn.textContent;
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Processing... this can take a minute';

    addCaptureMessage('Uploading and processing your recording...');

    try {
        const audioBase64 = await fileToBase64(file);

        const res = await fetch('/recordings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audioBase64,
                mimeType: file.type || 'audio/mp4',
                spaceId: activeSpaceId,
                mode: captureMode
            })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to process recording');
        }
        const data = await res.json();

        if (!data.phrases || data.phrases.length === 0) {
            addCaptureMessage("Didn't find any phrases worth capturing in that recording.");
        } else {
            data.phrases.forEach(addCaptureResult);
        }

        await loadTable(); // the new phrases are already saved — refresh Practice too
    } catch (err) {
        addCaptureMessage(err.message || "Something went wrong processing that recording — try again.");
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = originalText;
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ===== Shared log rendering (both input paths append here) =====

function addCaptureResult(phrase) {
    const div = document.createElement('div');
    div.className = 'capture-log-item';
    div.innerHTML = `
        <div class="phrase-hebrew" dir="auto">${phrase.hebrew_text || ''}</div>
        <div class="phrase-variant">${phrase.variant_1 || ''}</div>
        <div class="phrase-variant">${phrase.variant_2 || ''}</div>
    `;
    captureLog.appendChild(div);
    captureLog.scrollTop = captureLog.scrollHeight;
}

function addCaptureMessage(text) {
    const div = document.createElement('div');
    div.className = 'capture-log-item error';
    div.textContent = text;
    captureLog.appendChild(div);
    captureLog.scrollTop = captureLog.scrollHeight;
}

// ===== Transcripts (the "logs" view toggled into #capture-log) =====

let transcripts = [];

async function loadTranscripts() {
    const res = await fetch(`/transcripts?spaceId=${activeSpaceId}`);
    transcripts = await res.json();
    renderTranscripts();
}

function renderTranscripts() {
    const warningHtml = transcripts.length > 3
        ? `<div id="transcripts-warning">You have ${transcripts.length} saved transcripts — consider deleting old ones you've already reviewed.</div>`
        : '';

    const listHtml = transcripts.map(t => {
        const label = new Date(t.created_at).toLocaleString([], {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
        return `
        <div class="transcript-card">
            <div class="transcript-card-header" onclick="toggleTranscript('${t.id}')">
                <span>${label}</span>
                <div class="transcript-card-actions">
                    <button title="Delete" onclick="event.stopPropagation(); deleteTranscriptRow('${t.id}')">🗑</button>
                </div>
            </div>
            <div class="transcript-card-body" id="transcript-body-${t.id}" style="display:none">${t.content}</div>
        </div>
    `;
    }).join('');

    captureLog.innerHTML = warningHtml + (listHtml || '<div class="capture-log-item error">No recordings processed yet.</div>');
}

// Accordion: one click expands/collapses that entry in place.
function toggleTranscript(id) {
    const body = document.getElementById(`transcript-body-${id}`);
    if (!body) return;
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
}

async function deleteTranscriptRow(id) {
    try {
        const res = await fetch(`/transcripts/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete transcript');
        await loadTranscripts();
    } catch (err) {
        alert('Failed to delete transcript');
    }
}