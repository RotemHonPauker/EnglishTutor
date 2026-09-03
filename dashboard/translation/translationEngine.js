import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getSpaceRules, getTags } from '../../database.js';

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

// Builds the "Step 3: Suggest a Tag" section. Deliberately never invites
// the model to invent a new tag — only to pick from what's given, or say
// null. If the space has no tags yet, skip asking entirely.
const buildExistingTagsSection = (spaceTags) => {
    if (!spaceTags.length) {
        return 'This space has no tags defined yet, so always put null for "tag".';
    }
    const names = spaceTags.map(t => t.name).join(', ');
    return `This space has the following tags: ${names}\nIf one of these tags clearly and confidently fits this phrase's topic, put its exact name (as written above) in "tag". If none fit well, or you're not confident, put null instead — never guess, and never invent a tag name that isn't in the list above.`;
};

// Never trusts the model's tag name directly — resolves it against the
// tags actually fetched for this space (case-insensitive exact match). A
// name that doesn't match anything real (hallucinated, mistyped, or the
// model ignoring the "only from the list" instruction) just falls back to
// untagged, same as if the model had said null itself.
const resolveTagId = (tagName, spaceTags) => {
    if (!tagName) return null;
    const match = spaceTags.find(t => t.name.toLowerCase() === String(tagName).toLowerCase());
    return match ? match.id : null;
};

// mode is 'capture' (default, Hebrew input) or 'check' (English/mixed
// input — grammar and phrasing correction instead of translation).
// translationPrompt.txt contains instructions for both; only the mode word
// itself is injected, and the model follows whichever branch applies.
// Returns { correctedHebrew, variant1, variant2, tagId }.
export const translatePhrase = async (hebrewText, spaceId, mode = 'capture') => {
    const baseTemplate = readFileSync(basePromptPath, 'utf-8');
    const variantGuidance = readFileSync(variantGuidancePath, 'utf-8');
    const [spaceRules, spaceTags] = await Promise.all([
        getSpaceRules(spaceId),
        getTags(spaceId)
    ]);

    // A space with no additional rules yet is a normal state — the section
    // is simply omitted rather than left as an empty heading.
    const spaceRulesSection = spaceRules
        ? `## Additional Rules for This Space\n${spaceRules}\n\n`
        : '';

    const content = baseTemplate
        .replace('${mode}', mode)
        .replace('${variantGuidance}', variantGuidance)
        .replace('${spaceRulesSection}', spaceRulesSection)
        .replace('${existingTagsSection}', buildExistingTagsSection(spaceTags))
        .replace('${phrase}', hebrewText);

    const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [{ parts: [{ text: content }] }],
        config: {
            responseMimeType: 'application/json'
        }
    });

    const rawText = response.candidates[0].content.parts[0].text;
    const result = parseTranslationResponse(rawText);

    return {
        correctedHebrew: result.correctedHebrew,
        variant1: result.variant1,
        variant2: result.variant2,
        tagId: resolveTagId(result.tag, spaceTags)
    };
};