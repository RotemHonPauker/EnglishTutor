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
// immediately in that case, so it's always safe to call. Syncs right
// after, so a subscription id that just appeared reaches the Worker
// immediately, and refreshes the Slots tab's "blocked" banner
// (updateSlotsPermissionWarning, slots.js) so it reflects the outcome
// right away rather than waiting for the next tab load.
async function requestNotificationPermission() {
    if (typeof OneSignal !== 'undefined') {
        try {
            await OneSignal.Notifications.requestPermission();
        } catch (err) {
            console.error('Notification permission request failed:', err);
        }
    } // else: OneSignal hasn't finished loading yet (rare — only right at
      // page load); the next toggle/create/reload will pick it up.
    await syncSlotsToNotifyServer();
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