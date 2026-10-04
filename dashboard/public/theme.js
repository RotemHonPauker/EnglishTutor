// Light / dark theme switch. Loaded before the other scripts.
// The saved theme is applied early by the inline script in index.html;
// this file provides setTheme() for the buttons and keeps the UI in sync.

const THEME_STORAGE_KEY = 'fraza-theme';
const THEME_META_COLORS = { dark: '#000000', light: '#f3f2ef' };

function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') return;

    document.documentElement.setAttribute('data-theme', theme);

    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (e) {}

    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', THEME_META_COLORS[theme]);

    document.querySelectorAll('[data-theme-choice]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.themeChoice === theme);
    });
}

function toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

// Sync the picker buttons and theme-color with the applied theme
setTheme(getTheme());