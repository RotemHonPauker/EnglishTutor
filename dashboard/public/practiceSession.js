// ===== Practice session (production drills) =====
// This is the actual daily habit loop Fraza was missing: capturing and
// translating a phrase (or looking up a word) was never the same thing as
// practicing it. A session is short and self-graded — no AI feedback, no
// scoring, nothing written to the database except when a unit is actually
// finished (see advancePracticeAfterDecision below). For each unit it:
//   1. Shows a source-language prompt — a phrase's own Hebrew sentence, or
//      a dictionary word's own Hebrew query/synonyms (see "Units" below).
//   2. Lets you try saying/typing it in English yourself — this attempt
//      is NEVER saved anywhere, not even temporarily to IndexedDB; it's
//      plain in-memory UI state, frozen in place once revealed and
//      discarded the moment you move on.
//   3. Reveals the real English content this unit was actually captured/
//      corrected to.
//   4. On the LAST sentence of a (possibly multi-sentence) phrase, or on a
//      dictionary word's own single unit, offers exactly two choices:
//      Continue (keep it, stamp last_practiced_at so a future session
//      deprioritizes it) or Delete (it's solid enough that there's no
//      reason to keep seeing it). Every other sentence of a multi-sentence
//      phrase just auto-advances to the next one with a single tap, since
//      the phrase itself isn't "done" yet.
//
// Needs localDb.js, colorUtils.js, phrasesTable.js, slots.js, and
// dictionary.js loaded first.

// ===== Units =====
// A phrase captured from one continuous recording/monologue can contain
// several sentences back-to-back. Splitting those into separate units (by
// punctuation — see splitIntoSentenceUnits) is what lets a long card still
// be practiced sentence-by-sentence instead of as one unwieldy block. A
// dictionary word is always exactly one unit — there's no multi-sentence
// concept there. Either way, "units" (not phrases/words) is what the
// 7-unit session target below actually counts, via each item's own
// countUnitsFn (see pickSessionItems).

const PRACTICE_SESSION_TARGET_UNITS = 7;

let practiceQueue = [];        // flat list of unit objects — see buildPhraseUnits/buildDictionaryUnits
let practiceStepIndex = 0;
let practiceSessionItemCount = 0;   // for the "Practiced N phrases/words" done screen
let practiceSessionItemLabel = 'phrase'; // 'phrase' | 'word'
let practiceRevealed = false;
let practiceScopeSlotIds = new Set();

function openPracticeModal() {
    const overlay = document.getElementById('practice-modal-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function closePracticeSession() {
    const overlay = document.getElementById('practice-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    practiceQueue = [];
    practiceStepIndex = 0;
    practiceRevealed = false;
    practiceScopeSlotIds = new Set();
}

// ===== Entry points =====

// Wired to the Practice tab toolbar's "Start practice" button, for both
// phrase contexts and dictionary contexts (dictionary.js's
// applyDictionaryModeUI keeps this button visible either way, just with a
// different flow behind it — dictionary practice has nothing to scope by
// the way phrases do (no time slots, no manual multi-select there), so it
// skips the scope picker entirely and starts straight away).
function startPracticeFlow() {
    if (typeof isDictionarySpace === 'function' && isDictionarySpace()) {
        openPracticeModal();
        startDictionaryPractice();
        return;
    }
    renderPracticeScopePicker();
    openPracticeModal();
}

// Wired to the selection bar's own "Start practice" action
// (startPracticeFromSelection, phrasesTable.js) — practices exactly the
// phrases that were manually checked, in full, with no 7-unit cap. A
// deliberate pick IS the scope here, not a sample to be trimmed from.
// (The selection bar only exists in phrase contexts — dictionary cards
// don't currently support multi-select — so this is always phrases.)
function startManualPracticeFromSelection() {
    const ids = [...selectedPhraseIds];
    if (!ids.length) return;
    const chosen = allPhrases.filter(p => ids.includes(p.id));
    exitSelectMode();
    openPracticeModal();
    beginPracticeSession({
        candidates: chosen,
        capped: false,
        countUnitsFn: countUnitsForPhrase,
        buildUnitsFn: buildPhraseUnits,
        itemLabel: 'phrase'
    });
}

// ===== Dictionary practice (no scope picker — just the whole context) =====

function startDictionaryPractice() {
    beginPracticeSession({
        candidates: allDictionaryEntries,
        capped: true,
        countUnitsFn: () => 1,
        buildUnitsFn: buildDictionaryUnits,
        itemLabel: 'word'
    });
}

// A dictionary word has no sentences to drill through — just its own
// source-language cue (the Hebrew synonyms saved for it — source_query is
// only ever set when a lookup got resolved from a disambiguation list, so
// it's null most of the time; source_synonyms is the one reliably-
// populated Hebrew field) and, on reveal, everything about it at once: the
// English word, its synonyms, and the example sentence. Treated as its own
// single "last sentence" so it reuses the exact same Continue/Delete
// branch as a phrase's final sentence, with no separate code path needed
// for that decision.
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

// ===== Scope picker (phrase contexts only — the overlay's first screen) =====

function renderPracticeScopePicker() {
    const title = document.getElementById('practice-modal-title');
    if (title) title.textContent = 'Start practice';
    const body = document.getElementById('practice-modal-body');
    if (!body) return;

    if (!allPhrases.length) {
        body.innerHTML = `
            <div class="tag-name">No phrases in this context yet.</div>
            <div class="form-buttons"><button onclick="closePracticeSession()">Close</button></div>
        `;
        return;
    }

    body.innerHTML = `
        <div class="practice-scope-options">
            <button type="button" class="mode-toggle-btn active practice-scope-btn" onclick="startRandomRoutinePractice()">🔀 Random from this context</button>
            <button type="button" class="mode-toggle-btn active practice-scope-btn" onclick="renderPracticeSlotScopePicker()">🕐 Choose time slots</button>
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

function renderPracticeSlotScopePicker() {
    practiceScopeSlotIds = new Set();
    const title = document.getElementById('practice-modal-title');
    if (title) title.textContent = 'Choose time slots';
    const slotList = (typeof slots !== 'undefined' ? slots : []);

    if (!slotList.length) {
        const body = document.getElementById('practice-modal-body');
        if (body) {
            body.innerHTML = `
                <div class="tag-name">This context has no time slots yet.</div>
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

// Splits on ".", "?" or "!", keeping the punctuation attached to the
// sentence it ends. Trims whitespace and drops empty pieces (double
// punctuation, a trailing space after the last sentence, etc). Falls back
// to the whole original text as a single "sentence" if nothing matches at
// all (no terminal punctuation, or an empty string).
function splitIntoSentenceUnits(text) {
    if (!text) return [''];
    const parts = (text.match(/[^.!?]+[.!?]*/g) || [text]).map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : [text.trim()];
}

// A split that leaves a tiny fragment next to it (e.g. "זהו." / "That's
// it.") isn't a sentence worth practicing on its own — it gets folded into
// its neighbor instead. Measured in words, not characters, since that's
// what actually makes a fragment feel too small to stand alone regardless
// of language.
const MIN_WORDS_PER_SENTENCE_UNIT = 8;

function countWords(text) {
    return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

// Pairs a phrase's Hebrew sentences with BOTH of its translated versions'
// sentences, one-to-one by index — correct whenever each translation
// really is a sentence-by-sentence rendering of the same recording/
// monologue, which is the only time a phrase is more than one sentence in
// the first place. If a translation's own split comes out with a
// different count than the Hebrew source's (an uneven translation),
// everything from its last matched sentence onward is folded onto that
// final pair instead of being dropped, so no text is ever lost — it just
// appears together on the last sentence rather than split out on its own.
// The two translations are split independently of each other, so a
// mismatch on one side never affects the other's own pairing.
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

// Merges a too-short pair into a neighbor (forward when possible, since
// that reads most naturally; backward only for a short pair stuck at the
// very end). Judged by the Hebrew source's own word count — that's the
// side actually being read and attempted in a session, so it's the one
// that decides whether a sentence feels too small to stand alone.
// Re-checks each merged result before moving on, so several short
// fragments in a row still end up combined into one normal-sized sentence
// rather than merging only one pair at a time.
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
            // stay at i — the just-merged pair might still be short
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

// Mirrors the level-badge labels used in the table itself (phrasesTable.js's
// renderTable) — a Bridge context's "second version" is a different
// language entirely, not a step up, so it gets that language's own code
// instead of "Level 2".
function getVariantLabels() {
    const activeSpace = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    if (activeSpace?.space_type === 'bridge' && typeof codeForLanguage === 'function') {
        return [codeForLanguage(activeSpace.target_language), codeForLanguage(activeSpace.bridge_language)];
    }
    return ['Level 1', 'Level 2'];
}

// ===== Picking which items a capped session practices =====
// Shared between phrases and dictionary entries — both carry the same
// last_practiced_at field (see localDb.js's markPhrasePracticed/
// markDictionaryEntryPracticed), so the same ordering works for either.

// Orders candidates so the ones practiced longest ago (or never — null
// sorts first) come first, with a random tiebreak among equal
// last_practiced_at values (almost always several "never practiced" items
// at once) so repeated sessions don't always surface the same handful in
// the same order.
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

// Greedily adds candidates (least-recently-practiced first) until the
// running unit count (via countUnitsFn — one sentence-pair count per
// phrase, always 1 for a dictionary word) reaches targetUnits — always
// finishing whichever item it's partway through rather than cutting one
// off mid-sentence, so a session's real unit count can run slightly over
// the target rather than under it.
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
    practiceRevealed = false;
    const unit = practiceQueue[practiceStepIndex];
    const title = document.getElementById('practice-modal-title');
    if (title) title.textContent = `Practice — ${practiceStepIndex + 1} of ${practiceQueue.length}`;
    const body = document.getElementById('practice-modal-body');
    if (!body) return;
    body.innerHTML = `
        <div class="practice-source" dir="auto">${escapeHtml(unit.source)}</div>
        <textarea id="practice-attempt-input" class="practice-attempt-input" rows="2" placeholder="Try saying it in English, then type it here..."></textarea>
        <div class="practice-reveal-area" id="practice-reveal-area" style="display:none"></div>
        <div class="form-buttons" id="practice-step-actions">
            <button type="button" class="primary" onclick="revealPracticeAnswer()">Show the real answer</button>
        </div>
    `;
    const input = document.getElementById('practice-attempt-input');
    if (input) input.focus();
}

// Builds the reveal area's content for a phrase unit — both translated
// versions of this sentence, labeled (see getVariantLabels).
function renderPhraseAnswerHtml(unit) {
    const [label1, label2] = getVariantLabels();
    return `
        <div class="practice-answer"><span class="practice-answer-label">${escapeHtml(label1)}</span>${escapeHtml(unit.target1)}</div>
        <div class="practice-answer"><span class="practice-answer-label">${escapeHtml(label2)}</span>${escapeHtml(unit.target2)}</div>
    `;
}

// Builds the reveal area's content for a dictionary unit — the word
// itself, its synonyms, and the example sentence, all at once (there's
// nothing further to step through after this).
function renderDictionaryAnswerHtml(unit) {
    const e = unit.entry;
    return `
        <div class="practice-answer"><span class="practice-answer-label">Word</span>${escapeHtml(e.word || '')}</div>
        ${e.target_synonyms ? `<div class="practice-answer"><span class="practice-answer-label">Synonyms</span>${escapeHtml(e.target_synonyms)}</div>` : ''}
        ${e.example_sentence ? `<div class="practice-answer"><span class="practice-answer-label">Example</span>${escapeHtml(e.example_sentence)}</div>` : ''}
    `;
}

// Freezes whatever was just typed right where it is (so it stays visible
// for comparison without being repeated a second time below) and shows
// the real answer. Then swaps the action row to either a single "next
// sentence" button (mid-card, phrases only) or the real Continue/Delete
// choice (end of card, or always for a dictionary word) — see the
// file-level comment above for why those are different.
function revealPracticeAnswer() {
    if (practiceRevealed) return;
    practiceRevealed = true;
    const unit = practiceQueue[practiceStepIndex];
    const attemptInput = document.getElementById('practice-attempt-input');
    if (attemptInput) attemptInput.disabled = true;

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

// Mid-card sentence — just steps forward. Deliberately doesn't touch
// last_practiced_at or delete anything; that only ever happens once per
// phrase/word, on its own final decision below, so a multi-sentence
// phrase isn't written to IndexedDB several times for one practice pass.
function advancePracticeStep() {
    practiceStepIndex++;
    if (practiceStepIndex >= practiceQueue.length) {
        renderPracticeDone();
        return;
    }
    renderPracticeStep();
}

// The only two things a practice session ever writes anywhere: deleting a
// phrase/word outright, or stamping last_practiced_at on one that's kept.
// Both update the matching in-memory array too (allPhrases or
// allDictionaryEntries), so the table behind this overlay is already
// correct the moment the session closes (see finishPracticeSession)
// without needing a full reload.
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

// Closes the overlay and refreshes everything behind it that a session
// could have changed (a deleted phrase/word disappearing, the slots
// scroll's own per-slot phrase counts) — without a full loadTable()
// round-trip, since allPhrases/allDictionaryEntries are already up to
// date (see advancePracticeAfterDecision above).
function finishPracticeSession() {
    closePracticeSession();
    renderTable();
    if (typeof renderPracticeSlotsScroll === 'function') renderPracticeSlotsScroll();
}