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
//      height, for picking sentences and sending them straight to
//      translation.
//
// Picking which sentences matter used to be free-form text selection
// (long-press/drag). That's gone — a transcript's body is now rendered as
// one tappable <span> per sentence (see splitIntoSentences/
// renderTranscriptSentences below), which is what actually makes picking a
// LONG stretch (a whole story read aloud, a whole interview-practice
// recording) workable on a phone: tap-to-toggle one at a time, "Select
// all" then deselect the few exceptions, or arm "Range" and tap just the
// first and last sentence you want. The AI's own suggested sentences (see
// getTranscriptSuggestions) are highlighted, a visual hint only — never
// something that creates a card on its own. Whatever ends up selected, by
// hand or by tapping a suggestion, goes through the exact same
// translate-then-save step as before once "Send" is tapped — nothing is
// ever cleaned up or saved as a card without that explicit tap.
//
// Needs localDb.js, spacesState.js (activeSpaceId/getActiveSpace/
// setActiveSpace), slots.js (findActiveSlotNow/getAllSlots),
// promptTemplates.js, geminiClient.js (geminiGenerateContent/
// geminiExtractText) and translationEngine.js (translatePhrase) loaded
// first.

let transcriptsTabList = []; // the active context's own transcripts only
let openTranscriptId = null; // which one (if any) the focused editor is showing

// ===== Entering the tab =====

function enterTranscriptsTab(btnEl) {
    showView('transcripts', btnEl);
    loadTranscriptsTabList();
}

// Called on initial entry to the tab and on every context switch
// (spacesState.js's resetTranscriptsTab) — sweeps expired transcripts
// first (cheap; see localDb.js's deleteExpiredTranscripts), then loads
// this context's own remaining ones.
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
// was open (it belonged to the context being switched away from) and
// reloads fresh. Safe to call even when this tab isn't the one on screen
// right now, same pattern as loadSlotsScreen/resetCaptureLog.
async function resetTranscriptsTab() {
    openTranscriptId = null;
    resetTranscriptSelectionState();
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
    resetTranscriptSelectionState();
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

    // Every slot across every context, not just this one — a transcript's
    // slot_id was set from whichever slot was active anywhere in the app
    // the moment it was recorded (see finishRecordingIntoTranscript below),
    // which may belong to a different context than this transcript itself.
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
    if (body) body.innerHTML = renderTranscriptSentences(transcript);

    resetTranscriptSelectionState();
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

// ===== Splitting a transcript into sentence-level tap targets =====
// Joining the returned array back together reproduces the original
// content exactly — each entry keeps its own trailing punctuation and
// whitespace/line breaks, so nothing about spacing is lost when it's
// rendered back as one <span> per sentence instead of one plain text
// block. Not meant to be a linguistically perfect sentence splitter (an
// abbreviation with a period, say, still ends a "sentence" here) — just
// good enough to give reasonably sized, independently tappable chunks of
// a transcript.
function splitIntoSentences(content) {
    const text = content || '';
    if (!text) return [];
    const parts = text.split(/([.!?]+\s*|\n+)/);
    const sentences = [];
    let current = '';
    for (const part of parts) {
        current += part;
        if (/[.!?]\s*$/.test(part) || /\n+$/.test(part)) {
            if (current.trim()) sentences.push(current);
            current = '';
        }
    }
    if (current.trim()) sentences.push(current);
    return sentences.length ? sentences : [text];
}

// ===== AI candidate-sentence suggestions =====
// Runs exactly once, right when a transcript is created (see
// finishRecordingIntoTranscript below) — not lazily when the editor is
// opened — so by the time the person actually lands on it, the
// highlights are already there. The result is stored as plain {index,
// level} pairs via localDb.js's createTranscript, read back later against
// a fresh splitIntoSentences(transcript.content) call (see
// renderTranscriptSentences) rather than storing the sentence text itself
// — the two stay in sync because a transcript's content is never edited
// after it's created, only deleted outright.
//
// Best-effort and silent on failure: this is a nice-to-have layered on
// top of manual picking, which always works regardless — a transcript
// recorded before this feature existed, or one where this call simply
// failed, just shows no highlights at all, same as a plain unlabeled
// sentence.
async function getTranscriptSuggestions(sentences, spaceId) {
    if (!sentences.length) return [];
    try {
        const spaceFields = await getSpaceRuleFields(spaceId);
        const numberedSentences = sentences.map((s, i) => `${i}: ${s.trim()}`).join('\n');
        const content = TRANSCRIPT_SUGGESTIONS_PROMPT_TEMPLATE
            .replace(/\$\{sourceLanguage\}/g, spaceFields.sourceLanguage)
            .replace(/\$\{targetLanguage\}/g, spaceFields.targetLanguage)
            .replace('${numberedSentences}', numberedSentences);

        const response = await geminiGenerateContent({
            model: 'gemini-3.6-flash',
            contents: [{ parts: [{ text: content }] }],
            generationConfig: { responseMimeType: 'application/json' }
        });

        const rawText = geminiExtractText(response);
        const parsed = JSON.parse(rawText.trim().replace(/```json|```/g, '').trim());
        const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

        // Defensive filtering — an out-of-range index or an unrecognized
        // level is dropped rather than trusted, since this is rendered
        // straight into which sentences get highlighted.
        return suggestions.filter(s =>
            Number.isInteger(s.index) && s.index >= 0 && s.index < sentences.length &&
            (s.level === 1 || s.level === 2)
        );
    } catch (err) {
        return [];
    }
}

// ===== Rendering the editor body as tappable sentences =====

let currentTranscriptSentences = []; // the open transcript's own sentences, in order
let selectedSentenceIndices = new Set();
let sentSentenceIndices = new Set(); // already turned into cards this time the editor is open
let rangeModeArmed = false;
let rangeAnchorIdx = null; // set once the first tap of a range has landed

function renderTranscriptSentences(transcript) {
    const sentences = splitIntoSentences(transcript.content || '');
    currentTranscriptSentences = sentences;
    const levelByIndex = new Map((transcript.suggestions || []).map(s => [s.index, s.level]));
    return sentences.map((text, i) => {
        const level = levelByIndex.get(i);
        const levelClass = level ? ` suggested-level-${level}` : '';
        return `<span class="transcript-sentence${levelClass}" data-idx="${i}" onclick="toggleSentenceSelection(${i})">${escapeHtml(text)}</span>`;
    }).join('');
}

function resetTranscriptSelectionState() {
    selectedSentenceIndices.clear();
    sentSentenceIndices.clear();
    rangeModeArmed = false;
    rangeAnchorIdx = null;
    updateTranscriptSentenceClasses();
    updateTranscriptSelectionBar();
}

// ===== Selecting sentences: tap-to-toggle, Select all, and a 2-tap range =====

function toggleSentenceSelection(idx) {
    if (sentSentenceIndices.has(idx)) return; // already sent — nothing left to toggle

    if (rangeModeArmed) {
        if (rangeAnchorIdx === null) {
            rangeAnchorIdx = idx;
        } else {
            const start = Math.min(rangeAnchorIdx, idx);
            const end = Math.max(rangeAnchorIdx, idx);
            for (let i = start; i <= end; i++) {
                if (!sentSentenceIndices.has(i)) selectedSentenceIndices.add(i);
            }
            rangeModeArmed = false;
            rangeAnchorIdx = null;
        }
    } else if (selectedSentenceIndices.has(idx)) {
        selectedSentenceIndices.delete(idx);
    } else {
        selectedSentenceIndices.add(idx);
    }

    updateTranscriptSentenceClasses();
    updateTranscriptSelectionBar();
}

// "Range" button — tap once to arm it (the next tap places the start, the
// one after that places the end and selects everything between), tap it
// again before placing the start to cancel. Good for a long stretch where
// most of the transcript matters (an interview-practice recording, a
// story read aloud) — a lot less fiddly on a phone than dragging a text
// selection across several lines of scrolled content ever was.
function startRangeSelect() {
    if (!currentTranscriptSentences.length) return;
    if (rangeModeArmed && rangeAnchorIdx === null) {
        rangeModeArmed = false; // tapped again before placing the start — cancel
    } else {
        rangeModeArmed = true;
        rangeAnchorIdx = null;
    }
    updateTranscriptSelectionBar();
}

// Toggles between selecting everything not already sent and clearing the
// selection entirely — the other half of the "most of this transcript is
// useful" case (select all, then deselect the few exceptions by hand).
function toggleSelectAllSentences() {
    const selectable = currentTranscriptSentences.map((_, i) => i).filter(i => !sentSentenceIndices.has(i));
    const allSelected = selectable.length > 0 && selectable.every(i => selectedSentenceIndices.has(i));

    if (allSelected) {
        selectedSentenceIndices.clear();
    } else {
        selectable.forEach(i => selectedSentenceIndices.add(i));
    }
    rangeModeArmed = false;
    rangeAnchorIdx = null;

    updateTranscriptSentenceClasses();
    updateTranscriptSelectionBar();
}

function updateTranscriptSentenceClasses() {
    const body = document.getElementById('transcripts-tab-editor-body');
    if (!body) return;
    body.querySelectorAll('.transcript-sentence').forEach(el => {
        const idx = Number(el.dataset.idx);
        el.classList.toggle('selected', selectedSentenceIndices.has(idx));
        el.classList.toggle('sent', sentSentenceIndices.has(idx));
        el.classList.toggle('range-anchor', rangeAnchorIdx === idx);
    });
}

function updateTranscriptSelectionBar() {
    const bar = document.getElementById('transcripts-tab-selection-bar');
    const preview = document.getElementById('transcripts-tab-selection-preview');
    const sendBtn = document.getElementById('transcripts-tab-send-btn');
    const rangeBtn = document.getElementById('transcripts-tab-range-btn');
    const selectAllBtn = document.getElementById('transcripts-tab-select-all-btn');
    const count = selectedSentenceIndices.size;

    if (rangeBtn) rangeBtn.classList.toggle('active', rangeModeArmed);

    if (selectAllBtn) {
        const selectable = currentTranscriptSentences.map((_, i) => i).filter(i => !sentSentenceIndices.has(i));
        const allSelected = selectable.length > 0 && selectable.every(i => selectedSentenceIndices.has(i));
        selectAllBtn.textContent = allSelected ? 'Clear all' : 'Select all';
    }

    // Mid-range-pick (the start is already placed, waiting for the end) —
    // the bar takes over as a plain instruction, nothing to send yet.
    if (rangeAnchorIdx !== null) {
        if (preview) preview.textContent = 'Tap the last sentence of the range…';
        if (sendBtn) sendBtn.style.display = 'none';
        if (bar) bar.style.display = 'flex';
        return;
    }
    if (sendBtn) sendBtn.style.display = '';

    if (!count) {
        if (bar) bar.style.display = 'none';
        return;
    }
    // Shows the actual selected text, in transcript order — not just a
    // count — so it's always clear exactly what's about to be sent. The
    // preview element itself is capped at 4 lines (transcripts.css's
    // #transcripts-tab-selection-preview), so a long selection is simply
    // clipped rather than pushing the Send button offscreen.
    if (preview) {
        const orderedText = [...selectedSentenceIndices]
            .sort((a, b) => a - b)
            .map(i => (currentTranscriptSentences[i] || '').trim())
            .join(' ');
        preview.textContent = orderedText;
    }
    if (bar) bar.style.display = 'flex';
}

// Translates and saves every currently-selected sentence, in order — the
// transcript-tab equivalent of captureTab.js's submitPhraseDirect, just
// looping over however many sentences are selected and logging each into
// this tab's own #transcripts-tab-log, with no mode-mismatch check (a
// transcript is never attached to a dictionary context in the first place
// — see globalRecord.js's own context filter — so there's nothing to
// mismatch against). A sentence that fails to translate is logged and
// skipped, not retried; a missing API key stops the whole batch instead
// of failing through every remaining sentence one by one.
async function submitTranscriptSelection() {
    const indices = [...selectedSentenceIndices].sort((a, b) => a - b);
    if (!indices.length) return;
    if (typeof getActiveSpace === 'function' && !getActiveSpace()) return;

    const sendBtn = document.getElementById('transcripts-tab-send-btn');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '...'; }

    for (const idx of indices) {
        const text = (currentTranscriptSentences[idx] || '').trim();
        if (!text) continue;
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
            sentSentenceIndices.add(idx);
            selectedSentenceIndices.delete(idx);
        } catch (err) {
            if (err.code === 'NO_API_KEY') {
                addTranscriptTabLogMessage('No Gemini API key set yet.');
                break;
            }
            addTranscriptTabLogMessage("Couldn't translate that — try again.");
        }
    }

    if (typeof loadTable === 'function') loadTable(); // so it's already there if the user switches to Practice
    updateTranscriptSentenceClasses();
    updateTranscriptSelectionBar();

    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '➤ Send'; }
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
// from any tab, for any context, not necessarily the one currently open.

async function finishRecordingIntoTranscript(spaceId, transcriptText) {
    // Whichever slot is active anywhere in the app right now, if any —
    // same check translatePhrase uses for a freshly captured phrase (see
    // slots.js's findActiveSlotNow). Not scoped to this transcript's own
    // context: the slot that was open when the recording finished is what
    // decides its color, regardless of which context it's being saved
    // into. Decided once, right here, and stored — never recomputed later.
    const activeSlot = typeof findActiveSlotNow === 'function' ? await findActiveSlotNow() : null;

    // The AI's candidate-sentence pass also runs exactly once, right here
    // — see getTranscriptSuggestions's own comment for why this is eager,
    // not lazy, and why a failure here never blocks saving the transcript.
    const sentences = splitIntoSentences(transcriptText);
    const suggestions = await getTranscriptSuggestions(sentences, spaceId);

    const transcript = await createTranscript({ spaceId, content: transcriptText, slotId: activeSlot?.id || null, suggestions });

    if (spaceId !== activeSpaceId) {
        // Also reloads phrases/slots/transcripts for the new context (via
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