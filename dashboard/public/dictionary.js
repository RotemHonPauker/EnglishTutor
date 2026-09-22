// ===== Dictionary spaces =====
// Dictionary is a space_type now (alongside 'progression' and 'bridge'),
// not a separate global mode — a dictionary space is picked from the
// normal space picker exactly like any other space, and its id lives in
// the same activeSpaceId as everything else. This file just supplies the
// behavior that's specific to that type: word lookup instead of phrase
// capture, and a different Practice card shape. It repurposes Practice
// (own data source + card template, sharing the date-scroll/learned-filter
// machinery already built for phrases) and Add (Send becomes a word lookup
// instead of a phrase capture). Analytics and Setup don't apply and are
// disabled while a dictionary space is active.

let allDictionaryEntries = [];

function isDictionarySpace() {
    const space = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    return !!space && space.space_type === 'dictionary';
}

// The single source of truth Practice/date-scroll/learned-filter read
// from — swaps between the active space's phrases and its dictionary
// entries depending on type, so that shared machinery (built around
// allPhrases) works unchanged on either one.
function getPracticeItems() {
    return isDictionarySpace() ? allDictionaryEntries : allPhrases;
}

// Applies (or lifts) every UI restriction a dictionary space implies.
// Called on page load and on every space switch (setActiveSpace) — always
// derived fresh from the active space's type rather than a separate flag,
// so there's no "enter/exit" step to keep in sync with space switching.
function applyDictionaryModeUI() {
    const dict = isDictionarySpace();

    // Tab bar — Analytics (phrase-only) and Setup (space-rules only) don't
    // apply to a dictionary space.
    const analyticsBtn = document.querySelector('.tab-btn[data-view="analytics"]');
    const setupBtn = document.querySelector('.tab-btn[data-view="tags"]');
    [analyticsBtn, setupBtn].forEach(btn => {
        if (btn) btn.disabled = dict;
    });

    // Add tab — only the typed-word input + Send stay usable. Forces the
    // Type/Dictionary/Record icon selector onto "Dictionary" and disables
    // switching away from it entirely, since nothing else applies while
    // this whole space is dictionary lookups. Only forces the mode while
    // active — leaving it alone on the way out is resetCaptureLog's job,
    // so a manual "Dictionary" pick made in a normal space isn't clobbered
    // by an unrelated re-render here.
    document.querySelectorAll('#capture-mode-icons .capture-mode-icon-btn, #capture-history-btn').forEach(btn => {
        btn.disabled = dict;
    });
    if (dict && typeof setAddInputMode === 'function') {
        setAddInputMode('dictionary');
    }

    // Practice — tags don't apply to dictionary entries.
    const tagsBtn = document.getElementById('practice-tags-btn');
    if (tagsBtn) tagsBtn.style.display = dict ? 'none' : '';
}

// ===== Quick lookup from a non-dictionary space =====
// Picking 📖 from any regular space's Add tab still routes Send to a
// dictionary lookup — but now that needs a specific dictionary SPACE to
// save into (entries carry a space_id). If the active space already is
// one, use it directly (dict spaces lock straight onto this path via
// applyDictionaryModeUI above). Otherwise: exactly one dictionary space
// existing is an easy default; more than one needs the person to pick
// which; none existing means there's nowhere to save yet.

function resolveDictionarySpaceIdAndProceed(onResolved) {
    if (isDictionarySpace()) {
        onResolved(activeSpaceId);
        return;
    }
    const dictSpaces = (typeof spaces !== 'undefined' ? spaces : []).filter(s => s.space_type === 'dictionary');
    if (dictSpaces.length === 0) {
        addCaptureMessage('No dictionary space yet — create one from the space picker first.');
        return;
    }
    if (dictSpaces.length === 1) {
        onResolved(dictSpaces[0].id);
        return;
    }
    renderDictionarySpacePicker(dictSpaces, onResolved);
}

function renderDictionarySpacePicker(dictSpaces, onResolved) {
    const container = document.createElement('div');
    container.className = 'capture-log-item';

    const prompt = document.createElement('div');
    prompt.className = 'dictionary-options-prompt';
    prompt.textContent = 'Which dictionary?';
    container.appendChild(prompt);

    const chipList = document.createElement('div');
    chipList.className = 'dictionary-option-list';

    dictSpaces.forEach(s => {
        const chip = document.createElement('div');
        chip.className = 'dictionary-option-chip';
        chip.textContent = s.name;
        chip.addEventListener('click', () => {
            chipList.querySelectorAll('.dictionary-option-chip').forEach(c => c.style.pointerEvents = 'none');
            onResolved(s.id);
        });
        chipList.appendChild(chip);
    });

    container.appendChild(chipList);
    captureLog.appendChild(container);
    captureLog.scrollTop = captureLog.scrollHeight;
}

// ===== Word lookup (triggered from Add's Send button when in a dictionary space) =====

// query: what's being looked up right now. sourceQuery: the *original*
// source-language search, carried through when this call is resolving a
// word chosen from an earlier options list, so the saved entry remembers
// what was actually searched for. spaceId: which dictionary this lookup
// (and its language pair) belongs to.
async function submitDictionaryLookup(query, sourceQuery, partOfSpeechHint, spaceId) {
    const sendBtn = document.getElementById('capture-send-btn');
    captureTextInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    try {
        const res = await fetch('/dictionary/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spaceId, query, sourceQuery: sourceQuery || null, partOfSpeechHint: partOfSpeechHint || null })
        });
        if (!res.ok) throw new Error('Failed to look up word');
        const data = await res.json();

        if (data.type === 'options') {
            addDictionaryOptions(data.options, data.kind, query, sourceQuery, spaceId);
        } else {
            addDictionarySavedMessage(data.entry);
            if (spaceId === activeSpaceId) allDictionaryEntries.unshift(data.entry);
        }
    } catch (err) {
        addCaptureMessage("Couldn't look that up — try again.");
    } finally {
        captureTextInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = '➤';
        captureTextInput.focus();
    }
}

// Built with DOM methods rather than an HTML string — words can contain
// apostrophes ("don't", "it's"), which would break naive
// string-interpolated onclick attributes. Event listeners with closures
// sidestep that entirely.
function addDictionaryOptions(options, kind, query, sourceQuery, spaceId) {
    const container = document.createElement('div');
    container.className = 'capture-log-item';

    if (!options.length) {
        container.textContent = "Couldn't find any translations for that.";
        captureLog.appendChild(container);
        captureLog.scrollTop = captureLog.scrollHeight;
        return;
    }

    const prompt = document.createElement('div');
    prompt.className = 'dictionary-options-prompt';
    prompt.textContent = kind === 'senses' ? 'Which meaning did you mean?' : 'Which word did you mean?';
    container.appendChild(prompt);

    const chipList = document.createElement('div');
    chipList.className = 'dictionary-option-list';

    options.forEach(o => {
        const chip = document.createElement('div');
        chip.className = 'dictionary-option-chip';
        chip.textContent = kind === 'senses' ? o.partOfSpeech : o.word;
        if (o.context) {
            const contextSpan = document.createElement('span');
            contextSpan.className = 'dictionary-option-context';
            contextSpan.textContent = ` (${o.context})`;
            chip.appendChild(contextSpan);
        }
        chip.addEventListener('click', () => {
            chipList.querySelectorAll('.tag-chip').forEach(c => c.style.pointerEvents = 'none');
            if (kind === 'senses') {
                // Same word, resubmitted with a part-of-speech hint so the
                // model locks onto this sense instead of re-triggering the
                // same ambiguity.
                submitDictionaryLookup(query, sourceQuery, o.partOfSpeech, spaceId);
            } else {
                submitDictionaryLookup(o.word, sourceQuery, null, spaceId);
            }
        });
        chipList.appendChild(chip);
    });

    container.appendChild(chipList);
    captureLog.appendChild(container);
    captureLog.scrollTop = captureLog.scrollHeight;
}

// Shows the resolved entry the same way it'll look in Practice — word,
// part of speech, synonyms, example — instead of a bare "added" line, so
// the person can see (and sanity-check) the actual translation right away.
function addDictionarySavedMessage(entry) {
    const div = document.createElement('div');
    div.className = 'capture-log-item';
    div.innerHTML = `
        <div class="dictionary-word" dir="auto">${entry.word || ''}</div>
        ${entry.part_of_speech ? `<span class="dictionary-pos">${entry.part_of_speech}</span>` : ''}
        ${entry.source_synonyms ? `<div class="dictionary-synonyms" dir="auto">${entry.source_synonyms}</div>` : ''}
        ${entry.example_sentence ? `<div class="dictionary-example">${entry.example_sentence}</div>` : ''}
        ${entry.target_synonyms ? `<div class="dictionary-synonyms">${entry.target_synonyms}</div>` : ''}
    `;
    captureLog.appendChild(div);
    captureLog.scrollTop = captureLog.scrollHeight;
}

// ===== Dictionary data + card rendering (Practice, in a dictionary space) =====

async function loadDictionaryEntries(spaceId) {
    const res = await fetch(`/dictionary?spaceId=${spaceId}`);
    allDictionaryEntries = await res.json();
    if (typeof generateDateBuckets === 'function') generateDateBuckets();
    if (typeof renderDateScroll === 'function') renderDateScroll();
    renderTable();
}

// Called from renderTable() (phrasesTable.js) when the active space is a
// dictionary — a different card shape (word / part of speech / synonyms /
// example), no tag badge, no 🔊. Reuses .phrase-card/.phrase-card-header/
// .phrase-card-icons/.phrase-card-main and the learned-state styling
// as-is, so only the dictionary-specific inner pieces need their own CSS.
function renderDictionaryCards() {
    const sorted = allDictionaryEntries
        .filter(phraseMatchesLearnedFilter)
        .filter(phraseMatchesDateFilter)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    document.getElementById('phrase-count').textContent = sorted.length;

    tableBody.innerHTML = sorted.map(e => {
        const isLearned = !!e.learned_at;
        const cardClasses = ['phrase-card', 'dictionary-card', isLearned ? 'learned' : ''].filter(Boolean).join(' ');
        return `
        <div class="${cardClasses}">
            <div class="phrase-card-header">
                <div class="phrase-card-icons">
                    <button title="Delete word" onclick="deleteDictionaryRow('${e.id}')">🗑️</button>
                    <button class="learned-btn ${isLearned ? 'active' : ''}" title="${isLearned ? 'Learned — tap to unmark' : 'Mark as learned'}" onclick="toggleDictionaryLearned('${e.id}')">👑</button>
                </div>
                <span class="dictionary-pos">${e.part_of_speech || ''}</span>
            </div>
            <div class="phrase-card-main">
                <div class="dictionary-word" dir="auto">${e.word || ''}</div>
                ${e.source_synonyms ? `<div class="dictionary-synonyms" dir="auto">${e.source_synonyms}</div>` : ''}
                ${e.example_sentence ? `<div class="dictionary-example">${e.example_sentence}</div>` : ''}
                ${e.target_synonyms ? `<div class="dictionary-synonyms">${e.target_synonyms}</div>` : ''}
            </div>
        </div>
        `;
    }).join('');
}

// Same optimistic-update pattern as toggleLearned (phrasesTable.js), just
// against /dictionary instead of /phrases.
async function toggleDictionaryLearned(id) {
    const entry = allDictionaryEntries.find(e => e.id === id);
    if (!entry) return;
    const nextLearned = !entry.learned_at;
    entry.learned_at = nextLearned ? new Date().toISOString() : null;
    renderTable();
    try {
        const res = await fetch(`/dictionary/${id}/learned`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ learned: nextLearned })
        });
        if (!res.ok) throw new Error('Failed to update learned status');
        const updated = await res.json();
        entry.learned_at = updated.learned_at;
        renderTable();
    } catch (err) {
        entry.learned_at = nextLearned ? null : new Date().toISOString();
        renderTable();
        alert('Failed to update learned status');
    }
}

// Reuses the same delete-confirm modal as phrases (see pendingDeleteType
// in phrasesTable.js) — just points it at a word instead of a phrase.
function deleteDictionaryRow(id) {
    const entry = allDictionaryEntries.find(e => e.id === id);
    pendingDeleteId = id;
    pendingDeleteType = 'dictionary';
    document.getElementById('delete-modal-text').innerHTML =
        `Delete "${entry ? entry.word : 'this word'}"? This can't be undone.`;
    document.getElementById('delete-modal-overlay').style.display = 'flex';
}