// notifySync.js — keeps the Cloudflare Worker backend's (fraza-notify)
// stored copy of this device's slots/timezone/push-subscription-id up to
// date. The Worker's own cron decides when a reminder actually fires and
// talks to OneSignal directly; this file never does either.
// Needs localDb.js (getAllSlots) and the OneSignal Web SDK (index.html's
// window.OneSignalDeferred) loaded first.

const NOTIFY_WORKER_URL = 'https://fraza-notify.rotemhon.workers.dev';
const DEVICE_ID_STORAGE_KEY = 'fraza-device-id';

// Random id generated once per browser — there's no login, so this is what
// distinguishes one device's slots from another's in the Worker's storage.
function getOrCreateDeviceId() {
    try {
        let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
        if (!id) {
            id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
            localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
        }
        return id;
    } catch (err) {
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

async function getOneSignalSubscriptionId() {
    try {
        if (typeof OneSignal === 'undefined') return null;
        return OneSignal.User?.PushSubscription?.id || null;
    } catch (err) {
        return null;
    }
}

// Fire-and-forget: a failed sync just leaves the Worker's copy stale until
// the next successful one.
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
                enabled: s.enabled !== false
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

// Called from slots.js as the direct user gesture for creating/enabling a
// slot. IMPORTANT: the caller must call this as close as possible to the
// actual click — before any other await — or Chrome may silently refuse
// to show the permission prompt. Does not sync to the Worker itself; the
// caller does that afterward once it knows the final slot state.
// IMPORTANT #2: never wrap requestPermission()/optIn() below in a
// Promise.race() timeout — a real permission prompt waits indefinitely for
// an actual tap, and racing it against a timeout can report a false
// "timeout" while the native prompt is still open on screen.
async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') return;

    // This wait (for OneSignal.init() to finish) is safe to time out —
    // unlike the permission prompt below, no user interaction is involved.
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
            await OneSignal.User.PushSubscription.optIn();
        } else {
            await OneSignal.Notifications.requestPermission();
        }
    } catch (err) {
        console.error('Notification permission request failed:', err);
    }

    if (typeof updateSlotsPermissionWarning === 'function') updateSlotsPermissionWarning();
}

// Also sync once automatically on every app load/reload (covers the reload
// after a backup Import, and drift from a missed sync) — delayed so the
// app's own startup finishes first.
window.addEventListener('load', () => {
    setTimeout(syncSlotsToNotifyServer, 1500);
});