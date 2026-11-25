// Needs localDb.js, geminiClient.js, translationEngine.js, audioEngine.js
// and ttsStorage.js loaded first.

const captureLog = document.getElementById('capture-log');
const captureTextInput = document.getElementById('capture-text-input');

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

// ===== Add-tab input mode: Type / Dictionary / Record =====

let addInputMode = 'type'; // 'type' | 'dictionary' | 'record'

function setAddInputMode(mode, btnEl) {
    applyAddInputModeUI(mode, btnEl);
}

function applyAddInputModeUI(mode, btnEl) {
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

    refreshCaptureLog(previousMode);
}

// Clears the log on an actual mode switch (not a re-tap of the same mode) —
// Dictionary mode's own back-and-forth clarifying questions don't belong
// in whatever comes next.
function refreshCaptureLog(previousMode) {
    if (previousMode === addInputMode) return;
    if (addInputMode === 'record') {
        captureLog.innerHTML = `<div class="recording-info-note">📁<br>Pick an audio file you already have — for recording live instead, use the red button at the bottom of the screen.<br>Recordings are limited to up to 15 minutes.<br>Once it's processed, you'll land straight on its transcript. Just select whichever lines you want to translate.</div>`;
    } else {
        captureLog.innerHTML = '';
    }
}

function startRecordingUpload() {
    document.getElementById('recording-file-input').click();
}

function enterCaptureTab(btnEl) {
    showView('add', btnEl);
    resetCaptureLog();
}

function resetCaptureLog() {
    captureLog.innerHTML = '';
    editingPhraseId = null;
    hideEditingBanner();

    const hasActiveSpace = typeof getActiveSpace === 'function' && !!getActiveSpace();
    applyNoSpaceUI(!hasActiveSpace);
    if (!hasActiveSpace) {
        captureLog.innerHTML = '<div class="recording-info-note">👋<br>No space yet — tap the title above, then "+ New space" to create one. Come back here once it\'s made.</div>';
        return;
    }

    setAddInputMode((typeof isDictionarySpace === 'function' && isDictionarySpace()) ? 'dictionary' : 'type');
}

function applyNoSpaceUI(disabled) {
    if (captureTextInput) captureTextInput.disabled = disabled;
    const sendBtn = document.getElementById('capture-send-btn');
    if (sendBtn) sendBtn.disabled = disabled;
    document.querySelectorAll('#capture-mode-icons .capture-mode-icon-btn').forEach(b => { b.disabled = disabled; });
}

// ===== Typed input =====

async function submitTypedPhrase() {
    const text = captureTextInput.value.trim();
    if (!text) return;
    if (typeof getActiveSpace === 'function' && !getActiveSpace()) return;

    if ((typeof isDictionarySpace === 'function' && isDictionarySpace()) || addInputMode === 'dictionary') {
        const canSwitchToType = !(typeof isDictionarySpace === 'function' && isDictionarySpace());
        if (canSwitchToType && looksLikeSentence(text)) {
            showModeMismatchConfirm(text, 'to-type');
            return;
        }
        submitAsDictionaryLookup(text);
        return;
    }

    if (editingPhraseId) {
        await submitPhraseEdit(text);
        return;
    }

    if (looksLikeSingleTerm(text)) {
        showModeMismatchConfirm(text, 'to-dictionary');
        return;
    }

    await submitPhraseDirect(text);
}

async function submitPhraseDirect(text) {
    const sendBtn = document.getElementById('capture-send-btn');
    captureTextInput.value = '';
    captureTextInput.style.height = 'auto';
    captureTextInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    try {
        const result = await translatePhrase(text, activeSpaceId);
        const phrase = await saveSentence({
            sourceText: result.correctedSource,
            variant1: result.variant1,
            variant2: result.variant2,
            spaceId: activeSpaceId,
            slotId: result.slotId
        });
        addCaptureResult(phrase);
        loadTable();
    } catch (err) {
        addCaptureMessage(err.code === 'NO_API_KEY' ? 'No Gemini API key set yet.' : "Couldn't translate that — try again.");
    } finally {
        captureTextInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = '➤';
        captureTextInput.focus();
    }
}

function submitAsDictionaryLookup(text) {
    captureTextInput.value = '';
    captureTextInput.style.height = 'auto';
    if (typeof resolveDictionarySpaceIdAndProceed === 'function') {
        resolveDictionarySpaceIdAndProceed((spaceId) => submitDictionaryLookup(text, null, null, spaceId));
    }
}

// ===== Dictionary/Type mode-mismatch confirm =====
// >3 words in Dictionary mode reads as a sentence; 1-2 words in Type mode
// reads as a lookup query. One modal, copy/buttons swap by direction.

function looksLikeSentence(text) {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    return wordCount > 3;
}

function looksLikeSingleTerm(text) {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    return wordCount > 0 && wordCount <= 2;
}

let pendingModeMismatchText = null;
let pendingModeMismatchDirection = null; // 'to-type' | 'to-dictionary'

function showModeMismatchConfirm(text, direction) {
    pendingModeMismatchText = text;
    pendingModeMismatchDirection = direction;

    const title = document.getElementById('mode-mismatch-modal-title');
    const body = document.getElementById('mode-mismatch-modal-text');
    const switchBtn = document.getElementById('mode-mismatch-switch-btn');
    const stayBtn = document.getElementById('mode-mismatch-confirm-btn');

    if (direction === 'to-dictionary') {
        if (title) title.textContent = 'Look it up instead?';
        if (body) body.textContent = 'This looks like a single word — send it, or look it up?';
        if (stayBtn) stayBtn.textContent = '⌨️ Send it';
        if (switchBtn) switchBtn.textContent = '📖 Look it up';
    } else {
        if (title) title.textContent = 'Send as a phrase instead?';
        if (body) body.textContent = 'This looks like a full phrase — look it up, or send it?';
        if (stayBtn) stayBtn.textContent = '📖 Look it up';
        if (switchBtn) switchBtn.textContent = '⌨️ Send it';
    }

    document.getElementById('mode-mismatch-modal-overlay').style.display = 'flex';
}

function closeModeMismatchModal() {
    document.getElementById('mode-mismatch-modal-overlay').style.display = 'none';
}

function modeMismatchSwitchAction() {
    const text = pendingModeMismatchText;
    const direction = pendingModeMismatchDirection;
    pendingModeMismatchText = null;
    pendingModeMismatchDirection = null;
    closeModeMismatchModal();
    if (!text) return;

    if (direction === 'to-dictionary') {
        setAddInputMode('dictionary');
        submitAsDictionaryLookup(text);
    } else {
        setAddInputMode('type');
        captureTextInput.value = text;
        submitTypedPhrase();
    }
}

function modeMismatchStayAction() {
    const text = pendingModeMismatchText;
    const direction = pendingModeMismatchDirection;
    pendingModeMismatchText = null;
    pendingModeMismatchDirection = null;
    closeModeMismatchModal();
    if (!text) return;

    if (direction === 'to-dictionary') {
        submitPhraseDirect(text);
    } else {
        submitAsDictionaryLookup(text);
    }
}

// ===== Recorded input =====

async function handleRecordingFileSelected(inputEl) {
    const file = inputEl.files[0];
    inputEl.value = '';
    if (!file) return;

    const langBtns = document.querySelectorAll('#capture-record-buttons .record-lang-btn');
    langBtns.forEach(b => b.disabled = true);

    try {
        // Same 15-minute cap the live recorder enforces (globalRecord.js's
        // MAX_GLOBAL_RECORDING_MS) — a long existing file can bypass that otherwise.
        const maxMs = typeof MAX_GLOBAL_RECORDING_MS === 'number' ? MAX_GLOBAL_RECORDING_MS : 15 * 60 * 1000;
        const durationSec = await getAudioDurationSeconds(file).catch(() => null);
        if (durationSec != null && Number.isFinite(durationSec) && durationSec * 1000 > maxMs) {
            const maxMinutes = Math.round(maxMs / 60000);
            addCaptureMessage(`That recording is longer than ${maxMinutes} minutes — please use a shorter one.`);
            return;
        }

        addCaptureMessage('Uploading and transcribing your recording...');

        const audioBase64 = await fileToBase64(file);

        const { transcript } = await processRecording({
            audioBase64,
            mimeType: file.type || 'audio/mp4',
            spaceId: activeSpaceId
        });

        await finishRecordingIntoTranscript(activeSpaceId, transcript);
    } catch (err) {
        addCaptureMessage(
            err.code === 'NO_API_KEY'
                ? 'No Gemini API key set yet.'
                : (err.message || "Something went wrong processing that recording — try again.")
        );
    } finally {
        langBtns.forEach(b => b.disabled = false);
    }
}

// Resolves null (not reject) if the browser can't read metadata for this format.
function getAudioDurationSeconds(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve(audio.duration);
        };
        audio.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Couldn't read this recording's length."));
        };
        audio.src = url;
    });
}

// finishRecordingIntoTranscript is defined in transcriptsTab.js.

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ===== Shared log rendering =====

function addCaptureResult(phrase) {
    const div = document.createElement('div');
    div.className = 'capture-log-item';
    div.innerHTML = `
        <div class="phrase-source" dir="auto">${escapeHtml(phrase.source_text || '')}</div>
        <div class="phrase-variant">${escapeHtml(phrase.variant_1 || '')}</div>
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

// ===== Editing an existing phrase (✎ on a Practice card) =====

let editingPhraseId = null;

function startEditingPhrase(phrase) {
    navigateToTab('add');
    editingPhraseId = phrase.id;
    setAddInputMode('type');

    captureTextInput.value = phrase.source_text || '';
    captureTextInput.style.height = 'auto';
    captureTextInput.style.height = captureTextInput.scrollHeight + 'px';
    captureTextInput.focus();

    showEditingBanner(phrase);
}

function showEditingBanner(phrase) {
    const banner = document.getElementById('capture-editing-banner');
    if (!banner) return;
    const text = (phrase.source_text || '').slice(0, 40);
    const preview = phrase.source_text && phrase.source_text.length > 40 ? `${text}…` : text;
    const label = banner.querySelector('.capture-editing-text');
    if (label) label.textContent = preview ? `Editing: "${preview}"` : 'Editing phrase';
    const cancelBtn = document.getElementById('capture-editing-cancel-btn');
    if (cancelBtn) cancelBtn.onclick = cancelEditingPhrase;
    banner.style.display = 'flex';
}

function hideEditingBanner() {
    const banner = document.getElementById('capture-editing-banner');
    if (banner) banner.style.display = 'none';
}

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
        const result = await translatePhrase(text, activeSpaceId);
        const phrase = await updatePhrase({
            id,
            sourceText: result.correctedSource,
            variant1: result.variant1,
            variant2: result.variant2
        });
        await deleteTtsBlobsForPhrase(id);

        addCaptureResult(phrase);
        editingPhraseId = null;
        hideEditingBanner();
        loadTable();
    } catch (err) {
        addCaptureMessage(err.code === 'NO_API_KEY' ? 'No Gemini API key set yet.' : "Couldn't update that phrase — try again.");
    } finally {
        captureTextInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = '➤';
        captureTextInput.focus();
    }
}