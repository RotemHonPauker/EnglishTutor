// ttsStorage.js — on-device cache for generated phrase/word audio. Gemini
// TTS output never leaves this device: the WAV Blob goes into this
// browser's own IndexedDB (keyed by phraseId+variant) and plays back from
// an object URL. A phrase played from a different device just regenerates
// its own local copy.

// Prefixed TTS_ (not DB_NAME/etc.) — these are classic-script top-level
// consts sharing a global scope with localDb.js's own DB_NAME/DB_VERSION;
// a name collision there would throw and silently kill this whole script.
const TTS_DB_NAME = 'fraza-tts-cache';
const TTS_DB_VERSION = 1;
const TTS_STORE_NAME = 'audio';

// variant is 1 or 2 for a phrase's two translated versions, or the literal
// string 'word' for a dictionary entry.
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

async function deleteTtsBlobsForPhrase(phraseId) {
    await deleteTtsBlob(phraseId, 1);
    await deleteTtsBlob(phraseId, 2);
}

// Generates (and caches) the audio with Gemini TTS the first time only.
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
// Same lazy-generate-once-then-cache pattern, for a single "word" field.
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

async function deleteTtsBlobForDictionaryEntry(entryId) {
    await deleteTtsBlob(entryId, 'word');
}