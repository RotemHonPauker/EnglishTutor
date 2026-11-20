// slots.js — the Schedule section (lives inside the Setup tab now, not a
// tab of its own — see #schedule-section in index.html), used to manage
// time-of-day slots for the currently active Routine (see localDb.js's
// Slots section for the underlying data: start/end minutes, name,
// space_id, color). Tags are gone — each slot carries its own color
// directly now, and that color/name is what a phrase captured during its
// time window gets labeled with, with no separate tag entity in between
// (see translationEngine.js's translatePhrase and localDb.js's getPhrases).
//
// The Schedule list here (#slots-list, inside #schedule-section on the
// Setup tab) is scoped to activeSpaceId — only that routine's own slots.
// The old "Full schedule" overlay, merging every Routine's slots into one
// list, is gone — that's now the Practice tab's own job instead (its
// slots-scroll, renderPracticeSlotsScroll below), so there's no second
// place that does the same thing any more.
//
// Needs localDb.js (getSlots/getAllSlots/createSlot/updateSlot/deleteSlot/
// findOverlappingSlot) and spacesState.js (spaces/activeSpaceId/
// getActiveSpace) loaded first. COLORS (colorUtils.js) is the shared pool
// every slot's color comes from, app-wide (see localDb.js's
// MAX_SLOTS_TOTAL) — the same list backs both the add/edit modal's color
// picker and the Practice tab's own cross-routine slots scroll (below).

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
// inserts the ":" right after the 2nd digit (completing the hour), not
// only once a 3rd digit (the first minute digit) has also been typed. Caps
// input at 4 digits (HHMM) total. Also clamps each half live as soon as
// there are enough digits to judge it, rather than letting something like
// "99:99" sit there until Save rejects it — typing "99" for the hour
// becomes "23" immediately, typing "99" for the minutes becomes "59"
// immediately.
function formatSlotTimeInput(el) {
    const prevFormatted = el.dataset.prevFormatted || '';
    const caretPos = el.selectionStart;
    const isDeleting = el.value.length < prevFormatted.length;
    // The character this edit removed, when exactly one char was removed —
    // works for both Backspace and forward-Delete, since either way the
    // removed character sat at index caretPos of the OLD (prevFormatted)
    // value (Backspace moves the caret back onto it; forward-Delete leaves
    // the caret sitting right where it already was, in front of it).
    const removedChar = (isDeleting && prevFormatted.length - el.value.length === 1)
        ? prevFormatted.charAt(caretPos)
        : null;

    // How many digits sit before the caret in the just-edited value — this
    // is what lets the caret land back in the right spot after reformatting
    // below, instead of always snapping to the end of the field (assigning
    // el.value resets the caret to the end by default, which is exactly
    // what was making deleting a digit in the MIDDLE of the time jump the
    // caret to the end and scramble whatever was typed next).
    let digitsBeforeCaret = el.value.slice(0, caretPos).replace(/\D/g, '').length;

    let digits = el.value.replace(/\D/g, '').slice(0, 4);

    // Backspacing/deleting the auto-inserted ":" itself would otherwise
    // just get it immediately re-added (the digits before/after it are
    // unchanged), so it could never actually remove anything. Only kicks
    // in while just the hour's been typed (no minute digits yet, i.e.
    // digits.length === 2) — dropping the hour's own last digit too is
    // what makes it feel like a real delete instead of a no-op.
    if (removedChar === ':' && digits.length === 2) {
        digits = digits.slice(0, 1);
        digitsBeforeCaret = Math.min(digitsBeforeCaret, digits.length);
    }

    if (digits.length >= 2) {
        const hh = Math.min(parseInt(digits.slice(0, 2), 10), 23);
        digits = String(hh).padStart(2, '0') + digits.slice(2);
    }
    if (digits.length >= 4) {
        const mm = Math.min(parseInt(digits.slice(2, 4), 10), 59);
        digits = digits.slice(0, 2) + String(mm).padStart(2, '0');
    }
    digitsBeforeCaret = Math.min(digitsBeforeCaret, digits.length);

    const formatted = digits.length >= 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    el.value = formatted;
    el.dataset.prevFormatted = formatted;

    // Caret goes right after the same number of digits it was after
    // before this edit, plus one more step once it's past the hour, to
    // skip over the auto-inserted ":" rather than land in front of it.
    // Clamped to the field's new length as a safety net.
    const caretTarget = Math.min(digitsBeforeCaret + (digitsBeforeCaret >= 2 ? 1 : 0), formatted.length);
    el.setSelectionRange(caretTarget, caretTarget);
}

// Called on the input's own onblur (index.html) — if what's left in the
// field isn't a complete, valid HH:MM when the person tries to leave it
// (tabbing away, tapping elsewhere), refocus it right back instead of
// letting them wander off with a half-typed or invalid time sitting there
// unnoticed. An empty field is left alone here — submitSlot's own
// validation already catches a genuinely blank time, and trapping focus on
// an untouched field would be more annoying than useful.
function validateSlotTimeField(el) {
    const value = el.value.trim();
    if (!value) {
        el.classList.remove('invalid');
        return;
    }
    if (parseTimeInputMinutes(value) !== null) {
        el.classList.remove('invalid');
        return;
    }
    el.classList.add('invalid');
    // The blur has already happened by the time this runs — refocusing is
    // what actually keeps the person in this field. Deferred so it doesn't
    // fight whatever just took focus (e.g. closing the modal via Cancel
    // hides the field first, making this a harmless no-op).
    setTimeout(() => el.focus(), 0);
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
// translationEngine.js (deciding a freshly captured phrase's slot
// directly, with no model call involved) and by globalRecord.js (deciding
// which routine to route a fresh recording's transcript into). At most
// one slot can ever match at a given instant, since overlapping slots are
// blocked at creation time regardless of which routine they belong to
// (see localDb.js's findOverlappingSlot) — so there's nothing to
// disambiguate here.
async function findActiveSlotNow() {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const all = await getAllSlots();
    return all.find(s => s.start_minutes <= nowMinutes && nowMinutes < s.end_minutes) || null;
}

// ===== Loading the Schedule section =====

// Called on initial load and on every routine switch (spacesState.js) —
// same pattern as renderSpaceRulesForm/renderAnalyticsChart: safe to call
// even when the Setup tab (where the Schedule section now lives) isn't the
// one currently on screen, since it just no-ops if the section's elements
// aren't there, and otherwise leaves it already up to date for the next
// time the tab is opened.
async function loadSlotsScreen() {
    const list = document.getElementById('slots-list');
    if (!list) return; // not on the Setup tab yet

    const active = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    if (!active) {
        slots = [];
        list.innerHTML = '<div class="recording-info-note">👋<br>No routine yet — create one first from the title above.</div>';
        return;
    }

    slots = await getSlots(activeSpaceId);
    renderSlotsList();
    updateSlotsPermissionWarning();
    // Keeps the Practice tab's own slots scroll in sync whenever a slot is
    // added/edited/deleted/toggled anywhere, not just when Practice itself
    // is re-entered (see enterPracticeTab below, which refreshes it on tab
    // switch too) — a slot added/renamed/recolored/deleted here changes
    // that strip's own pills AND, for the active routine's own slots,
    // what the card-list filter actually offers.
    if (typeof renderPracticeSlotsScroll === 'function') renderPracticeSlotsScroll();
}

// ===== Practice-tab slots scroll — today's schedule AND the card filter =====
// Shows TODAY's reminder schedule across every routine, same as always —
// but a slot belonging to the ACTIVE routine is now also a real filter
// control for the card list below it (tap it to narrow down to just that
// slot's cards), with its own phrase count shown right on the pill. A
// slot belonging to any OTHER routine stays exactly what it always was:
// plain, non-interactive "what's coming up today" context — its cards
// aren't even loaded right now, so there's nothing to count or filter by.
// One strip doing both jobs, replacing the separate single-routine
// slot-filter strip that used to sit below it (Rotem's own call — two
// horizontal scrolls for related things was one too many).
//
// Every slot is shown in its own color always now, not just while it's
// the current/next one (also Rotem's own call) — current/next still gets
// a slightly thicker border on top of that (see .current/.next in
// table.css); the selected (filtering) slot gets its own outline instead,
// so the two visual cues never collide.
//
// selectedSlotBucketId is a real slot id (belonging to the active
// routine), 'unlabeled', or null — read by phraseMatchesSlotFilter below,
// which phrasesTable.js's renderTable filters the card list through.
let selectedSlotBucketId = null;

async function renderPracticeSlotsScroll() {
    const bar = document.getElementById('practice-slots-scroll');
    const track = document.getElementById('practice-slots-scroll-track');
    if (!bar || !track) return; // not on the Practice tab (or not built into this page)

    // Dictionary entries have no slot concept at all (dictionary.js) —
    // this strip reverts to exactly its old display-only self there: no
    // counts, nothing clickable, no Unlabeled pill.
    const filteringApplies = !(typeof isDictionarySpace === 'function' && isDictionarySpace());

    const all = await getAllSlots();
    const enabled = all.filter(s => s.enabled !== false);
    const ownSlots = filteringApplies ? enabled.filter(s => s.space_id === activeSpaceId) : [];

    const countBySlotId = new Map();
    let unlabeledCount = 0;
    if (filteringApplies) {
        const items = typeof allPhrases !== 'undefined' ? allPhrases : [];
        items.forEach(p => {
            if (p.slot_id) countBySlotId.set(p.slot_id, (countBySlotId.get(p.slot_id) || 0) + 1);
            else unlabeledCount++;
        });
    }

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    if (filteringApplies) {
        const stillValid = selectedSlotBucketId === 'unlabeled'
            ? unlabeledCount > 0
            : ownSlots.some(s => s.id === selectedSlotBucketId);
        if (!stillValid) {
            const activeOwnNow = ownSlots.find(s => s.start_minutes <= nowMinutes && nowMinutes < s.end_minutes);
            selectedSlotBucketId = activeOwnNow ? activeOwnNow.id : (ownSlots[0]?.id ?? (unlabeledCount > 0 ? 'unlabeled' : null));
        }
    }

    if (!enabled.length && !unlabeledCount) {
        track.innerHTML = `<div class="scroll-empty-note">No time slots set up yet</div>`;
        return;
    }

    const active = enabled.find(s => s.start_minutes <= nowMinutes && nowMinutes < s.end_minutes) || null;
    // The list is already sorted by start_minutes (getAllSlots), so the
    // first one starting later than now is the next one — only looked for
    // when nothing is active right now.
    const next = !active ? (enabled.find(s => s.start_minutes > nowMinutes) || null) : null;

    const slotPillsHtml = enabled.map(s => {
        const isOwn = filteringApplies && s.space_id === activeSpaceId;
        const isSelected = isOwn && s.id === selectedSlotBucketId;
        const isActive = !!active && s.id === active.id;
        const isNext = !!next && s.id === next.id;
        const contrast = getContrastColor(s.color);
        const style = `background:${s.color || '#333'}; color:${contrast}; border-color:${s.color || '#333'};`;
        const classes = ['practice-slot-pill', isActive ? 'current' : '', isNext ? 'next' : '', isOwn ? 'selectable' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
        return `
        <div class="${classes}" style="${style}" ${isOwn ? `onclick="selectSlotBucket('${s.id}')"` : ''}>
            <span class="practice-slot-pill-time">${formatSlotRange(s.start_minutes, s.end_minutes)}</span>
            <span class="practice-slot-pill-name">${escapeHtml(s.name || '')}</span>
            <span class="practice-slot-pill-routine">${escapeHtml(getSpaceNameById(s.space_id))}</span>
            ${isOwn ? `<span class="practice-slot-pill-count">${countBySlotId.get(s.id) || 0} phrase${countBySlotId.get(s.id) === 1 ? '' : 's'}</span>` : ''}
        </div>
        `;
    }).join('');

    // The active routine's own untagged phrases — kept clearly apart from
    // a real slot (no time range, no slot color) but just as clickable;
    // its own routine name underneath is what makes it obvious which
    // routine this particular "Unlabeled" belongs to.
    const activeSpace = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    const unlabeledPillHtml = (filteringApplies && unlabeledCount > 0 && activeSpace) ? `
        <div class="practice-slot-pill selectable ${selectedSlotBucketId === 'unlabeled' ? 'selected' : ''}" onclick="selectSlotBucket('unlabeled')">
            <span class="practice-slot-pill-name">Unlabeled</span>
            <span class="practice-slot-pill-routine">${escapeHtml(activeSpace.name)}</span>
            <span class="practice-slot-pill-count">${unlabeledCount} phrase${unlabeledCount === 1 ? '' : 's'}</span>
        </div>
    ` : '';

    track.innerHTML = slotPillsHtml + unlabeledPillHtml;
}

// Wired to each selectable pill's own onclick above.
function selectSlotBucket(id) {
    selectedSlotBucketId = id;
    renderPracticeSlotsScroll();
    if (typeof renderTable === 'function') renderTable();
}

// Read by phrasesTable.js's renderTable to narrow the card list down to
// whichever slot (or 'unlabeled') is currently selected above. Dictionary
// entries never reach a "not everything" state here — isDictionarySpace
// makes this a no-op filter there, same as renderPracticeSlotsScroll's
// own filteringApplies guard.
function phraseMatchesSlotFilter(phrase) {
    if (typeof isDictionarySpace === 'function' && isDictionarySpace()) return true;
    if (!selectedSlotBucketId) return true;
    if (selectedSlotBucketId === 'unlabeled') return !phrase.slot_id;
    return phrase.slot_id === selectedSlotBucketId;
}

// Called on routine switch (spacesState.js) — the new routine's own slots
// (and so its own bucket ids) are completely different, so there's
// nothing to carry over; renderPracticeSlotsScroll picks a fresh default
// the next time it runs.
function resetSlotScroll() {
    selectedSlotBucketId = null;
}

// The Practice tab button calls this instead of showView directly. Lands
// on whichever slot a phrase just captured on the Add tab actually got
// (if any), so it's immediately visible without having to go hunting for
// it.
function enterPracticeTab(btnEl) {
    const cameFromAdd = document.getElementById('view-add')?.classList.contains('active');
    showView('practice', btnEl);
    if (cameFromAdd) {
        const items = typeof allPhrases !== 'undefined' ? allPhrases : [];
        const last = [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        if (last) selectedSlotBucketId = last.slot_id || 'unlabeled';
        if (typeof renderTable === 'function') renderTable();
    }
    if (typeof renderPracticeSlotsScroll === 'function') renderPracticeSlotsScroll();
}

// A slot row doesn't carry its own routine's name (unlike a phrase, slots
// are never joined against their space in localDb.js) — this is just a
// lookup against `spaces` (spacesState.js), which already holds every
// routine for the space picker.
function getSpaceNameById(spaceId) {
    const space = (typeof spaces !== 'undefined' ? spaces : []).find(s => s.id === spaceId);
    return space ? space.name : '';
}

// Shows the "notifications are blocked" banner (index.html) whenever the
// browser's own push permission is currently denied — checked every time
// the tab loads, and again right after any attempt to request permission
// (see notifySync.js's requestNotificationPermission), so it never shows
// stale info. A slot's own on/off toggle is a separate, per-slot concern
// (see renderSlotsList/toggleSlotEnabled) from this: this banner is about
// whether the browser will deliver ANY notification at all, regardless of
// which slots are individually turned on.
function updateSlotsPermissionWarning() {
    const warning = document.getElementById('slots-permission-warning');
    if (!warning) return;
    const blocked = typeof Notification !== 'undefined' && Notification.permission === 'denied';
    warning.style.display = blocked ? '' : 'none';
}

// ===== Rendering the per-routine list =====

function renderSlotsList() {
    const list = document.getElementById('slots-list');
    if (!list) return;

    if (!slots.length) {
        list.innerHTML = '<div class="slots-empty">No time slots yet for this routine — add one to get notified when it\'s time to record.</div>';
        return;
    }

    list.innerHTML = slots.map(s => {
        // A slot saved before this toggle existed has no `enabled` field at
        // all — treated as on (true), same as a freshly created one, never
        // as silently off.
        const enabled = s.enabled !== false;
        const color = s.color || '#333';

        // The slot's own color is its at-a-glance identity now (same
        // border-accent language as .practice-slot-pill in
        // renderPracticeSlotsScroll below) — no more tag chips stacked on
        // the card. Deleting is modal-only (the edit
        // modal's own Delete button). See .disabled below for the dimmed
        // look when the toggle is off.
        return `
        <div class="slot-card${enabled ? '' : ' disabled'}" style="border-inline-start-color:${color}">
            <div class="slot-card-main" onclick="openSlotModal('${s.id}')">
                <div class="slot-card-time">${formatSlotRange(s.start_minutes, s.end_minutes)}</div>
                <div class="slot-card-text">${escapeHtml(s.name || '')}</div>
            </div>
            <label class="slot-enable-toggle" title="${enabled ? 'Time slot on — tap to turn off' : 'Time slot off — tap to turn on'}">
                <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleSlotEnabled('${s.id}', ${enabled})">
                <span class="slot-enable-toggle-track"></span>
            </label>
        </div>
        `;
    }).join('');
}

// ===== Add/edit modal =====

let editingSlotId = null;
let selectedSlotColor = null;

async function openSlotModal(slotId) {
    const active = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    if (!active) return;

    editingSlotId = slotId || null;
    const slot = slotId ? slots.find(s => s.id === slotId) : null;

    document.getElementById('slot-modal-title').textContent = slot ? 'Edit time slot' : 'New time slot';
    const startTimeInput = document.getElementById('slot-start-time');
    const endTimeInput = document.getElementById('slot-end-time');
    startTimeInput.value = minutesToTimeInputValue(slot ? slot.start_minutes : 8 * 60);
    endTimeInput.value = minutesToTimeInputValue(slot ? slot.end_minutes : 8 * 60 + 30);
    // Keeps formatSlotTimeInput's own backspace-tracking (prevFormatted) in
    // sync with the value the field is actually opening with, rather than
    // comparing the first real keystroke against a stale/empty baseline.
    startTimeInput.dataset.prevFormatted = startTimeInput.value;
    endTimeInput.dataset.prevFormatted = endTimeInput.value;
    document.getElementById('slot-name-input').value = slot ? (slot.name || '') : '';
    document.getElementById('slot-modal-error').style.display = 'none';
    document.getElementById('slot-modal-error').textContent = '';

    const deleteBtn = document.getElementById('slot-modal-delete-btn');
    if (deleteBtn) deleteBtn.style.display = slot ? '' : 'none';

    selectedSlotColor = slot ? (slot.color || null) : null;
    await renderSlotColorPicker();

    document.getElementById('slot-modal-overlay').style.display = 'flex';
}

function closeSlotModal() {
    editingSlotId = null;
    selectedSlotColor = null;
    document.getElementById('slot-modal-overlay').style.display = 'none';
}

// Every slot across every routine shares ONE pool of colors (see
// localDb.js's MAX_SLOTS_TOTAL) — a slot's color IS its identity, so two
// slots can never share one anywhere in the app. Checked against every
// slot (getAllSlots), not just this routine's own; the slot currently
// being edited never disables its own color.
async function renderSlotColorPicker() {
    const container = document.getElementById('slot-color-picker');
    if (!container) return;

    const allSlots = await getAllSlots();
    const usedColors = allSlots
        .filter(s => s.id !== editingSlotId && s.color)
        .map(s => s.color);

    container.innerHTML = COLORS.map(c => {
        const taken = usedColors.includes(c);
        return `
            <div class="color-circle ${selectedSlotColor === c ? 'selected' : ''} ${taken ? 'disabled' : ''}"
                style="background:${c}"
                onclick="${taken ? '' : `selectSlotColor('${c}')`}"
                data-color="${c}">
            </div>
        `;
    }).join('');
}

function selectSlotColor(color) {
    selectedSlotColor = color;
    document.querySelectorAll('#slot-color-picker .color-circle').forEach(el => {
        el.classList.toggle('selected', el.dataset.color === color);
    });
}

function showSlotModalError(message) {
    const err = document.getElementById('slot-modal-error');
    err.textContent = message;
    err.style.display = 'block';
}

// Validates (name present, color chosen, same-day range, then the
// hard-block cross-routine overlap check — see localDb.js's
// findOverlappingSlot), then creates or updates.
async function submitSlot() {
    const isNewSlot = !editingSlotId; // plain variable read, no await — safe to check this early

    // Fired HERE, before any other await below (not after creating the
    // slot, like before) — see notifySync.js's own comment on
    // requestNotificationPermission for why: it must stay as close as
    // possible to this actual click, or Chrome silently refuses to show
    // the permission prompt at all. Not awaited yet — it runs concurrently
    // with the rest of this function and is only awaited at the very end,
    // so it doesn't block validation/saving.
    const permissionPromise = (isNewSlot && typeof requestNotificationPermission === 'function')
        ? requestNotificationPermission()
        : null;

    const name = document.getElementById('slot-name-input').value.trim();
    if (!name) {
        showSlotModalError('Please give this time slot a name.');
        return;
    }

    if (!selectedSlotColor) {
        showSlotModalError('Please pick a color for this time slot.');
        return;
    }

    const startMinutes = parseTimeInputMinutes(document.getElementById('slot-start-time').value);
    const endMinutes = parseTimeInputMinutes(document.getElementById('slot-end-time').value);

    if (startMinutes === null || endMinutes === null) {
        showSlotModalError('Please enter a valid 24-hour time as HH:MM, e.g. 20:00.');
        return;
    }

    if (endMinutes <= startMinutes) {
        showSlotModalError("End time must be after start time — time slots can't cross midnight yet.");
        return;
    }

    const conflict = await findOverlappingSlot({ startMinutes, endMinutes, excludeId: editingSlotId });
    if (conflict) {
        const conflictSpace = (typeof spaces !== 'undefined' ? spaces : []).find(s => s.id === conflict.space_id);
        const conflictRoutineName = conflictSpace ? conflictSpace.name : 'another routine';
        showSlotModalError(`That overlaps an existing time slot: "${conflict.name}" (${formatSlotRange(conflict.start_minutes, conflict.end_minutes)}, ${conflictRoutineName}). Adjust one of the times first.`);
        return;
    }

    try {
        if (editingSlotId) {
            await updateSlot({ id: editingSlotId, startMinutes, endMinutes, name, color: selectedSlotColor });
        } else {
            await createSlot({ spaceId: activeSpaceId, startMinutes, endMinutes, name, color: selectedSlotColor });
        }
    } catch (err) {
        showSlotModalError(err.message || 'Failed to save time slot.');
        return;
    }

    closeSlotModal();
    await loadSlotsScreen();

    // The permission request (if any) was already fired at the very top of
    // this function, right as Save was tapped — just wait for it to finish
    // here. Then sync, now that the new/edited slot actually exists in the
    // local DB (syncing any earlier would have missed it) — this also
    // covers the subscription id that requestNotificationPermission may
    // have just obtained, so the Worker learns about both in one go.
    if (permissionPromise) await permissionPromise;
    if (typeof syncSlotsToNotifyServer === 'function') await syncSlotsToNotifyServer(); // notifySync.js
}

// Wired to each slot's own on/off toggle (renderSlotsList). wasEnabled is
// the state BEFORE this click (captured at render time), so the new
// state is simply its opposite.
async function toggleSlotEnabled(id, wasEnabled) {
    // Turning a slot ON is itself the explicit user gesture browsers
    // require before they'll prompt for push permission (a no-op if
    // already granted/denied) — fired HERE, before the setSlotEnabled
    // write below, same reasoning as submitSlot: it has to stay as close
    // as possible to this actual tap, or Chrome silently never shows the
    // permission prompt at all. Not awaited yet — only at the very end.
    const permissionPromise = (!wasEnabled && typeof requestNotificationPermission === 'function')
        ? requestNotificationPermission()
        : null;

    try {
        await setSlotEnabled(id, !wasEnabled); // localDb.js
    } catch (err) {
        alert('Failed to update time slot.');
        await loadSlotsScreen(); // reverts the checkbox's own optimistic UI state back to what's actually stored
        return;
    }
    await loadSlotsScreen();

    // Turning one off never needed permission — just a sync either way,
    // once the permission request (if any) has finished.
    if (permissionPromise) await permissionPromise;
    if (typeof syncSlotsToNotifyServer === 'function') await syncSlotsToNotifyServer(); // notifySync.js
}

// Deleting is modal-only — open the slot (tap its card) and use the
// Delete button there. There's no quick-delete icon directly on the card
// itself (see renderSlotsList).
async function deleteSlotFromModal() {
    if (!editingSlotId) return;
    const id = editingSlotId;
    const confirmed = confirm('Delete this time slot? This can\'t be undone.');
    if (!confirmed) return;
    try {
        await deleteSlot(id);
        closeSlotModal();
        await loadSlotsScreen();
        if (typeof syncSlotsToNotifyServer === 'function') syncSlotsToNotifyServer(); // notifySync.js
    } catch (err) {
        showSlotModalError('Failed to delete time slot.');
    }
}


// ===== Notification text (fixed template, not free text) =====
// A slot only stores a short NAME, not a message to send — the person
// doesn't type notification copy. The actual push-notification body
// (Step 3: OneSignal) is always built from this one fixed template, so
// every notification reads the same way regardless of what the slot is
// for.
function buildSlotNotificationText(slot) {
    return `Time to record: ${slot.name}`;
}