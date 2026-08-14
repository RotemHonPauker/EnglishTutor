import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getSpaceRules } from '../../database.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const __dirname = dirname(fileURLToPath(import.meta.url));
const basePromptPath = join(__dirname, 'translationPrompt.txt');
const variantGuidancePath = join(__dirname, 'variantGuidance.txt');

// Strips a ```json fence if Claude wraps the response in one, then parses.
const parseTranslationResponse = (rawText) => {
    const cleaned = rawText.trim().replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
};

export const translatePhrase = async (hebrewText, spaceId) => {
    // The base template is fixed, plain-file config (like editorPrompt.txt)
    // — read fresh each time in case it's ever edited by hand, but never
    // through the chat UI. The space's own additional rules ARE editable
    // through the chat UI and are read fresh from the DB on every call so a
    // save takes effect on the very next translation, no restart needed.
    const baseTemplate = readFileSync(basePromptPath, 'utf-8');
    const variantGuidance = readFileSync(variantGuidancePath, 'utf-8');
    const spaceRules = await getSpaceRules(spaceId);

    // A space with no additional rules yet is a normal state — the section
    // is simply omitted rather than left as an empty heading.
    const spaceRulesSection = spaceRules
        ? `## Additional Rules for This Space\n${spaceRules}\n\n`
        : '';

    const content = baseTemplate
        .replace('${variantGuidance}', variantGuidance)
        .replace('${spaceRulesSection}', spaceRulesSection)
        .replace('${hebrewText}', hebrewText);

    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
            role: 'user',
            content
        }]
    });

    return parseTranslationResponse(response.content[0].text);
};