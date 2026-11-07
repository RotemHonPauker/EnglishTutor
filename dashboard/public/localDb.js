// localDb.js — replaces remoteDb.js (and, with it, Supabase entirely).
// Same function names and shapes as remoteDb.js, so the rest of the app's
// logic doesn't change at all — just which data-layer file index.html
// loads. A plain classic script (no import/export), same as every other
// file in public/: these are top-level consts, which makes them ordinary
// globals other scripts call directly.
//
// Storage: IndexedDB, entirely inside this browser. There is no server,
// no login, no network call for any of this — every function below reads
// or writes this device's own local database. Nothing here is shared
// between devices; see ttsStorage.js for the same idea already in use
// for cached audio, and backup.js for the Export/Import feature that's
// the only way data moves between devices now.
//
// IndexedDB lets a single transaction span several object stores
// atomically — unlike the old Supabase-over-REST version, so the
// multi-table operations below (deleteSpace, migrateSpace, mergeTags)
// are genuinely all-or-nothing again, the way the original server-side
// database.js was with a real Postgres transaction.

const DB_NAME = 'fraza-db';
const DB_VERSION = 1;
const STORE_NAMES = ['spaces', 'tags', 'phrases', 'dictionary', 'transcripts'];

const TAG_COLORS = [
    '#AD1457', '#D81B60', '#E67C73', '#F4511E',
    '#F09300', '#F6BF26', '#7CB342', '#0B8043',
    '#009688', '#33B679', '#039BE5', '#3F51B5',
    '#B39DDB', '#9E69AF', '#8E24AA', '#795548'
];

// --- IndexedDB plumbing -----------------------------------------------
// Everything below this block is a thin, promise-based wrapper around the
// raw IndexedDB API (which is callback/event based). The rest of the
// file — the actual Fraza functions — never touches IDBRequest/
// IDBTransaction directly.

let dbPromise = null;

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            const spaces = db.createObjectStore('spaces', { keyPath: 'id' });
            spaces.createIndex('created_at', 'created_at');

            const tags = db.createObjectStore('tags', { keyPath: 'id' });
            tags.createIndex('space_id', 'space_id');

            const phrases = db.createObjectStore('phrases', { keyPath: 'id' });
            phrases.createIndex('space_id', 'space_id');
            phrases.createIndex('tag_id', 'tag_id');

            const dictionary = db.createObjectStore('dictionary', { keyPath: 'id' });
            dictionary.createIndex('space_id', 'space_id');

            const transcripts = db.createObjectStore('transcripts', { keyPath: 'id' });
            transcripts.createIndex('space_id', 'space_id');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

function newId() {
    return crypto.randomUUID();
}

function reqToPromise(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function txDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
}

async function idbGet(storeName, id) {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readonly');
    const result = await reqToPromise(tx.objectStore(storeName).get(id));
    return result || null;
}

async function idbGetAll(storeName) {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readonly');
    return (await reqToPromise(tx.objectStore(storeName).getAll())) || [];
}

async function idbGetAllByIndex(storeName, indexName, value) {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readonly');
    const index = tx.objectStore(storeName).index(indexName);
    return (await reqToPromise(index.getAll(value))) || [];
}

async function idbCountByIndex(storeName, indexName, value) {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readonly');
    const index = tx.objectStore(storeName).index(indexName);
    return await reqToPromise(index.count(value));
}

async function idbPut(storeName, row) {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(row);
    await txDone(tx);
    return row;
}

async function idbDelete(storeName, id) {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    await txDone(tx);
}

function sortByCreatedAt(rows, ascending) {
    return [...rows].sort((a, b) => {
        const diff = new Date(a.created_at) - new Date(b.created_at);
        return ascending ? diff : -diff;
    });
}

function notFoundError(storeName, id) {
    return new Error(`No row with id ${id} in ${storeName}`);
}

// --- Phrases ------------------------------------------------------------

const saveSentence = async ({ sourceText, variant1, variant2, spaceId, tagId }) => {
    const row = {
        id: newId(),
        source_text: sourceText,
        variant_1: variant1,
        variant_2: variant2,
        space_id: spaceId,
        tag_id: tagId || null,
        level: 1,
        learned_at: null,
        tts_url_variant1: null,
        tts_url_variant2: null,
        created_at: new Date().toISOString()
    };
    return idbPut('phrases', row);
};

const getPhraseById = async (id) => idbGet('phrases', id);

// Editor-driven save: same as the original — overwrites wording, clears
// the cached-audio flags (see updatePhraseTtsFlag below for why these are
// flags now, not URLs).
const updatePhrase = async ({ id, sourceText, variant1, variant2 }) => {
    const existing = await idbGet('phrases', id);
    if (!existing) throw notFoundError('phrases', id);
    const updated = {
        ...existing,
        source_text: sourceText,
        variant_1: variant1,
        variant_2: variant2,
        tts_url_variant1: null,
        tts_url_variant2: null
    };
    return idbPut('phrases', updated);
};

const updatePhraseTag = async ({ id, tagId }) => {
    const existing = await idbGet('phrases', id);
    if (!existing) throw notFoundError('phrases', id);
    return idbPut('phrases', { ...existing, tag_id: tagId || null });
};

const updatePhraseLevel = async ({ id, level }) => {
    const existing = await idbGet('phrases', id);
    if (!existing) throw notFoundError('phrases', id);
    return idbPut('phrases', { ...existing, level });
};

const updatePhraseLearned = async ({ id, learned }) => {
    const existing = await idbGet('phrases', id);
    if (!existing) throw notFoundError('phrases', id);
    return idbPut('phrases', { ...existing, learned_at: learned ? new Date().toISOString() : null });
};

const bulkMovePhrases = async ({ ids, targetSpaceId }) => {
    const db = await openDb();
    const tx = db.transaction('phrases', 'readwrite');
    const store = tx.objectStore('phrases');
    const updated = [];
    for (const id of ids) {
        const existing = await reqToPromise(store.get(id));
        if (!existing) continue;
        const row = { ...existing, space_id: targetSpaceId, tag_id: null };
        store.put(row);
        updated.push(row);
    }
    await txDone(tx);
    return updated;
};

const deletePhrase = async (id) => {
    const existing = await idbGet('phrases', id);
    if (!existing) return null;
    await idbDelete('phrases', id);
    return existing;
};

// TTS, same meaning as in remoteDb.js: this column is a flag ('cached'
// once this device has generated audio for that variant, or null) — the
// actual audio lives in IndexedDB too, but in ttsStorage.js's own object
// store, keyed by phraseId+variant. A phrase played from a different
// device regenerates its own local copy, same as before it was ever
// played anywhere.
const updatePhraseTtsFlag = async ({ id, variant, cached }) => {
    const existing = await idbGet('phrases', id);
    if (!existing) throw notFoundError('phrases', id);
    const column = variant === 1 ? 'tts_url_variant1' : 'tts_url_variant2';
    return idbPut('phrases', { ...existing, [column]: cached ? 'cached' : null });
};

// Mirrors the original's LEFT JOIN onto tags, flattening the result to
// tag_name/tag_color so calling code doesn't need to change.
const getPhrases = async (spaceId) => {
    const [phrases, tags] = await Promise.all([
        idbGetAllByIndex('phrases', 'space_id', spaceId),
        idbGetAllByIndex('tags', 'space_id', spaceId)
    ]);
    const tagById = new Map(tags.map(t => [t.id, t]));
    return sortByCreatedAt(phrases, false).map(p => {
        const tag = p.tag_id ? tagById.get(p.tag_id) : null;
        return { ...p, tag_name: tag?.name ?? null, tag_color: tag?.color ?? null };
    });
};

// --- Spaces ---------------------------------------------------------------

const getSpaces = async () => sortByCreatedAt(await idbGetAll('spaces'), true);

const createSpace = async ({ name, spaceType, sourceLanguage, targetLanguage, bridgeLanguage }) => {
    const row = {
        id: newId(),
        name,
        space_type: spaceType || 'progression',
        source_language: sourceLanguage,
        target_language: targetLanguage,
        bridge_language: bridgeLanguage || null,
        about_this_space: null,
        variant_1_notes: null,
        variant_2_notes: null,
        audio_recording_notes: null,
        created_at: new Date().toISOString()
    };
    return idbPut('spaces', row);
};

const updateSpace = async ({ id, name, aboutThisSpace, variant1Notes, variant2Notes, audioRecordingNotes }) => {
    const existing = await idbGet('spaces', id);
    if (!existing) throw notFoundError('spaces', id);
    const updated = { ...existing };
    if (name !== undefined) updated.name = name;
    if (aboutThisSpace !== undefined) updated.about_this_space = aboutThisSpace || null;
    if (variant1Notes !== undefined) updated.variant_1_notes = variant1Notes || null;
    if (variant2Notes !== undefined) updated.variant_2_notes = variant2Notes || null;
    if (audioRecordingNotes !== undefined) updated.audio_recording_notes = audioRecordingNotes || null;
    return idbPut('spaces', updated);
};

// Deletes everything scoped to a space, then the space itself — same
// order as the original (phrases, dictionary, transcripts, tags, space),
// all inside one IndexedDB transaction, so it's genuinely all-or-nothing.
// Doesn't touch IndexedDB-cached TTS audio — the caller (phrasesTable.js
// / ttsStorage.js) cleans that up itself, same pattern as a single
// phrase delete.
const deleteSpace = async (id) => {
    const db = await openDb();
    const tx = db.transaction(['spaces', 'tags', 'phrases', 'dictionary', 'transcripts'], 'readwrite');

    const spaceStore = tx.objectStore('spaces');
    const existing = await reqToPromise(spaceStore.get(id));
    if (!existing) { tx.abort(); throw notFoundError('spaces', id); }

    for (const storeName of ['phrases', 'dictionary', 'transcripts', 'tags']) {
        const store = tx.objectStore(storeName);
        const index = store.index('space_id');
        const rows = await reqToPromise(index.getAll(id));
        for (const row of rows) store.delete(row.id);
    }
    spaceStore.delete(id);

    await txDone(tx);
    return existing;
};

const MAX_TRANSCRIPTS_PER_SPACE_MIGRATION = 3;

const migrateSpace = async ({ sourceId, targetId, dropSourceTranscripts = false }) => {
    if (sourceId === targetId) {
        throw new Error('Cannot migrate a space into itself');
    }

    if (!dropSourceTranscripts) {
        const [sourceCount, targetCount] = await Promise.all([
            idbCountByIndex('transcripts', 'space_id', sourceId),
            idbCountByIndex('transcripts', 'space_id', targetId)
        ]);
        if (sourceCount + targetCount > MAX_TRANSCRIPTS_PER_SPACE_MIGRATION) {
            const err = new Error('Too many transcripts to migrate');
            err.code = 'TOO_MANY_TRANSCRIPTS';
            err.sourceCount = sourceCount;
            err.targetCount = targetCount;
            throw err;
        }
    }

    const db = await openDb();
    const tx = db.transaction(['spaces', 'tags', 'phrases', 'transcripts'], 'readwrite');

    const transcriptStore = tx.objectStore('transcripts');
    const transcriptIndex = transcriptStore.index('space_id');
    const sourceTranscripts = await reqToPromise(transcriptIndex.getAll(sourceId));
    if (dropSourceTranscripts) {
        for (const t of sourceTranscripts) transcriptStore.delete(t.id);
    } else {
        for (const t of sourceTranscripts) transcriptStore.put({ ...t, space_id: targetId });
    }

    const tagStore = tx.objectStore('tags');
    const tagIndex = tagStore.index('space_id');
    const sourceTags = await reqToPromise(tagIndex.getAll(sourceId));
    const targetTags = await reqToPromise(tagIndex.getAll(targetId));

    const usedNames = new Set(targetTags.map(t => t.name.toLowerCase()));
    const usedColors = new Set(targetTags.filter(t => t.color).map(t => t.color));

    for (const tag of sourceTags) {
        let newName = tag.name;
        if (usedNames.has(newName.toLowerCase())) {
            let suffix = '';
            let attempt = 1;
            do {
                suffix = attempt === 1 ? ' (new)' : ` (new ${attempt})`;
                attempt++;
            } while (usedNames.has((tag.name + suffix).toLowerCase()));
            newName = tag.name + suffix;
        }
        usedNames.add(newName.toLowerCase());

        let newColor = tag.color;
        if (newColor && usedColors.has(newColor)) {
            newColor = TAG_COLORS.find(c => !usedColors.has(c)) || null;
        }
        if (newColor) usedColors.add(newColor);

        tagStore.put({ ...tag, space_id: targetId, name: newName, color: newColor });
    }

    const phraseStore = tx.objectStore('phrases');
    const phraseIndex = phraseStore.index('space_id');
    const sourcePhrases = await reqToPromise(phraseIndex.getAll(sourceId));
    for (const p of sourcePhrases) phraseStore.put({ ...p, space_id: targetId });

    tx.objectStore('spaces').delete(sourceId);

    await txDone(tx);
};

const getSpaceRuleFields = async (spaceId) => {
    const row = await idbGet('spaces', spaceId);
    if (!row) throw notFoundError('spaces', spaceId);
    return {
        aboutThisSpace: row.about_this_space ?? null,
        variant1Notes: row.variant_1_notes ?? null,
        variant2Notes: row.variant_2_notes ?? null,
        audioRecordingNotes: row.audio_recording_notes ?? null,
        spaceType: row.space_type ?? 'progression',
        sourceLanguage: row.source_language ?? 'Hebrew',
        targetLanguage: row.target_language ?? 'English',
        bridgeLanguage: row.bridge_language ?? null
    };
};

// --- Tags -------------------------------------------------------------

const getTags = async (spaceId) => {
    const tags = await idbGetAllByIndex('tags', 'space_id', spaceId);
    return [...tags].sort((a, b) => a.name.localeCompare(b.name));
};

const createTag = async ({ name, color, spaceId }) => {
    const row = { id: newId(), name, color: color || null, space_id: spaceId, created_at: new Date().toISOString() };
    return idbPut('tags', row);
};

const updateTag = async ({ id, name, color }) => {
    const existing = await idbGet('tags', id);
    if (!existing) throw notFoundError('tags', id);
    const updated = { ...existing };
    if (name !== undefined) updated.name = name;
    if (color !== undefined) updated.color = color || null;
    return idbPut('tags', updated);
};

const deleteTag = async (id) => {
    const count = await idbCountByIndex('phrases', 'tag_id', id);
    if (count > 0) {
        throw new Error(`This tag has ${count} phrase(s) linked to it. Merge or retag them first.`);
    }
    await idbDelete('tags', id);
};

// Moves every phrase from sourceId onto targetId, then deletes the
// source tag — one transaction across both stores, so it's atomic.
const mergeTags = async ({ sourceId, targetId }) => {
    if (sourceId === targetId) {
        throw new Error('Cannot merge a tag into itself');
    }

    const db = await openDb();
    const tx = db.transaction(['tags', 'phrases'], 'readwrite');
    const tagStore = tx.objectStore('tags');

    const [source, target] = await Promise.all([
        reqToPromise(tagStore.get(sourceId)),
        reqToPromise(tagStore.get(targetId))
    ]);
    if (!source || !target) { tx.abort(); throw new Error('Both tags must exist'); }

    const phraseStore = tx.objectStore('phrases');
    const phraseIndex = phraseStore.index('tag_id');
    const phrases = await reqToPromise(phraseIndex.getAll(sourceId));
    for (const p of phrases) phraseStore.put({ ...p, tag_id: targetId });

    tagStore.delete(sourceId);

    await txDone(tx);
};

// --- Transcripts --------------------------------------------------------

const getTranscripts = async (spaceId) => {
    const rows = await idbGetAllByIndex('transcripts', 'space_id', spaceId);
    return sortByCreatedAt(rows, false);
};

const createTranscript = async ({ spaceId, content }) => {
    const row = { id: newId(), space_id: spaceId, content, created_at: new Date().toISOString() };
    return idbPut('transcripts', row);
};

const deleteTranscript = async (id) => {
    const existing = await idbGet('transcripts', id);
    if (!existing) return null;
    await idbDelete('transcripts', id);
    return existing;
};

// --- Dictionary ---------------------------------------------------------

const getDictionaryEntries = async (spaceId) => {
    const rows = await idbGetAllByIndex('dictionary', 'space_id', spaceId);
    return sortByCreatedAt(rows, false);
};

const saveDictionaryEntry = async ({ spaceId, sourceQuery, word, partOfSpeech, sourceSynonyms, exampleSentence, targetSynonyms }) => {
    const row = {
        id: newId(),
        space_id: spaceId,
        source_query: sourceQuery || null,
        word,
        part_of_speech: partOfSpeech,
        source_synonyms: sourceSynonyms,
        example_sentence: exampleSentence,
        target_synonyms: targetSynonyms,
        learned_at: null,
        created_at: new Date().toISOString()
    };
    return idbPut('dictionary', row);
};

const updateDictionaryEntryLearned = async ({ id, learned }) => {
    const existing = await idbGet('dictionary', id);
    if (!existing) throw notFoundError('dictionary', id);
    return idbPut('dictionary', { ...existing, learned_at: learned ? new Date().toISOString() : null });
};

const deleteDictionaryEntry = async (id) => {
    const existing = await idbGet('dictionary', id);
    if (!existing) return null;
    await idbDelete('dictionary', id);
    return existing;
};