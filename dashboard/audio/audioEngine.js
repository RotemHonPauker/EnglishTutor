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

// Inline requests have a real size ceiling — stay safely under it and use
// the Files API (upload, then reference by URI) only when actually needed.
const INLINE_SIZE_LIMIT_BYTES = 15 * 1024 * 1024; // 15MB

// Returns { transcript, phrases: [{ hebrewText, variant1, variant2 }] }.
export const processRecording = async (audioBuffer, mimeType, spaceId) => {
    const baseTemplate = readFileSync(basePromptPath, 'utf-8');
    const variantGuidance = readFileSync(variantGuidancePath, 'utf-8');
    const spaceRules = await getSpaceRules(spaceId);
    const spaceRulesSection = spaceRules
        ? `## Additional Rules for This Space\n${spaceRules}\n\n`
        : '';

    const promptText = baseTemplate
        .replace('${variantGuidance}', variantGuidance)
        .replace('${spaceRulesSection}', spaceRulesSection);

    let audioPart;
    if (audioBuffer.length <= INLINE_SIZE_LIMIT_BYTES) {
        // Small file: send the bytes directly in the request. Simpler, and
        // avoids the separate upload step entirely.
        audioPart = {
            inlineData: {
                data: audioBuffer.toString('base64'),
                mimeType
            }
        };
    } else {
        // Large file: upload through the Files API first, then reference
        // it by URI, since it won't fit in the request body directly.
        const uploadedFile = await ai.files.upload({
            file: new Blob([audioBuffer], { type: mimeType })
        });
        audioPart = { fileData: { fileUri: uploadedFile.uri, mimeType } };
    }

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