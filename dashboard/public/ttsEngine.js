// ttsEngine.js — calls Gemini TTS directly (geminiClient.js) and decodes the
// returned audio into a playable WAV Blob — storage is ttsStorage.js's job
// (getOrCreatePhraseAudioUrl).
// Needs geminiClient.js loaded first.

const generateSpeechBlob = (function () {
    // gemini-3.8-flash-lite-tts returns a complete WAV file by default, so
    // this is just a base64 decode — no header to build.
    function base64ToWavBlob(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: 'audio/wav' });
    }

    return async function generateSpeechBlob(text) {
        const response = await geminiGenerateContent({
            model: 'gemini-3.8-flash-lite-tts',
            contents: [{
                // The model reads text as a verbatim transcript, so the style
                // direction has to live in speech_metadata, not in the text.
                parts: [{ text, speech_metadata: { style: 'warm and welcoming' } }]
            }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Achernar' }
                    }
                }
            }
        });

        const base64Data = geminiExtractInlineAudioBase64(response);
        if (!base64Data) {
            throw new Error('Gemini did not return any audio data.');
        }

        return base64ToWavBlob(base64Data);
    };
})();