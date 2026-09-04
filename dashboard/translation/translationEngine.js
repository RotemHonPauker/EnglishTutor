import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getSpaceRuleFields, getTags } from '../../database.js';

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

// Appends this space's own Variant 1 / Variant 2 notes (if any) onto the
// generic variantGuidance.txt content, so space-specific voice/style sits
// right alongside the general guidance instead of buried in one big blob.
const buildVariantGuidanceSection = (baseGuidance, spaceFields) => {
    if (!spaceFields.variant1Notes && !spaceFields.variant2Notes) {
        return baseGuidance;
    }
    let section = `${baseGuidance}\n\n## This Space's Variant Guidance\n`;
    if (spaceFields.variant1Notes) section += `Variant 1: ${spaceFields.variant1Notes}\n`;
    if (spaceFields.variant2Notes) section += `Variant 2: ${spaceFields.variant2Notes}\n`;
    return section;
};

// A space with nothing filled in under "About this space" yet is a normal
// state — the section is simply omitted rather than left as an empty
// heading.
const buildSpaceRulesSection = (spaceFields) => {
    return spaceFields.aboutThisSpace
        ? `## About This Space\n${spaceFields.aboutThisSpace}\n\n`
        : '';
};

// mode is 'capture' (default, Hebrew input) or 'check' (English/mixed
// input — grammar and phrasing correction instead of translation).
// translationPrompt.txt contains instructions for both; only the mode word
// itself is injected, and the model follows whichever branch applies.
// Returns { correctedHebrew, variant1, variant2, tagId }.
export const translatePhrase = async (hebrewText, spaceId, mode = 'capture') => {
    const baseTemplate = readFileSync(basePromptPath, 'utf-8');
    const variantGuidanceBase = readFileSync(variantGuidancePath, 'utf-8');
    const [spaceFields, spaceTags] = await Promise.all([
        getSpaceRuleFields(spaceId),
        getTags(spaceId)
    ]);

    const content = baseTemplate
        .replace('${mode}', mode)
        .replace('${variantGuidance}', buildVariantGuidanceSection(variantGuidanceBase, spaceFields))
        .replace('${spaceRulesSection}', buildSpaceRulesSection(spaceFields))
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