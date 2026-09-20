import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getSpaceRuleFields } from '../../database.js';

const ai = new GoogleGenAI({ vertexai: false, apiKey: process.env.GEMINI_API_KEY });
const __dirname = dirname(fileURLToPath(import.meta.url));
const basePromptPath = join(__dirname, 'audioPrompt.txt');

const parseResponse = (rawText) => {
    const cleaned = rawText.trim().replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
};

// A space with nothing filled in under "About this space" yet is a normal
// state — the section is simply omitted rather than left as an empty
// heading.
const buildSpaceRulesSection = (spaceFields) => {
    return spaceFields.aboutThisSpace
        ? `## About This Space\n${spaceFields.aboutThisSpace}\n\n`
        : '';
};

// Gemini's inline request limit is 100MB total (prompt text + audio,
// base64-encoded). 60MB of raw audio keeps the base64-encoded size (~33%
// larger) comfortably under that — roughly half an hour of recording,
// based on this app's actual observed recording weight (~1.5MB/minute).
const INLINE_SIZE_LIMIT_BYTES = 60 * 1024 * 1024; // 60MB

// Transcription only. Phrase splitting, translation, and tagging used to
// happen here too, automatically, on the whole recording — but that meant
// paying (in tokens, and in edit-after-the-fact cleanup) for every aside
// and filler word Gemini decided to carve into a phrase. Now the person
// picks what's actually worth keeping straight from the transcript (see
// the selection-to-input flow in captureTab.js), and each pick goes
// through the exact same one-phrase-at-a-time pipeline as typing it in
// by hand (translationEngine.js) — so nothing gets translated unless a
// person chose it.
// Returns { transcript }.
export const processRecording = async (audioBuffer, mimeType, spaceId, mode = 'capture') => {
    if (audioBuffer.length > INLINE_SIZE_LIMIT_BYTES) {
        throw new Error('Recording is too large (over ~30 minutes). Please use a shorter recording for now.');
    }

    const baseTemplate = readFileSync(basePromptPath, 'utf-8');
    const spaceFields = await getSpaceRuleFields(spaceId);

    const promptText = baseTemplate
        .replace('${mode}', mode)
        .replace('${spaceRulesSection}', buildSpaceRulesSection(spaceFields));

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
    const result = parseResponse(rawText);

    return { transcript: result.transcript };
};