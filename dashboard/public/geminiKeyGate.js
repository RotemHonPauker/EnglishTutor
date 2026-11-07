// geminiKeyGate.js — one-time "Enter your Gemini API key" overlay. This
// is the only setup gate left in the app — there's no database connection
// or login to wait on anymore (everything else lives in this device's
// own IndexedDB, see localDb.js). Shown once per device, right at
// startup; skipped automatically on every later launch as long as a key
// is still saved.
//
// Needs geminiClient.js loaded first (uses hasGeminiApiKey/setGeminiApiKey).
//
// Usage from app.js: window.onload should be:
//   window.onload = async () => {
//       await waitForGeminiKey();
//       ...rest as before...
//   }

(function () {
    // The app's original #app-loading-overlay (base.css/index.html) was
    // designed to hide itself automatically once the old server's initial
    // fetches finished (see loadingOverlay.js) — a timing assumption that
    // no longer holds now that startup can pause on a person filling in
    // this form. This is the first script in the startup chain now (no
    // more connection/login gates before it), so it force-hides that
    // overlay directly, the same way connectionGate.js used to.
    const legacyLoadingOverlay = document.getElementById('app-loading-overlay');
    if (legacyLoadingOverlay) legacyLoadingOverlay.style.display = 'none';

    let resolveReady;
    const readyPromise = new Promise((resolve) => { resolveReady = resolve; });
    window.waitForGeminiKey = () => readyPromise;

    function buildForm() {
        const overlay = document.createElement('div');
        overlay.id = 'gemini-key-gate-overlay';
        overlay.innerHTML = `
            <style>
                #gemini-key-gate-overlay {
                    position: fixed; inset: 0; z-index: 99999;
                    background: #1a1a1a; color: #eee;
                    display: flex; align-items: center; justify-content: center;
                    font-family: -apple-system, system-ui, sans-serif;
                }
                #gemini-key-gate-box { width: 100%; max-width: 360px; padding: 24px; }
                #gemini-key-gate-box h1 { font-size: 1.3rem; margin-bottom: 8px; text-align: center; }
                #gemini-key-gate-box p { font-size: 0.8rem; color: #999; margin-bottom: 16px; text-align: center; }
                #gemini-key-gate-box label { font-size: 0.8rem; color: #aaa; display: block; margin-top: 12px; }
                #gemini-key-gate-box input {
                    width: 100%; box-sizing: border-box; padding: 12px; margin-top: 4px;
                    border-radius: 8px; border: 1px solid #444; background: #2a2a2a; color: #eee; font-size: 0.95rem;
                }
                #gemini-key-gate-box button {
                    width: 100%; margin-top: 16px; padding: 14px; border-radius: 8px; border: none;
                    background: #4a7dff; color: white; font-size: 1rem; font-weight: 600;
                }
                #gemini-key-gate-error { color: #ff6b6b; font-size: 0.85rem; margin-top: 10px; min-height: 1.2em; text-align: center; }
                #gemini-key-gate-link { display: block; text-align: center; margin-top: 14px; font-size: 0.8rem; color: #7ea6ff; }
                #gemini-key-gate-box .field-hint { font-size: 0.72rem; color: #777; margin-top: 4px; line-height: 1.4; }
            </style>
            <div id="gemini-key-gate-box">
                <h1>Connect your Gemini API key</h1>
                <p>One-time setup for this device. Needed for translation, dictionary lookups, audio transcription and text-to-speech.</p>
                <label for="gemini-key-gate-key">Gemini API key</label>
                <input id="gemini-key-gate-key" type="text" placeholder="Paste your API key" autocomplete="off" />
                <div class="field-hint">Google AI Studio (link below) → "API Keys" in the left sidebar → copy the key already listed there for this project.</div>
                <button id="gemini-key-gate-submit">Save and continue</button>
                <div id="gemini-key-gate-error"></div>
                <a id="gemini-key-gate-link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Get a key from Google AI Studio</a>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('gemini-key-gate-submit').addEventListener('click', () => {
            const key = document.getElementById('gemini-key-gate-key').value.trim();
            const errorEl = document.getElementById('gemini-key-gate-error');

            if (!key) {
                errorEl.textContent = 'Please enter your Gemini API key.';
                return;
            }

            setGeminiApiKey(key);
            overlay.remove();
            resolveReady();
        });
    }

    if (hasGeminiApiKey()) {
        resolveReady();
    } else {
        buildForm();
    }
})();