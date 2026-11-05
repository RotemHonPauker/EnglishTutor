// geminiClient.js — calls Gemini's REST API directly from the browser,
// using the API key the person typed into the one-time startup gate (see
// geminiKeyGate.js), read back from localStorage. Replaces the server's
// @google/genai SDK
// usage (translationEngine.js / dictionaryEngine.js / audioEngine.js /
// ttsEngine.js all used `ai.models.generateContent({...})` server-side —
// this is the same call, over plain fetch instead of that SDK, since the
// SDK itself is a Node package, not meant for a browser).
// Plain classic script, like the rest of public/ — no import/export.

const GEMINI_API_KEY_STORAGE_KEY = 'fraza-gemini-api-key';

function getGeminiApiKey() {
    try {
        return localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '';
    } catch (e) {
        return '';
    }
}

function setGeminiApiKey(key) {
    try {
        if (key) {
            localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key);
        } else {
            localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
        }
        return true;
    } catch (e) {
        return false;
    }
}

function hasGeminiApiKey() {
    return !!getGeminiApiKey();
}

// contents: Gemini's `contents` array, e.g. [{ parts: [{ text: '...' }] }]
// or [{ parts: [{ text: '...' }, { inlineData: { data, mimeType } }] }].
// generationConfig: optional, e.g. { responseMimeType: 'application/json' }
// or the TTS shape { responseModalities: ['AUDIO'], speechConfig: {...} }.
async function geminiGenerateContent({ model, contents, generationConfig }) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        const err = new Error('No Gemini API key set — add one in Setup first.');
        err.code = 'NO_API_KEY';
        throw err;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents,
            ...(generationConfig ? { generationConfig } : {})
        })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        const message = data?.error?.message || `Gemini request failed (${res.status})`;
        throw new Error(message);
    }

    return data;
}

// Pulls the plain text out of a normal (non-audio) Gemini response.
function geminiExtractText(response) {
    return response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// Pulls the base64 audio payload out of a TTS response
// (responseModalities: ['AUDIO']).
function geminiExtractInlineAudioBase64(response) {
    return response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;
}