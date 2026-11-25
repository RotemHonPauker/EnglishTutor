// Needs remoteDb.js, geminiClient.js, translationEngine.js, audioEngine.js
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
// Three small icon buttons live in the input box's own footer, next to
// Send — always visible regardless of which mode is picked, so there's
// always a way back. Only the content above the footer (the textarea, or
// the record button) swaps out. The icon itself is intentionally bare (no
// text label): the clarification is the placeholder text/button that
// appears the moment you tap one, not the button itself.

let addInputMode = 'type'; // 'type' | 'dictionary' | 'record'

function setAddInputMode(mode, btnEl) {
    applyAddInputModeUI(mode, btnEl);
}

// Just the visual side of switching input mode (icon state, textarea vs.
// record button, placeholder text) — split out of setAddInputMode so
// other code (applyDictionaryModeUI) can force a mode change directly too.
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

// The recording note lives in the main log area (center of the screen,
// room to actually read it). previousMode lets this be a no-op when
// switching between Type and Dictionary, so it never clobbers real
// capture results sitting in the log — it only touches the log when
// Record is actually being entered or left.
function refreshCaptureLog(previousMode) {
    if (addInputMode === 'record') {
        captureLog.innerHTML = `<div class="recording-info-note">🎙️<br>Recordings are limited to about 15 minutes.<br>Once it's processed, you'll land straight on its transcript. Just select whichever lines you want to translate.</div>`;
    } else if (previousMode === 'record') {
        captureLog.innerHTML = '';
    }
}

// The single "Choose a recording" button shown once Record is picked —
// just opens the file picker. Used to be two buttons ("Recording in
// Hebrew" / "Recording in English"), each setting a capture/check mode
// that told Gemini which language to expect for transcription — gone now
// that the transcription prompt (promptTemplates.js's AUDIO_PROMPT_TEMPLATE,
// via audioEngine.js) transcribes exactly as spoken either way, in
// whichever of this context's own two languages (or a mix of them) was
// actually used, with no language hint needed up front.
function startRecordingUpload() {
    document.getElementById('recording-file-input').click();
}

// Entering the Add tab always starts with a clean, empty log — anything
// shown there this session is cleared.
function enterCaptureTab(btnEl) {
    showView('add', btnEl);
    resetCaptureLog();
}

// Shared by enterCaptureTab and space switching (spacesState.js calls this
// directly, since enterCaptureTab won't fire if the user is already
// sitting on this tab when they switch spaces from the header). Lands back
// on the normal capture log and cancels any in-progress phrase edit, since
// re-entering the tab fresh means starting over.
function resetCaptureLog() {
    captureLog.innerHTML = '';
    editingPhraseId = null;
    hideEditingBanner();

    // Nothing to capture into yet on a brand-new install (or right after
    // deleting the last space) — show that plainly instead of leaving a
    // normal-looking input that fails with a confusing error the moment
    // someone tries to use it. Re-evaluated every time this runs, so it
    // clears itself automatically once a space exists (setActiveSpace
    // already calls resetCaptureLog, see spacesState.js).
    const hasActiveSpace = typeof getActiveSpace === 'function' && !!getActiveSpace();
    applyNoSpaceUI(!hasActiveSpace);
    if (!hasActiveSpace) {
        captureLog.innerHTML = '<div class="recording-info-note">👋<br>No context yet — tap the title above, then "+ New context" to create one. Come back here once it\'s made.</div>';
        return;
    }

    setAddInputMode((typeof isDictionarySpace === 'function' && isDictionarySpace()) ? 'dictionary' : 'type');
}

// Disables the whole input area (text box, mode icons, send) while there's
// no active space to save into.
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
    // Defense in depth — the input is disabled in this state (see
    // resetCaptureLog), but guard the submit path directly too.
    if (typeof getActiveSpace === 'function' && !getActiveSpace()) return;

    if ((typeof isDictionarySpace === 'function' && isDictionarySpace()) || addInputMode === 'dictionary') {
        // Only warn when there's an actual Type mode to switch to — a
        // dictionary context has no alternative, so there's nothing to
        // mistake it for.
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

    // Same mismatch check in the other direction: one or two words typed
    // in ⌨️ Type mode reads like a dictionary query, not a phrase. Only
    // relevant for a fresh capture — editing or moving an existing (short)
    // phrase is deliberate, so those paths above return before this.
    if (looksLikeSingleTerm(text)) {
        showModeMismatchConfirm(text, 'to-dictionary');
        return;
    }

    await submitPhraseDirect(text);
}

// Pulled out of submitTypedPhrase so both the normal path and the
// mode-mismatch "send anyway" path can call it directly, without
// re-running (and possibly re-triggering) the mismatch check.
//
// Used to be one POST to /phrases; now it's two steps done here directly:
// call Gemini to translate (translationEngine.js), then save the result
// (remoteDb.js).
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
        loadTable(); // so it's already there if the user switches to Practice
    } catch (err) {
        addCaptureMessage(err.code === 'NO_API_KEY' ? 'No Gemini API key set yet.' : "Couldn't translate that — try again.");
    } finally {
        captureTextInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = '➤';
        captureTextInput.focus();
    }
}

// Pulled out of submitTypedPhrase so the mode-mismatch "look up anyway"
// path can call it directly too.
function submitAsDictionaryLookup(text) {
    captureTextInput.value = '';
    captureTextInput.style.height = 'auto';
    if (typeof resolveDictionarySpaceIdAndProceed === 'function') {
        resolveDictionarySpaceIdAndProceed((spaceId) => submitDictionaryLookup(text, null, null, spaceId));
    }
}

// ===== Dictionary/Type mode-mismatch confirm =====
// Two simple heuristics catch the "forgot which mode I'm in" case before
// text gets lost to the wrong kind of send: more than 3 words typed while
// 📖 Dictionary is selected reads as a sentence, not a lookup query; 1-2
// words typed while ⌨️ Type is selected reads as a lookup query, not a
// phrase. One modal handles both directions — its copy and buttons just
// swap depending on which triggered it.

function looksLikeSentence(text) {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    return wordCount > 3;
}

function looksLikeSingleTerm(text) {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    return wordCount > 0 && wordCount <= 2;
}

let pendingModeMismatchText = null;
let pendingModeMismatchDirection = null; // 'to-type' (currently in Dictionary) | 'to-dictionary' (currently in Type)

function showModeMismatchConfirm(text, direction) {
    pendingModeMismatchText = text;
    pendingModeMismatchDirection = direction;

    const title = document.getElementById('mode-mismatch-modal-title');
    const body = document.getElementById('mode-mismatch-modal-text');
    const switchBtn = document.getElementById('mode-mismatch-switch-btn');
    const stayBtn = document.getElementById('mode-mismatch-confirm-btn');

    // The "switch" button always carries the primary (colored) styling,
    // set once in the HTML — it's the more likely intent either way,
    // since the mismatch itself is usually just forgetting which mode is
    // active, not a deliberate choice to stay in it.
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

// "Switch" button: hop to the other mode and act accordingly.
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

// "Stay" button: keep the currently-selected mode and send as-is, this once.
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
// A recording only ever gets transcribed — no phrases are created
// automatically from it. As soon as the transcript is back, the app flips
// straight to the Transcripts tab, opened right onto it (see
// finishRecordingIntoTranscript in transcriptsTab.js) so the person can
// start picking lines right away.
//
// Used to be one POST to /recordings; now it's two steps done here
// directly: transcribe via Gemini (audioEngine.js — the recording itself
// never leaves this device except as part of that one API call), then
// save the resulting transcript text (remoteDb.js). The raw audio itself
// is never stored anywhere, same as the original server version.
async function handleRecordingFileSelected(inputEl) {
    const file = inputEl.files[0];
    inputEl.value = ''; // allow picking the same file again later
    if (!file) return;

    const langBtns = document.querySelectorAll('#capture-record-buttons .record-lang-btn');
    langBtns.forEach(b => b.disabled = true);

    try {
        // Same 15-minute cap the global in-browser recorder enforces live,
        // via its own auto-stop timer (globalRecord.js's
        // MAX_GLOBAL_RECORDING_MS) — this is the other way a long
        // recording can get in: picking an existing, already-long file
        // instead of recording fresh. Checked here, before transcribing,
        // rather than left to audioEngine.js's own much-larger inline-size
        // limit, which exists only as a hard technical ceiling (Gemini's
        // request-size limit), not a stand-in for what Rotem actually
        // wants a session capped at.
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

// Reads an audio/video file's length client-side, without uploading
// anything anywhere — just an off-DOM <audio> element long enough to fire
// its loadedmetadata event, which carries .duration in seconds. Resolves
// null (via the .catch at the call site) rather than rejecting, for a
// format the browser can't read metadata for; a length check that can't
// run isn't a reason to block the upload outright, just a check this
// particular file doesn't get.
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

// finishRecordingIntoTranscript (shared by this file's own file-upload
// Record mode, called just above, and globalRecord.js's in-browser
// recording) now lives in transcriptsTab.js — the recording always
// finishes onto the Transcripts tab these days, not here, so that's a
// better home for it. Still called by the same name, just defined in a
// different file.

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

// Exits edit mode without saving — clears the input too, so nothing
// half-edited lingers as if it were about to be sent as a new phrase.
function cancelEditingPhrase() {
    editingPhraseId = null;
    hideEditingBanner();
    captureTextInput.value = '';
    captureTextInput.style.height = 'auto';
}

// Used to be one PATCH to /phrases/:id/retranslate; now it's: re-translate
// (translationEngine.js), overwrite the phrase in place (updatePhrase,
// which also clears both tts_url_variant flags), and clear this device's
// cached audio for it (ttsStorage.js) — the old recording no longer
// matches the new wording.
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
        loadTable(); // so the updated wording is already there in Practice
    } catch (err) {
        addCaptureMessage(err.code === 'NO_API_KEY' ? 'No Gemini API key set yet.' : "Couldn't update that phrase — try again.");
    } finally {
        captureTextInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = '➤';
        captureTextInput.focus();
    }
}