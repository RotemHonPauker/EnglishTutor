// audioEngine.js (client) — mirrors the server's
// dashboard/audio/audioEngine.js + audioPrompt.txt exactly: transcription
// only (phrase splitting/translation/tagging happen per-phrase afterward,
// same as the server version), reading the prompt from
// promptTemplates.js and calling Gemini directly (geminiClient.js)
// instead of a server route. The recording itself is sent inline, base64-
// encoded, straight from the browser — same approach as before, just
// without a server in between.
// Wrapped in an IIFE so its internal helpers (some share a name with
// helpers in translationEngine.js / dictionaryEngine.js) stay private.
// Needs promptTemplates.js and geminiClient.js loaded first.

const processRecording = (function () {
    // Gemini's inline request limit is 100MB total (prompt text + audio,
    // base64-encoded). 60MB of raw audio keeps the base64-encoded size
    // (~33% larger) comfortably under that — roughly half an hour of
    // recording, based on this app's actual observed recording weight
    // (~1.5MB/minute). Same ceiling as the server version used.
    const INLINE_SIZE_LIMIT_BYTES = 60 * 1024 * 1024;

    // Estimates raw byte size from a base64 string's length (each 4 base64
    // characters encode 3 raw bytes; trailing '=' padding trims a little
    // off the end) — close enough for a size *limit* check, without
    // needing the original Blob/File on hand.
    function estimateBytesFromBase64(base64) {
        const padding = (base64.match(/=+$/) || [''])[0].length;
        return Math.floor((base64.length * 3) / 4) - padding;
    }

    function parseAudioResponse(rawText) {
        const cleaned = rawText.trim().replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    }

    function buildSpaceRulesSection(spaceFields) {
        return spaceFields.aboutThisSpace
            ? `## About This Space\n${spaceFields.aboutThisSpace}\n\n`
            : '';
    }

    function buildAudioRecordingSection(spaceFields) {
        return spaceFields.audioRecordingNotes
            ? `## Notes On This Space's Recordings\n${spaceFields.audioRecordingNotes}\n`
            : '';
    }

    // Returns { transcript }.
    return async function processRecording({ audioBase64, mimeType, spaceId, mode = 'capture' }) {
        if (estimateBytesFromBase64(audioBase64) > INLINE_SIZE_LIMIT_BYTES) {
            throw new Error('Recording is too large (over ~30 minutes). Please use a shorter recording for now.');
        }

        const spaceFields = await getSpaceRuleFields(spaceId);

        const promptText = AUDIO_PROMPT_TEMPLATE
            .replace(/\$\{sourceLanguage\}/g, spaceFields.sourceLanguage)
            .replace(/\$\{targetLanguage\}/g, spaceFields.targetLanguage)
            .replace('${mode}', mode)
            .replace('${spaceRulesSection}', buildSpaceRulesSection(spaceFields))
            .replace('${audioRecordingSection}', buildAudioRecordingSection(spaceFields));

        const audioPart = {
            inlineData: {
                data: audioBase64,
                mimeType
            }
        };

        const response = await geminiGenerateContent({
            model: 'gemini-3.6-flash',
            contents: [{ parts: [{ text: promptText }, audioPart] }],
            generationConfig: { responseMimeType: 'application/json' }
        });

        const rawText = geminiExtractText(response);
        const result = parseAudioResponse(rawText);

        return { transcript: result.transcript };
    };
})();