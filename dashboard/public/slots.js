// slots.js — Schedule section (Setup tab): time-of-day slots for the
// active Space. Needs localDb.js and spacesState.js loaded first.

let slots = []; // active space's own slots only

// ===== Time text inputs (24-hour, e.g. "20:00") =====

// Auto-formats digits into HH:MM as typed, clamping each half live.
function formatSlotTimeInput(el) {
    const prevFormatted = el.dataset.prevFormatted || '';
    const caretPos = el.selectionStart;
    const isDeleting = el.value.length < prevFormatted.length;
    const removedChar = (isDeleting && prevFormatted.length - el.value.length === 1)
        ? prevFormatted.charAt(caretPos)
        : null;

    let digitsBeforeCaret = el.value.slice(0, caretPos).replace(/\D/g, '').length;
    let digits = el.value.replace(/\D/g, '').slice(0, 4);

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

    const caretTarget = Math.min(digitsBeforeCaret + (digitsBeforeCaret >= 2 ? 1 : 0), formatted.length);
    el.setSelectionRange(caretTarget, caretTarget);
}

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
    setTimeout(() => el.focus(), 0);
}

function parseTimeInputMinutes(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec((value || '').trim());
    if (!match) return null;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
}

function minutesToTimeInputValue(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatSlotRange(startMinutes, endMinutes) {
    const label = (mins) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m === 0 ? `${h}:00` : `${h}:${String(m).padStart(2, '0')}`;
    };
    return `${label(startMinutes)}–${label(endMinutes)}`;
}

// Cross-space: used by translationEngine.js/globalRecord.js to tag a
// fresh phrase/recording.
async function findActiveSlotNow() {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const all = await getAllSlots();
    return all.find(s => s.start_minutes <= nowMinutes && nowMinutes < s.end_minutes) || null;
}

// ===== Loading the Schedule section =====

async function loadSlotsScreen() {
    const list = document.getElementById('slots-list');
    if (!list) return;

    const active = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    if (!active) {
        slots = [];
        list.innerHTML = '<div class="recording-info-note">👋<br>No space yet — create one first from the title above.</div>';
        return;
    }

    slots = await getSlots(activeSpaceId);
    renderSlotsList();
    updateSlotsPermissionWarning();
    if (typeof renderPracticeSlotsScroll === 'function') renderPracticeSlotsScroll();
}

// ===== Practice-tab slots scroll — today's schedule + card filter =====
// selectedSlotBucketId: a slot id (active space only), 'unlabeled', or null.
let selectedSlotBucketId = null;

async function renderPracticeSlotsScroll() {
    const bar = document.getElementById('practice-slots-scroll');
    const track = document.getElementById('practice-slots-scroll-track');
    if (!bar || !track) return;

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
    const next = !active ? (enabled.find(s => s.start_minutes > nowMinutes) || null) : null;

    const slotPillsHtml = enabled.map(s => {
        const isOwn = filteringApplies && s.space_id === activeSpaceId;
        const isSelected = isOwn && s.id === selectedSlotBucketId;
        const isActive = !!active && s.id === active.id;
        const isNext = !!next && s.id === next.id;
        const style = s.color ? `background:${s.color}; color:${getContrastColor(s.color)}; --slot-color:${s.color};` : '';
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

function selectSlotBucket(id) {
    selectedSlotBucketId = id;
    renderPracticeSlotsScroll();
    if (typeof renderTable === 'function') renderTable();
}

function phraseMatchesSlotFilter(phrase) {
    if (typeof isDictionarySpace === 'function' && isDictionarySpace()) return true;
    if (!selectedSlotBucketId) return true;
    if (selectedSlotBucketId === 'unlabeled') return !phrase.slot_id;
    return phrase.slot_id === selectedSlotBucketId;
}

function resetSlotScroll() {
    selectedSlotBucketId = null;
}

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

function getSpaceNameById(spaceId) {
    const space = (typeof spaces !== 'undefined' ? spaces : []).find(s => s.id === spaceId);
    return space ? space.name : '';
}

function updateSlotsPermissionWarning() {
    const warning = document.getElementById('slots-permission-warning');
    if (!warning) return;
    const blocked = typeof Notification !== 'undefined' && Notification.permission === 'denied';
    warning.style.display = blocked ? '' : 'none';
}

// ===== Rendering the per-space list =====

function renderSlotsList() {
    const list = document.getElementById('slots-list');
    if (!list) return;

    if (!slots.length) {
        list.innerHTML = '<div class="slots-empty">No time slots yet for this space — add one to get notified when it\'s time to record.</div>';
        return;
    }

    list.innerHTML = slots.map(s => {
        const enabled = s.enabled !== false;
        const colorStyle = s.color ? `border-inline-start-color:${s.color}` : '';
        return `
        <div class="slot-card${enabled ? '' : ' disabled'}" style="${colorStyle}">
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

async function submitSlot() {
    const isNewSlot = !editingSlotId;

    // Must fire close to the click or Chrome won't show the permission prompt.
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
        const conflictRoutineName = conflictSpace ? conflictSpace.name : 'another space';
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

    if (permissionPromise) await permissionPromise;
    if (typeof syncSlotsToNotifyServer === 'function') await syncSlotsToNotifyServer();
}

async function toggleSlotEnabled(id, wasEnabled) {
    const permissionPromise = (!wasEnabled && typeof requestNotificationPermission === 'function')
        ? requestNotificationPermission()
        : null;

    try {
        await setSlotEnabled(id, !wasEnabled);
    } catch (err) {
        alert('Failed to update time slot.');
        await loadSlotsScreen();
        return;
    }
    await loadSlotsScreen();

    if (permissionPromise) await permissionPromise;
    if (typeof syncSlotsToNotifyServer === 'function') await syncSlotsToNotifyServer();
}

async function deleteSlotFromModal() {
    if (!editingSlotId) return;
    const id = editingSlotId;
    const confirmed = confirm('Delete this time slot? This can\'t be undone.');
    if (!confirmed) return;
    try {
        await deleteSlot(id);
        closeSlotModal();
        await loadSlotsScreen();
        if (typeof syncSlotsToNotifyServer === 'function') syncSlotsToNotifyServer();
    } catch (err) {
        showSlotModalError('Failed to delete time slot.');
    }
}

function buildSlotNotificationText(slot) {
    return `Time to record: ${slot.name}`;
}