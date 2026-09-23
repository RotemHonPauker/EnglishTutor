// The frontend's copy of the supported-languages list — fetched once from
// the backend (the actual source of truth, languages.js) rather than kept
// as a second hardcoded copy here. LANGUAGES starts empty and is filled in
// by loadLanguages(), called once from app.js's window.onload before
// anything that needs it (the space-creation form, the Bridge badge
// language codes) renders.

let LANGUAGES = [];

async function loadLanguages() {
    try {
        const res = await fetch('/languages');
        LANGUAGES = await res.json();
    } catch (err) {
        console.error('Failed to load languages:', err);
    }
}

function codeForLanguage(name) {
    const match = LANGUAGES.find(l => l.name === name);
    return match ? match.code : (name || '');
}

function languageOptionsHtml(selectedName) {
    return LANGUAGES.map(l => `<option value="${l.name}" ${l.name === selectedName ? 'selected' : ''}>${l.name}</option>`).join('');
}