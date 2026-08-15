import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getSpaceRules } from '../../database.js';

const ai = new GoogleGenAI({ vertexai: false, apiKey: process.env.GEMINI_API_KEY });
const __dirname = dirname(fileURLToPath(import.meta.url));
const basePromptPath = join(__dirname, 'translationPrompt.txt');
const variantGuidancePath = join(__dirname, 'variantGuidance.txt');

// responseMimeType below asks Gemini for clean JSON directly, so this fence
// strip is only a safety net for the rare case it wraps the answer anyway.
const parseTranslationResponse = (rawText) => {
    const cleaned = rawText.trim().replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
};

// Two alternative instructions for Step 1 — which one applies is a choice
// made per-request (the toggle), not a space-level setting, so this stays
// local to the engine rather than living in any space's own rules.
const captureModeInstructions = `The input is in Hebrew. It may contain typos or awkward phrasing — silently correct any errors, preserving the original meaning exactly, and put the corrected Hebrew in "correctedHebrew". Then translate it into English for "variant1" and "variant2" below.`;

const checkModeInstructions = `The input is already in English, or a mix of English and Hebrew (e.g. an English sentence with a word or two in Hebrew where the writer didn't know the English word). Put the input as-is, with only obvious typos fixed, into "correctedHebrew" — do not translate it there. Then produce two corrected, natural English versions of it for "variant1" and "variant2" below, fixing grammar and phrasing while preserving the original meaning and intent. If any Hebrew words are mixed in, translate just those words into English as part of the correction.`;

// mode is 'capture' (default, Hebrew input) or 'check' (English/mixed
// input — grammar and phrasing correction instead of translation).
export const translatePhrase = async (hebrewText, spaceId, mode = 'capture') => {
    const baseTemplate = readFileSync(basePromptPath, 'utf-8');
    const variantGuidance = readFileSync(variantGuidancePath, 'utf-8');
    const spaceRules = await getSpaceRules(spaceId);

    // A space with no additional rules yet is a normal state — the section
    // is simply omitted rather than left as an empty heading.
    const spaceRulesSection = spaceRules
        ? `## Additional Rules for This Space\n${spaceRules}\n\n`
        : '';

    const content = baseTemplate
        .replace('${modeInstructions}', mode === 'check' ? checkModeInstructions : captureModeInstructions)
        .replace('${variantGuidance}', variantGuidance)
        .replace('${spaceRulesSection}', spaceRulesSection)
        .replace('${phrase}', hebrewText);

    const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [{ parts: [{ text: content }] }],
        config: {
            responseMimeType: 'application/json'
        }
    });

    const rawText = response.candidates[0].content.parts[0].text;
    return parseTranslationResponse(rawText);
};