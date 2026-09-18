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
// Hebrew vs English by script alone. partOfSpeechHint, when given, comes
// from a sense-disambiguation option the person just picked (see Rule 4 in
// the prompt) — it skips straight to defining the word as that specific
// part of speech instead of re-triggering the same ambiguity. Returns one of:
//   { type: 'options', kind: 'translations', options: [{ word, context }] }  — Hebrew input, needs a word chosen
//   { type: 'options', kind: 'senses', options: [{ partOfSpeech, context }] } — English input, needs a sense chosen
//   { type: 'detail', word, partOfSpeech, hebrewSynonyms, exampleSentence, englishSynonyms } — resolved, ready to save
// Enforces the app's word display convention regardless of what the model
// happened to return — capitalized first letter, and verbs never prefixed
// with "to" (just the verb itself). Applied in code rather than relying on
// the prompt alone, since that's a request, not a guarantee.
const normalizeWord = (word) => {
    if (!word) return word;
    const trimmed = word.trim().replace(/^to\s+/i, '');
    if (!trimmed) return trimmed;
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

export const lookupWord = async (query, partOfSpeechHint) => {
    const baseTemplate = readFileSync(promptPath, 'utf-8');
    const hintSection = partOfSpeechHint
        ? `The person has already specified this should be defined as a: ${partOfSpeechHint}. Skip disambiguation and define it directly as that part of speech.`
        : '';
    const content = baseTemplate
        .replace('${query}', query)
        .replace('${partOfSpeechHintSection}', hintSection);

    const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [{ parts: [{ text: content }] }],
        config: {
            responseMimeType: 'application/json'
        }
    });

    const rawText = response.candidates[0].content.parts[0].text;
    const result = parseResponse(rawText);

    if (result.type === 'detail' && result.word) {
        result.word = normalizeWord(result.word);
    }
    if (result.type === 'options' && result.kind === 'translations' && Array.isArray(result.options)) {
        result.options = result.options.map(o => ({ ...o, word: normalizeWord(o.word) }));
    }

    return result;
};