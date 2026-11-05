// ttsEngine.js (client) — mirrors the server's dashboard/tts/ttsEngine.js:
// calls Gemini TTS directly from the browser (geminiClient.js) and wraps
// the raw PCM audio it returns in a standard WAV header, the same math
// the server used with Node's Buffer — just built on ArrayBuffer/DataView
// here, since there's no Buffer in a browser.
// This file only turns text into a playable WAV Blob. Where that Blob
// gets stored (this device's IndexedDB, not a server disk) is
// ttsStorage.js's job — see getOrCreatePhraseAudioUrl there, which is
// the function the rest of the app should actually call.
// Needs geminiClient.js loaded first.

const generateSpeechBlob = (function () {
    function base64ToUint8Array(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function pcmToWavBlob(pcmBytes, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
        const byteRate = sampleRate * numChannels * bitsPerSample / 8;
        const blockAlign = numChannels * bitsPerSample / 8;
        const dataSize = pcmBytes.length;

        const header = new ArrayBuffer(44);
        const view = new DataView(header);
        const writeString = (offset, str) => {
            for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM format
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);

        return new Blob([header, pcmBytes], { type: 'audio/wav' });
    }

    // Generates speech for `text` and returns a playable WAV Blob.
    return async function generateSpeechBlob(text) {
        const response = await geminiGenerateContent({
            model: 'gemini-3.1-flash-tts-preview',
            contents: [{ parts: [{ text: `Read aloud in a warm, welcoming tone.: ${text}` }] }],
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

        const pcmBytes = base64ToUint8Array(base64Data);
        return pcmToWavBlob(pcmBytes);
    };
})();