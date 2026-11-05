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
// Needs geminiClient.js, ttsEngine.js and remoteDb.js loaded first.

const DB_NAME = 'fraza-tts-cache';
const DB_VERSION = 1;
const STORE_NAME = 'audio';

function ttsKey(phraseId, variant) {
    return `${phraseId}-v${variant}`;
}

function openTtsDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveTtsBlob(phraseId, variant, blob) {
    const db = await openTtsDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(blob, ttsKey(phraseId, variant));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getTtsBlob(phraseId, variant) {
    const db = await openTtsDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(ttsKey(phraseId, variant));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

async function deleteTtsBlob(phraseId, variant) {
    const db = await openTtsDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(ttsKey(phraseId, variant));
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