// globalRecord.js — the always-available record button in the tab bar.
// Tap opens a space picker; recording starts once a space is chosen
// (MediaRecorder/getUserMedia — Android/Chrome only, the Add tab's file
// upload is the fallback elsewhere). Tap again to stop; the recording is
// saved as a transcript, not a phrase, same as the upload flow.
// Needs localDb.js, audioEngine.js, spacesState.js and captureTab.js
// (finishRecordingIntoTranscript) loaded first.

const RECORDING_SUPPORTED = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
const MAX_GLOBAL_RECORDING_MS = 15 * 60 * 1000;

let globalRecordState = 'idle'; // 'idle' | 'picking' | 'recording' | 'processing'
let globalMediaRecorder = null;
let globalRecordedChunks = [];
let globalRecordStream = null;
let globalRecordStartedAt = null;
let globalRecordTimerInterval = null;
let globalRecordAutoStopTimeout = null;
let globalRecordSpaceId = null;

function initGlobalRecordButton() {
    const btn = document.getElementById('global-record-btn');
    if (!btn) return;

    if (!RECORDING_SUPPORTED) {
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
    globalRecordStream.getTracks().forEach(t => t.stop());
}

// ===== Screen wake lock while recording =====
// Held only during "recording", released on stop. Hold-to-stop (below)
// is what makes this safe against an accidental touch through a pocket.
let wakeLockSentinel = null;

async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch (err) {
        wakeLockSentinel = null;
    }
}

function releaseWakeLock() {
    if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
        wakeLockSentinel = null;
    }
}

// The Wake Lock API auto-releases when the document goes to the
// background — re-acquire it once visible again.
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

async function finishGlobalRecording(audioBase64, mimeType, spaceId) {
    try {
        const { transcript } = await processRecording({ audioBase64, mimeType, spaceId });
        await finishRecordingIntoTranscript(spaceId, transcript);
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

    btn.classList.toggle('recording', globalRecordState === 'recording');
    btn.classList.toggle('processing', globalRecordState === 'picking' || globalRecordState === 'processing');
    btn.disabled = globalRecordState === 'picking' || globalRecordState === 'processing';

    const labelText = globalRecordState === 'recording' ? '0:00' : globalRecordState === 'processing' ? 'Saving…' : globalRecordState === 'picking' ? 'Choose...' : 'Record';
    if (label) label.textContent = labelText;

    const overlay = document.getElementById('global-recording-overlay');
    const overlayBtn = document.getElementById('global-recording-overlay-btn');
    const overlayLabel = document.getElementById('global-recording-overlay-label');
    const overlayHint = document.getElementById('global-recording-overlay-hint');
    const overlayVisible = globalRecordState === 'recording' || globalRecordState === 'processing';
    if (overlay) overlay.classList.toggle('visible', overlayVisible);
    if (overlayBtn) overlayBtn.disabled = globalRecordState === 'processing';
    if (overlayLabel) overlayLabel.textContent = labelText;
    if (overlayHint) overlayHint.style.visibility = globalRecordState === 'recording' ? 'visible' : 'hidden';
    if (globalRecordState !== 'recording') cancelHoldToStop();
}

// ===== Hold-to-stop (overlay button) =====
// Requires holding for HOLD_TO_STOP_MS, not a tap — releasing early cancels it.
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

// ===== Space picker, shown before recording starts =====

let pendingRoutinePickCallback = null;

function openRecordRoutinePicker(onChosen) {
    globalRecordState = 'picking';
    applyGlobalRecordButtonUI();
    pendingRoutinePickCallback = onChosen;

    const candidates = (typeof spaces !== 'undefined' ? spaces : []).filter(s => s.space_type !== 'dictionary');
    const list = document.getElementById('record-routine-list');

    list.innerHTML = candidates.length
        ? candidates.map(s => `<button type="button" class="record-routine-option" onclick="chooseRecordRoutine('${s.id}')">${escapeHtml(s.name)}</button>`).join('')
        : '<div class="slots-empty">No space to save this recording into yet — create one first.</div>';

    document.getElementById('record-routine-modal-overlay').style.display = 'flex';
}

function chooseRecordRoutine(spaceId) {
    const callback = pendingRoutinePickCallback;
    pendingRoutinePickCallback = null;
    document.getElementById('record-routine-modal-overlay').style.display = 'none';
    if (callback) callback(spaceId);
}

function cancelRecordRoutinePicker() {
    document.getElementById('record-routine-modal-overlay').style.display = 'none';
    pendingRoutinePickCallback = null;
    globalRecordState = 'idle';
    applyGlobalRecordButtonUI();
}

initGlobalRecordButton();
initGlobalRecordingOverlayButton();