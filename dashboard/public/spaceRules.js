// Space Setup: the 4-field accordion (About this space / Variant 1 /
// Variant 2 / Audio Recording), each with its own Save/Cancel/Copy-from,
// plus the navigation guard that blocks switching tabs or spaces while a
// field has an unsaved edit. Split out of spacesState.js, which still owns
// `spaces`/`activeSpaceId`/`getActiveSpace()` and calls renderSpaceRulesForm()
// from its own renderSpaceHeader() — a plain global-scope call, same as
// everywhere else cross-file calls happen in this app.

// ===== Space rules (Setup tab, above the tag list) =====
// An accordion — each field starts collapsed, one click opens it for
// editing, and Save/Cancel/Copy-from all act on that one field only. The
// fields already come along with every space object from GET /spaces (a
// plain SELECT *), so no separate fetch is needed here — just read
// whatever's already in `spaces`.

const SPACE_RULE_FIELDS = {
    about: { textareaId: 'space-rules-about', dbKey: 'about_this_space', bodyKey: 'aboutThisSpace', label: 'About this space' },
    variant1: { textareaId: 'space-rules-variant1', dbKey: 'variant_1_notes', bodyKey: 'variant1Notes', label: 'Variant 1' },
    variant2: { textareaId: 'space-rules-variant2', dbKey: 'variant_2_notes', bodyKey: 'variant2Notes', label: 'Variant 2' },
    audio: { textareaId: 'space-rules-audio', dbKey: 'audio_recording_notes', bodyKey: 'audioRecordingNotes', label: 'Audio Recording' }
};

// Only one field open at a time — opening one collapses whatever else was
// open, so an edit sitting half-finished in another field never quietly
// falls out of view. Collapsing still doesn't discard anything by itself;
// only Cancel does that.
function toggleSpaceRuleItem(field) {
    const item = document.querySelector(`.space-rules-item[data-field="${field}"]`);
    if (!item) return;

    const isOpening = !item.classList.contains('open');

    document.querySelectorAll('.space-rules-item.open').forEach(other => {
        if (other !== item) {
            other.classList.remove('open');
            closeCopyPicker(other.dataset.field);
        }
    });

    item.classList.toggle('open', isOpening);
    if (!isOpening) closeCopyPicker(field);
}

function closeAllSpaceRuleItems() {
    document.querySelectorAll('.space-rules-item.open').forEach(item => item.classList.remove('open'));
    Object.keys(SPACE_RULE_FIELDS).forEach(closeCopyPicker);
}

function setFieldStatus(field, text, isError = false) {
    const statusEl = document.getElementById(`space-rules-status-${field}`);
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('error', isError);
}

// Repopulates every field from the currently active space (discarding any
// unsaved edits) and collapses the whole accordion — used both on initial
// load/space-switch, and as the basis for a single field's Cancel.
function renderSpaceRulesForm() {
    const aboutEl = document.getElementById('space-rules-about');
    if (!aboutEl) return; // not on the Setup tab yet

    const active = getActiveSpace();
    Object.entries(SPACE_RULE_FIELDS).forEach(([field, cfg]) => {
        const el = document.getElementById(cfg.textareaId);
        if (el) el.value = active?.[cfg.dbKey] || '';
        setFieldStatus(field, '');
    });

    closeAllSpaceRuleItems();
}

// Discards unsaved edits in just this one field and closes it.
function cancelSpaceRuleField(field) {
    const cfg = SPACE_RULE_FIELDS[field];
    if (!cfg) return;
    const active = getActiveSpace();
    const el = document.getElementById(cfg.textareaId);
    if (el) el.value = active?.[cfg.dbKey] || '';
    setFieldStatus(field, '');
    closeCopyPicker(field);
    document.querySelector(`.space-rules-item[data-field="${field}"]`)?.classList.remove('open');
}

// Saves just this one field — the PUT endpoint only touches whatever keys
// are actually sent, so the other 3 fields (and name) are untouched.
async function saveSpaceRuleField(field) {
    const cfg = SPACE_RULE_FIELDS[field];
    const active = getActiveSpace();
    if (!cfg || !active) return;

    const value = document.getElementById(cfg.textareaId).value.trim();
    const item = document.querySelector(`.space-rules-item[data-field="${field}"]`);
    const btn = item?.querySelector('.space-rules-save-btn');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch(`/spaces/${active.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [cfg.bodyKey]: value })
        });
        if (!res.ok) throw new Error('Failed to save');

        const updated = await res.json();
        const idx = spaces.findIndex(s => s.id === active.id);
        if (idx !== -1) spaces[idx] = updated;

        setFieldStatus(field, 'Saved');
        setTimeout(() => setFieldStatus(field, ''), 2000);
        closeCopyPicker(field);
        item?.classList.remove('open');
    } catch (err) {
        setFieldStatus(field, 'Failed to save', true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ===== Copy a field's content from another space =====
// Only fills the textarea — doesn't save anything by itself, so Save/
// Cancel on that field still apply normally afterward.

function toggleCopyPicker(field) {
    const container = document.getElementById(`space-rules-copy-${field}`);
    if (!container) return;
    if (container.classList.contains('open')) {
        closeCopyPicker(field);
    } else {
        renderCopyPicker(field);
    }
}

function closeCopyPicker(field) {
    const container = document.getElementById(`space-rules-copy-${field}`);
    if (!container) return;
    container.classList.remove('open');
    container.innerHTML = '';
}

function renderCopyPicker(field) {
    const cfg = SPACE_RULE_FIELDS[field];
    const active = getActiveSpace();
    const container = document.getElementById(`space-rules-copy-${field}`);
    if (!cfg || !active || !container) return;

    // Only spaces that actually have something written for this specific
    // field are worth offering — nothing useful about copying blank.
    const candidates = spaces.filter(s => s.id !== active.id && s[cfg.dbKey]);

    container.classList.add('open');
    container.innerHTML = candidates.length
        ? `<div class="tag-picker-chip-list">${candidates.map(s => `<div class="tag-chip" onclick="copyFieldFromSpace('${field}', '${s.id}')">${s.name}</div>`).join('')}</div>`
        : `<div class="space-rules-copy-empty">No other space has "${cfg.label}" filled in yet.</div>`;
}

function copyFieldFromSpace(field, sourceSpaceId) {
    const cfg = SPACE_RULE_FIELDS[field];
    const source = spaces.find(s => s.id === sourceSpaceId);
    if (!cfg || !source) return;
    const el = document.getElementById(cfg.textareaId);
    if (el) el.value = source[cfg.dbKey] || '';
    closeCopyPicker(field);
}

// ===== Guarding tab switches against an unsaved rules field =====
// Since only one field can be open at a time, there's at most one to check.
// If it's open and its textarea no longer matches what's actually saved,
// switching tabs is blocked until the person explicitly discards the
// change or goes back to it — Save is deliberately not offered from the
// prompt itself, only from the field after reviewing it again.

function getDirtySpaceRuleField() {
    const openItem = document.querySelector('.space-rules-item.open');
    if (!openItem) return null;
    const field = openItem.dataset.field;
    const cfg = SPACE_RULE_FIELDS[field];
    const active = getActiveSpace();
    const el = cfg && document.getElementById(cfg.textareaId);
    if (!cfg || !active || !el) return null;
    const savedValue = active[cfg.dbKey] || '';
    return el.value.trim() !== savedValue ? field : null;
}

let pendingNavigation = null; // { type: 'tab', view, btnEl } | { type: 'space', spaceId }

// Every tab-bar button calls this instead of navigating directly.
function requestTabSwitch(view, btnEl) {
    const alreadyThere = document.querySelector('.view.active')?.id === `view-${view}`;
    if (alreadyThere) return;

    const dirtyField = getDirtySpaceRuleField();
    if (dirtyField) {
        showUnsavedRulesPrompt(dirtyField, { type: 'tab', view, btnEl });
        return;
    }

    navigateToTab(view, btnEl);
}

// The space header calls this instead of openSpacePicker directly —
// clicking it at all is already "I want to switch spaces", so there's no
// need to wait until a specific target space is actually chosen before
// warning about an unsaved field.
function requestOpenSpacePicker() {
    const dirtyField = getDirtySpaceRuleField();
    if (dirtyField) {
        showUnsavedRulesPrompt(dirtyField, { type: 'space', spaceId: null });
        return;
    }
    openSpacePicker();
}

// The space picker's own rows call this instead of setActiveSpace directly
// — kept as a second safety net, though by the time the picker is open
// there shouldn't be a dirty field left to catch (requestOpenSpacePicker
// already would have blocked getting here).
function requestSpaceSwitch(id) {
    if (id === activeSpaceId) {
        closeSpacePicker();
        return;
    }

    const dirtyField = getDirtySpaceRuleField();
    if (dirtyField) {
        showUnsavedRulesPrompt(dirtyField, { type: 'space', spaceId: id });
        return;
    }

    setActiveSpace(id);
}

// The actual switch, once nothing is blocking it — routes to each tab's
// own entry function where one exists (Add/Practice have their own reset
// logic), or the generic showView otherwise.
function navigateToTab(view, btnEl) {
    if (view === 'add') {
        enterCaptureTab(btnEl);
    } else if (view === 'practice') {
        enterPracticeTab(btnEl);
    } else {
        showView(view, btnEl);
    }
}

function showUnsavedRulesPrompt(field, pending) {
    const cfg = SPACE_RULE_FIELDS[field];
    pendingNavigation = pending;
    document.getElementById('unsaved-rules-modal-text').textContent =
        `You have an unsaved change in "${cfg.label}". Discard it, or go back and save it first.`;
    document.getElementById('unsaved-rules-modal-overlay').style.display = 'flex';
}

// "Go back & review" — if a space switch was what got blocked, also close
// the space picker modal underneath, since going back means looking at
// the Setup tab clearly, not staring at two overlapping modals.
function closeUnsavedRulesModal() {
    if (pendingNavigation?.type === 'space') {
        closeSpacePicker();
    }
    pendingNavigation = null;
    document.getElementById('unsaved-rules-modal-overlay').style.display = 'none';
}

function discardUnsavedRulesAndSwitch() {
    const openItem = document.querySelector('.space-rules-item.open');
    if (openItem) cancelSpaceRuleField(openItem.dataset.field);

    document.getElementById('unsaved-rules-modal-overlay').style.display = 'none';
    const pending = pendingNavigation;
    pendingNavigation = null;
    if (!pending) return;

    if (pending.type === 'tab') {
        navigateToTab(pending.view, pending.btnEl);
    } else if (pending.type === 'space') {
        if (pending.spaceId) {
            setActiveSpace(pending.spaceId); // this also closes the space picker itself
        } else {
            openSpacePicker(); // no target chosen yet — just clear the way to pick one
        }
    }
}