// audioEngine.js — transcribes a recording via Gemini (geminiClient.js,
// promptTemplates.js). IIFE to keep helpers private from
// translationEngine.js/dictionaryEngine.js.

const processRecording = (function () {
    // ~30 min of audio, base64-encoded, stays under Gemini's 100MB inline limit.
    const INLINE_SIZE_LIMIT_BYTES = 60 * 1024 * 1024;

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

    return async function processRecording({ audioBase64, mimeType, spaceId }) {
        if (estimateBytesFromBase64(audioBase64) > INLINE_SIZE_LIMIT_BYTES) {
            throw new Error('Recording is too large (over ~30 minutes). Please use a shorter recording for now.');
        }

        const spaceFields = await getSpaceRuleFields(spaceId);

        const promptText = AUDIO_PROMPT_TEMPLATE
            .replace(/\$\{sourceLanguage\}/g, spaceFields.sourceLanguage)
            .replace(/\$\{targetLanguage\}/g, spaceFields.targetLanguage)
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