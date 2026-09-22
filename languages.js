// Fixed, shared list of supported languages — a closed set rather than
// free text, so every space's source/target/bridge language always has a
// consistent name (used in prompts) and code (used for badges, dictionary
// space names). Mirrored in the frontend's languages.js — keep both in
// sync if this list changes.

export const LANGUAGES = [
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

// Language names are stored in spaces/DB as full names ("Hebrew") since
// prompts need them in natural language. This resolves a name back to its
// code for anything display-only (badges, auto-generated dictionary
// names). Falls back to the name itself if somehow not in the list, so a
// lookup never breaks on unexpected data.
export const codeForLanguage = (name) => {
    const match = LANGUAGES.find(l => l.name === name);
    return match ? match.code : (name || '');
};