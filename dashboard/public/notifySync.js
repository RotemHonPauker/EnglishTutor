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
// re-render, etc). Testing showed OneSignal.Notifications.requestPermission()
// hangs forever (no native prompt ever appears, no error, no resolve) when
// it's reached after other async work has already run since the click —
// Chrome silently refuses to show a permission prompt once it decides the
// call isn't tied closely enough to a real user gesture any more. This
// function does NOT sync to the Worker itself any more (it used to) —
// the caller does that afterward, once it knows the final slot state, so a
// slot created concurrently with this call isn't missed by an early sync.
async function requestNotificationPermission() {
    // TEMPORARY DEBUG — every theory tried so far (user-gesture timing,
    // alert()s delaying things, OneSignal init not finished yet) still
    // ends in the same inconsistent hang/fake-success, even with the
    // Web Push platform now configured in OneSignal's dashboard (0 real
    // subscribers there throughout). This test bypasses OneSignal
    // entirely first — plain Notification.requestPermission(), nothing
    // OneSignal-related — to see whether the browser's own native
    // permission flow works at all on its own, independent of OneSignal's
    // subscribe logic. Remove once this is confirmed fixed.
    alert('[debug] requestNotificationPermission called'); // confirms the function is even reached
    if (typeof Notification === 'undefined') {
        alert('[debug] Notification API unavailable');
        return;
    }

    alert('[debug] checkpoint 2 — about to call Notification.requestPermission()');

    const rawStart = Date.now();
    let rawResult;
    try {
        const rawTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('RAW_TIMEOUT_8S')), 8000));
        rawResult = await Promise.race([Notification.requestPermission(), rawTimeout]);
    } catch (err) {
        rawResult = 'ERROR: ' + (err && err.message ? err.message : err);
    }

    alert('[debug] checkpoint 3 — RAW call settled: ' + rawResult);

    let debugMsg = '[debug] RAW Notification.requestPermission(): ' + rawResult + ' (' + (Date.now() - rawStart) + 'ms). ';

    if (typeof OneSignal === 'undefined') {
        alert(debugMsg + 'OneSignal undefined.');
        if (typeof updateSlotsPermissionWarning === 'function') updateSlotsPermissionWarning();
        return;
    }

    // Waits for OneSignal.init() to have actually finished (see index.html)
    // before doing anything else — testing showed inconsistent results
    // (sometimes hanging, sometimes "succeeding" without a real
    // subscription) when the SDK wasn't fully initialized yet. This
    // normally resolves instantly, since init() finishes well before a
    // person can tap anything — but guards the rare case where it hasn't.
    if (typeof window.oneSignalReady !== 'undefined') {
        await window.oneSignalReady;
    }

    const currentPermission = (typeof Notification !== 'undefined') ? Notification.permission : 'unavailable';
    debugMsg += 'OneSignal: permission was: ' + currentPermission + '. ';

    try {
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_8S')), 8000));
        const action = (currentPermission === 'granted')
            ? OneSignal.User.PushSubscription.optIn()
            : OneSignal.Notifications.requestPermission();
        await Promise.race([action, timeout]);

        const subId = OneSignal.User?.PushSubscription?.id || null;
        const optedIn = OneSignal.User?.PushSubscription?.optedIn;
        debugMsg += 'Done. PushSubscription.id: ' + subId + ' | optedIn: ' + optedIn + ' | permission now: ' + (typeof Notification !== 'undefined' ? Notification.permission : 'n/a');

        // Checks the RAW browser-level push subscription directly (not
        // through OneSignal at all) — this tells us whether the actual
        // handshake with the browser's push service (Google's FCM, for
        // Chrome) succeeded, independent of whatever OneSignal's own
        // "optedIn" bookkeeping says. OneSignal's dashboard is showing 0
        // real subscribers despite optedIn:true client-side, so this
        // narrows down whether the browser itself ever got a subscription
        // at all.
        try {
            const reg = await navigator.serviceWorker.ready;
            const rawSub = await reg.pushManager.getSubscription();
            debugMsg += ' | RAW browser subscription: ' + (rawSub ? ('endpoint=' + rawSub.endpoint.slice(0, 60) + '...') : 'NONE');
        } catch (rawErr) {
            debugMsg += ' | RAW check threw: ' + (rawErr && rawErr.message ? rawErr.message : rawErr);
        }
    } catch (err) {
        debugMsg += 'Threw or timed out: ' + (err && err.message ? err.message : err);
        console.error('Notification permission request failed:', err);
    }

    alert(debugMsg);
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