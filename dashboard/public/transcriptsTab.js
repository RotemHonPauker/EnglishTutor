// transcriptsTab.js — the Transcripts tab. A recording's transcript always
// lands here; picking lines and sending them to translation happens in
// this tab too. Two sub-views share #view-transcripts, toggled by
// show/hide: the compact list (#transcripts-tab-list-view) and the
// focused editor (#transcripts-tab-editor-view).
// Needs localDb.js, spacesState.js, slots.js (findActiveSlotNow/getAllSlots),
// promptTemplates.js, geminiClient.js and translationEngine.js
// (translatePhrase) loaded first.

let transcriptsTabList = []; // the active space's own transcripts only
let openTranscriptId = null;

// ===== Entering the tab =====

function enterTranscriptsTab(btnEl) {
    showView('transcripts', btnEl);
    loadTranscriptsTabList();
}

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

async function resetTranscriptsTab() {
    openTranscriptId = null;
    resetTranscriptSelectionState();
    await loadTranscriptsTabList();
}

// ===== Switching between the list and the focused editor =====

async function renderTranscriptsTab() {
    const listView = document.getElementById('transcripts-tab-list-view');
    const editorView = document.getElementById('transcripts-tab-editor-view');
    if (!listView || !editorView) return;

    const openTranscript = openTranscriptId ? transcriptsTabList.find(t => t.id === openTranscriptId) : null;

    if (!openTranscript) {
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

    // A transcript's slot_id may belong to a different space than the
    // transcript itself, so look across every space's slots, not just this one.
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
// Not a linguistically perfect splitter — just good enough for reasonably
// sized, independently tappable chunks. Joining the result back together
// reproduces the original content exactly (punctuation/whitespace kept).
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
// Runs once, when the transcript is created (finishRecordingIntoTranscript
// below), and is stored as {index, level} pairs read back against a fresh
// splitIntoSentences() call — safe since a transcript's content never
// changes after creation. Best-effort: a failure just means no highlights.
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

        return suggestions.filter(s =>
            Number.isInteger(s.index) && s.index >= 0 && s.index < sentences.length &&
            (s.level === 1 || s.level === 2)
        );
    } catch (err) {
        return [];
    }
}

// ===== Rendering the editor body as tappable sentences =====

let currentTranscriptSentences = [];
let selectedSentenceIndices = new Set();
let sentSentenceIndices = new Set(); // already turned into cards this time the editor is open
let rangeModeArmed = false;
let rangeAnchorIdx = null;

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
    if (sentSentenceIndices.has(idx)) return;

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

// Tap to arm, tap again to cancel before placing the start; the next two
// taps place the range's start and end.
function startRangeSelect() {
    if (!currentTranscriptSentences.length) return;
    if (rangeModeArmed && rangeAnchorIdx === null) {
        rangeModeArmed = false;
    } else {
        rangeModeArmed = true;
        rangeAnchorIdx = null;
    }
    updateTranscriptSelectionBar();
}

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
    if (preview) {
        const orderedText = [...selectedSentenceIndices]
            .sort((a, b) => a - b)
            .map(i => (currentTranscriptSentences[i] || '').trim())
            .join(' ');
        preview.textContent = orderedText;
    }
    if (bar) bar.style.display = 'flex';
}

// A missing API key stops the whole batch; any other per-sentence failure
// is logged and skipped so the rest still goes through.
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

    if (typeof loadTable === 'function') loadTable();
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
// Shared by the Add tab's file-upload Record mode (captureTab.js) and the
// global record button (globalRecord.js).
async function finishRecordingIntoTranscript(spaceId, transcriptText) {
    // Whichever slot is active anywhere in the app right now, if any — not
    // scoped to this transcript's own space. Decided once, stored, never
    // recomputed later.
    const activeSlot = typeof findActiveSlotNow === 'function' ? await findActiveSlotNow() : null;

    const sentences = splitIntoSentences(transcriptText);
    const suggestions = await getTranscriptSuggestions(sentences, spaceId);

    const transcript = await createTranscript({ spaceId, content: transcriptText, slotId: activeSlot?.id || null, suggestions });

    if (spaceId !== activeSpaceId) {
        await setActiveSpace(spaceId);
    }

    // Plain showView (not navigateToTab) skips the unsaved-rules guard —
    // landing here is an automatic consequence of finishing a recording,
    // not an explicit tab switch.
    showView('transcripts', document.querySelector('.tab-btn[data-view="transcripts"]'));
    await loadTranscriptsTabList();
    await openTranscriptEditor(transcript.id);
}