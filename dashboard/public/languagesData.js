// Fixed, shared list of supported languages — mirrors dashboard/languages.js
// on the backend. Kept as a plain global (same pattern as COLORS in
// colorUtils.js) since this app has no bundler/shared-import setup between
// frontend and backend files.

const LANGUAGES = [
    { code: 'HE', name: 'Hebrew' },
    { code: 'EN', name: 'English' },
    { code: 'ES', name: 'Spanish' },
    { code: 'FR', name: 'French' },
    { code: 'DE', name: 'German' },
    { code: 'RU', name: 'Russian' },
    { code: 'AR', name: 'Arabic' },
    { code: 'NL', name: 'Dutch' },
    { code: 'CS', name: 'Czech' },
    { code: 'IT', name: 'Italian' },
    { code: 'PT', name: 'Portuguese' },
    { code: 'PL', name: 'Polish' },
    { code: 'JA', name: 'Japanese' },
    { code: 'ZH', name: 'Chinese' },
    { code: 'KO', name: 'Korean' },
    { code: 'TR', name: 'Turkish' },
    { code: 'SV', name: 'Swedish' },
    { code: 'EL', name: 'Greek' },
    { code: 'HI', name: 'Hindi' },
    { code: 'UK', name: 'Ukrainian' }
];

function codeForLanguage(name) {
    const match = LANGUAGES.find(l => l.name === name);
    return match ? match.code : (name || '');
}

function languageOptionsHtml(selectedName) {
    return LANGUAGES.map(l => `<option value="${l.name}" ${l.name === selectedName ? 'selected' : ''}>${l.name}</option>`).join('');
}