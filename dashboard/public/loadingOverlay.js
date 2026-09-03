// Wraps the browser's built-in fetch so the loading overlay shows and hides
// automatically around network requests in the app — without having to add
// show/hide calls at each individual call site.
//
// A counter (rather than a simple boolean) is used because some actions
// fire more than one fetch at once (e.g. a phrase update followed by a
// table refresh); the overlay should only hide once every in-flight
// request has actually finished.
(function () {
    const originalFetch = window.fetch;
    let activeRequests = 0;
    let shownAt = null;
    let showTimer = null;

    // Most in-place actions (marking a phrase learned, retagging, deleting,
    // filtering) finish well under this on a normal connection — those
    // should never show anything at all. Flashing a full-screen overlay for
    // something that completes almost instantly reads as the app being
    // slow, not fast. Only a request still running after this delay gets
    // the overlay — genuinely slow calls (translation, TTS, recording
    // processing) still show it reliably.
    const SHOW_DELAY_MS = 1000;

    // Once the overlay does get shown, it stays up at least this long —
    // so on the slower requests that do trigger it, it doesn't flash off
    // after a single frame either.
    const MIN_VISIBLE_MS = 400;

    function showLoadingOverlay() {
        const overlay = document.getElementById('app-loading-overlay');
        if (!overlay) return;
        shownAt = Date.now();
        overlay.classList.remove('hidden');
    }

    function hideLoadingOverlay() {
        if (showTimer) {
            clearTimeout(showTimer);
            showTimer = null;
        }
        if (!shownAt) return; // never actually shown — nothing to hide

        const overlay = document.getElementById('app-loading-overlay');
        if (!overlay) return;

        const elapsed = Date.now() - shownAt;
        const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
        setTimeout(() => {
            // A new request may have started during the wait — only hide if
            // everything is still actually finished.
            if (activeRequests <= 0) {
                overlay.classList.add('hidden');
                shownAt = null;
            }
        }, remaining);
    }

    window.fetch = async function (...args) {
        activeRequests++;
        // Only ever one pending "should I show it yet?" timer at a time,
        // shared across however many requests are currently in flight.
        if (!showTimer && !shownAt) {
            showTimer = setTimeout(() => {
                showTimer = null;
                if (activeRequests > 0) showLoadingOverlay();
            }, SHOW_DELAY_MS);
        }
        try {
            return await originalFetch(...args);
        } finally {
            activeRequests--;
            if (activeRequests <= 0) {
                activeRequests = 0;
                hideLoadingOverlay();
            }
        }
    };
})();