// Wraps the browser's built-in fetch so the loading overlay shows and hides
// automatically around EVERY network request in the app — page load, saving
// a tag, opening the editor, etc. — without
// having to add show/hide calls at each individual call site.
//
// A counter (rather than a simple boolean) is used because some actions
// fire more than one fetch at once (e.g. a phrase update followed by a
// table refresh); the overlay should only hide once every in-flight
// request has actually finished.
(function () {
    const originalFetch = window.fetch;
    let activeRequests = 0;
    let shownAt = null;

    // Even if a request finishes almost instantly, the overlay stays up at
    // least this long once shown — otherwise fast actions (toggling a
    // status, saving a tag) cause a jarring one-frame flash instead of a
    // calm, visible loading state.
    const MIN_VISIBLE_MS = 400;

    function showLoadingOverlay() {
        const overlay = document.getElementById('app-loading-overlay');
        if (!overlay) return;
        if (overlay.classList.contains('hidden')) {
            shownAt = Date.now();
        }
        overlay.classList.remove('hidden');
    }

    function hideLoadingOverlay() {
        const overlay = document.getElementById('app-loading-overlay');
        if (!overlay) return;
        const elapsed = shownAt ? Date.now() - shownAt : MIN_VISIBLE_MS;
        const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
        setTimeout(() => {
            // A new request may have started during the wait — only hide if
            // everything is still actually finished.
            if (activeRequests <= 0) {
                overlay.classList.add('hidden');
            }
        }, remaining);
    }

    window.fetch = async function (...args) {
        activeRequests++;
        showLoadingOverlay();
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