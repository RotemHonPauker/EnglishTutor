// Needs remoteDb.js, geminiClient.js, translationEngine.js, audioEngine.js
// and ttsStorage.js loaded first.

const captureLog = document.getElementById('capture-log');
const transcriptsPanel = document.getElementById('transcripts-panel');
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

// Transcripts (below) is a TOGGLE that layers on top of this mode, not a
// separate mode of its own — it can be open at the same time as either
// Type or Dictionary, and switching between those two never touches it.
// The one exception is Record: a recording and the transcript list can't
// be on screen together (see transcriptsOpen), so picking Record closes
// the toggle if it was open.
function setAddInputMode(mode, btnEl) {
    if (mode === 'record' && transcriptsOpen) {
        closeTranscriptsView();
    }
    applyAddInputModeUI(mode, btnEl);
}

// Just the visual side of switching input mode (icon state, textarea vs.
// record buttons, placeholder text) — split out of setAddInputMode so
// openTranscriptsView can also force a switch out of Record (into Type)
// without going through the "close transcripts" branch above.
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
    if (isRecord) updateRecordButtonLabels();

    refreshCaptureLog(previousMode);
}

// The recording note lives in the main log area (center of the screen,
// room to actually read it). previousMode lets this be a no-op when
// switching between Type and Dictionary, so it never clobbers real
// capture results sitting in the log — it only touches the log when
// Record is actually being entered or left. Independent of the
// transcripts toggle entirely — that renders into its own panel now (see
// below), never into capture-log, so there's nothing here to guard against.
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

// ===== Transcripts toggle =====
// A toggle layered on top of addInputMode, not a view that replaces it:
// it can be open together with Type or Dictionary, and only Record forces
// it shut (see setAddInputMode above). The "Transcriptions" button itself
// is the toggle — tap to open, tap again to close. Renders into its own
// #transcripts-panel, a separate element from #capture-log — never into
// capture-log itself, so opening or closing it can never clear or
// overwrite a phrase result, a dictionary lookup's option chips still
// being chosen, or anything else capture-log happens to be showing.

let transcriptsOpen = false;

function toggleTranscriptsView() {
    if (transcriptsOpen) {
        closeTranscriptsView();
    } else {
        openTranscriptsView();
    }
}

function openTranscriptsView() {
    if (transcriptsOpen) return;
    // Record has no text field to add a selection into, and can't be
    // shown alongside the transcript list anyway — switch to Type first
    // so there's something underneath to work with.
    if (addInputMode === 'record') {
        applyAddInputModeUI('type');
    }
    transcriptsOpen = true;
    if (transcriptsPanel) transcriptsPanel.style.display = 'flex';
    applyTranscriptsButtonUI();
    loadTranscripts(); // renders into #transcripts-panel, see the Transcripts section below
}

function closeTranscriptsView() {
    if (!transcriptsOpen) return;
    transcriptsOpen = false;
    if (transcriptsPanel) {
        transcriptsPanel.style.display = 'none';
        transcriptsPanel.innerHTML = ''; // reloaded fresh next time it opens; capture-log is untouched
    }
    applyTranscriptsButtonUI();
    hideTranscriptSelectionBar();
}

function applyTranscriptsButtonUI() {
    const btn = document.getElementById('capture-history-btn');
    if (btn) btn.classList.toggle('active', transcriptsOpen);
}

// Shared by enterCaptureTab and space switching (spacesState.js calls this
// directly, since enterCaptureTab won't fire if the user is already
// sitting on this tab when they switch spaces from the header). Always
// closes the transcripts toggle and lands back on the normal capture log
// — and cancels any in-progress phrase edit, since re-entering the tab
// fresh means starting over.
function resetCaptureLog() {
    transcriptsOpen = false;
    if (transcriptsPanel) {
        transcriptsPanel.style.display = 'none';
        transcriptsPanel.innerHTML = '';
    }
    applyTranscriptsButtonUI();
    captureLog.innerHTML = '';
    hideTranscriptSelectionBar();
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
        captureLog.innerHTML = '<div class="recording-info-note">👋<br>No space yet — tap the title above, then "+ New space" to create one. Come back here once it\'s made.</div>';
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
        // dictionary SPACE has no alternative, so there's nothing to
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
            tagId: result.tagId
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
// automatically from it. As soon as the transcript is back, the view
// flips straight to the transcript list (see the selection-to-input flow
// below) so the person can start picking lines right away.
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

    addCaptureMessage('Uploading and transcribing your recording...');

    try {
        const audioBase64 = await fileToBase64(file);

        const { transcript } = await processRecording({
            audioBase64,
            mimeType: file.type || 'audio/mp4',
            spaceId: activeSpaceId,
            mode: captureMode
        });

        await createTranscript({ spaceId: activeSpaceId, content: transcript });

        // Recording and the transcript toggle can't coexist, so switch out
        // of Record into Type first, then open the toggle straight onto
        // the fresh transcript, ready to select from.
        if (addInputMode === 'record') {
            applyAddInputModeUI('type');
        }
        transcriptsOpen = true;
        if (transcriptsPanel) transcriptsPanel.style.display = 'flex';
        applyTranscriptsButtonUI();
        await loadTranscripts();
        if (transcripts.length) toggleTranscript(transcripts[0].id);
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

// ===== Transcripts (rendered into #transcripts-panel while the toggle is open) =====

let transcripts = [];

async function loadTranscripts() {
    transcripts = await getTranscripts(activeSpaceId);
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
            <div class="transcript-card-body" id="transcript-body-${t.id}" style="display:none">${escapeHtml(t.content)}</div>
        </div>
    `;
    }).join('');

    if (transcriptsPanel) {
        transcriptsPanel.innerHTML = warningHtml + (listHtml || '<div class="capture-log-item error">No recordings processed yet.</div>');
    }
}

// Accordion: one click expands that entry and collapses any other that was
// open, same as a single-open-field Setup accordion — never more than one
// transcript's body showing at a time.
function toggleTranscript(id) {
    const body = document.getElementById(`transcript-body-${id}`);
    if (!body) return;
    const isOpen = body.style.display !== 'none';

    document.querySelectorAll('.transcript-card-body').forEach(b => b.style.display = 'none');

    body.style.display = isOpen ? 'none' : 'block';
}

async function deleteTranscriptRow(id) {
    try {
        await deleteTranscript(id);
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
    if (!transcriptsOpen) {
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

// Drops the selected text into the input, ready to edit and Send — the
// transcript list stays open underneath the whole time (the toggle is
// untouched here), so this can be repeated for as many lines as wanted
// without losing the transcript. The input is already usable in Type or
// Dictionary mode regardless of the toggle, so there's nothing to unlock;
// this just fills it and focuses it.
function addTranscriptSelectionToInput() {
    if (!pendingTranscriptSelection) return;
    const text = pendingTranscriptSelection;

    window.getSelection().removeAllRanges();
    hideTranscriptSelectionBar();

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