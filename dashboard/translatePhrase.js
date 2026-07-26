import Anthropic from '@anthropic-ai/sdk';
import { translationPrompt } from './translation/translationPrompt.js';
import { parseTranslationResponse } from './translation/parseTranslationResponse.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Same prompt template and parsing the old bot used — reused, not duplicated,
// so a wording edit made through the "Edit bot prompt" chat flow applies here too.
export const translatePhrase = async (hebrewText) => {
    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
            role: 'user',
            content: translationPrompt(hebrewText)
        }]
    });

    return parseTranslationResponse(response.content[0].text);
};