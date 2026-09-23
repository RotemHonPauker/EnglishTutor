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

// Drives the transcript-selection bar (see the Transcripts section below):
// whenever the person selects text inside an expanded transcript body,
// show a bar offering to send that exact selection to the input instead of
// auto-generating a card for it.
document.addEventListener('selectionchange', handleTranscriptSelectionChange);

// ===== Add-tab input mode: Type / Dictionary / Record =====
// Three small icon buttons live in the input box's own footer, next to
// Send — always visible regardless of which mode is picked, so there's
// always a way back. Only the content above the footer (the textarea, or
// the two record-language buttons) swaps out. The icon itself is
// intentionally bare (no text label): the clarification is the
// placeholder text/buttons that appear the moment you tap one, not the
// button itself.

let addInputMode = 'type'; // 'type' | 'dictionary' | 'record'

function setAddInputMode(mode, btnEl) {
    const previousMode = addInputMode;
    addInputMode = mode;
    document.querySelectorAll('#capture-mode-icons .capture-mode-icon-btn[data-mode]').forEach(b => b.classList.remove('active'));
    const activeBtn = btnEl || document.querySelector(`#capture-mode-icons .capture-mode-icon-btn[data-mode="${mode}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const recordButtons = document.getElementById('capture-record-buttons');
    const sendBtn = document.getElementById('capture-send-btn');
    const isRecord = mode === 'record';

    if (captureTextInput) captureTextInput.style.display = isRecord ? 'none' : '';
    if (recordButtons) recordButtons.style.display = isRecord ? 'flex' : 'none';
    if (sendBtn) sendBtn.style.display = isRecord ? 'none' : '';

    if (captureTextInput && !isRecord) {
        const space = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
        const source = space?.source_language || 'the source language';
        const target = space?.target_language || 'the target language';
        captureTextInput.placeholder = mode === 'dictionary'
            ? `Look up a word in the ${source}-${target} dictionary...`
            : `Translate from ${source}, or polish your ${target}...`;
    }
    if (isRecord) updateRecordButtonLabels();

    refreshCaptureLog(previousMode);
}

// The recording note lives in the main log area (center of the screen,
// room to actually read it). previousMode lets this be a no-op when switching between
// Type and Dictionary, so it never clobbers real capture results sitting
// in the log — it only touches the log when Record is actually being
// entered or left (or when returning from the transcripts view, which
// passes 'record' regardless so the log always matches whatever mode is
// current).
function refreshCaptureLog(previousMode) {
    if (addInputMode === 'record') {
        captureLog.innerHTML = `<div class="recording-info-note">🎙️<br>Recordings are limited to about 30 minutes.<br>Once it's processed, you'll land straight on its transcript. Just select whichever lines you want to translate.</div>`;
    } else if (previousMode === 'record') {
        captureLog.innerHTML = '';
    }
}

// The two "Recording in Hebrew" / "Recording in English" buttons shown
// once Record is picked — each one sets which language Gemini should
// expect (audioPrompt.txt still needs an explicit hint for transcription,
// unlike typed text) and only then opens the file picker. Nothing opens
// until one of these two is actually tapped.
function startRecordingUpload(mode) {
    captureMode = mode;
    document.getElementById('recording-file-input').click();
}

// Labels the two record buttons with the active space's actual languages
// instead of hardcoded names.
function updateRecordButtonLabels() {
    const space = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    const source = space?.source_language || 'source language';
    const target = space?.target_language || 'target language';
    const sourceBtn = document.getElementById('record-lang-source-btn');
    const targetBtn = document.getElementById('record-lang-target-btn');
    if (sourceBtn) sourceBtn.textContent = `🎙️ Recording in ${source}`;
    if (targetBtn) targetBtn.textContent = `🎙️ Recording in ${target}`;
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
        refreshCaptureLog('record'); // restores the recording note if Record is still the active mode, else clears
        hideTranscriptSelectionBar();
    }
}

function applyCaptureViewMode() {
    const btn = document.getElementById('capture-history-btn');
    const contentArea = document.getElementById('capture-content-area');
    const sendBtn = document.getElementById('capture-send-btn');
    if (captureViewMode === 'transcripts') {
        if (btn) { btn.textContent = 'Back'; btn.title = 'Back to capture'; btn.classList.add('active'); }
        if (contentArea) contentArea.classList.add('disabled');
        if (sendBtn) sendBtn.disabled = true;
    } else {
        if (btn) { btn.textContent = 'Transcriptions'; btn.title = 'View past recording transcripts'; btn.classList.remove('active'); }
        if (contentArea) contentArea.classList.remove('disabled');
        if (sendBtn) sendBtn.disabled = false;
    }
}

// Shared by enterCaptureTab and space switching (spacesState.js calls this
// directly, since enterCaptureTab won't fire if the user is already
// sitting on this tab when they switch spaces from the header). Always
// lands back on the normal capture log, not the transcripts view — and
// cancels any in-progress phrase edit, since re-entering the tab fresh
// means starting over.
function resetCaptureLog() {
    captureViewMode = 'log';
    applyCaptureViewMode();
    captureLog.innerHTML = '';
    hideTranscriptSelectionBar();
    setAddInputMode((typeof isDictionarySpace === 'function' && isDictionarySpace()) ? 'dictionary' : 'type');
    editingPhraseId = null;
    hideEditingBanner();
}

// ===== Typed input =====

async function submitTypedPhrase() {
    const text = captureTextInput.value.trim();
    if (!text) return;

    if ((typeof isDictionarySpace === 'function' && isDictionarySpace()) || addInputMode === 'dictionary') {
        captureTextInput.value = '';
        captureTextInput.style.height = 'auto';
        if (typeof resolveDictionarySpaceIdAndProceed === 'function') {
            resolveDictionarySpaceIdAndProceed((spaceId) => submitDictionaryLookup(text, null, null, spaceId));
        }
        return;
    }

    if (editingPhraseId) {
        await submitPhraseEdit(text);
        return;
    }

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
            body: JSON.stringify({ hebrewText: text, spaceId: activeSpaceId })
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
        sendBtn.textContent = '➤';
        captureTextInput.focus();
    }
}

// ===== Recorded input =====
// A recording only ever gets transcribed — no phrases are created
// automatically from it. As soon as the transcript is back, the view
// flips straight to the transcript list (see the selection-to-input flow
// below) so the person can start picking lines right away.
async function handleRecordingFileSelected(inputEl) {
    const file = inputEl.files[0];
    inputEl.value = ''; // allow picking the same file again later
    if (!file) return;

    const langBtns = document.querySelectorAll('#capture-record-buttons .record-lang-btn');
    langBtns.forEach(b => b.disabled = true);

    addCaptureMessage('Uploading and transcribing your recording...');

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

        // Straight into the transcript list, expanded on the fresh one,
        // ready to select from.
        captureViewMode = 'transcripts';
        applyCaptureViewMode();
        await loadTranscripts();
        if (transcripts.length) toggleTranscript(transcripts[0].id);
    } catch (err) {
        addCaptureMessage(err.message || "Something went wrong processing that recording — try again.");
    } finally {
        langBtns.forEach(b => b.disabled = false);
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
                    <button title="Delete" onclick="event.stopPropagation(); deleteTranscriptRow('${t.id}')">🗑️</button>
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

// ===== Transcript selection → input =====
// The person picks whatever's actually worth translating with the phone's
// normal long-press text selection, taps "Add to input", edits it if
// needed, then Send — same one-phrase-at-a-time path as typing it fresh.
// Repeat per phrase; nothing in the transcript is translated automatically.

let pendingTranscriptSelection = '';

function handleTranscriptSelectionChange() {
    if (captureViewMode !== 'transcripts') {
        hideTranscriptSelectionBar();
        return;
    }

    const selection = window.getSelection();
    const text = selection && !selection.isCollapsed ? selection.toString().trim() : '';
    if (!text) {
        hideTranscriptSelectionBar();
        return;
    }

    // Only react to selections actually inside a transcript's (expanded)
    // body — not, say, the date header or the delete button next to it.
    let node = selection.anchorNode;
    const anchorEl = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!anchorEl || !anchorEl.closest('.transcript-card-body')) {
        hideTranscriptSelectionBar();
        return;
    }

    pendingTranscriptSelection = text;
    const bar = document.getElementById('transcript-selection-bar');
    const preview = document.getElementById('transcript-selection-preview');
    if (preview) preview.textContent = text;
    if (bar) bar.style.display = 'flex';
}

function hideTranscriptSelectionBar() {
    pendingTranscriptSelection = '';
    const bar = document.getElementById('transcript-selection-bar');
    if (bar) bar.style.display = 'none';
}

// Switches back to the normal capture log with the selected text already
// sitting in the input, ready to edit and Send — the input is disabled
// while browsing transcripts, so leaving that view is what re-enables it.
function addTranscriptSelectionToInput() {
    if (!pendingTranscriptSelection) return;
    const text = pendingTranscriptSelection;

    window.getSelection().removeAllRanges();
    captureViewMode = 'log';
    applyCaptureViewMode();
    captureLog.innerHTML = '';
    hideTranscriptSelectionBar();
    setAddInputMode('type');

    captureTextInput.value = text;
    captureTextInput.style.height = 'auto';
    captureTextInput.style.height = captureTextInput.scrollHeight + 'px';
    captureTextInput.focus();
}

// ===== Editing an existing phrase (✎ on a Practice card) =====
// Reuses the same Add-tab input as a fresh capture — the difference is
// just that Send re-translates and overwrites this one phrase in place
// (same row, same created_at) instead of creating a new card. Tagging is
// left untouched either way, same as a plain create.

let editingPhraseId = null;

// Called from phrasesTable.js's editPhraseRow. Reaching Practice at all
// already means no Setup field is left open with an unsaved edit (that
// would have blocked leaving Setup in the first place), so this jumps
// straight to Add without going through the tab-switch guard again.
function startEditingPhrase(phrase) {
    navigateToTab('add'); // enterCaptureTab -> resetCaptureLog() clears editingPhraseId first
    editingPhraseId = phrase.id;
    setAddInputMode('type');

    captureTextInput.value = phrase.hebrew_text || '';
    captureTextInput.style.height = 'auto';
    captureTextInput.style.height = captureTextInput.scrollHeight + 'px';
    captureTextInput.focus();

    showEditingBanner(phrase);
}

function showEditingBanner(phrase) {
    const banner = document.getElementById('capture-editing-banner');
    if (!banner) return;
    const text = (phrase.hebrew_text || '').slice(0, 40);
    const preview = phrase.hebrew_text && phrase.hebrew_text.length > 40 ? `${text}…` : text;
    const label = banner.querySelector('.capture-editing-text');
    if (label) label.textContent = preview ? `Editing: "${preview}"` : 'Editing phrase';
    banner.style.display = 'flex';
}

function hideEditingBanner() {
    const banner = document.getElementById('capture-editing-banner');
    if (banner) banner.style.display = 'none';
}

// Exits edit mode without saving — clears the input too, so nothing
// half-edited lingers as if it were about to be sent as a new phrase.
function cancelEditingPhrase() {
    editingPhraseId = null;
    hideEditingBanner();
    captureTextInput.value = '';
    captureTextInput.style.height = 'auto';
}

async function submitPhraseEdit(text) {
    const id = editingPhraseId;
    const sendBtn = document.getElementById('capture-send-btn');
    captureTextInput.value = '';
    captureTextInput.style.height = 'auto';
    captureTextInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    try {
        const res = await fetch(`/phrases/${id}/retranslate`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hebrewText: text, spaceId: activeSpaceId })
        });
        if (!res.ok) throw new Error('Failed to update phrase');
        const phrase = await res.json();
        addCaptureResult(phrase);
        editingPhraseId = null;
        hideEditingBanner();
        loadTable(); // so the updated wording is already there in Practice
    } catch (err) {
        addCaptureMessage("Couldn't update that phrase — try again.");
    } finally {
        captureTextInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = '➤';
        captureTextInput.focus();
    }
}