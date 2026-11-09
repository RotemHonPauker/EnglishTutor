// slots.js — the Slots screen: the repurposed former-Analytics tab slot
// in the bottom nav, now used to manage time-of-day reminders for the
// currently active Routine (see localDb.js's Slots section for the
// underlying data: start/end minutes, name, space_id, tag_ids).
//
// Two views live here:
//   1. The per-routine Slots list (#view-slots) — scoped to activeSpaceId,
//      showing only that routine's own slots and only that routine's own
//      tags in the add/edit form. This is the main, everyday view.
//   2. The "view full day" overlay (#full-day-modal-overlay) — reachable
//      from a button on the Slots screen — merges every slot from every
//      Routine into one time-sorted list, color-coded per routine. This
//      is the ONLY place slots from different routines are shown
//      together; the per-routine list never leaks another routine's
//      slots in.
//
// Needs localDb.js (getSlots/getAllSlots/createSlot/updateSlot/deleteSlot/
// findOverlappingSlot), spacesState.js (spaces/activeSpaceId/getActiveSpace)
// and tags.js (tags) loaded first. COLORS (colorUtils.js) is reused for the
// full-day overlay's per-routine color coding.

let slots = []; // the ACTIVE routine's own slots only

// ===== Time text inputs (always 24-hour — "20:00", never "8:00 PM") =====
// A native <input type="time"> renders in whatever 12h/24h format the
// browser/OS locale picks, and a <select> dropdown works around that but
// isn't what was wanted here — manual typing instead. So this is a plain
// <input type="text"> (inputmode="numeric" for a numeric keypad on
// mobile), auto-formatted as digits are typed ("2000" -> "20:00" as the
// 3rd digit lands) and strictly validated as 24-hour HH:MM on submit — the
// displayed text is always exactly what's typed, never reformatted by the
// browser into a locale-specific shape. Minutes are still stored as
// minutes-since-midnight (0-1439) for the overlap arithmetic (see
// localDb.js's slotRangesOverlap); these helpers convert to/from that.

// Called on the input's own oninput (index.html) as the person types —
// inserts the ":" automatically once there are enough digits, and caps
// input at 4 digits (HHMM) so it can never grow past "23:59".
function formatSlotTimeInput(el) {
    const caretWasAtEnd = el.selectionStart === el.value.length;
    const digits = el.value.replace(/\D/g, '').slice(0, 4);
    const formatted = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    el.value = formatted;
    if (caretWasAtEnd) el.setSelectionRange(formatted.length, formatted.length);
}

// Strict "H:MM" / "HH:MM" parse, 24-hour range only. Returns
// minutes-since-midnight, or null if the text isn't a valid time at all
// (caller shows an error — this never guesses or clamps a bad value).
function parseTimeInputMinutes(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec((value || '').trim());
    if (!match) return null;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
}

// Always zero-padded both sides ("08:00", "20:00") — used to populate the
// field when opening the modal for an existing slot, or the default for a
// new one.
function minutesToTimeInputValue(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Short, human label for a time range, e.g. "7:00–7:30".
function formatSlotRange(startMinutes, endMinutes) {
    const label = (mins) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m === 0 ? `${h}:00` : `${h}:${String(m).padStart(2, '0')}`;
    };
    return `${label(startMinutes)}–${label(endMinutes)}`;
}

// ===== Which slot is active right now? =====
// Global across every routine, not just the active one — used by
// translationEngine.js (restricting a captured phrase's candidate tags to
// the active slot's own tags, instead of the whole routine's tag list)
// and by globalRecord.js (deciding which routine to route a fresh
// recording's transcript into). At most one slot can ever match at a
// given instant, since overlapping slots are blocked at creation time
// regardless of which routine they belong to (see localDb.js's
// findOverlappingSlot) — so there's nothing to disambiguate here.
async function findActiveSlotNow() {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const all = await getAllSlots();
    return all.find(s => s.start_minutes <= nowMinutes && nowMinutes < s.end_minutes) || null;
}

// ===== Deterministic per-routine color (for the full-day overlay) =====
// Routines have no color field of their own today — this derives a
// stable pick from the existing tag-color palette (colorUtils.js) purely
// for telling routines apart on the merged timeline. Nothing here is
// saved; the same routine id always hashes to the same color, which is
// all the overlay needs.

function routineColorForId(spaceId) {
    if (!spaceId || typeof COLORS === 'undefined' || !COLORS.length) return '#333';
    let hash = 0;
    for (let i = 0; i < spaceId.length; i++) {
        hash = (hash * 31 + spaceId.charCodeAt(i)) >>> 0;
    }
    return COLORS[hash % COLORS.length];
}

// ===== Entering / leaving the tab =====

function enterSlotsTab(btnEl) {
    showView('slots', btnEl);
    loadSlotsScreen();
}

// Called on initial load and on every routine switch (spacesState.js) —
// same pattern as renderSpaceRulesForm/renderAnalyticsChart: safe to call
// even when the Slots view isn't the one currently on screen, since it
// just no-ops if the view's elements aren't there, and otherwise leaves
// it already up to date for the next time the tab is opened.
async function loadSlotsScreen() {
    const list = document.getElementById('slots-list');
    if (!list) return; // not on the Slots tab yet

    const active = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    if (!active) {
        slots = [];
        list.innerHTML = '<div class="recording-info-note">👋<br>No routine yet — create one first from the title above.</div>';
        return;
    }

    slots = await getSlots(activeSpaceId);
    renderSlotsList();
    updateSlotsPermissionWarning();
}

// Shows the "notifications are blocked" banner (index.html) whenever the
// browser's own push permission is currently denied — checked every time
// the tab loads, and again right after any attempt to request permission
// (see notifySync.js's requestNotificationPermission), so it never shows
// stale info. A reminder's own on/off toggle is a separate, per-reminder
// concern (see renderSlotsList/toggleSlotEnabled) from this: this banner is
// about whether the browser will deliver ANY notification at all,
// regardless of which reminders are individually turned on.
function updateSlotsPermissionWarning() {
    const warning = document.getElementById('slots-permission-warning');
    if (!warning) return;
    const blocked = typeof Notification !== 'undefined' && Notification.permission === 'denied';
    warning.style.display = blocked ? '' : 'none';
}

// Re-renders just the list (and the tag picker, if the add/edit modal is
// open) without re-fetching — called from tags.js's loadTags() whenever
// the active routine's tags change (added, renamed, recolored, deleted,
// merged), so a slot's tag chips and the picker's choices never show a
// stale name/color.
function refreshSlotsAfterTagsChanged() {
    if (document.getElementById('slots-list')) renderSlotsList();
    if (document.getElementById('slot-modal-overlay')?.style.display === 'flex') {
        renderSlotTagPicker();
    }
}

// ===== Rendering the per-routine list =====

function renderSlotsList() {
    const list = document.getElementById('slots-list');
    if (!list) return;

    if (!slots.length) {
        list.innerHTML = '<div class="slots-empty">No reminders yet for this routine — add one to get notified when it\'s time to record.</div>';
        return;
    }

    list.innerHTML = slots.map(s => {
        const tagChips = (s.tag_ids || [])
            .map(id => tags.find(t => t.id === id))
            .filter(Boolean)
            .map(t => {
                const contrast = getContrastColor(t.color);
                return `<span class="slot-tag-chip" style="background:${t.color || '#333'}; color:${contrast}">${escapeHtml(t.name)}</span>`;
            }).join('');

        // A slot saved before this toggle existed has no `enabled` field at
        // all — treated as on (true), same as a freshly created one, never
        // as silently off.
        const enabled = s.enabled !== false;

        // Time, name, and tags all sit in one row now (no wrapping to a
        // second line) — the first tag stays inline, and any further tags
        // stack vertically underneath it in their own narrow column,
        // rather than wrapping the whole row. Deleting is modal-only now
        // (the edit modal's own Delete button) — removing the card's own
        // trash icon freed up the room for this. See .disabled below for
        // the dimmed look when the toggle is off.
        return `
        <div class="slot-card${enabled ? '' : ' disabled'}">
            <div class="slot-card-main" onclick="openSlotModal('${s.id}')">
                <div class="slot-card-time">${formatSlotRange(s.start_minutes, s.end_minutes)}</div>
                <div class="slot-card-text">${escapeHtml(s.name || '')}</div>
                ${tagChips ? `<div class="slot-card-tags">${tagChips}</div>` : ''}
            </div>
            <label class="slot-enable-toggle" title="${enabled ? 'Reminder on — tap to turn off' : 'Reminder off — tap to turn on'}">
                <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleSlotEnabled('${s.id}', ${enabled})">
                <span class="slot-enable-toggle-track"></span>
            </label>
        </div>
        `;
    }).join('');
}

// ===== Add/edit modal =====

let editingSlotId = null;
let selectedSlotTagIds = new Set();

function openSlotModal(slotId) {
    const active = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    if (!active) return;

    editingSlotId = slotId || null;
    const slot = slotId ? slots.find(s => s.id === slotId) : null;

    document.getElementById('slot-modal-title').textContent = slot ? 'Edit reminder' : 'New reminder';
    document.getElementById('slot-start-time').value = minutesToTimeInputValue(slot ? slot.start_minutes : 8 * 60);
    document.getElementById('slot-end-time').value = minutesToTimeInputValue(slot ? slot.end_minutes : 8 * 60 + 30);
    document.getElementById('slot-name-input').value = slot ? (slot.name || '') : '';
    document.getElementById('slot-modal-error').style.display = 'none';
    document.getElementById('slot-modal-error').textContent = '';

    const deleteBtn = document.getElementById('slot-modal-delete-btn');
    if (deleteBtn) deleteBtn.style.display = slot ? '' : 'none';

    selectedSlotTagIds = new Set(slot ? (slot.tag_ids || []) : []);
    renderSlotTagPicker();

    document.getElementById('slot-modal-overlay').style.display = 'flex';
}

function closeSlotModal() {
    editingSlotId = null;
    selectedSlotTagIds = new Set();
    document.getElementById('slot-modal-overlay').style.display = 'none';
}

// Only the ACTIVE routine's own tags are offered — avoids tag-list
// clutter/confusion from every other routine's tags, per the agreed
// design. Multi-select: tapping a chip toggles it in/out of the set.
function renderSlotTagPicker() {
    const container = document.getElementById('slot-tag-picker');
    if (!container) return;

    if (!tags.length) {
        container.innerHTML = '<div class="slots-empty">This routine has no tags yet — you can still save this reminder without one.</div>';
        return;
    }

    container.innerHTML = tags.map(t => {
        const contrast = getContrastColor(t.color);
        const selected = selectedSlotTagIds.has(t.id);
        return `<div class="tag-chip ${selected ? 'selected' : ''}" style="background:${t.color || '#333'}; color:${contrast}" onclick="toggleSlotTagChip('${t.id}')">${escapeHtml(t.name)}</div>`;
    }).join('');
}

function toggleSlotTagChip(tagId) {
    if (selectedSlotTagIds.has(tagId)) {
        selectedSlotTagIds.delete(tagId);
    } else {
        selectedSlotTagIds.add(tagId);
    }
    renderSlotTagPicker();
}

function showSlotModalError(message) {
    const err = document.getElementById('slot-modal-error');
    err.textContent = message;
    err.style.display = 'block';
}

// Validates (name present, same-day range, then the hard-block
// cross-routine overlap check — see localDb.js's findOverlappingSlot),
// then creates or updates.
async function submitSlot() {
    const name = document.getElementById('slot-name-input').value.trim();
    if (!name) {
        showSlotModalError('Please give this reminder a name.');
        return;
    }

    const startMinutes = parseTimeInputMinutes(document.getElementById('slot-start-time').value);
    const endMinutes = parseTimeInputMinutes(document.getElementById('slot-end-time').value);

    if (startMinutes === null || endMinutes === null) {
        showSlotModalError('Please enter a valid 24-hour time as HH:MM, e.g. 20:00.');
        return;
    }

    if (endMinutes <= startMinutes) {
        showSlotModalError("End time must be after start time — reminders can't cross midnight yet.");
        return;
    }

    const conflict = await findOverlappingSlot({ startMinutes, endMinutes, excludeId: editingSlotId });
    if (conflict) {
        const conflictSpace = (typeof spaces !== 'undefined' ? spaces : []).find(s => s.id === conflict.space_id);
        const conflictRoutineName = conflictSpace ? conflictSpace.name : 'another routine';
        showSlotModalError(`That overlaps an existing reminder: "${conflict.name}" (${formatSlotRange(conflict.start_minutes, conflict.end_minutes)}, ${conflictRoutineName}). Adjust one of the times first.`);
        return;
    }

    const tagIds = [...selectedSlotTagIds];

    try {
        if (editingSlotId) {
            await updateSlot({ id: editingSlotId, startMinutes, endMinutes, name, tagIds });
        } else {
            await createSlot({ spaceId: activeSpaceId, startMinutes, endMinutes, name, tagIds });
        }
    } catch (err) {
        showSlotModalError(err.message || 'Failed to save reminder.');
        return;
    }

    const isNewSlot = !editingSlotId; // about to be cleared by closeSlotModal — capture first

    closeSlotModal();
    await loadSlotsScreen();

    // A new reminder is created already-on (createSlot's enabled: true
    // default) — that's exactly the kind of gesture that should also ask
    // for push permission, same reasoning as toggleSlotEnabled below, so a
    // first-time user isn't left with an "on" reminder that silently never
    // got permission to actually notify. Editing an existing reminder's
    // time/name/tags doesn't change its on/off state, so a plain sync is
    // enough there.
    if (isNewSlot && typeof requestNotificationPermission === 'function') {
        await requestNotificationPermission(); // notifySync.js — also syncs
    } else if (typeof syncSlotsToNotifyServer === 'function') {
        syncSlotsToNotifyServer(); // notifySync.js
    }
}

// Wired to each reminder's own on/off toggle (renderSlotsList). wasEnabled
// is the state BEFORE this click (captured at render time), so the new
// state is simply its opposite.
async function toggleSlotEnabled(id, wasEnabled) {
    try {
        await setSlotEnabled(id, !wasEnabled); // localDb.js
    } catch (err) {
        alert('Failed to update reminder.');
        await loadSlotsScreen(); // reverts the checkbox's own optimistic UI state back to what's actually stored
        return;
    }
    await loadSlotsScreen();

    // Turning a reminder ON is itself the explicit user gesture browsers
    // require before they'll prompt for push permission — ask right here
    // (a no-op if already granted) instead of needing a separate dedicated
    // button. Turning one off never needs permission, just a sync.
    if (!wasEnabled && typeof requestNotificationPermission === 'function') {
        await requestNotificationPermission(); // notifySync.js — also syncs
    } else if (typeof syncSlotsToNotifyServer === 'function') {
        syncSlotsToNotifyServer(); // notifySync.js
    }
}

// Deleting is modal-only now — open the reminder (tap its card) and use
// the Delete button there. There's no longer a quick-delete icon directly
// on the card itself (see renderSlotsList).
async function deleteSlotFromModal() {
    if (!editingSlotId) return;
    const id = editingSlotId;
    const confirmed = confirm('Delete this reminder? This can\'t be undone.');
    if (!confirmed) return;
    try {
        await deleteSlot(id);
        closeSlotModal();
        await loadSlotsScreen();
        if (typeof syncSlotsToNotifyServer === 'function') syncSlotsToNotifyServer(); // notifySync.js
    } catch (err) {
        showSlotModalError('Failed to delete reminder.');
    }
}

// ===== "View full day" overlay — every routine's slots together =====

async function openFullDayOverlay() {
    // Only on reminders — a reminder someone turned off still exists and
    // can still be edited, but it won't actually notify, so including it
    // here would make this merged timeline misrepresent what's really
    // going to happen today.
    const all = (await getAllSlots()).filter(s => s.enabled !== false);
    const container = document.getElementById('full-day-list');

    if (!all.length) {
        container.innerHTML = '<div class="slots-empty">No active reminders in any routine right now.</div>';
    } else {
        const spaceById = new Map((typeof spaces !== 'undefined' ? spaces : []).map(s => [s.id, s]));
        container.innerHTML = all.map(s => {
            const routine = spaceById.get(s.space_id);
            const color = routineColorForId(s.space_id);
            const routineName = routine ? routine.name : 'Deleted routine';
            return `
            <div class="full-day-row" style="border-inline-start-color:${color}">
                <div class="full-day-row-time">${formatSlotRange(s.start_minutes, s.end_minutes)}</div>
                <div class="full-day-row-body">
                    <div class="full-day-row-routine" style="color:${color}">${escapeHtml(routineName)}</div>
                    <div class="full-day-row-text">${escapeHtml(s.name || '')}</div>
                </div>
            </div>
            `;
        }).join('');
    }

    document.getElementById('full-day-modal-overlay').style.display = 'flex';
}

function closeFullDayOverlay() {
    document.getElementById('full-day-modal-overlay').style.display = 'none';
}

// ===== Notification text (fixed template, not free text) =====
// A slot only stores a short NAME, not a message to send — the person
// doesn't type notification copy. The actual push-notification body
// (Step 3: OneSignal) is always built from this one fixed template, so
// every notification reads the same way regardless of what the slot is
// for. Not called anywhere yet — defined here, next to the Slot entity
// itself, ready for when push notifications are wired up.
function buildSlotNotificationText(slot) {
    return `Time to record: ${slot.name}`;
}