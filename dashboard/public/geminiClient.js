// geminiClient.js — calls Gemini's REST API directly from the browser,
// using the API key stored by geminiKeyGate.js.

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

function geminiExtractText(response) {
    return response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

function geminiExtractInlineAudioBase64(response) {
    return response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;
}