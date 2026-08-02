import { GoogleGenAI } from '@google/genai';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const audioDir = join(__dirname, '..', 'public', 'audio-cache');

const ai = new GoogleGenAI({ vertexai: false, apiKey: process.env.GEMINI_API_KEY });

// Gemini TTS returns raw 16-bit PCM audio (24kHz, mono) — not a playable
// file on its own. This wraps it in a standard WAV header so it can be
// saved and played like any normal audio file.
function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = pcmBuffer.length;

    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
}

// Generates speech for `text`, saves it as `filename` under
// public/audio-cache/, and returns the URL path the frontend can play
// directly (served automatically by express.static, same as any other
// file under public/).
export const generateSpeech = async (text, filename) => {
    await mkdir(audioDir, { recursive: true });

    const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text: `Read aloud in a warm, welcoming tone.: ${text}` }] }],
        config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Achernar' }
                }
            }
        }
    });

    const base64Data = response.candidates[0].content.parts[0].inlineData.data;
    const wavBuffer = pcmToWav(Buffer.from(base64Data, 'base64'));

    await writeFile(join(audioDir, filename), wavBuffer);

    return `/audio-cache/${filename}`;
};

// Best-effort cleanup — called when a phrase is deleted, so its cached
// audio files don't linger on disk forever. Missing files aren't an error.
export const deleteSpeechFile = async (url) => {
    if (!url) return;
    const filename = url.replace('/audio-cache/', '');
    try {
        await unlink(join(audioDir, filename));
    } catch (err) {
        // Already gone, or never existed — fine either way.
    }
};