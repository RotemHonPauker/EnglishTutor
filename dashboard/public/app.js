// Escapes user text before it's interpolated into innerHTML, app-wide.
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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

// Tracks window.visualViewport so --app-height (base.css) stays correct
// when the mobile keyboard opens — 100dvh alone isn't reliable enough.
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
    await waitForGeminiKey();

    if (typeof deleteExpiredTranscripts === 'function') {
        await deleteExpiredTranscripts();
    }

    await loadSpaces();
    if (typeof applyDictionaryModeUI === 'function') {
        applyDictionaryModeUI();
    }
    await loadTable();
    if (typeof loadSlotsScreen === 'function') {
        await loadSlotsScreen();
    }
};

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.error('Service worker registration failed:', err);
        });
    });
}