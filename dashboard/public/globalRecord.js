// globalRecord.js — the global record button: a single always-available
// trigger (red circular button, raised in the center of the tab bar) that
// isn't scoped to whichever Routine happens to be open. Tapping it opens a
// large routine picker FIRST (see "Which routine?" picker below); only
// once a routine is chosen does in-browser recording actually start
// (MediaRecorder/getUserMedia — Android/Chrome only; the existing
// per-routine Add-tab record-via-file-upload flow, see captureTab.js's
// handleRecordingFileSelected, stays as the fallback on browsers without
// this support, e.g. iOS Safari). Tap the button again to stop.
//
// On stop, this works exactly like the file-upload flow: the recording is
// transcribed and saved as a TRANSCRIPT, not turned straight into a
// phrase — the person still manually picks which lines become phrase
// cards afterward (see captureTab.js's finishRecordingIntoTranscript,
// shared by both flows).
//
// Which Routine the transcript belongs to is decided UP FRONT, before
// recording starts — always, via the picker, never guessed from context.
// (An earlier version of this decided it from the active Slot, if any,
// right after stopping instead — dropped because stopping isn't actually
// any more free a moment to make that decision than starting is, and it
// was confusing in cases where the person had moved on from the routine
// they started recording for by the time they stopped.)
//
// Needs localDb.js, audioEngine.js, spacesState.js (spaces/setActiveSpace)
// and captureTab.js (finishRecordingIntoTranscript) loaded first.

const RECORDING_SUPPORTED = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

// Same ~30-minute safety ceiling as audioEngine.js's own inline-size
// limit (processRecording would reject anything larger anyway) — stopped
// automatically here first, so recording just ends cleanly instead of
// failing afterward on upload.
const MAX_GLOBAL_RECORDING_MS = 30 * 60 * 1000;

let globalRecordState = 'idle'; // 'idle' | 'picking' | 'recording' | 'processing'
let globalMediaRecorder = null;
let globalRecordedChunks = [];
let globalRecordStream = null;
let globalRecordStartedAt = null;
let globalRecordTimerInterval = null;
let globalRecordAutoStopTimeout = null;

// The routine chosen in the picker before recording starts — set once,
// read once (in handleGlobalRecordingStopped), then cleared. Unlike the
// old design, stopping never needs to ask again.
let globalRecordSpaceId = null;

function initGlobalRecordButton() {
    const btn = document.getElementById('global-record-btn');
    if (!btn) return;

    if (!RECORDING_SUPPORTED) {
        // No in-browser recording on this browser (iOS Safari, mainly) —
        // hide the button entirely rather than show something that can't
        // work. The per-routine Add-tab flow (file picker) is still there.
        const wrap = document.querySelector('.global-record-wrap');
        if (wrap) wrap.style.display = 'none';
        return;
    }

    btn.addEventListener('click', toggleGlobalRecording);
}

function toggleGlobalRecording() {
    if (globalRecordState === 'idle') {
        openRecordRoutinePicker((spaceId) => {
            globalRecordSpaceId = spaceId;
            startGlobalRecording();
        });
    } else if (globalRecordState === 'recording') {
        stopGlobalRecording();
    }
    // 'picking'/'processing' — ignore taps; the button is disabled during these states anyway.
}

function pickSupportedMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return candidates.find(t => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t)) || null;
}

async function startGlobalRecording() {
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        alert('Microphone access is needed to record. Check your browser/site permissions and try again.');
        globalRecordSpaceId = null;
        globalRecordState = 'idle';
        applyGlobalRecordButtonUI();
        return;
    }

    globalRecordStream = stream;
    globalRecordedChunks = [];

    const mimeType = pickSupportedMimeType();
    globalMediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    globalMediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) globalRecordedChunks.push(e.data);
    };
    globalMediaRecorder.onstop = handleGlobalRecordingStopped;
    globalMediaRecorder.start();

    globalRecordState = 'recording';
    globalRecordStartedAt = Date.now();
    applyGlobalRecordButtonUI();
    globalRecordTimerInterval = setInterval(updateGlobalRecordTimerLabel, 1000);
    globalRecordAutoStopTimeout = setTimeout(() => {
        if (globalRecordState === 'recording') stopGlobalRecording();
    }, MAX_GLOBAL_RECORDING_MS);
}

function stopGlobalRecording() {
    if (!globalMediaRecorder || globalRecordState !== 'recording') return;
    clearTimeout(globalRecordAutoStopTimeout);
    clearInterval(globalRecordTimerInterval);
    globalRecordState = 'processing';
    applyGlobalRecordButtonUI();
    globalMediaRecorder.stop();
    // Stop every track immediately so the browser's mic-in-use indicator
    // clears right away, rather than lingering until this stream is
    // garbage-collected.
    globalRecordStream.getTracks().forEach(t => t.stop());
}

async function handleGlobalRecordingStopped() {
    const mimeType = globalMediaRecorder.mimeType || 'audio/webm';
    const blob = new Blob(globalRecordedChunks, { type: mimeType });
    globalRecordedChunks = [];
    globalMediaRecorder = null;
    globalRecordStream = null;

    const spaceId = globalRecordSpaceId;
    globalRecordSpaceId = null;

    try {
        const audioBase64 = await blobToBase64(blob);
        await finishGlobalRecording(audioBase64, mimeType, spaceId);
    } catch (err) {
        alert('Something went wrong preparing that recording — try again.');
        globalRecordState = 'idle';
        applyGlobalRecordButtonUI();
    }
}

// mode: 'capture' (source-language hint) — same default audioEngine.js
// itself uses. The global button has no language-pair buttons the way the
// Add tab's own record mode does (see captureTab.js's
// record-lang-source-btn/record-lang-target-btn), since there's no screen
// context to put them on here; defaulting to the source language matches
// this app's primary day-to-day capture direction.
async function finishGlobalRecording(audioBase64, mimeType, spaceId) {
    try {
        const { transcript } = await processRecording({ audioBase64, mimeType, spaceId, mode: 'capture' });
        await finishRecordingIntoTranscript(spaceId, transcript); // captureTab.js — shared with the file-upload flow
    } catch (err) {
        alert(err.code === 'NO_API_KEY' ? 'No Gemini API key set yet.' : (err.message || "Something went wrong processing that recording — try again."));
    } finally {
        globalRecordState = 'idle';
        applyGlobalRecordButtonUI();
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ===== Button visuals =====

function applyGlobalRecordButtonUI() {
    const btn = document.getElementById('global-record-btn');
    const label = document.getElementById('global-record-label');
    if (!btn) return;

    // No icon/emoji to swap — the button is just a plain ring (drawn in
    // tabs.css via ::after) in every state. State is shown by the
    // button's color/pulse (CSS, driven by these same classes) and by
    // the label text below it.
    btn.classList.toggle('recording', globalRecordState === 'recording');
    btn.classList.toggle('processing', globalRecordState === 'picking' || globalRecordState === 'processing');
    btn.disabled = globalRecordState === 'picking' || globalRecordState === 'processing';

    if (label) {
        label.textContent = globalRecordState === 'recording' ? '0:00' : globalRecordState === 'processing' ? 'Saving…' : globalRecordState === 'picking' ? 'Choose...' : 'Record';
    }
}

function updateGlobalRecordTimerLabel() {
    const label = document.getElementById('global-record-label');
    if (!label || !globalRecordStartedAt) return;
    const elapsedSec = Math.floor((Date.now() - globalRecordStartedAt) / 1000);
    const mm = Math.floor(elapsedSec / 60);
    const ss = elapsedSec % 60;
    label.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
}

// ===== "Which routine?" picker — shown every time, before recording
// starts. Large, high-contrast, single-tap options (see the
// .record-routine-option styling in tabs.css) since this is meant to be
// read and tapped in a hurry, not browsed. =====

let pendingRoutinePickCallback = null;

function openRecordRoutinePicker(onChosen) {
    globalRecordState = 'picking';
    applyGlobalRecordButtonUI();
    pendingRoutinePickCallback = onChosen;

    // A dictionary routine does word lookups, not phrase capture, so it's
    // not a valid target for a recording's transcript — same restriction
    // phrasesTable.js's bulk "Move to..." already applies.
    const candidates = (typeof spaces !== 'undefined' ? spaces : []).filter(s => s.space_type !== 'dictionary');
    const list = document.getElementById('record-routine-list');

    list.innerHTML = candidates.length
        ? candidates.map(s => `<button type="button" class="record-routine-option" onclick="chooseRecordRoutine('${s.id}')">${escapeHtml(s.name)}</button>`).join('')
        : '<div class="slots-empty">No routine to save this recording into yet — create one first.</div>';

    document.getElementById('record-routine-modal-overlay').style.display = 'flex';
}

// Picking a routine starts recording right away (see toggleGlobalRecording's
// callback), so this just hides the modal and lets that callback run.
function chooseRecordRoutine(spaceId) {
    const callback = pendingRoutinePickCallback;
    pendingRoutinePickCallback = null;
    document.getElementById('record-routine-modal-overlay').style.display = 'none';
    if (callback) callback(spaceId);
}

// Explicit Cancel/✕ — backs all the way out, no recording was ever started.
function cancelRecordRoutinePicker() {
    document.getElementById('record-routine-modal-overlay').style.display = 'none';
    pendingRoutinePickCallback = null;
    globalRecordState = 'idle';
    applyGlobalRecordButtonUI();
}

initGlobalRecordButton();