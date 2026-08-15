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

// mode is 'capture' (default, Hebrew input) or 'check' (English/mixed
// input — grammar and phrasing correction instead of translation).
// translationPrompt.txt contains instructions for both; only the mode word
// itself is injected, and the model follows whichever branch applies.
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
        .replace('${mode}', mode)
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