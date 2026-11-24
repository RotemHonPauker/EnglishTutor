// ttsStorage.js — on-device cache for generated phrase audio. Gemini TTS
// output never leaves this device: the WAV Blob is written to this
// browser's IndexedDB (keyed by phraseId+variant) and played back from
// there through an object URL. Replaces the server's
// public/audio-cache/*.wav directory, where tts_url_variant1/2 used to
// hold a path any device could play — here, those two columns only hold
// a 'cached'/null FLAG (see remoteDb.js's updatePhraseTtsFlag), because
// the file itself only exists on whichever device generated it. A phrase
// played from a different device regenerates its own local copy, same as
// if it had never been played before.

// Named with a TTS_ prefix, not DB_NAME/DB_VERSION/STORE_NAME — this is a
// plain classic script like every other file in public/, so a top-level
// const lives in the same shared global scope as every other script tag's
// top-level consts (no per-file scoping without `type="module"`).
// localDb.js already declares its own DB_NAME/DB_VERSION/STORE_NAME, and
// since it loads first (see index.html), this file's would-be redeclaration
// used to throw a SyntaxError that silently killed this entire script —
// every function below went undefined, which is why phrase deletion (and
// 🔊 playback) failed the moment it tried to call deleteTtsBlobsForPhrase.
const TTS_DB_NAME = 'fraza-tts-cache';
const TTS_DB_VERSION = 1;
const TTS_STORE_NAME = 'audio';

// `variant` is a plain string/number distinguishing which "slot" of a
// given id's audio this is — a phrase passes 1 or 2 (its two translated
// variants), a dictionary entry passes the literal string 'word' (see
// getOrCreateDictionaryAudioUrl below). Template-literal interpolation
// doesn't care which, so the same key scheme covers both without needing
// a separate store.
function ttsKey(phraseId, variant) {
    return `${phraseId}-v${variant}`;
}

function openTtsDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(TTS_DB_NAME, TTS_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(TTS_STORE_NAME)) {
                db.createObjectStore(TTS_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveTtsBlob(phraseId, variant, blob) {
    const db = await openTtsDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(TTS_STORE_NAME, 'readwrite');
        tx.objectStore(TTS_STORE_NAME).put(blob, ttsKey(phraseId, variant));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getTtsBlob(phraseId, variant) {
    const db = await openTtsDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(TTS_STORE_NAME, 'readonly');
        const req = tx.objectStore(TTS_STORE_NAME).get(ttsKey(phraseId, variant));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

async function deleteTtsBlob(phraseId, variant) {
    const db = await openTtsDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(TTS_STORE_NAME, 'readwrite');
        tx.objectStore(TTS_STORE_NAME).delete(ttsKey(phraseId, variant));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Deletes both variants for one phrase — called wherever the server
// version called deleteSpeechFile() twice: on phrase delete, on
// retranslate (old audio no longer matches the new wording), and when a
// whole space is deleted.
async function deleteTtsBlobsForPhrase(phraseId) {
    await deleteTtsBlob(phraseId, 1);
    await deleteTtsBlob(phraseId, 2);
}

// The one entry point the rest of the app actually needs (phrasesTable.js's
// playPhraseAudio, once that file is updated): returns a playable object
// URL for this phrase+variant, generating (and caching) the audio with
// Gemini TTS the first time only — same lazy-generation behavior as the
// server's old POST /phrases/:id/tts route.
// `phrase` must have id, variant_1, variant_2.
async function getOrCreatePhraseAudioUrl(phrase, variant) {
    const cached = await getTtsBlob(phrase.id, variant);
    if (cached) {
        return URL.createObjectURL(cached);
    }

    const text = variant === 1 ? phrase.variant_1 : phrase.variant_2;
    if (!text) {
        throw new Error('This variant has no text yet');
    }

    const blob = await generateSpeechBlob(text);
    await saveTtsBlob(phrase.id, variant, blob);
    await updatePhraseTtsFlag({ id: phrase.id, variant, cached: true });

    return URL.createObjectURL(blob);
}

// ===== Dictionary entry audio =====
// Same lazy-generate-once-then-cache pattern as a phrase's own 🔊, just for
// a dictionary entry's single "word" field instead of two numbered
// variants — see dictionary.js's playDictionaryAudio for the button that
// calls this. There's no tts flag column on a dictionary entry the way a
// phrase has tts_url_variant1/2 (that column was never more than
// informational — nothing reads it back), so this only touches the
// IndexedDB cache, nothing in localDb.js's `dictionary` store.
// `entry` must have id, word.
async function getOrCreateDictionaryAudioUrl(entry) {
    const cached = await getTtsBlob(entry.id, 'word');
    if (cached) {
        return URL.createObjectURL(cached);
    }

    const text = entry.word;
    if (!text) {
        throw new Error('This word has no text yet');
    }

    const blob = await generateSpeechBlob(text);
    await saveTtsBlob(entry.id, 'word', blob);

    return URL.createObjectURL(blob);
}

// Mirrors deleteTtsBlobsForPhrase above, for one dictionary entry's own
// cached word audio — called on deleting that entry (phrasesTable.js's
// confirmDelete) and when a whole space is deleted (spacesState.js's
// submitDeleteSpace).
async function deleteTtsBlobForDictionaryEntry(entryId) {
    await deleteTtsBlob(entryId, 'word');
}