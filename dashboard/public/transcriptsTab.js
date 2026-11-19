// transcriptsTab.js — the Transcripts tab: took over the Schedule tab's old
// spot in the bottom nav (Schedule itself moved into a Setup section — see
// #schedule-section in index.html/spaceRules.css/slots.js). Replaces the
// old Add-tab "Transcriptions" toggle (#transcripts-panel) entirely — a
// recording's transcript now always lands here, not inline in Add, and
// picking lines to translate happens right in this tab too, with no
// handoff to Add.
//
// A transcript only lives for TRANSCRIPT_RETENTION_MS (24h — see
// localDb.js) before it's hard-deleted; there's no more count-based cap or
// "consider deleting old ones" warning. It also carries its own slot_id
// now, decided once at creation (whichever slot was active anywhere in the
// app the moment the recording finished — see finishRecordingIntoTranscript
// below) and stored permanently, which is what colors its row in the list.
//
// Two sub-views share this one tab (#view-transcripts), toggled by
// show/hide rather than built as separate .view elements, since only one
// is ever shown and they're simple enough not to need the showView()
// machinery:
//   1. #transcripts-tab-list-view — the default: a compact, collapsed list.
//   2. #transcripts-tab-editor-view — one transcript at a time, full tab
//      height, for selecting lines and sending them straight to
//      translation.
//
// Needs localDb.js, spacesState.js (activeSpaceId/getActiveSpace/
// setActiveSpace), slots.js (findActiveSlotNow/getAllSlots) and
// translationEngine.js (translatePhrase) loaded first.

let transcriptsTabList = []; // the active routine's own transcripts only
let openTranscriptId = null; // which one (if any) the focused editor is showing
let pendingTranscriptTabSelection = '';

// ===== Entering the tab =====

function enterTranscriptsTab(btnEl) {
    showView('transcripts', btnEl);
    loadTranscriptsTabList();
}

// Called on initial entry to the tab and on every routine switch
// (spacesState.js's resetTranscriptsTab) — sweeps expired transcripts
// first (cheap; see localDb.js's deleteExpiredTranscripts), then loads
// this routine's own remaining ones.
async function loadTranscriptsTabList() {
    if (typeof deleteExpiredTranscripts === 'function') {
        await deleteExpiredTranscripts();
    }
    const active = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    transcriptsTabList = active && typeof getTranscripts === 'function'
        ? await getTranscripts(activeSpaceId)
        : [];
    await renderTranscriptsTab();
}

// Shared by setActiveSpace (spacesState.js) — closes whatever transcript
// was open (it belonged to the routine being switched away from) and
// reloads fresh. Safe to call even when this tab isn't the one on screen
// right now, same pattern as loadSlotsScreen/resetCaptureLog.
async function resetTranscriptsTab() {
    openTranscriptId = null;
    hideTranscriptTabSelectionBar();
    await loadTranscriptsTabList();
}

// ===== Switching between the list and the focused editor =====

async function renderTranscriptsTab() {
    const listView = document.getElementById('transcripts-tab-list-view');
    const editorView = document.getElementById('transcripts-tab-editor-view');
    if (!listView || !editorView) return; // not on the Transcripts tab yet

    const openTranscript = openTranscriptId ? transcriptsTabList.find(t => t.id === openTranscriptId) : null;

    if (!openTranscript) {
        // Covers both "nothing open" and "it was deleted/expired out from
        // under us" — either way, fall back to the list rather than
        // showing a stale or empty editor.
        openTranscriptId = null;
        listView.style.display = '';
        editorView.style.display = 'none';
        await renderTranscriptsTabList();
    } else {
        listView.style.display = 'none';
        editorView.style.display = 'flex';
        renderTranscriptEditor(openTranscript);
    }
}

async function openTranscriptEditor(id) {
    openTranscriptId = id;
    await renderTranscriptsTab();
}

async function closeTranscriptEditor() {
    openTranscriptId = null;
    hideTranscriptTabSelectionBar();
    await renderTranscriptsTab();
}

// ===== Compact list =====

async function renderTranscriptsTabList() {
    const list = document.getElementById('transcripts-tab-list');
    if (!list) return;

    if (!transcriptsTabList.length) {
        list.innerHTML = '<div class="recording-info-note">🎙️<br>No recordings in the last 24 hours — anything older is cleared automatically.</div>';
        return;
    }

    // Every slot across every routine, not just this one — a transcript's
    // slot_id was set from whichever slot was active anywhere in the app
    // the moment it was recorded (see finishRecordingIntoTranscript below),
    // which may belong to a different routine than this transcript itself.
    const allSlots = typeof getAllSlots === 'function' ? await getAllSlots() : [];
    const slotById = new Map(allSlots.map(s => [s.id, s]));

    list.innerHTML = transcriptsTabList.map(t => {
        const slot = t.slot_id ? slotById.get(t.slot_id) : null;
        const color = slot?.color || 'var(--border)';
        const pinned = isTranscriptPinned(t);
        const timeLabel = new Date(t.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
        const label = slot ? `${timeLabel} · ${escapeHtml(slot.name || '')}` : timeLabel;
        const content = (t.content || '').replace(/\s+/g, ' ').trim();
        const preview = content.length > 70 ? `${content.slice(0, 70)}…` : content;
        return `
        <div class="transcript-row" style="border-inline-start-color:${color}" onclick="openTranscriptEditor('${t.id}')">
            <div class="transcript-row-main">
                <div class="transcript-row-time">${label}</div>
                <div class="transcript-row-preview" dir="auto">${escapeHtml(preview)}</div>
            </div>
            <button class="transcript-pin-btn${pinned ? ' pinned' : ''}" title="${pinned ? 'Pinned — protected from the 24h auto-delete' : 'Pin — protect from the 24h auto-delete'}" onclick="event.stopPropagation(); toggleTranscriptPinned('${t.id}')">${pinned ? '⭐' : '☆'}</button>
            <button title="Delete" onclick="event.stopPropagation(); deleteTranscriptTabRow('${t.id}')">🗑️</button>
        </div>
        `;
    }).join('');
}

// A transcript's pinned state is read through isTranscriptPinned (see
// localDb.js) rather than t.pinned directly, so every transcript that
// already existed before pinning shipped (pinned is undefined there, not
// false) still shows up starred and protected — see the comment on
// isTranscriptPinned itself for why that's the intended behavior, not a
// fallback.
async function toggleTranscriptPinned(id) {
    const transcript = transcriptsTabList.find(t => t.id === id);
    if (!transcript) return;
    try {
        await setTranscriptPinned(id, !isTranscriptPinned(transcript));
        await loadTranscriptsTabList();
    } catch (err) {
        alert('Failed to update pin');
    }
}

async function deleteTranscriptTabRow(id) {
    const confirmed = confirm("Delete this transcript? This can't be undone.");
    if (!confirmed) return;
    try {
        await deleteTranscript(id);
        await loadTranscriptsTabList();
    } catch (err) {
        alert('Failed to delete transcript');
    }
}

// ===== Focused editor =====

function renderTranscriptEditor(transcript) {
    const label = document.getElementById('transcripts-tab-editor-label');
    if (label) {
        label.textContent = new Date(transcript.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    }
    const pinBtn = document.getElementById('transcripts-tab-pin-btn');
    if (pinBtn) {
        const pinned = isTranscriptPinned(transcript);
        pinBtn.textContent = pinned ? '⭐' : '☆';
        pinBtn.classList.toggle('pinned', pinned);
        pinBtn.title = pinned ? 'Pinned — protected from the 24h auto-delete' : 'Pin — protect from the 24h auto-delete';
    }
    const body = document.getElementById('transcripts-tab-editor-body');
    if (body) body.innerHTML = escapeHtml(transcript.content || '');

    hideTranscriptTabSelectionBar();
    const log = document.getElementById('transcripts-tab-log');
    if (log) log.innerHTML = '';
}

async function toggleOpenTranscriptPinned() {
    if (!openTranscriptId) return;
    await toggleTranscriptPinned(openTranscriptId);
}

async function deleteOpenTranscript() {
    if (!openTranscriptId) return;
    const id = openTranscriptId;
    const confirmed = confirm("Delete this transcript? This can't be undone.");
    if (!confirmed) return;
    try {
        await deleteTranscript(id);
        openTranscriptId = null;
        await loadTranscriptsTabList();
    } catch (err) {
        alert('Failed to delete transcript');
    }
}

// ===== Selection -> send =====
// Same long-press text-selection mechanic the old Add-tab panel used, just
// scoped to #transcripts-tab-editor-body instead of a transcript card's
// own expanded body — the person picks whatever's worth translating, taps
// Send, and it's translated and saved as a new phrase card right from
// here. No handoff to Add; repeat for as many lines as wanted, the
// transcript stays open underneath the whole time.

document.addEventListener('selectionchange', handleTranscriptTabSelectionChange);

function handleTranscriptTabSelectionChange() {
    if (!openTranscriptId) {
        hideTranscriptTabSelectionBar();
        return;
    }

    const selection = window.getSelection();
    const text = selection && !selection.isCollapsed ? selection.toString().trim() : '';
    if (!text) {
        hideTranscriptTabSelectionBar();
        return;
    }

    // Only react to selections actually inside the open transcript's body
    // — not, say, the header's Back/Delete buttons.
    const node = selection.anchorNode;
    const anchorEl = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!anchorEl || !anchorEl.closest('#transcripts-tab-editor-body')) {
        hideTranscriptTabSelectionBar();
        return;
    }

    pendingTranscriptTabSelection = text;
    const bar = document.getElementById('transcripts-tab-selection-bar');
    const preview = document.getElementById('transcripts-tab-selection-preview');
    if (preview) preview.textContent = text;
    if (bar) bar.style.display = 'flex';
}

function hideTranscriptTabSelectionBar() {
    pendingTranscriptTabSelection = '';
    const bar = document.getElementById('transcripts-tab-selection-bar');
    if (bar) bar.style.display = 'none';
}

// Translates and saves the current selection directly — the transcript-tab
// equivalent of captureTab.js's submitPhraseDirect, just logging into this
// tab's own #transcripts-tab-log instead of #capture-log, and with no
// mode-mismatch check (a transcript is never attached to a dictionary
// routine in the first place — see globalRecord.js's own routine filter —
// so there's nothing to mismatch against).
async function submitTranscriptSelection() {
    const text = pendingTranscriptTabSelection;
    if (!text) return;
    if (typeof getActiveSpace === 'function' && !getActiveSpace()) return;

    window.getSelection().removeAllRanges();
    hideTranscriptTabSelectionBar();

    const sendBtn = document.getElementById('transcripts-tab-send-btn');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '...'; }

    try {
        const result = await translatePhrase(text, activeSpaceId);
        const phrase = await saveSentence({
            sourceText: result.correctedSource,
            variant1: result.variant1,
            variant2: result.variant2,
            spaceId: activeSpaceId,
            slotId: result.slotId
        });
        addTranscriptTabLogResult(phrase);
        if (typeof loadTable === 'function') loadTable(); // so it's already there if the user switches to Practice
    } catch (err) {
        addTranscriptTabLogMessage(err.code === 'NO_API_KEY' ? 'No Gemini API key set yet.' : "Couldn't translate that — try again.");
    } finally {
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '➤ Send'; }
    }
}

function addTranscriptTabLogResult(phrase) {
    const log = document.getElementById('transcripts-tab-log');
    if (!log) return;
    const div = document.createElement('div');
    div.className = 'capture-log-item';
    div.innerHTML = `
        <div class="phrase-source" dir="auto">${escapeHtml(phrase.source_text || '')}</div>
        <div class="phrase-variant">${escapeHtml(phrase.variant_1 || '')}</div>
    `;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}

function addTranscriptTabLogMessage(text) {
    const log = document.getElementById('transcripts-tab-log');
    if (!log) return;
    const div = document.createElement('div');
    div.className = 'capture-log-item error';
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}

// ===== Turning a finished recording into a transcript =====
// Shared by both ways a recording turns into one: picking a file via the
// Add tab's own Record mode (captureTab.js's handleRecordingFileSelected)
// and the global record button (globalRecord.js) — which can be tapped
// from any tab, for any routine, not necessarily the one currently open.

async function finishRecordingIntoTranscript(spaceId, transcriptText) {
    // Whichever slot is active anywhere in the app right now, if any —
    // same check translatePhrase uses for a freshly captured phrase (see
    // slots.js's findActiveSlotNow). Not scoped to this transcript's own
    // routine: the slot that was open when the recording finished is what
    // decides its color, regardless of which routine it's being saved
    // into. Decided once, right here, and stored — never recomputed later.
    const activeSlot = typeof findActiveSlotNow === 'function' ? await findActiveSlotNow() : null;
    const transcript = await createTranscript({ spaceId, content: transcriptText, slotId: activeSlot?.id || null });

    if (spaceId !== activeSpaceId) {
        // Also reloads phrases/slots/transcripts for the new routine (via
        // setActiveSpace's own resetTranscriptsTab call) — harmless here
        // since the fresh transcript is opened explicitly right below
        // anyway, replacing whatever that reload just showed.
        await setActiveSpace(spaceId);
    }

    // Plain showView (not navigateToTab/enterTranscriptsTab) deliberately
    // skips the unsaved-space-rules-field guard — the global record button
    // can be tapped from any tab, and landing here is an automatic
    // consequence of finishing a recording, not an explicit tab switch to
    // confirm or guard.
    showView('transcripts', document.querySelector('.tab-btn[data-view="transcripts"]'));
    await loadTranscriptsTabList();
    await openTranscriptEditor(transcript.id);
}