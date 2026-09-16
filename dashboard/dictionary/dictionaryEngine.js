import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ai = new GoogleGenAI({ vertexai: false, apiKey: process.env.GEMINI_API_KEY });
const __dirname = dirname(fileURLToPath(import.meta.url));
const promptPath = join(__dirname, 'dictionaryPrompt.txt');

const parseResponse = (rawText) => {
    const cleaned = rawText.trim().replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
};

// Looks up a single word/term — no space, no mode, the model auto-detects
// Hebrew vs English by script alone. Returns one of:
//   { type: 'options', options: [{ word, context }] }  — Hebrew input, needs disambiguation
//   { type: 'detail', word, partOfSpeech, hebrewSynonyms, exampleSentence, englishSynonyms } — resolved, ready to save
export const lookupWord = async (query) => {
    const baseTemplate = readFileSync(promptPath, 'utf-8');
    const content = baseTemplate.replace('${query}', query);

    const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [{ parts: [{ text: content }] }],
        config: {
            responseMimeType: 'application/json'
        }
    });

    const rawText = response.candidates[0].content.parts[0].text;
    return parseResponse(rawText);
};