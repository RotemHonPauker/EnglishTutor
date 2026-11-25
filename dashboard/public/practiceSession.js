// ===== Practice session (production drills) =====
// A short, self-graded drill: show the source sentence, let the person try
// saying/typing it (never saved), reveal the real translation, then on the
// last sentence of a phrase (or a dictionary word's single unit) either
// Continue (stamps last_practiced_at) or Delete. Nothing else is written
// to the database.
// Needs localDb.js, colorUtils.js, phrasesTable.js, slots.js, and
// dictionary.js loaded first.

// A phrase captured from one recording can hold several sentences; splitting
// them into units (splitIntoSentenceUnits) lets a long card be practiced
// sentence-by-sentence. A dictionary word is always exactly one unit.
// "Units", not phrases/words, is what the 7-unit session target counts
// (each item's own countUnitsFn — see pickSessionItems).

const PRACTICE_SESSION_TARGET_UNITS = 7;

let practiceQueue = [];
let practiceStepIndex = 0;
let practiceSessionItemCount = 0;
let practiceSessionItemLabel = 'phrase'; // 'phrase' | 'word'
let practiceRevealed = false;
let practiceScopeSlotIds = new Set();

// ===== Recording an attempt instead of typing it =====
// A separate, much simpler recorder than globalRecord.js's — no cap, no
// overlay, no wake lock, since an attempt is always one short sentence.
// The audio itself is discarded after transcription; only the resulting
// text lands in the attempt textarea, same as a typed attempt.
const PRACTICE_ATTEMPT_RECORDING_SUPPORTED = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
let practiceAttemptRecordState = 'idle'; // 'idle' | 'recording' | 'transcribing'
let practiceAttemptMediaRecorder = null;
let practiceAttemptChunks = [];
let practiceAttemptStream = null;

function practiceAttemptPickMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return candidates.find(t => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t)) || null;
}

function practiceAttemptBlobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function togglePracticeAttemptRecording() {
    if (practiceAttemptRecordState === 'idle') {
        startPracticeAttemptRecording();
    } else if (practiceAttemptRecordState === 'recording') {
        stopPracticeAttemptRecording();
    }
}

async function startPracticeAttemptRecording() {
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        alert('Microphone access is needed to record. Check your browser/site permissions and try again.');
        return;
    }
    practiceAttemptStream = stream;
    practiceAttemptChunks = [];
    const mimeType = practiceAttemptPickMimeType();
    practiceAttemptMediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    practiceAttemptMediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) practiceAttemptChunks.push(e.data);
    };
    practiceAttemptMediaRecorder.onstop = handlePracticeAttemptRecordingStopped;
    practiceAttemptMediaRecorder.start();
    practiceAttemptRecordState = 'recording';
    updatePracticeAttemptRecordButtonUI();
}

function stopPracticeAttemptRecording() {
    if (!practiceAttemptMediaRecorder || practiceAttemptRecordState !== 'recording') return;
    practiceAttemptRecordState = 'transcribing';
    updatePracticeAttemptRecordButtonUI();
    practiceAttemptMediaRecorder.stop();
    practiceAttemptStream.getTracks().forEach(t => t.stop());
}

// Cuts a recording short with no transcription — used when leaving the
// step (or session) while the mic is still live.
function cancelPracticeAttemptRecording() {
    if (practiceAttemptMediaRecorder && practiceAttemptRecordState === 'recording') {
        practiceAttemptMediaRecorder.onstop = null;
        practiceAttemptMediaRecorder.stop();
    }
    if (practiceAttemptStream) practiceAttemptStream.getTracks().forEach(t => t.stop());
    practiceAttemptMediaRecorder = null;
    practiceAttemptStream = null;
    practiceAttemptChunks = [];
    practiceAttemptRecordState = 'idle';
}

async function handlePracticeAttemptRecordingStopped() {
    const mimeType = practiceAttemptMediaRecorder.mimeType || 'audio/webm';
    const blob = new Blob(practiceAttemptChunks, { type: mimeType });
    practiceAttemptChunks = [];
    practiceAttemptMediaRecorder = null;
    practiceAttemptStream = null;

    const input = document.getElementById('practice-attempt-input');
    try {
        const audioBase64 = await practiceAttemptBlobToBase64(blob);
        const { transcript } = await processRecording({ audioBase64, mimeType, spaceId: activeSpaceId });
        if (input) input.value = transcript;
    } catch (err) {
        alert(err.code === 'NO_API_KEY' ? 'No Gemini API key set yet.' : "Couldn't transcribe that — try again, or just type it instead.");
    } finally {
        practiceAttemptRecordState = 'idle';
        updatePracticeAttemptRecordButtonUI();
    }
}

function updatePracticeAttemptRecordButtonUI() {
    const btn = document.getElementById('practice-attempt-record-btn');
    if (!btn) return;
    btn.classList.toggle('recording', practiceAttemptRecordState === 'recording');
    btn.disabled = practiceAttemptRecordState === 'transcribing';
    btn.textContent = practiceAttemptRecordState === 'recording' ? '⏹' : (practiceAttemptRecordState === 'transcribing' ? '⏳' : '🎙️');
    btn.title = practiceAttemptRecordState === 'recording' ? 'Stop recording' : (practiceAttemptRecordState === 'transcribing' ? 'Transcribing…' : 'Record your attempt instead of typing it');
}

function openPracticeModal() {
    const overlay = document.getElementById('practice-modal-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function closePracticeSession() {
    cancelPracticeAttemptRecording();
    const overlay = document.getElementById('practice-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    practiceQueue = [];
    practiceStepIndex = 0;
    practiceRevealed = false;
    practiceScopeSlotIds = new Set();
}

// ===== Entry points =====

function startPracticeFlow() {
    if (typeof isDictionarySpace === 'function' && isDictionarySpace()) {
        openPracticeModal();
        startDictionaryPractice();
        return;
    }
    renderPracticeScopePicker();
    openPracticeModal();
}

// capped: true here is a defensive no-op, not a trim — phrasesTable.js's
// toggleCardSelection already enforces the 7-unit cap live while selecting.
function startManualPracticeFromSelection() {
    const ids = [...selectedPhraseIds];
    if (!ids.length) return;
    const chosen = allPhrases.filter(p => ids.includes(p.id));
    exitSelectMode();
    openPracticeModal();
    beginPracticeSession({
        candidates: chosen,
        capped: true,
        countUnitsFn: countUnitsForPhrase,
        buildUnitsFn: buildPhraseUnits,
        itemLabel: 'phrase'
    });
}

// ===== Dictionary practice (no scope picker — just the whole space) =====

function startDictionaryPractice() {
    beginPracticeSession({
        candidates: allDictionaryEntries,
        capped: true,
        countUnitsFn: () => 1,
        buildUnitsFn: buildDictionaryUnits,
        itemLabel: 'word'
    });
}

// Treated as its own single "last sentence" so it reuses the same
// Continue/Delete branch as a phrase's final sentence.
function buildDictionaryUnits(entry) {
    return [{
        type: 'dictionary',
        entry,
        source: entry.source_synonyms || entry.source_query || '',
        sentenceIndex: 0,
        totalSentences: 1,
        isLastSentence: true
    }];
}

function countUnitsForDictionaryEntry() {
    return 1;
}

// ===== Scope picker (phrase spaces only) =====

function renderPracticeScopePicker() {
    const title = document.getElementById('practice-modal-title');
    if (title) title.textContent = 'Start practice';
    const body = document.getElementById('practice-modal-body');
    if (!body) return;

    if (!allPhrases.length) {
        body.innerHTML = `
            <div class="tag-name">No phrases in this space yet.</div>
            <div class="form-buttons"><button onclick="closePracticeSession()">Close</button></div>
        `;
        return;
    }

    body.innerHTML = `
        <div class="practice-scope-notice">
            <div>Sessions are kept short — around 5 minutes, up to 7 cards each.</div>
            <div>Phrases are picked automatically — prioritizing the ones you haven't practiced in a while.</div>
        </div>
        <div class="practice-scope-options">
            <button type="button" class="practice-scope-btn active" onclick="startRandomRoutinePractice()">🔀 Random from this space</button>
            <button type="button" class="practice-scope-btn" onclick="renderPracticeSlotScopePicker()">🕐 Choose time slots</button>
            <button type="button" class="practice-scope-btn" onclick="selectPhrasesFromScopePicker()">✅ Select phrases</button>
        </div>
    `;
}

function startRandomRoutinePractice() {
    beginPracticeSession({
        candidates: allPhrases,
        capped: true,
        countUnitsFn: countUnitsForPhrase,
        buildUnitsFn: buildPhraseUnits,
        itemLabel: 'phrase'
    });
}

function selectPhrasesFromScopePicker() {
    closePracticeSession();
    if (typeof toggleSelectMode === 'function') toggleSelectMode();
}

function renderPracticeSlotScopePicker() {
    practiceScopeSlotIds = new Set();
    const title = document.getElementById('practice-modal-title');
    if (title) title.textContent = 'Choose time slots';
    const slotList = (typeof slots !== 'undefined' ? slots : []);

    if (!slotList.length) {
        const body = document.getElementById('practice-modal-body');
        if (body) {
            body.innerHTML = `
                <div class="tag-name">This space has no time slots yet.</div>
                <div class="form-buttons"><button onclick="renderPracticeScopePicker()">Back</button></div>
            `;
        }
        return;
    }
    renderPracticeSlotScopeChips();
}

function renderPracticeSlotScopeChips() {
    const body = document.getElementById('practice-modal-body');
    if (!body) return;
    const slotList = (typeof slots !== 'undefined' ? slots : []);
    const chips = slotList.map(s => {
        const contrast = getContrastColor(s.color);
        const selected = practiceScopeSlotIds.has(s.id);
        return `<div class="tag-chip ${selected ? 'selected' : ''}" style="background:${s.color || '#333'}; color:${contrast}" onclick="togglePracticeScopeSlot('${s.id}')">${escapeHtml(s.name)}</div>`;
    }).join('');
    body.innerHTML = `
        <div class="tag-picker-chip-list">${chips}</div>
        <div class="form-buttons">
            <button onclick="renderPracticeScopePicker()">Back</button>
            <button class="primary" ${practiceScopeSlotIds.size ? '' : 'disabled'} onclick="startSlotsScopePractice()">Start</button>
        </div>
    `;
}

function togglePracticeScopeSlot(id) {
    if (practiceScopeSlotIds.has(id)) practiceScopeSlotIds.delete(id);
    else practiceScopeSlotIds.add(id);
    renderPracticeSlotScopeChips();
}

function startSlotsScopePractice() {
    const candidates = allPhrases.filter(p => p.slot_id && practiceScopeSlotIds.has(p.slot_id));
    beginPracticeSession({
        candidates,
        capped: true,
        countUnitsFn: countUnitsForPhrase,
        buildUnitsFn: buildPhraseUnits,
        itemLabel: 'phrase'
    });
}

// ===== Splitting a phrase into sentence units =====

// Splits on ".", "?" or "!", keeping the punctuation. Falls back to the
// whole text as one "sentence" if nothing matches.
function splitIntoSentenceUnits(text) {
    if (!text) return [''];
    const parts = (text.match(/[^.!?]+[.!?]*/g) || [text]).map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : [text.trim()];
}

// A fragment this short gets folded into its neighbor rather than stand
// alone as its own unit. Measured in words, not characters.
const MIN_WORDS_PER_SENTENCE_UNIT = 8;

function countWords(text) {
    return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

// Pairs the source sentences with both translated versions' sentences,
// one-to-one by index. If a translation's split has a different count than
// the source's, everything from its last matched sentence onward is
// folded onto the final pair so no text is lost.
function buildPhraseSentencePairs(phrase) {
    const sourceParts = splitIntoSentenceUnits(phrase.source_text);
    const target1Parts = splitIntoSentenceUnits(phrase.variant_1);
    const target2Parts = splitIntoSentenceUnits(phrase.variant_2);
    const count = Math.max(sourceParts.length, target1Parts.length, target2Parts.length);
    const pairs = [];
    for (let i = 0; i < count; i++) {
        const isLast = i === count - 1;
        const pick = (parts) => isLast ? parts.slice(i).join(' ') : (parts[i] || '');
        pairs.push({ source: pick(sourceParts), target1: pick(target1Parts), target2: pick(target2Parts) });
    }
    return mergeShortSentencePairs(pairs);
}

function combineSentencePairs(a, b) {
    return {
        source: [a.source, b.source].filter(Boolean).join(' '),
        target1: [a.target1, b.target1].filter(Boolean).join(' '),
        target2: [a.target2, b.target2].filter(Boolean).join(' ')
    };
}

// Merges a too-short pair forward into its neighbor (backward only at the
// very end), judged by the source's word count. Re-checks each merged
// result so several short fragments in a row still end up combined.
function mergeShortSentencePairs(pairs) {
    const merged = [...pairs];
    let i = 0;
    while (i < merged.length && merged.length > 1) {
        if (countWords(merged[i].source) >= MIN_WORDS_PER_SENTENCE_UNIT) {
            i++;
            continue;
        }
        if (i < merged.length - 1) {
            merged[i] = combineSentencePairs(merged[i], merged[i + 1]);
            merged.splice(i + 1, 1);
        } else {
            merged[i - 1] = combineSentencePairs(merged[i - 1], merged[i]);
            merged.splice(i, 1);
            i--;
        }
    }
    return merged;
}

function buildPhraseUnits(phrase) {
    const pairs = buildPhraseSentencePairs(phrase);
    return pairs.map((pair, i) => ({
        type: 'phrase',
        phrase,
        source: pair.source,
        target1: pair.target1,
        target2: pair.target2,
        sentenceIndex: i,
        totalSentences: pairs.length,
        isLastSentence: i === pairs.length - 1
    }));
}

function countUnitsForPhrase(phrase) {
    return buildPhraseSentencePairs(phrase).length || 1;
}

// Mirrors phrasesTable.js's level-badge labels — a Bridge space's "second
// version" is a different language, not a step up.
function getVariantLabels() {
    const activeSpace = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    if (activeSpace?.space_type === 'bridge' && typeof codeForLanguage === 'function') {
        return [codeForLanguage(activeSpace.target_language), codeForLanguage(activeSpace.bridge_language)];
    }
    return ['Level 1', 'Level 2'];
}

// ===== Picking which items a capped session practices =====
// Shared between phrases and dictionary entries — both carry last_practiced_at.

// Least-recently-practiced (null first) comes first, with a random
// tiebreak so repeated sessions don't always surface the same handful.
function sortByLastPracticed(items) {
    const withTiebreak = items.map(item => ({ item, r: Math.random() }));
    withTiebreak.sort((a, b) => {
        const at = a.item.last_practiced_at ? new Date(a.item.last_practiced_at).getTime() : 0;
        const bt = b.item.last_practiced_at ? new Date(b.item.last_practiced_at).getTime() : 0;
        if (at !== bt) return at - bt;
        return a.r - b.r;
    });
    return withTiebreak.map(x => x.item);
}

// Greedily adds items until the running unit count reaches targetUnits,
// always finishing the item it's partway through rather than cutting it
// off mid-sentence.
function pickSessionItems(candidates, targetUnits, countUnitsFn) {
    const ordered = sortByLastPracticed(candidates);
    const chosen = [];
    let total = 0;
    for (const item of ordered) {
        if (total >= targetUnits) break;
        chosen.push(item);
        total += countUnitsFn(item);
    }
    return chosen;
}

// ===== Running the session =====

function beginPracticeSession({ candidates, capped, countUnitsFn, buildUnitsFn, itemLabel }) {
    const chosenItems = capped ? pickSessionItems(candidates, PRACTICE_SESSION_TARGET_UNITS, countUnitsFn) : candidates;
    practiceQueue = chosenItems.flatMap(buildUnitsFn);
    practiceStepIndex = 0;
    practiceSessionItemCount = chosenItems.length;
    practiceSessionItemLabel = itemLabel;
    if (!practiceQueue.length) {
        renderPracticeDone();
        return;
    }
    renderPracticeStep();
}

function renderPracticeStep() {
    cancelPracticeAttemptRecording();
    practiceRevealed = false;
    const unit = practiceQueue[practiceStepIndex];
    const title = document.getElementById('practice-modal-title');
    if (title) title.textContent = `Practice — ${practiceStepIndex + 1} of ${practiceQueue.length}`;
    const body = document.getElementById('practice-modal-body');
    if (!body) return;
    body.innerHTML = `
        <div class="practice-question-group">
            <div class="practice-source" dir="auto">${escapeHtml(unit.source)}</div>
            <div class="practice-attempt-row">
                <textarea id="practice-attempt-input" class="practice-attempt-input" rows="2" placeholder="Try saying it in English, then type it here..."></textarea>
                ${PRACTICE_ATTEMPT_RECORDING_SUPPORTED ? `<button type="button" id="practice-attempt-record-btn" class="practice-attempt-record-btn" title="Record your attempt instead of typing it" onclick="togglePracticeAttemptRecording()">🎙️</button>` : ''}
            </div>
        </div>
        <div class="practice-reveal-area" id="practice-reveal-area" style="display:none"></div>
        <div class="form-buttons" id="practice-step-actions">
            <button type="button" class="primary" onclick="revealPracticeAnswer()">Show the real answer</button>
        </div>
    `;
    const input = document.getElementById('practice-attempt-input');
    if (input) input.focus();
}

function renderPhraseAnswerHtml(unit) {
    const [label1, label2] = getVariantLabels();
    return `
        <div class="practice-answer"><span class="practice-answer-label">${escapeHtml(label1)}</span>${escapeHtml(unit.target1)}</div>
        <div class="practice-answer"><span class="practice-answer-label">${escapeHtml(label2)}</span>${escapeHtml(unit.target2)}</div>
    `;
}

function renderDictionaryAnswerHtml(unit) {
    const e = unit.entry;
    return `
        <div class="practice-answer"><span class="practice-answer-label">Word</span>${escapeHtml(e.word || '')}</div>
        ${e.target_synonyms ? `<div class="practice-answer"><span class="practice-answer-label">Synonyms</span>${escapeHtml(e.target_synonyms)}</div>` : ''}
        ${e.example_sentence ? `<div class="practice-answer"><span class="practice-answer-label">Example</span>${escapeHtml(e.example_sentence)}</div>` : ''}
    `;
}

function revealPracticeAnswer() {
    if (practiceRevealed) return;
    practiceRevealed = true;
    const unit = practiceQueue[practiceStepIndex];
    const attemptInput = document.getElementById('practice-attempt-input');
    if (attemptInput) attemptInput.disabled = true;
    cancelPracticeAttemptRecording();
    const attemptRecordBtn = document.getElementById('practice-attempt-record-btn');
    if (attemptRecordBtn) attemptRecordBtn.disabled = true;

    const revealArea = document.getElementById('practice-reveal-area');
    if (revealArea) {
        revealArea.style.display = 'block';
        revealArea.innerHTML = unit.type === 'dictionary' ? renderDictionaryAnswerHtml(unit) : renderPhraseAnswerHtml(unit);
    }

    const actions = document.getElementById('practice-step-actions');
    if (!actions) return;
    if (unit.isLastSentence) {
        const deleteLabel = unit.type === 'dictionary' ? '🗑️ Delete word' : '🗑️ Delete phrase';
        actions.innerHTML = `
            <button type="button" class="primary" onclick="advancePracticeAfterDecision(false)">Continue</button>
            <button type="button" class="danger" onclick="advancePracticeAfterDecision(true)">${deleteLabel}</button>
        `;
    } else {
        actions.innerHTML = `<button type="button" class="primary" onclick="advancePracticeStep()">Next sentence ▸</button>`;
    }
}

// Mid-card sentence — just steps forward. Doesn't touch last_practiced_at
// or delete anything; that only happens once per phrase/word, below.
function advancePracticeStep() {
    practiceStepIndex++;
    if (practiceStepIndex >= practiceQueue.length) {
        renderPracticeDone();
        return;
    }
    renderPracticeStep();
}

// The only two things a session ever writes: delete a phrase/word, or
// stamp last_practiced_at on one that's kept. Both update the in-memory
// array too, so the table behind this overlay is already correct once the
// session closes.
async function advancePracticeAfterDecision(shouldDelete) {
    const unit = practiceQueue[practiceStepIndex];
    try {
        if (unit.type === 'dictionary') {
            const id = unit.entry.id;
            if (shouldDelete) {
                await deleteDictionaryEntry(id);
                allDictionaryEntries = allDictionaryEntries.filter(e => e.id !== id);
            } else {
                const updated = await markDictionaryEntryPracticed(id);
                const idx = allDictionaryEntries.findIndex(e => e.id === id);
                if (idx !== -1) allDictionaryEntries[idx] = { ...allDictionaryEntries[idx], last_practiced_at: updated.last_practiced_at };
            }
        } else {
            const id = unit.phrase.id;
            if (shouldDelete) {
                await deletePhrase(id);
                if (typeof deleteTtsBlobsForPhrase === 'function') await deleteTtsBlobsForPhrase(id);
                allPhrases = allPhrases.filter(p => p.id !== id);
            } else {
                const updated = await markPhrasePracticed(id);
                const idx = allPhrases.findIndex(p => p.id === id);
                if (idx !== -1) allPhrases[idx] = { ...allPhrases[idx], last_practiced_at: updated.last_practiced_at };
            }
        }
    } catch (err) {
        alert('Something went wrong saving that — continuing anyway.');
    }
    advancePracticeStep();
}

function renderPracticeDone() {
    const title = document.getElementById('practice-modal-title');
    if (title) title.textContent = 'Practice';
    const body = document.getElementById('practice-modal-body');
    if (!body) return;
    const label = practiceSessionItemLabel === 'word' ? 'word' : 'phrase';
    body.innerHTML = practiceSessionItemCount
        ? `<div class="tag-name">Done — practiced ${practiceSessionItemCount} ${label}${practiceSessionItemCount === 1 ? '' : 's'}.</div>
           <div class="form-buttons"><button type="button" class="primary" onclick="finishPracticeSession()">Close</button></div>`
        : `<div class="tag-name">Nothing to practice in that scope yet.</div>
           <div class="form-buttons"><button type="button" class="primary" onclick="closePracticeSession()">Close</button></div>`;
}

function finishPracticeSession() {
    closePracticeSession();
    renderTable();
    if (typeof renderPracticeSlotsScroll === 'function') renderPracticeSlotsScroll();
}