import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getSpaceRules } from '../../database.js';

const ai = new GoogleGenAI({ vertexai: false, apiKey: process.env.GEMINI_API_KEY });
const __dirname = dirname(fileURLToPath(import.meta.url));
const basePromptPath = join(__dirname, 'audioPrompt.txt');
// Shared with the typed-phrase pipeline — one file, not duplicated here.
const variantGuidancePath = join(__dirname, '..', 'translation', 'variantGuidance.txt');

const parseResponse = (rawText) => {
    const cleaned = rawText.trim().replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
};

// Two alternative instructions for Step 1 — a per-request choice (the
// toggle), not a space-level setting, so this stays local to the engine
// rather than living in any space's own rules.
const captureModeInstructions = `Transcribe the audio into Hebrew text, focusing on the primary/main speaker. Treat other voices or background sound as context, not something to transcribe verbatim.`;

const checkModeInstructions = `Transcribe the audio, focusing on the primary/main speaker. The speech is in English, or a mix of English and Hebrew (e.g. an English sentence with a word or two in Hebrew where the speaker didn't know the English word). Transcribe it as spoken — grammar and phrasing correction happen in a later step, not here.`;

// Gemini's inline request limit is 100MB total (prompt text + audio,
// base64-encoded). 60MB of raw audio keeps the base64-encoded size (~33%
// larger) comfortably under that — roughly half an hour of recording,
// based on this app's actual observed recording weight (~1.5MB/minute).

const INLINE_SIZE_LIMIT_BYTES = 60 * 1024 * 1024; // 60MB

// mode is 'capture' (default, Hebrew speech) or 'check' (English/mixed
// speech — grammar and phrasing correction instead of translation).
// Returns { transcript, phrases: [{ hebrewText, variant1, variant2 }] }.
export const processRecording = async (audioBuffer, mimeType, spaceId, mode = 'capture') => {
    if (audioBuffer.length > INLINE_SIZE_LIMIT_BYTES) {
        throw new Error('Recording is too large (over ~30 minutes). Please use a shorter recording for now.');
    }

    const baseTemplate = readFileSync(basePromptPath, 'utf-8');
    const variantGuidance = readFileSync(variantGuidancePath, 'utf-8');
    const spaceRules = await getSpaceRules(spaceId);
    const spaceRulesSection = spaceRules
        ? `## Additional Rules for This Space\n${spaceRules}\n\n`
        : '';

    const promptText = baseTemplate
        .replace('${modeInstructions}', mode === 'check' ? checkModeInstructions : captureModeInstructions)
        .replace('${variantGuidance}', variantGuidance)
        .replace('${spaceRulesSection}', spaceRulesSection);

    const audioPart = {
        inlineData: {
            data: audioBuffer.toString('base64'),
            mimeType
        }
    };

    const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [{
            parts: [
                { text: promptText },
                audioPart
            ]
        }],
        config: {
            responseMimeType: 'application/json'
        }
    });

    const rawText = response.candidates[0].content.parts[0].text;
    return parseResponse(rawText);
};