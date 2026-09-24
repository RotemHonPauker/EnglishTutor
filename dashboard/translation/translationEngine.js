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

// A space with nothing filled in under "About this space" yet is a normal
// state — the section is simply omitted rather than left as an empty
// heading.
const buildSpaceRulesSection = (spaceFields) => {
    return spaceFields.aboutThisSpace
        ? `## About This Space\n${spaceFields.aboutThisSpace}\n\n`
        : '';
};

// Builds Step 2 of the prompt — what "variant1"/"variant2" actually mean —
// which differs by space type:
//   - progression (the original model): both variants are the target
//     language, variant2 a step up in fluency from variant1. Uses the
//     shared variantGuidance.txt, with this space's own Level 1/Level 2
//     notes appended, same mechanism as before.
//   - bridge: variant1 is the target language, variant2 is a THIRD
//     language (the bridge language) shown purely for reference/
//     comparison — not a more advanced version of anything. This space's
//     "Level 1/2" notes are repurposed as target/bridge-language notes.
const buildTranslationStep = (variantGuidanceBase, spaceFields) => {
    if (spaceFields.spaceType === 'bridge') {
        let section = `Produce two translations of the corrected text:\n- "variant1": a natural translation into ${spaceFields.targetLanguage}.\n- "variant2": a natural translation into ${spaceFields.bridgeLanguage}, included purely as a reference/comparison language. It is a separate language, not a more advanced or different version of ${spaceFields.targetLanguage} — translate independently into it.\nDo not use dashes in either translation.`;
        if (spaceFields.variant1Notes) section += `\n\n${spaceFields.targetLanguage} notes: ${spaceFields.variant1Notes}`;
        if (spaceFields.variant2Notes) section += `\n\n${spaceFields.bridgeLanguage} notes: ${spaceFields.variant2Notes}`;
        return section;
    }

    // progression (default)
    const resolvedGuidance = variantGuidanceBase.replace(/\$\{targetLanguage\}/g, spaceFields.targetLanguage);
    if (!spaceFields.variant1Notes && !spaceFields.variant2Notes) {
        return resolvedGuidance;
    }
    let section = `${resolvedGuidance}\n\n## This Space's Level Guidance\n`;
    if (spaceFields.variant1Notes) section += `Level 1: ${spaceFields.variant1Notes}\n`;
    if (spaceFields.variant2Notes) section += `Level 2: ${spaceFields.variant2Notes}\n`;
    return section;
};

// Returns { correctedSource, variant1, variant2, tagId }.
export const translatePhrase = async (sourceText, spaceId) => {
    const baseTemplate = readFileSync(basePromptPath, 'utf-8');
    const variantGuidanceBase = readFileSync(variantGuidancePath, 'utf-8');
    const [spaceFields, spaceTags] = await Promise.all([
        getSpaceRuleFields(spaceId),
        getTags(spaceId)
    ]);

    const content = baseTemplate
        .replace(/\$\{sourceLanguage\}/g, spaceFields.sourceLanguage)
        .replace(/\$\{targetLanguage\}/g, spaceFields.targetLanguage)
        .replace('${translationStep}', buildTranslationStep(variantGuidanceBase, spaceFields))
        .replace('${spaceRulesSection}', buildSpaceRulesSection(spaceFields))
        .replace('${existingTagsSection}', buildExistingTagsSection(spaceTags))
        .replace('${phrase}', sourceText);

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
        correctedSource: result.correctedSource,
        variant1: result.variant1,
        variant2: result.variant2,
        tagId: resolveTagId(result.tag, spaceTags)
    };
};