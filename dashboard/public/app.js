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

window.onload = async () => {
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