// supabaseClient.js — no Project URL or anon key hardcoded here anymore.
// Both are entered once (like the Gemini key) and saved to this device's
// localStorage by connectionGate.js, which also actually creates the
// `sb` client below once it has them. This file just holds the shared
// pieces connectionGate.js needs: where the values are stored, and how
// to build the client once they're known.
//
// Our own client is named `sb`, not `supabase` — the Supabase CDN
// library (the <script src="...supabase-js@2"> tag, loaded before this
// file) already defines its own global called `supabase` (the namespace
// object with .createClient() on it). Naming our client the same thing
// caused a real "Identifier 'supabase' has already been declared"
// SyntaxError, since both ended up being top-level declarations sharing
// one global scope. `window.supabase` below is that library namespace;
// `sb` is our actual client instance, used everywhere else in the app
// (remoteDb.js, authGate.js) to query the database.
//
// Note: unlike the Gemini key, the anon key was never meant to be a true
// secret — Supabase's Row Level Security (see 01-user-id-and-rls.sql) is
// what actually protects the data, regardless of whether this key is
// visible. Keeping it out of the published source isn't adding real
// protection on top of RLS; it mainly avoids GitHub's automated secret
// scanners flagging it, and keeps a stranger from seeing at a glance
// which Supabase project this is. Never put the service_role key
// anywhere in this app, in any form — that one IS secret, and bypasses
// RLS entirely.

const SUPABASE_URL_STORAGE_KEY = 'fraza-supabase-url';
const SUPABASE_ANON_KEY_STORAGE_KEY = 'fraza-supabase-anon-key';

function getSavedSupabaseConfig() {
    try {
        return {
            url: localStorage.getItem(SUPABASE_URL_STORAGE_KEY) || '',
            anonKey: localStorage.getItem(SUPABASE_ANON_KEY_STORAGE_KEY) || ''
        };
    } catch (e) {
        return { url: '', anonKey: '' };
    }
}

function saveSupabaseConfig(url, anonKey) {
    try {
        localStorage.setItem(SUPABASE_URL_STORAGE_KEY, url);
        localStorage.setItem(SUPABASE_ANON_KEY_STORAGE_KEY, anonKey);
        return true;
    } catch (e) {
        return false;
    }
}

// Starts out null — nothing in this app can call it yet.
// connectionGate.js (loaded right after this file) sets it, either
// immediately (saved config already on this device) or once the
// one-time "Connect" form is submitted.
let sb = null;

function initSupabaseClient(url, anonKey) {
    sb = window.supabase.createClient(url, anonKey);
    return sb;
}