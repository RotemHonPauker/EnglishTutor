// Login screen — blocks the rest of the app until there's a valid
// Supabase Auth session. Loads before every other script (see index.html)
// except connectionGate.js, which it waits on first — `supabase` isn't a
// real client yet until that gate resolves (it may need to show its own
// one-time "Connect to database" form before this file can do anything).
//
// Usage from app.js (to be updated in a later step): the very first line
// of window.onload should be:
//   window.onload = async () => { await waitForAuth(); ...rest as before... }
// so no remoteDb/geminiClient call ever runs before a session is confirmed.

(function () {
    let resolveAuthReady;
    const authReadyPromise = new Promise((resolve) => { resolveAuthReady = resolve; });
    window.waitForAuth = () => authReadyPromise;

    function buildOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'auth-gate-overlay';
        overlay.innerHTML = `
            <style>
                #auth-gate-overlay {
                    position: fixed; inset: 0; z-index: 99999;
                    background: #1a1a1a; color: #eee;
                    display: flex; align-items: center; justify-content: center;
                    font-family: -apple-system, system-ui, sans-serif;
                }
                #auth-gate-box { width: 100%; max-width: 320px; padding: 24px; }
                #auth-gate-box h1 { font-size: 1.4rem; margin-bottom: 4px; text-align: center; }
                #auth-gate-box p { font-size: 0.8rem; color: #999; margin: 0 0 16px; text-align: center; }
                #auth-gate-box input {
                    width: 100%; box-sizing: border-box; padding: 12px; margin-top: 10px;
                    border-radius: 8px; border: 1px solid #444; background: #2a2a2a; color: #eee; font-size: 1rem;
                }
                #auth-gate-box button {
                    width: 100%; margin-top: 16px; padding: 14px; border-radius: 8px; border: none;
                    background: #4a7dff; color: white; font-size: 1rem; font-weight: 600;
                }
                #auth-gate-box button:disabled { background: #555; }
                #auth-gate-error { color: #ff6b6b; font-size: 0.85rem; margin-top: 10px; min-height: 1.2em; text-align: center; }
            </style>
            <div id="auth-gate-box">
                <h1>Sign in to your database 🔒</h1>
                <p>This is the single Supabase account that's allowed to access your data (sign-ups are disabled) — not a new account. Use the email and password you set when you created that account in the Supabase dashboard under Authentication → Users.</p>
                <input id="auth-gate-email" type="email" placeholder="Email" autocomplete="username" />
                <input id="auth-gate-password" type="password" placeholder="Password" autocomplete="current-password" />
                <button id="auth-gate-submit">Sign in</button>
                <div id="auth-gate-error"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        const emailInput = document.getElementById('auth-gate-email');
        const passwordInput = document.getElementById('auth-gate-password');
        const submitBtn = document.getElementById('auth-gate-submit');
        const errorEl = document.getElementById('auth-gate-error');

        async function attemptLogin() {
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            if (!email || !password) return;

            submitBtn.disabled = true;
            submitBtn.textContent = '...';
            errorEl.textContent = '';

            const { error } = await sb.auth.signInWithPassword({ email, password });

            if (error) {
                errorEl.textContent = 'Sign-in failed — check email/password';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Sign in';
                return;
            }
            // onAuthStateChange (below) handles removing the overlay and
            // resolving waitForAuth().
        }

        submitBtn.addEventListener('click', attemptLogin);
        passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptLogin(); });
    }

    function removeOverlay() {
        const overlay = document.getElementById('auth-gate-overlay');
        if (overlay) overlay.remove();
    }

    let resolved = false;
    function handleSession(session) {
        if (session && !resolved) {
            resolved = true;
            removeOverlay();
            resolveAuthReady();
        } else if (!session) {
            // No session (or just signed out) — show the login screen if
            // it isn't already up.
            if (!document.getElementById('auth-gate-overlay')) buildOverlay();
        }
    }

    // Everything below needs a real `supabase` client — wait for
    // connectionGate.js first (it may itself be waiting on the person to
    // fill in a one-time "Connect to database" form).
    (async function start() {
        await waitForSupabaseConnection();

        sb.auth.onAuthStateChange((_event, session) => handleSession(session));

        // Initial check — the session may already exist (persisted by the
        // Supabase SDK itself in localStorage).
        const { data } = await sb.auth.getSession();
        handleSession(data.session);
    })();
})();