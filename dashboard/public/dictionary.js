// ===== Dictionary mode =====
// A parallel "context" alongside spaces — entered via the space picker
// (a "📖 Dictionary" row next to the space list), not tied to any space.
// Rather than a separate screen, it repurposes Practice (own data source +
// card template, sharing the date-scroll/learned-filter machinery already
// built for phrases) and Add (Send becomes a word lookup instead of a
// phrase capture). Analytics and Setup don't apply and are disabled while
// active.

let isDictionaryMode = localStorage.getItem('isDictionaryMode') === 'true';
let allDictionaryEntries = [];

// The single source of truth Practice/date-scroll/learned-filter read
// from — swaps between the active space's phrases and the global
// dictionary list depending on mode, so that shared machinery (built
// around allPhrases) works unchanged on either one.
function getPracticeItems() {
    return isDictionaryMode ? allDictionaryEntries : allPhrases;
}

function enterDictionaryMode() {
    isDictionaryMode = true;
    localStorage.setItem('isDictionaryMode', 'true');
    closeSpacePicker();
    applyDictionaryModeUI();

    // Analytics and Setup just became disabled — if either was the active
    // view, there's nothing there to show anymore. Land on Practice,
    // rather than leaving the person stranded on a tab they can no longer
    // reach via the tab bar.
    const activeView = document.querySelector('.view.active')?.id;
    if (activeView === 'view-analytics' || activeView === 'view-tags') {
        navigateToTab('practice');
    }

    if (typeof resetCaptureLog === 'function') resetCaptureLog();
    if (typeof resetDateScroll === 'function') resetDateScroll();
    if (typeof resetLearnedFilter === 'function') resetLearnedFilter();
    if (typeof resetTagFilter === 'function') resetTagFilter();
    loadTable();
}

// Called from setActiveSpace (spacesState.js) whenever a real space is
// picked — leaving dictionary mode is just "picking a space" like any
// other switch, not a separate action.
function exitDictionaryModeIfNeeded() {
    if (!isDictionaryMode) return;
    isDictionaryMode = false;
    localStorage.setItem('isDictionaryMode', 'false');
}

// Applies (or lifts) every UI restriction dictionary mode implies. Called
// on entry, and once on page load if a previous session left the app in
// dictionary mode.
function applyDictionaryModeUI() {
    // Header — "📖 Dictionary" instead of the space name; no health dot,
    // it's not a space.
    const nameEl = document.getElementById('space-header-name');
    const dot = document.getElementById('space-health-dot');
    if (isDictionaryMode) {
        if (nameEl) nameEl.textContent = '📖 Dictionary';
        if (dot) dot.style.display = 'none';
    } else {
        if (dot) dot.style.display = '';
        if (typeof renderSpaceHeader === 'function') renderSpaceHeader();
    }

    // Tab bar — Analytics (phrase-only) and Setup (space-only) don't apply.
    const analyticsBtn = document.querySelector('.tab-btn[data-view="analytics"]');
    const setupBtn = document.querySelector('.tab-btn[data-view="tags"]');
    [analyticsBtn, setupBtn].forEach(btn => {
        if (btn) btn.disabled = isDictionaryMode;
    });

    // Add tab — only the typed-word input + Send stay usable. The mode
    // toggle keeps its existing labels (still makes sense as a hint —
    // "Hebrew" / English word both apply), just disabled, same as the
    // transcripts-view treatment already used for #capture-input-area.
    document.querySelectorAll('#capture-mode-toggle .mode-toggle-btn').forEach(btn => {
        btn.disabled = isDictionaryMode;
    });
    const historyBtn = document.getElementById('capture-history-btn');
    if (historyBtn) historyBtn.disabled = isDictionaryMode;
    const recordBtn = document.getElementById('recording-upload-btn');
    if (recordBtn) recordBtn.disabled = isDictionaryMode;
    if (typeof captureTextInput !== 'undefined' && captureTextInput) {
        captureTextInput.placeholder = isDictionaryMode
            ? 'Type a Hebrew or English word...'
            : 'Type a Hebrew phrase...';
    }

    // Practice — tags don't apply to dictionary entries.
    const tagsBtn = document.getElementById('practice-tags-btn');
    if (tagsBtn) tagsBtn.style.display = isDictionaryMode ? 'none' : '';
}

// ===== Word lookup (triggered from Add's Send button when in dictionary mode) =====

// query: what's being looked up right now. hebrewQuery: the *original*
// Hebrew search, carried through when this call is resolving a word
// chosen from an earlier options list, so the saved entry remembers what
// was actually searched for.
async function submitDictionaryLookup(query, hebrewQuery, partOfSpeechHint) {
    const sendBtn = document.getElementById('capture-send-btn');
    captureTextInput.value = '';
    captureTextInput.style.height = 'auto';
    captureTextInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    try {
        const res = await fetch('/dictionary/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, hebrewQuery: hebrewQuery || null, partOfSpeechHint: partOfSpeechHint || null })
        });
        if (!res.ok) throw new Error('Failed to look up word');
        const data = await res.json();

        if (data.type === 'options') {
            addDictionaryOptions(data.options, data.kind, query, hebrewQuery);
        } else {
            addDictionarySavedMessage(data.entry);
            allDictionaryEntries.unshift(data.entry);
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

// Built with DOM methods rather than an HTML string — English words can
// contain apostrophes ("don't", "it's"), which would break naive
// string-interpolated onclick attributes. Event listeners with closures
// sidestep that entirely.
function addDictionaryOptions(options, kind, query, hebrewQuery) {
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
                submitDictionaryLookup(query, hebrewQuery, o.partOfSpeech);
            } else {
                submitDictionaryLookup(o.word, hebrewQuery);
            }
        });
        chipList.appendChild(chip);
    });

    container.appendChild(chipList);
    captureLog.appendChild(container);
    captureLog.scrollTop = captureLog.scrollHeight;
}

function addDictionarySavedMessage(entry) {
    const div = document.createElement('div');
    div.className = 'capture-log-item';
    div.innerHTML = `
        <div class="dictionary-word" dir="auto">✓ ${entry.word || ''}</div>
        <div class="dictionary-example">Added to your dictionary</div>
    `;
    captureLog.appendChild(div);
    captureLog.scrollTop = captureLog.scrollHeight;
}

// ===== Dictionary data + card rendering (Practice, in dictionary mode) =====

async function loadDictionaryEntries() {
    const res = await fetch('/dictionary');
    allDictionaryEntries = await res.json();
    if (typeof generateDateBuckets === 'function') generateDateBuckets();
    if (typeof renderDateScroll === 'function') renderDateScroll();
    renderTable();
}

// Called from renderTable() (phrasesTable.js) when isDictionaryMode is on
// — a different card shape (word / part of speech / synonyms / example),
// no tag badge, no 🔊. Reuses .phrase-card/.phrase-card-header/
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
                    <button class="learned-btn ${isLearned ? 'active' : ''}" title="${isLearned ? 'Learned — tap to unmark' : 'Mark as learned'}" onclick="toggleDictionaryLearned('${e.id}')">👑</button>
                    <button title="Delete word" onclick="deleteDictionaryRow('${e.id}')">🗑</button>
                </div>
                <span class="dictionary-pos">${e.part_of_speech || ''}</span>
            </div>
            <div class="phrase-card-main">
                <div class="dictionary-word" dir="auto">${e.word || ''}</div>
                ${e.hebrew_synonyms ? `<div class="dictionary-synonyms" dir="auto">${e.hebrew_synonyms}</div>` : ''}
                ${e.example_sentence ? `<div class="dictionary-example">${e.example_sentence}</div>` : ''}
                ${e.english_synonyms ? `<div class="dictionary-synonyms">${e.english_synonyms}</div>` : ''}
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