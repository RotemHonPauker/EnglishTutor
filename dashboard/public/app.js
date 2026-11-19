// --- SHARED HTML-ESCAPING HELPER ---
// User-entered text (space names, slot names, phrase text, dictionary
// words...) gets interpolated into innerHTML template strings all over
// this app's UI files. Escaping it here, once, is what actually closes
// the XSS gap: without it, a space/slot/phrase containing something like
// <img src=x onerror="..."> would have its markup executed instead of
// just displayed as text. Defined in app.js (loaded first) so every
// later UI file can use it as a plain global.
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- VIEW SWITCHING (tab bar) ---

function showView(view, btnEl) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) {
        btnEl.classList.add('active');
    } else {
        document.querySelector(`.tab-btn[data-view="${view}"]`).classList.add('active');
    }
    // Lets base.css show/hide the shared #space-header's Practice-only
    // quick actions (#header-practice-btn/#header-add-slot-btn) purely by
    // CSS, without a separate JS call on every tab switch — every path
    // into any tab (enterCaptureTab/enterPracticeTab/enterTranscriptsTab,
    // or this function directly) always runs through here.
    document.body.dataset.activeView = view;
}

// index.html already marks Practice as the initially active view
// (#view-practice.active, no JS involved) — this line is what keeps
// body[data-active-view] in sync with that from the very first paint,
// not just from showView's own calls above. Without it, the Practice-only
// header buttons stayed hidden after a fresh page load/refresh until the
// first real tab switch, since nothing had called showView yet to set
// the attribute. Runs synchronously as this script loads (it's the last
// script tag, so the DOM is already there by then), not inside
// window.onload, so there's no flash of the buttons being hidden first.
document.body.dataset.activeView = document.querySelector('.view.active')?.id.replace('view-', '') || 'practice';

// --- REAL VIEWPORT HEIGHT (handles the mobile keyboard properly) ---
// `100dvh` alone isn't reliably supported/behaved on every mobile browser,
// and iOS Safari in particular can still leave a stale gap when the
// keyboard opens. Tracking window.visualViewport directly and exposing it
// as a CSS variable is the most robust fix: body's height in base.css reads
// var(--app-height), which this keeps in sync with the actual visible area
// at all times, keyboard open or not.
function updateAppHeight() {
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${height}px`);
}

updateAppHeight();
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateAppHeight);
    window.visualViewport.addEventListener('scroll', updateAppHeight);
} else {
    window.addEventListener('resize', updateAppHeight);
}

window.onload = async () => {
    // Nothing else runs until the one-time Gemini API key gate has
    // resolved (geminiKeyGate.js) — everything else (spaces, phrases, time
    // slots) lives in this device's own IndexedDB (localDb.js), so there's
    // no connection or login step to wait on anymore.
    await waitForGeminiKey();

    // Transcripts only ever live for 24h (see localDb.js's
    // TRANSCRIPT_RETENTION_MS) — sweeping expired ones now, once per app
    // load, is enough to keep the Transcripts tab honest without running a
    // timer in the background. Scans every routine's transcripts at once,
    // so this doesn't need to wait on activeSpaceId/loadSpaces below.
    if (typeof deleteExpiredTranscripts === 'function') {
        await deleteExpiredTranscripts();
    }

    // LANGUAGES and COLORS are now plain inlined constants
    // (languagesUtils.js / colorUtils.js) rather than fetched from the
    // old GET /languages and GET /colors routes, so there's nothing to
    // load for them anymore — they're already populated by the time this
    // script runs.
    await loadSpaces();
    // Restores the tab/Add-tab restrictions if the active space happens to
    // be a dictionary space — derived fresh from that space's type, so
    // this is always safe to call regardless of what kind of space it is.
    // loadTable() below already knows to fetch dictionary entries instead
    // of phrases when that's the case.
    if (typeof applyDictionaryModeUI === 'function') {
        applyDictionaryModeUI();
    }
    await loadTable();
    // Tags used to load eagerly here too (the old loadTags()) — slots
    // need the same treatment, not lazy-loading on first visit to the
    // Schedule tab, because slots.js's own `slots` global is read by other
    // screens that can be reached before that tab ever is: the Practice
    // tab's own Slots filter (phrasesTable.js) and the practice-session
    // scope picker (practiceSession.js) both assume it's already
    // populated. loadSlotsScreen() safely no-ops if the Schedule tab's own
    // #slots-list element isn't in the DOM for some reason, but otherwise
    // runs fine even while a different tab is the one actually visible —
    // same as loadTable() itself running before Practice is necessarily
    // on screen.
    if (typeof loadSlotsScreen === 'function') {
        await loadSlotsScreen();
    }
};

// --- PWA: register service worker so the app is installable ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.error('Service worker registration failed:', err);
        });
    });
}