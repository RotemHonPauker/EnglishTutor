// --- SHARED HTML-ESCAPING HELPER ---
// User-entered text (space names, tag names, phrase text, dictionary
// words...) gets interpolated into innerHTML template strings all over
// this app's UI files. Escaping it here, once, is what actually closes
// the XSS gap: without it, a space/tag/phrase containing something like
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
}

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
    // resolved (geminiKeyGate.js) — everything else (spaces, tags,
    // phrases) lives in this device's own IndexedDB (localDb.js), so
    // there's no connection or login step to wait on anymore.
    await waitForGeminiKey();

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
    await loadTags();
    await loadTable();
};

// --- PWA: register service worker so the app is installable ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.error('Service worker registration failed:', err);
        });
    });
}