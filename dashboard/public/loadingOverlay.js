// Wraps fetch so the loading overlay shows/hides automatically around
// network requests, with a show delay (skip the flash for fast calls) and
// a minimum visible time (skip a one-frame flicker on slow ones).
(function () {
    const originalFetch = window.fetch;
    let activeRequests = 0;
    let shownAt = null;
    let showTimer = null;

    const SHOW_DELAY_MS = 1000;
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
        if (!shownAt) return;

        const overlay = document.getElementById('app-loading-overlay');
        if (!overlay) return;

        const elapsed = Date.now() - shownAt;
        const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
        setTimeout(() => {
            if (activeRequests <= 0) {
                overlay.classList.add('hidden');
                shownAt = null;
            }
        }, remaining);
    }

    window.fetch = async function (...args) {
        activeRequests++;
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