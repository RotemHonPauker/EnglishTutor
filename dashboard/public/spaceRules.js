// Space Setup: the 4-field accordion (About this space / Level 1 /
// Level 2 / Audio Recording), each with its own Save/Cancel/Copy-from,
// plus the navigation guard that blocks switching tabs or spaces while a
// field has an unsaved edit. Split out of spacesState.js, which owns
// spaces/activeSpaceId/getActiveSpace() and calls renderSpaceRulesForm()
// from its own renderSpaceHeader(). Needs localDb.js loaded first.

const SPACE_RULE_FIELDS = {
    about: { textareaId: 'space-rules-about', dbKey: 'about_this_space', bodyKey: 'aboutThisSpace', label: 'About this space' },
    level1: { textareaId: 'space-rules-level1', dbKey: 'variant_1_notes', bodyKey: 'variant1Notes', label: 'Level 1' },
    level2: { textareaId: 'space-rules-level2', dbKey: 'variant_2_notes', bodyKey: 'variant2Notes', label: 'Level 2' },
    audio: { textareaId: 'space-rules-audio', dbKey: 'audio_recording_notes', bodyKey: 'audioRecordingNotes', label: 'Audio Recording' }
};

// Only one field open at a time — opening one collapses the others.
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

function renderSpaceRulesForm() {
    const aboutEl = document.getElementById('space-rules-about');
    if (!aboutEl) return;

    const active = getActiveSpace();
    Object.entries(SPACE_RULE_FIELDS).forEach(([field, cfg]) => {
        const el = document.getElementById(cfg.textareaId);
        if (el) el.value = active?.[cfg.dbKey] || '';
        setFieldStatus(field, '');
    });

    // In a Bridge space, variant_2 is a separate reference language, not a
    // more advanced version of variant_1 — labels reflect that instead.
    const title1 = document.getElementById('space-rules-title-level1');
    const title2 = document.getElementById('space-rules-title-level2');
    const textarea1 = document.getElementById('space-rules-level1');
    const textarea2 = document.getElementById('space-rules-level2');
    if (active?.space_type === 'bridge') {
        if (title1) title1.textContent = active.target_language;
        if (title2) title2.textContent = `${active.bridge_language} (bridge)`;
        if (textarea1) textarea1.placeholder = `How the ${active.target_language} translation should sound...`;
        if (textarea2) textarea2.placeholder = `How the ${active.bridge_language} should sound, so it helps you learn ${active.target_language}...`;
    } else {
        if (title1) title1.textContent = 'Level 1';
        if (title2) title2.textContent = 'Level 2';
        if (textarea1) textarea1.placeholder = 'How Level 1 should sound...';
        if (textarea2) textarea2.placeholder = 'How Level 2 should sound (a step up from Level 1)...';
    }

    closeAllSpaceRuleItems();
}

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

async function saveSpaceRuleField(field) {
    const cfg = SPACE_RULE_FIELDS[field];
    const active = getActiveSpace();
    if (!cfg || !active) return;

    const value = document.getElementById(cfg.textareaId).value.trim();
    const item = document.querySelector(`.space-rules-item[data-field="${field}"]`);
    const btn = item?.querySelector('.space-rules-save-btn');
    if (btn) btn.disabled = true;

    try {
        const updated = await updateSpace({ id: active.id, [cfg.bodyKey]: value });
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

    const candidates = spaces.filter(s => s.id !== active.id && s[cfg.dbKey]);

    container.classList.add('open');
    container.innerHTML = candidates.length
        ? `<div class="tag-picker-chip-list">${candidates.map(s => `<div class="tag-chip" onclick="copyFieldFromSpace('${field}', '${s.id}')">${escapeHtml(s.name)}</div>`).join('')}</div>`
        : `<div class="space-rules-copy-empty">No other space has "${escapeHtml(cfg.label)}" filled in yet.</div>`;
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

function requestOpenSpacePicker() {
    const dirtyField = getDirtySpaceRuleField();
    if (dirtyField) {
        showUnsavedRulesPrompt(dirtyField, { type: 'space', spaceId: null });
        return;
    }
    openSpacePicker();
}

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

function navigateToTab(view, btnEl) {
    if (view === 'add') {
        enterCaptureTab(btnEl);
    } else if (view === 'practice') {
        enterPracticeTab(btnEl);
    } else if (view === 'transcripts') {
        enterTranscriptsTab(btnEl);
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
            setActiveSpace(pending.spaceId);
        } else {
            openSpacePicker();
        }
    }
}