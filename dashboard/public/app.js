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
    await loadSpaces();
    await loadTags();
    await loadTable();
};

// --- PWA: register service worker so the app is installable ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.error('Service worker registration failed:', err);
        });
    });
}