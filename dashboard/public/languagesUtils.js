// The frontend's list of supported languages. There's no backend anymore
// to fetch this from (the old GET /languages route is gone), so the list
// is just inlined here directly — same values as the original
// dashboard/languages.js, which no longer exists. LANGUAGES is populated
// immediately at script-load time, so nothing needs to await it anymore
// (loadLanguages() is kept as a no-op so app.js doesn't need changing
// beyond removing it from its startup Promise.all).

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