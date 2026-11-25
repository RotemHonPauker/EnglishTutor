// ===== Dictionary spaces =====
// A dictionary is a space_type, picked and switched to like any other
// space. This file supplies the type-specific behavior: word lookup
// instead of phrase capture, and a different Practice card shape.
// Needs localDb.js, dictionaryEngine.js, geminiClient.js and ttsStorage.js
// loaded first.

let allDictionaryEntries = [];

function isDictionarySpace() {
    const space = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    return !!space && space.space_type === 'dictionary';
}

function getPracticeItems() {
    return isDictionarySpace() ? allDictionaryEntries : allPhrases;
}

// Called on load and on every space switch — derives UI restrictions
// fresh from the active space's type.
function applyDictionaryModeUI() {
    const dict = isDictionarySpace();

    const transcriptsBtn = document.querySelector('.tab-btn[data-view="transcripts"]');
    const setupBtn = document.querySelector('.tab-btn[data-view="tags"]');
    [transcriptsBtn, setupBtn].forEach(btn => {
        if (btn) btn.disabled = dict;
    });

    document.querySelectorAll('#capture-mode-icons .capture-mode-icon-btn').forEach(btn => {
        btn.disabled = dict;
    });
    if (dict && typeof setAddInputMode === 'function') {
        setAddInputMode('dictionary');
    }
}

// ===== Quick lookup from a non-dictionary space =====

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

// ===== Word lookup =====

async function submitDictionaryLookup(query, sourceQuery, partOfSpeechHint, spaceId) {
    const sendBtn = document.getElementById('capture-send-btn');
    captureTextInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    try {
        const spaceFields = await getSpaceRuleFields(spaceId);
        const result = await lookupWord(query.trim(), spaceFields.sourceLanguage, spaceFields.targetLanguage, partOfSpeechHint || null);

        if (result.type === 'options') {
            addDictionaryOptions(result.options || [], result.kind, query, sourceQuery, spaceId);
        } else {
            const entry = await saveDictionaryEntry({
                spaceId,
                sourceQuery: sourceQuery || null,
                word: result.word,
                partOfSpeech: result.partOfSpeech,
                sourceSynonyms: (result.sourceSynonyms || []).join(', '),
                exampleSentence: result.exampleSentence,
                targetSynonyms: (result.targetSynonyms || []).join(', ')
            });
            addDictionarySavedMessage(entry);
            if (spaceId === activeSpaceId) allDictionaryEntries.unshift(entry);
        }
    } catch (err) {
        addCaptureMessage(err.code === 'NO_API_KEY' ? 'No Gemini API key set yet.' : "Couldn't look that up — try again.");
    } finally {
        captureTextInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = '➤';
        captureTextInput.focus();
    }
}

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

function addDictionarySavedMessage(entry) {
    const div = document.createElement('div');
    div.className = 'capture-log-item';
    div.innerHTML = `
        <div class="dictionary-word" dir="auto">${escapeHtml(entry.word || '')}</div>
        ${entry.part_of_speech ? `<span class="dictionary-pos">${escapeHtml(entry.part_of_speech)}</span>` : ''}
        ${entry.source_synonyms ? `<div class="dictionary-synonyms" dir="auto">${escapeHtml(entry.source_synonyms)}</div>` : ''}
        ${entry.example_sentence ? `<div class="dictionary-example">${escapeHtml(entry.example_sentence)}</div>` : ''}
        ${entry.target_synonyms ? `<div class="dictionary-synonyms">${escapeHtml(entry.target_synonyms)}</div>` : ''}
    `;
    captureLog.appendChild(div);
    captureLog.scrollTop = captureLog.scrollHeight;
}

// ===== Dictionary data + card rendering (Practice, in a dictionary space) =====

async function loadDictionaryEntries(spaceId) {
    allDictionaryEntries = await getDictionaryEntries(spaceId);
    renderTable();
}

// Shares phrasesTable.js's playback state (currentlyPlayingAudio/Btn) so
// a word's audio stops any phrase card's audio, and vice versa.
async function playDictionaryAudio(entryId, btnEl) {
    if (currentlyPlayingBtn === btnEl && currentlyPlayingAudio) {
        stopCurrentAudio();
        return;
    }
    stopCurrentAudio();

    const entry = allDictionaryEntries.find(e => e.id === entryId);
    if (!entry) return;

    const originalContent = btnEl.textContent;
    btnEl.disabled = true;
    btnEl.textContent = '⏳';
    try {
        const url = await getOrCreateDictionaryAudioUrl(entry);
        btnEl.disabled = false;
        btnEl.textContent = originalContent;
        startPlayback(url, btnEl);
    } catch (err) {
        alert(err.code === 'NO_API_KEY' ? 'No Gemini API key set yet.' : 'Failed to play audio');
        btnEl.disabled = false;
        btnEl.textContent = originalContent;
    }
}

// Called from renderTable() (phrasesTable.js) when the active space is a dictionary.
function renderDictionaryCards() {
    const sorted = [...allDictionaryEntries].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    tableBody.innerHTML = sorted.map(e => `
        <div class="phrase-card dictionary-card">
            <div class="phrase-card-header">
                <div class="phrase-card-icons">
                    <button title="Delete word" onclick="deleteDictionaryRow('${e.id}')">🗑️</button>
                </div>
                <div class="phrase-card-badges">
                    ${isCardOld(e) ? `<button class="old-badge" title="Created over a month ago — tap to delete" onclick="deleteDictionaryRow('${e.id}')">🕓 Old</button>` : ''}
                    <span class="dictionary-pos">${escapeHtml(e.part_of_speech || '')}</span>
                </div>
            </div>
            <div class="phrase-card-main">
                <div class="dictionary-word" dir="auto"><button class="tts-btn" title="Play" onclick="playDictionaryAudio('${e.id}', this)">🔊</button> ${escapeHtml(e.word || '')}</div>
                ${e.source_synonyms ? `<div class="dictionary-synonyms" dir="auto">${escapeHtml(e.source_synonyms)}</div>` : ''}
                ${e.example_sentence ? `<div class="dictionary-example">${escapeHtml(e.example_sentence)}</div>` : ''}
                ${e.target_synonyms ? `<div class="dictionary-synonyms">${escapeHtml(e.target_synonyms)}</div>` : ''}
            </div>
        </div>
    `).join('');
}

function deleteDictionaryRow(id) {
    const entry = allDictionaryEntries.find(e => e.id === id);
    pendingDeleteId = id;
    pendingDeleteType = 'dictionary';
    document.getElementById('delete-modal-text').innerHTML =
        `Delete "${escapeHtml(entry ? entry.word : 'this word')}"? This can't be undone.`;
    document.getElementById('delete-modal-overlay').style.display = 'flex';
}