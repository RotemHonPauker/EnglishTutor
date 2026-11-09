// notifySync.js — bridges this device's Slots to the Cloudflare Worker
// backend (fraza-notify) that actually decides when to send a reminder
// and asks OneSignal to deliver it. This file only keeps the Worker's
// stored copy of THIS device's slots/timezone/push-subscription-id up to
// date — it never decides when a notification fires (the Worker's own
// cron does that) and never talks to OneSignal's send API directly (only
// the Worker has the secret key for that).
//
// Needs localDb.js (getAllSlots) and the OneSignal Web SDK (loaded in
// index.html, via window.OneSignalDeferred) loaded first.

const NOTIFY_WORKER_URL = 'https://fraza-notify.rotemhon.workers.dev';
const DEVICE_ID_STORAGE_KEY = 'fraza-device-id';

// A random id generated once per browser and never changed — this IS the
// "account" as far as the Worker is concerned (there's no login; see the
// architecture discussion — this id is the only thing distinguishing one
// device's slots from another's in the Worker's storage). If browser
// storage is ever cleared, the device just starts syncing under a fresh
// id going forward; the local Slots themselves are unaffected, since
// those live in IndexedDB, not here.
function getOrCreateDeviceId() {
    try {
        let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
        if (!id) {
            id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
            localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
        }
        return id;
    } catch (err) {
        // localStorage unavailable (private-mode edge cases) — an
        // in-memory id for this page load only; nothing persists across
        // reloads in that case, but the app still works otherwise.
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}

function getDeviceTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (err) {
        return 'UTC';
    }
}

// The OneSignal subscription id for push on THIS browser, or null if the
// person hasn't granted push permission yet (or OneSignal hasn't finished
// loading). Syncing with a null id is still useful — it keeps the
// Worker's record of this device's slots/timezone current even before
// notifications are turned on — the Worker just has nothing to send to
// until a real id shows up on a later sync.
async function getOneSignalSubscriptionId() {
    try {
        if (typeof OneSignal === 'undefined') return null;
        return OneSignal.User?.PushSubscription?.id || null;
    } catch (err) {
        return null;
    }
}

// Gathers every slot across every routine (not just the active one — the
// Worker needs the full picture to know what's due for this device) and
// pushes it, with this device's timezone and OneSignal subscription id,
// to the Worker's /sync endpoint.
//
// Fire-and-forget by design: a failed sync (offline, Worker down) just
// means the Worker's copy goes stale until the next successful one —
// never blocks or interrupts whatever the person was doing with Slots.
async function syncSlotsToNotifyServer() {
    try {
        const allSlots = (typeof getAllSlots === 'function') ? await getAllSlots() : [];
        const oneSignalPlayerId = await getOneSignalSubscriptionId();

        const body = {
            deviceId: getOrCreateDeviceId(),
            timezone: getDeviceTimezone(),
            oneSignalPlayerId,
            slots: allSlots.map(s => ({
                id: s.id,
                name: s.name || '',
                start_minutes: s.start_minutes,
                end_minutes: s.end_minutes,
                enabled: s.enabled !== false // a slot saved before this field existed is treated as on, same default used everywhere else
            }))
        };

        await fetch(`${NOTIFY_WORKER_URL}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (err) {
        console.error('Notify sync failed (will retry on the next slot change):', err);
    }
}

// Called from slots.js whenever creating or turning on a reminder is the
// explicit user gesture browsers require before prompting for push
// permission (there's no separate dedicated button for this any more — see
// index.html). A no-op prompt-wise if permission was already decided
// (granted or denied) — OneSignal's own requestPermission() just resolves
// immediately in that case, so it's always safe to call.
//
// IMPORTANT: the caller (slots.js) must call this as close as possible to
// the actual click/tap — before any other await (an IndexedDB write, a
// re-render, etc). Chrome may silently refuse to show the permission
// prompt at all once it decides the call isn't tied closely enough to a
// real user gesture any more. This function does NOT sync to the Worker
// itself any more (it used to) — the caller does that afterward, once it
// knows the final slot state, so a slot created concurrently with this
// call isn't missed by an early sync.
//
// IMPORTANT #2 — do not wrap the actual requestPermission()/optIn() call
// below in a Promise.race() timeout. A real browser permission prompt
// waits indefinitely for an actual tap/click from the person — there's no
// way to know in advance how long that takes, and nothing is wrong if it
// takes a few seconds. An earlier version of this code raced that call
// against an 8-second timeout (while debugging a suspected OneSignal
// hang) combined with a chain of alert() debug popups. That combination
// was itself the real bug: each alert() is a blocking native dialog, so
// while the person was still reading/dismissing one, the 8-second timer
// kept running in the background regardless — and the code gave up on,
// and reported a "timeout" for, a permission request that was actually
// still open on screen, patiently waiting for a tap that hadn't happened
// yet. Confirmed on a real device: the native "Allow/Block" prompt
// appeared correctly every single time; our own artificial timeout (plus
// the alert()s racing against it) was just abandoning it before there was
// ever a real chance to answer it.
async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') return;

    // Waits for OneSignal.init() to have actually finished (see index.html)
    // before doing anything else. This one IS safe to time out — unlike
    // the permission prompt below, it's a plain network/setup call with no
    // user interaction involved, so if it hasn't resolved after 15s
    // something has genuinely gone wrong (rather than just "waiting on a
    // tap"), and giving up is the right call.
    if (typeof window.oneSignalReady !== 'undefined') {
        try {
            const initTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('INIT_TIMEOUT_15S')), 15000));
            await Promise.race([window.oneSignalReady, initTimeout]);
        } catch (initErr) {
            console.error('OneSignal.init() did not finish in time:', initErr);
            if (typeof updateSlotsPermissionWarning === 'function') updateSlotsPermissionWarning();
            return;
        }
    }

    if (typeof OneSignal === 'undefined') {
        if (typeof updateSlotsPermissionWarning === 'function') updateSlotsPermissionWarning();
        return;
    }

    try {
        const currentPermission = Notification.permission;
        if (currentPermission === 'granted') {
            // Already granted at the browser level (e.g. re-enabling a
            // slot after opting out) — just (re)opt in with OneSignal,
            // no native prompt involved.
            await OneSignal.User.PushSubscription.optIn();
        } else {
            // Shows the native browser prompt and waits for the actual
            // tap — see the big comment above on why this must not be
            // raced against a timeout.
            await OneSignal.Notifications.requestPermission();
        }
    } catch (err) {
        console.error('Notification permission request failed:', err);
    }

    if (typeof updateSlotsPermissionWarning === 'function') updateSlotsPermissionWarning(); // slots.js
}

// Also sync once automatically on every app load/reload — covers the
// page reload that follows a backup Import (see backup.js), and general
// drift if an earlier sync was missed (offline, etc.). The short delay
// lets the rest of the app's own startup (opening the database, loading
// routines) finish first.
window.addEventListener('load', () => {
    setTimeout(syncSlotsToNotifyServer, 1500);
});