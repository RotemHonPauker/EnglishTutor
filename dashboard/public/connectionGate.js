// connectionGate.js — before anything else can run (including login),
// the app needs to know which Supabase project to talk to. Shows a
// one-time "Connect" form (Project URL + anon key) the first time there's
// nothing saved yet, then builds the actual client (initSupabaseClient,
// from supabaseClient.js) and remembers the values in localStorage for
// every later launch on this device — same one-time pattern as the
// Gemini key and the login session, just for a different pair of values.
// Needs supabaseClient.js loaded first. authGate.js must wait for this
// (via waitForSupabaseConnection()) before it touches `supabase` at all.

(function () {
    // The app's original #app-loading-overlay (base.css/index.html) was
    // designed to hide itself automatically once the old server's initial
    // fetches finished (see loadingOverlay.js) — a timing assumption that
    // no longer holds now that startup can pause on a person filling in a
    // form. Rather than depend on this overlay's own z-index/CSS (unknown
    // from here, and not worth coupling to), this gate — the first of the
    // three new startup scripts to run — just force-hides it directly, so
    // it can never sit on top of (or merely alongside) the connection
    // form, the login screen, or the Gemini key screen that follow it.
    const legacyLoadingOverlay = document.getElementById('app-loading-overlay');
    if (legacyLoadingOverlay) legacyLoadingOverlay.style.display = 'none';

    let resolveReady;
    const readyPromise = new Promise((resolve) => { resolveReady = resolve; });
    window.waitForSupabaseConnection = () => readyPromise;

    function buildForm() {
        const overlay = document.createElement('div');
        overlay.id = 'connection-gate-overlay';
        overlay.innerHTML = `
            <style>
                #connection-gate-overlay {
                    position: fixed; inset: 0; z-index: 99999;
                    background: #1a1a1a; color: #eee;
                    display: flex; align-items: center; justify-content: center;
                    font-family: -apple-system, system-ui, sans-serif;
                }
                #connection-gate-box { width: 100%; max-width: 360px; padding: 24px; }
                #connection-gate-box h1 { font-size: 1.3rem; margin-bottom: 8px; text-align: center; }
                #connection-gate-box p { font-size: 0.8rem; color: #999; margin-bottom: 16px; text-align: center; }
                #connection-gate-box label { font-size: 0.8rem; color: #aaa; display: block; margin-top: 12px; }
                #connection-gate-box input {
                    width: 100%; box-sizing: border-box; padding: 12px; margin-top: 4px;
                    border-radius: 8px; border: 1px solid #444; background: #2a2a2a; color: #eee; font-size: 0.95rem;
                }
                #connection-gate-box button {
                    width: 100%; margin-top: 16px; padding: 14px; border-radius: 8px; border: none;
                    background: #4a7dff; color: white; font-size: 1rem; font-weight: 600;
                }
                #connection-gate-error { color: #ff6b6b; font-size: 0.85rem; margin-top: 10px; min-height: 1.2em; text-align: center; }
                #connection-gate-box .field-hint { font-size: 0.72rem; color: #777; margin-top: 4px; line-height: 1.4; }
                #connection-gate-link { display: block; text-align: center; margin-top: 14px; font-size: 0.8rem; color: #7ea6ff; }
            </style>
            <div id="connection-gate-box">
                <h1>Connect to your Supabase database</h1>
                <p>One-time setup for this device — these two values just point the app at your project; they're saved on this device only.</p>
                <label for="connection-gate-url">Project URL</label>
                <input id="connection-gate-url" type="text" placeholder="https://xxxxx.supabase.co" autocomplete="off" />
                <div class="field-hint">Supabase dashboard → your project → "Connect" button (top of page) → Framework tab → .env.local → "NEXT_PUBLIC_SUPABASE_URL".</div>
                <label for="connection-gate-key">Publishable key</label>
                <input id="connection-gate-key" type="text" placeholder="sb_publishable_... or eyJ..." autocomplete="off" />
                <div class="field-hint">Same panel → .env.local → "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" (older projects may still call this the "anon key" — same value).</div>
                <button id="connection-gate-submit">Save and continue</button>
                <div id="connection-gate-error"></div>
                <a id="connection-gate-link" href="https://supabase.com/dashboard/projects" target="_blank" rel="noopener">Open your Supabase dashboard</a>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('connection-gate-submit').addEventListener('click', () => {
            const url = document.getElementById('connection-gate-url').value.trim();
            const anonKey = document.getElementById('connection-gate-key').value.trim();
            const errorEl = document.getElementById('connection-gate-error');

            if (!url || !anonKey) {
                errorEl.textContent = 'Both fields are required.';
                return;
            }
            if (!/^https:\/\/.+\.supabase\.co\/?$/.test(url)) {
                errorEl.textContent = "That doesn't look like a Supabase Project URL.";
                return;
            }

            saveSupabaseConfig(url, anonKey);
            initSupabaseClient(url, anonKey);
            overlay.remove();
            resolveReady();
        });
    }

    const saved = getSavedSupabaseConfig();
    if (saved.url && saved.anonKey) {
        initSupabaseClient(saved.url, saved.anonKey);
        resolveReady();
    } else {
        buildForm();
    }
})();