// globalRecord.js — the global record button: a single always-available
// trigger (red circular button, raised in the center of the tab bar) that
// isn't scoped to whichever Space happens to be open. Tapping it opens a
// large space picker FIRST (see "Which space?" picker below); only
// once a space is chosen does in-browser recording actually start
// (MediaRecorder/getUserMedia — Android/Chrome only; the existing
// per-space Add-tab record-via-file-upload flow, see captureTab.js's
// handleRecordingFileSelected, stays as the fallback on browsers without
// this support, e.g. iOS Safari). Tap the button again to stop.
//
// On stop, this works exactly like the file-upload flow: the recording is
// transcribed and saved as a TRANSCRIPT, not turned straight into a
// phrase — the person still manually picks which lines become phrase
// cards afterward (see captureTab.js's finishRecordingIntoTranscript,
// shared by both flows).
//
// Which Space the transcript belongs to is decided UP FRONT, before
// recording starts — always, via the picker, never guessed from context.
// (An earlier version of this decided it from the active Slot, if any,
// right after stopping instead — dropped because stopping isn't actually
// any more free a moment to make that decision than starting is, and it
// was confusing in cases where the person had moved on from the space
// they started recording for by the time they stopped.)
//
// Needs localDb.js, audioEngine.js, spacesState.js (spaces/setActiveSpace)
// and captureTab.js (finishRecordingIntoTranscript) loaded first.

const RECORDING_SUPPORTED = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

// Rotem's own real-world ceiling: she said she rarely records past 15
// minutes, and a longer transcript just becomes a chore to read through
// and pick lines out of afterward — stopped automatically here, so
// recording just ends cleanly on its own instead of running long and
// producing something nobody wants to read. (Well under audioEngine.js's
// own much higher inline-size limit, so that one is never actually hit by
// this button.)
const MAX_GLOBAL_RECORDING_MS = 15 * 60 * 1000;

let globalRecordState = 'idle'; // 'idle' | 'picking' | 'recording' | 'processing'
let globalMediaRecorder = null;
let globalRecordedChunks = [];
let globalRecordStream = null;
let globalRecordStartedAt = null;
let globalRecordTimerInterval = null;
let globalRecordAutoStopTimeout = null;

// The space chosen in the picker before recording starts — set once,
// read once (in handleGlobalRecordingStopped), then cleared. Unlike the
// old design, stopping never needs to ask again.
let globalRecordSpaceId = null;

function initGlobalRecordButton() {
    const btn = document.getElementById('global-record-btn');
    if (!btn) return;

    if (!RECORDING_SUPPORTED) {
        // No in-browser recording on this browser (iOS Safari, mainly) —
        // hide the button entirely rather than show something that can't
        // work. The per-space Add-tab flow (file picker) is still there.
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
    acquireWakeLock();
    globalRecordTimerInterval = setInterval(updateGlobalRecordTimerLabel, 1000);
    globalRecordAutoStopTimeout = setTimeout(() => {
        if (globalRecordState === 'recording') stopGlobalRecording();
    }, MAX_GLOBAL_RECORDING_MS);
}

function stopGlobalRecording() {
    if (!globalMediaRecorder || globalRecordState !== 'recording') return;
    clearTimeout(globalRecordAutoStopTimeout);
    clearInterval(globalRecordTimerInterval);
    releaseWakeLock();
    globalRecordState = 'processing';
    applyGlobalRecordButtonUI();
    globalMediaRecorder.stop();
    // Stop every track immediately so the browser's mic-in-use indicator
    // clears right away, rather than lingering until this stream is
    // garbage-collected.
    globalRecordStream.getTracks().forEach(t => t.stop());
}

// ===== Screen wake lock while actually recording =====
// Rotem's own call, weighed deliberately against the tradeoff: a lit
// screen for up to 15 minutes costs battery, and could register an
// accidental touch through a pocket/bag — but hold-to-stop below (not a
// plain tap) is what makes that safe, so nothing stops unless the button
// is genuinely held down on purpose. Held only for the "recording" state
// itself, released the moment it ends (stopGlobalRecording, above) — no
// need to keep the screen awake just for the brief "processing" tail.
// Unsupported browsers (the Wake Lock API isn't universal) silently get
// no wake lock at all; recording itself is unaffected either way.
let wakeLockSentinel = null;

async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch (err) {
        // E.g. battery saver mode refused it, or the tab wasn't visible at
        // the moment of the request — recording keeps going regardless,
        // the screen just isn't held on. visibilitychange below retries
        // once the tab is visible again.
        wakeLockSentinel = null;
    }
}

function releaseWakeLock() {
    if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
        wakeLockSentinel = null;
    }
}

// The Wake Lock API itself auto-releases a lock whenever the document goes
// into the background (screen manually turned off and back on, switching
// to another app and back, etc.) — this is the one place that needs to
// notice and ask for it again, rather than leaving the screen free to
// turn off for the rest of a still-ongoing recording.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && globalRecordState === 'recording' && !wakeLockSentinel) {
        acquireWakeLock();
    }
});

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

// No more "mode" to pass — processRecording (audioEngine.js) always just
// transcribes exactly as spoken now, restricted to this space's own
// source/target languages (or a mix), with no language hint needed up
// front. The global button never had language-pair buttons the way the
// Add tab's own record mode used to (see captureTab.js), so this is just
// one less thing to pass through.
async function finishGlobalRecording(audioBase64, mimeType, spaceId) {
    try {
        const { transcript } = await processRecording({ audioBase64, mimeType, spaceId });
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

    const labelText = globalRecordState === 'recording' ? '0:00' : globalRecordState === 'processing' ? 'Saving…' : globalRecordState === 'picking' ? 'Choose...' : 'Record';
    if (label) label.textContent = labelText;

    // Full-screen overlay (base.css's #global-recording-overlay) — up for
    // as long as recording is actually happening, plus the brief
    // "processing" tail right after stopping, so there's never a gap
    // where the small tab-bar button is the only indication something's
    // still in flight. Not shown for "picking" — the space picker modal
    // is its own full-screen overlay already (globalRecord.js's
    // openRecordRoutinePicker), and only one of the two should cover the
    // screen at a time.
    const overlay = document.getElementById('global-recording-overlay');
    const overlayBtn = document.getElementById('global-recording-overlay-btn');
    const overlayLabel = document.getElementById('global-recording-overlay-label');
    const overlayHint = document.getElementById('global-recording-overlay-hint');
    const overlayVisible = globalRecordState === 'recording' || globalRecordState === 'processing';
    if (overlay) overlay.classList.toggle('visible', overlayVisible);
    if (overlayBtn) overlayBtn.disabled = globalRecordState === 'processing';
    if (overlayLabel) overlayLabel.textContent = labelText;
    // The hold-to-stop hint only makes sense while there's actually
    // something to hold the button down to stop — hidden during the
    // "processing" tail, when the button is disabled anyway.
    if (overlayHint) overlayHint.style.visibility = globalRecordState === 'recording' ? 'visible' : 'hidden';
    if (globalRecordState !== 'recording') cancelHoldToStop();
}

// ===== Hold-to-stop (overlay button) =====
// A plain tap would be too easy to trigger by accident — the overlay's
// big button only stops the recording after being held down for
// HOLD_TO_STOP_MS, not on a quick tap/touch; releasing early, or the
// pointer leaving the button, cancels it with no effect. This (plus the
// wake-lock comment above) is what makes it safe to keep the screen on
// while a recording sits in a pocket or bag.
const HOLD_TO_STOP_MS = 600;
let holdToStopTimeout = null;

function startHoldToStop() {
    if (globalRecordState !== 'recording') return;
    const btn = document.getElementById('global-recording-overlay-btn');
    if (btn) btn.classList.add('holding');
    holdToStopTimeout = setTimeout(() => {
        holdToStopTimeout = null;
        stopGlobalRecording();
    }, HOLD_TO_STOP_MS);
}

function cancelHoldToStop() {
    const btn = document.getElementById('global-recording-overlay-btn');
    if (btn) btn.classList.remove('holding');
    if (holdToStopTimeout) {
        clearTimeout(holdToStopTimeout);
        holdToStopTimeout = null;
    }
}

function initGlobalRecordingOverlayButton() {
    const btn = document.getElementById('global-recording-overlay-btn');
    if (!btn) return;
    btn.addEventListener('pointerdown', startHoldToStop);
    btn.addEventListener('pointerup', cancelHoldToStop);
    btn.addEventListener('pointerleave', cancelHoldToStop);
    btn.addEventListener('pointercancel', cancelHoldToStop);
}

function updateGlobalRecordTimerLabel() {
    const label = document.getElementById('global-record-label');
    const overlayLabel = document.getElementById('global-recording-overlay-label');
    if (!label || !globalRecordStartedAt) return;
    const elapsedSec = Math.floor((Date.now() - globalRecordStartedAt) / 1000);
    const mm = Math.floor(elapsedSec / 60);
    const ss = elapsedSec % 60;
    const text = `${mm}:${String(ss).padStart(2, '0')}`;
    label.textContent = text;
    if (overlayLabel) overlayLabel.textContent = text;
}

// ===== "Which space?" picker — shown every time, before recording
// starts. Large, high-contrast, single-tap options (see the
// .record-routine-option styling in tabs.css) since this is meant to be
// read and tapped in a hurry, not browsed. =====

let pendingRoutinePickCallback = null;

function openRecordRoutinePicker(onChosen) {
    globalRecordState = 'picking';
    applyGlobalRecordButtonUI();
    pendingRoutinePickCallback = onChosen;

    // A dictionary space does word lookups, not phrase capture, so it's
    // not a valid target for a recording's transcript — same restriction
    // phrasesTable.js's bulk "Move to..." already applies.
    const candidates = (typeof spaces !== 'undefined' ? spaces : []).filter(s => s.space_type !== 'dictionary');
    const list = document.getElementById('record-routine-list');

    list.innerHTML = candidates.length
        ? candidates.map(s => `<button type="button" class="record-routine-option" onclick="chooseRecordRoutine('${s.id}')">${escapeHtml(s.name)}</button>`).join('')
        : '<div class="slots-empty">No space to save this recording into yet — create one first.</div>';

    document.getElementById('record-routine-modal-overlay').style.display = 'flex';
}

// Picking a space starts recording right away (see toggleGlobalRecording's
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
initGlobalRecordingOverlayButton();