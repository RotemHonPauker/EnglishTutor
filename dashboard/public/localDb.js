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
// multi-table operations below (deleteSpace, migrateSpace) are genuinely
// all-or-nothing again, the way the original server-side database.js was
// with a real Postgres transaction.

const DB_NAME = 'fraza-db';
// v2 added the 'slots' store. v3 removes the 'tags' store entirely — tags
// were replaced by giving each Slot its own color directly (see the Slots
// section below): a phrase captured during a slot's time window is now
// colored and labeled by that slot itself, with no separate tag entity in
// between. openDb()'s onupgradeneeded guards every store-creation behind
// objectStoreNames.contains(...) so bumping this version on a device that
// already has an older database only adds/removes what's actually
// changed, instead of trying (and failing) to recreate stores that
// already exist.
const DB_VERSION = 3;
const STORE_NAMES = ['spaces', 'phrases', 'dictionary', 'transcripts', 'slots'];

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

            // Every store creation is guarded — onupgradeneeded re-runs
            // this whole function on an existing older database jumping
            // straight to the latest version, and createObjectStore()
            // throws if the store is already there (stores persist across
            // versions; only each version's own additions actually need
            // creating).
            if (!db.objectStoreNames.contains('spaces')) {
                const spaces = db.createObjectStore('spaces', { keyPath: 'id' });
                spaces.createIndex('created_at', 'created_at');
            }

            if (!db.objectStoreNames.contains('phrases')) {
                const phrases = db.createObjectStore('phrases', { keyPath: 'id' });
                phrases.createIndex('space_id', 'space_id');
                // NOTE: no index on slot_id — nothing currently looks up
                // phrases by slot (getPhrases joins the other direction,
                // slot-by-id, in memory), so there's nothing to index yet.
            }

            if (!db.objectStoreNames.contains('dictionary')) {
                const dictionary = db.createObjectStore('dictionary', { keyPath: 'id' });
                dictionary.createIndex('space_id', 'space_id');
            }

            if (!db.objectStoreNames.contains('transcripts')) {
                const transcripts = db.createObjectStore('transcripts', { keyPath: 'id' });
                transcripts.createIndex('space_id', 'space_id');
            }

            // v2: Slots — a time-of-day window, linked to one Routine
            // (space_id). See the Slots section below for what a slot row
            // actually holds now (v3 onward: its own color, no more
            // tag_ids). Overlap validation (findOverlappingSlot) scans
            // every slot regardless of space_id, so no extra index is
            // needed for that — the space_id index here is only for
            // loading one routine's own slots in the Slots/Schedule screen
            // (slots.js).
            if (!db.objectStoreNames.contains('slots')) {
                const slots = db.createObjectStore('slots', { keyPath: 'id' });
                slots.createIndex('space_id', 'space_id');
            }

            // v3: tags are gone — a slot's own color now does what a tag
            // used to do. Any device upgrading from v1/v2 still has this
            // store sitting around with old data in it; just drop it.
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

// --- Card age (phrases + dictionary entries) ----------------------------
// There used to be a whole lifetime/saved/trash mechanism here — a
// per-routine expiry policy, a one-way "saved" flag, and a 24h grace
// window before a hard delete. Rotem's own call to drop all of it: too
// much machinery for what the app actually needed, once cards are browsed
// by which time slot they belong to (see slots.js's
// renderPracticeSlotsScroll) rather than by when they were captured. All
// that's left of the idea is this
// one soft nudge: a card older than CARD_OLD_MS just gets a visible "old"
// note on its own card (phrasesTable.js/dictionary.js) to encourage
// deleting it by hand — nothing here ever deletes anything automatically.
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
        // "learned" is gone — a phrase that's solid enough to stop
        // practicing just gets deleted outright now (see
        // practiceSession.js). last_practiced_at instead tracks when this
        // phrase was last stepped through in a practice session (null =
        // never), which is what decides which phrases a session picks
        // first (see pickSessionItems in practiceSession.js).
        last_practiced_at: null,
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

// Called once per phrase at the end of a practice-session card (not per
// sentence — see practiceSession.js's advancePracticeAfterDecision), when
// the person taps "Continue" rather than "Delete phrase". This is the only
// thing a successful practice pass writes anywhere — no record of the
// attempt itself is kept (see the file-level comment in practiceSession.js
// for why).
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
        // slot_id cleared on a cross-routine move, same reasoning as the
        // old tag_id clear it replaces — a slot belongs to one specific
        // routine's own schedule, so it has nothing to do with wherever
        // the phrase lands.
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

// Mirrors the original's LEFT JOIN onto tags, now flattened against this
// routine's own slots instead: slot_name/slot_color so calling code can
// show a phrase card's color/label without a second lookup. Only this
// routine's own slots are considered, which is correct — a phrase's
// slot_id is only ever set to a slot belonging to its own space_id (see
// bulkMovePhrases above, which clears it on any cross-routine move).
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

// Deletes everything scoped to a space, then the space itself — same
// order as the original (phrases, dictionary, transcripts, space), all
// inside one IndexedDB transaction, so it's genuinely all-or-nothing.
// Also removes this routine's own slots — a slot with no routine left to
// belong to has no reminder to send, so it cannot be allowed to linger as
// an orphan the next time slots are listed or checked for overlap.
// Doesn't touch IndexedDB-cached TTS audio — the caller (phrasesTable.js
// / ttsStorage.js) cleans that up itself, same pattern as a single
// phrase delete.
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

// Moves a routine's phrases and transcripts into another routine, then
// deletes the source. Tags used to be merged here too (duplicate/
// conflicting names and colors resolved, same as mergeTags) — there's
// nothing left to merge now that tags are gone. Slots aren't touched by a
// migration (same as before this change): they stay with whichever
// routine they were created in, and a migrated phrase's own slot_id is
// cleared, same reasoning as bulkMovePhrases above. Transcripts used to be
// blocked from migrating past a hard cap (MAX_TRANSCRIPTS_PER_SPACE) — gone
// now that transcripts expire on their own after 24h (see
// deleteExpiredTranscripts below), so there's nothing left to overflow and
// nothing to check here before moving them.
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
// A transcript is short-lived on purpose: it lives for TRANSCRIPT_RETENTION_MS
// (24h) and is then hard-deleted (see deleteExpiredTranscripts below) —
// replacing the old MAX_TRANSCRIPTS_PER_SPACE soft-cap/warning entirely.
// It also carries its own slot_id now, decided once at creation time (the
// slot active when the recording finished, if any — see
// transcriptsTab.js's finishRecordingIntoTranscript) and stored permanently,
// NOT recomputed live against whatever slots exist later. If that slot is
// later deleted, this is read the same lazy way a phrase's own slot_id is
// (see getPhrases above): a lookup against the current slots list that
// simply comes back empty, so the transcript just loses its color — no
// error, no cascade-clearing needed here.
//
// A transcript can also be pinned — protects it from the 24h auto-delete
// indefinitely, until unpinned. New transcripts are created with
// pinned: false (see createTranscript below), same as every other
// explicit default in this file. But every transcript that already
// existed before this feature shipped has no pinned field at all
// (undefined) — not false — and isTranscriptPinned treats that missing
// field as pinned too, same "undefined means legacy, treat it as the
// safe/protected state" pattern as a slot's own `enabled !== false`
// elsewhere in this file. That's deliberate, not just a safe default: it's
// exactly how every transcript sitting in the app right now, recorded
// before pinning existed, ends up protected automatically the first time
// this runs, with no separate one-time migration needed. Once any of
// those is explicitly unpinned (or any new transcript is created), normal
// 24h expiry applies to it from then on.
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
        // The AI's candidate-sentence highlights (transcriptsTab.js's
        // getTranscriptSuggestions), computed once right here at creation
        // time — [{index, level}], indices into
        // splitIntoSentences(content) rather than the sentence text
        // itself. Empty for a transcript this feature found nothing worth
        // suggesting in, or that was recorded before this feature existed.
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

// 24 hours, in milliseconds — a transcript older than this is hard-deleted
// the next time this runs (app.js's window.onload, and again whenever the
// Transcripts tab's list is loaded — see transcriptsTab.js's
// loadTranscriptsTabList — so the list is always accurate without needing
// a running timer), UNLESS it's pinned (isTranscriptPinned above) — a
// pinned transcript never expires on its own, no matter how old. Scans
// every space at once rather than just the active one, since a routine
// switch shouldn't be what decides whether a stale transcript elsewhere
// finally gets cleaned up.
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
        // Same purpose as a phrase's own last_practiced_at (see
        // saveSentence above) — null until the first time this word is
        // stepped through in a practice session (practiceSession.js),
        // which is what decides which words a session picks first.
        last_practiced_at: null,
        created_at: new Date().toISOString()
    };
    return idbPut('dictionary', row);
};

// Mirrors markPhrasePracticed above — called once a dictionary word's
// practice-session unit ends in "Continue" rather than "Delete word".
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
// A Slot is a time-of-day window: a start-end range (both stored as
// minutes-since-midnight, 0-1439, for easy arithmetic — see
// getSelectedMinutes/setTimeSelects in slots.js for the <-> hour/minute
// <select> conversion), a short name (NOT free-typed notification text —
// see buildSlotNotificationText in slots.js), the one Routine (space_id)
// it belongs to, and its own color.
//
// A slot's color IS its identity now — there's no separate Tag entity any
// more. A phrase captured while a slot's time window is open is linked
// directly to that slot (phrases.slot_id) and takes on its color/name for
// display, with no in-between "which tag applies" step. Colors come from
// one shared pool of MAX_SLOTS_TOTAL below, enforced across EVERY routine
// in the app at once, not per-routine — two slots can never share a
// color anywhere in the app, since a slot's color is how it's told apart
// on the Practice tab's own cross-routine slots scroll (every routine's
// slots together — see slots.js's renderPracticeSlotsScroll).

// One color per slot, one slot per color — so the color pool's size IS
// the app-wide slot limit. Enforced here (not just in the UI) so the
// invariant holds regardless of which code path creates a slot.
const MAX_SLOTS_TOTAL = 16;

const getSlots = async (spaceId) => {
    const rows = await idbGetAllByIndex('slots', 'space_id', spaceId);
    return [...rows].sort((a, b) => a.start_minutes - b.start_minutes);
};

// Every slot from every routine — used by the Practice tab's own
// cross-routine slots scroll (slots.js's renderPracticeSlotsScroll), the
// global color-uniqueness check in the slot add/edit modal, and
// findActiveSlotNow/findOverlappingSlot below.
const getAllSlots = async () => {
    const rows = await idbGetAll('slots');
    return [...rows].sort((a, b) => a.start_minutes - b.start_minutes);
};

function slotRangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
}

// The hard-block overlap check, across ALL routines — not just the one
// being edited, per the agreed design (a slot at 8:15 for "Breakfast" and
// another at 8:00-8:30 for "Commute" conflict regardless of which routine
// either belongs to). excludeId lets editing an existing slot compare
// against every OTHER slot without the slot flagging itself.
// Returns the first conflicting slot, or null.
const findOverlappingSlot = async ({ startMinutes, endMinutes, excludeId }) => {
    const all = await idbGetAll('slots');
    return all.find(s => s.id !== excludeId && slotRangesOverlap(startMinutes, endMinutes, s.start_minutes, s.end_minutes)) || null;
};

// NOTE: a slot no longer carries free-typed notification text — just a
// short `name` the person gives it (e.g. "Morning coffee"). The actual
// push-notification body is a fixed template built from that name in
// code (see slots.js's buildSlotNotificationText), not something typed
// per-slot.

// `enabled` defaults to true for every new slot — per the agreed design,
// a freshly created slot should notify unless the person explicitly
// turns it off afterwards (see setSlotEnabled below, wired to the
// per-slot toggle in slots.js).
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

// Deliberately doesn't touch `enabled` — editing a slot's time/name/color
// from the modal shouldn't silently flip its notification state one way
// or the other; that's only ever changed via setSlotEnabled below.
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

// Flips just the per-slot on/off toggle (slots.js) — a separate, narrower
// action from updateSlot on purpose, so toggling notifications off/on can
// never accidentally touch the time/name/color fields.
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

// Small helper used only by createSlot's app-wide cap check above — not
// worth a generic addition to the IndexedDB-plumbing section since
// nothing else needs a plain whole-store count yet.
async function idbCountAll(storeName) {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readonly');
    return await reqToPromise(tx.objectStore(storeName).count());
}