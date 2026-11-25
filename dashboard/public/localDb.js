// localDb.js — all app data in IndexedDB, entirely on this device. No
// server, no login, no network call here. See ttsStorage.js for cached
// audio and backup.js for the Export/Import feature that moves data
// between devices.

const DB_NAME = 'fraza-db';
const DB_VERSION = 3;
const STORE_NAMES = ['spaces', 'phrases', 'dictionary', 'transcripts', 'slots'];

let dbPromise = null;

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;

            // Every creation is guarded with objectStoreNames.contains —
            // onupgradeneeded re-runs this whole function on an older
            // database jumping straight to the latest version.
            if (!db.objectStoreNames.contains('spaces')) {
                const spaces = db.createObjectStore('spaces', { keyPath: 'id' });
                spaces.createIndex('created_at', 'created_at');
            }

            if (!db.objectStoreNames.contains('phrases')) {
                const phrases = db.createObjectStore('phrases', { keyPath: 'id' });
                phrases.createIndex('space_id', 'space_id');
            }

            if (!db.objectStoreNames.contains('dictionary')) {
                const dictionary = db.createObjectStore('dictionary', { keyPath: 'id' });
                dictionary.createIndex('space_id', 'space_id');
            }

            if (!db.objectStoreNames.contains('transcripts')) {
                const transcripts = db.createObjectStore('transcripts', { keyPath: 'id' });
                transcripts.createIndex('space_id', 'space_id');
            }

            if (!db.objectStoreNames.contains('slots')) {
                const slots = db.createObjectStore('slots', { keyPath: 'id' });
                slots.createIndex('space_id', 'space_id');
            }

            if (db.objectStoreNames.contains('tags')) {
                db.deleteObjectStore('tags');
            }
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

// A card older than CARD_OLD_MS just gets a visible "old" note on its own
// card (phrasesTable.js/dictionary.js) — nothing here deletes anything
// automatically.
const CARD_OLD_MS = 30 * 24 * 60 * 60 * 1000; // 1 month

const isCardOld = (card) => Date.now() - new Date(card.created_at).getTime() > CARD_OLD_MS;

// --- Phrases ------------------------------------------------------------

const saveSentence = async ({ sourceText, variant1, variant2, spaceId, slotId }) => {
    const row = {
        id: newId(),
        source_text: sourceText,
        variant_1: variant1,
        variant_2: variant2,
        space_id: spaceId,
        slot_id: slotId || null,
        level: 1,
        last_practiced_at: null,
        tts_url_variant1: null,
        tts_url_variant2: null,
        created_at: new Date().toISOString()
    };
    return idbPut('phrases', row);
};

const getPhraseById = async (id) => idbGet('phrases', id);

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

const updatePhraseSlot = async ({ id, slotId }) => {
    const existing = await idbGet('phrases', id);
    if (!existing) throw notFoundError('phrases', id);
    return idbPut('phrases', { ...existing, slot_id: slotId || null });
};

const updatePhraseLevel = async ({ id, level }) => {
    const existing = await idbGet('phrases', id);
    if (!existing) throw notFoundError('phrases', id);
    return idbPut('phrases', { ...existing, level });
};

const markPhrasePracticed = async (id) => {
    const existing = await idbGet('phrases', id);
    if (!existing) throw notFoundError('phrases', id);
    return idbPut('phrases', { ...existing, last_practiced_at: new Date().toISOString() });
};

const bulkMovePhrases = async ({ ids, targetSpaceId }) => {
    const db = await openDb();
    const tx = db.transaction('phrases', 'readwrite');
    const store = tx.objectStore('phrases');
    const updated = [];
    for (const id of ids) {
        const existing = await reqToPromise(store.get(id));
        if (!existing) continue;
        const row = { ...existing, space_id: targetSpaceId, slot_id: null };
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

// tts_url_variantN is a flag ('cached' or null) — the actual audio lives
// in ttsStorage.js's own store, keyed by phraseId+variant.
const updatePhraseTtsFlag = async ({ id, variant, cached }) => {
    const existing = await idbGet('phrases', id);
    if (!existing) throw notFoundError('phrases', id);
    const column = variant === 1 ? 'tts_url_variant1' : 'tts_url_variant2';
    return idbPut('phrases', { ...existing, [column]: cached ? 'cached' : null });
};

// Flattens each phrase's slot_name/slot_color in, so callers can show a
// card's color/label with no second lookup.
const getPhrases = async (spaceId) => {
    const [phrases, slots] = await Promise.all([
        idbGetAllByIndex('phrases', 'space_id', spaceId),
        idbGetAllByIndex('slots', 'space_id', spaceId)
    ]);
    const slotById = new Map(slots.map(s => [s.id, s]));
    return sortByCreatedAt(phrases, false).map(p => {
        const slot = p.slot_id ? slotById.get(p.slot_id) : null;
        return { ...p, slot_name: slot?.name ?? null, slot_color: slot?.color ?? null };
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

// Deletes everything scoped to a space (including its own slots), then the
// space itself, inside one transaction — all-or-nothing. Cached TTS audio
// is cleaned up by the caller instead (phrasesTable.js/ttsStorage.js).
const deleteSpace = async (id) => {
    const db = await openDb();
    const tx = db.transaction(['spaces', 'phrases', 'dictionary', 'transcripts', 'slots'], 'readwrite');

    const spaceStore = tx.objectStore('spaces');
    const existing = await reqToPromise(spaceStore.get(id));
    if (!existing) { tx.abort(); throw notFoundError('spaces', id); }

    for (const storeName of ['phrases', 'dictionary', 'transcripts', 'slots']) {
        const store = tx.objectStore(storeName);
        const index = store.index('space_id');
        const rows = await reqToPromise(index.getAll(id));
        for (const row of rows) store.delete(row.id);
    }
    spaceStore.delete(id);

    await txDone(tx);
    return existing;
};

// Moves a space's phrases and transcripts into another space, then deletes
// the source. Slots stay with their own space; a migrated phrase's own
// slot_id is cleared, same as bulkMovePhrases above.
const migrateSpace = async ({ sourceId, targetId }) => {
    if (sourceId === targetId) {
        throw new Error('Cannot migrate a space into itself');
    }

    const db = await openDb();
    const tx = db.transaction(['spaces', 'phrases', 'transcripts'], 'readwrite');

    const transcriptStore = tx.objectStore('transcripts');
    const transcriptIndex = transcriptStore.index('space_id');
    const sourceTranscripts = await reqToPromise(transcriptIndex.getAll(sourceId));
    for (const t of sourceTranscripts) transcriptStore.put({ ...t, space_id: targetId });

    const phraseStore = tx.objectStore('phrases');
    const phraseIndex = phraseStore.index('space_id');
    const sourcePhrases = await reqToPromise(phraseIndex.getAll(sourceId));
    for (const p of sourcePhrases) phraseStore.put({ ...p, space_id: targetId, slot_id: null });

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

// --- Transcripts --------------------------------------------------------

// A transcript with no `pinned` field at all predates the pinning feature
// — treated as pinned too, so every transcript that existed before this
// shipped is automatically protected with no separate migration needed.
const isTranscriptPinned = (t) => t.pinned !== false;

const getTranscripts = async (spaceId) => {
    const rows = await idbGetAllByIndex('transcripts', 'space_id', spaceId);
    return sortByCreatedAt(rows, false);
};

const createTranscript = async ({ spaceId, content, slotId, suggestions }) => {
    const row = {
        id: newId(),
        space_id: spaceId,
        content,
        slot_id: slotId || null,
        suggestions: suggestions || [],
        pinned: false,
        created_at: new Date().toISOString()
    };
    return idbPut('transcripts', row);
};

const setTranscriptPinned = async (id, pinned) => {
    const existing = await idbGet('transcripts', id);
    if (!existing) throw notFoundError('transcripts', id);
    const updated = { ...existing, pinned: !!pinned };
    return idbPut('transcripts', updated);
};

const deleteTranscript = async (id) => {
    const existing = await idbGet('transcripts', id);
    if (!existing) return null;
    await idbDelete('transcripts', id);
    return existing;
};

// A transcript older than this is hard-deleted the next time this runs
// (app.js startup, and the Transcripts tab list load), unless pinned.
const TRANSCRIPT_RETENTION_MS = 24 * 60 * 60 * 1000;

const deleteExpiredTranscripts = async () => {
    const cutoff = Date.now() - TRANSCRIPT_RETENTION_MS;
    const all = await idbGetAll('transcripts');
    const expired = all.filter(t => !isTranscriptPinned(t) && new Date(t.created_at).getTime() < cutoff);
    if (!expired.length) return;

    const db = await openDb();
    const tx = db.transaction('transcripts', 'readwrite');
    const store = tx.objectStore('transcripts');
    for (const t of expired) store.delete(t.id);
    await txDone(tx);
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
        last_practiced_at: null,
        created_at: new Date().toISOString()
    };
    return idbPut('dictionary', row);
};

const markDictionaryEntryPracticed = async (id) => {
    const existing = await idbGet('dictionary', id);
    if (!existing) throw notFoundError('dictionary', id);
    return idbPut('dictionary', { ...existing, last_practiced_at: new Date().toISOString() });
};

const deleteDictionaryEntry = async (id) => {
    const existing = await idbGet('dictionary', id);
    if (!existing) return null;
    await idbDelete('dictionary', id);
    return existing;
};

// --- Slots ----------------------------------------------------------------
// A Slot is a time-of-day window (start/end stored as minutes-since-midnight),
// a short name, the Space it belongs to, and its own color — a slot's color
// is its identity, with colors shared from one app-wide pool so no two
// slots anywhere share a color (MAX_SLOTS_TOTAL below).

const MAX_SLOTS_TOTAL = 16;

const getSlots = async (spaceId) => {
    const rows = await idbGetAllByIndex('slots', 'space_id', spaceId);
    return [...rows].sort((a, b) => a.start_minutes - b.start_minutes);
};

const getAllSlots = async () => {
    const rows = await idbGetAll('slots');
    return [...rows].sort((a, b) => a.start_minutes - b.start_minutes);
};

function slotRangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
}

// Checks across ALL spaces, not just the one being edited — two slots from
// different spaces still conflict if their times overlap. excludeId lets
// editing a slot compare against every other slot without flagging itself.
const findOverlappingSlot = async ({ startMinutes, endMinutes, excludeId }) => {
    const all = await idbGetAll('slots');
    return all.find(s => s.id !== excludeId && slotRangesOverlap(startMinutes, endMinutes, s.start_minutes, s.end_minutes)) || null;
};

const createSlot = async ({ spaceId, startMinutes, endMinutes, name, color }) => {
    const existingCount = await idbCountAll('slots');
    if (existingCount >= MAX_SLOTS_TOTAL) {
        const err = new Error(`There's already a time slot for every available color (${MAX_SLOTS_TOTAL}) — delete one before adding another.`);
        err.code = 'TOO_MANY_SLOTS';
        err.maxSlots = MAX_SLOTS_TOTAL;
        throw err;
    }

    const row = {
        id: newId(),
        space_id: spaceId,
        start_minutes: startMinutes,
        end_minutes: endMinutes,
        name,
        color: color || null,
        enabled: true,
        created_at: new Date().toISOString()
    };
    return idbPut('slots', row);
};

// Doesn't touch `enabled` — only setSlotEnabled below changes that.
const updateSlot = async ({ id, startMinutes, endMinutes, name, color }) => {
    const existing = await idbGet('slots', id);
    if (!existing) throw notFoundError('slots', id);
    const updated = {
        ...existing,
        start_minutes: startMinutes,
        end_minutes: endMinutes,
        name,
        color: color || null
    };
    return idbPut('slots', updated);
};

const setSlotEnabled = async (id, enabled) => {
    const existing = await idbGet('slots', id);
    if (!existing) throw notFoundError('slots', id);
    const updated = { ...existing, enabled: !!enabled };
    return idbPut('slots', updated);
};

const deleteSlot = async (id) => {
    const existing = await idbGet('slots', id);
    if (!existing) return null;
    await idbDelete('slots', id);
    return existing;
};

async function idbCountAll(storeName) {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readonly');
    return await reqToPromise(tx.objectStore(storeName).count());
}