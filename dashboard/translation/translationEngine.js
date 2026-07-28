import Anthropic from '@anthropic-ai/sdk';
import { getPrompt } from '../../database.js';
import { parseTranslationResponse } from './parseTranslationResponse.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const translatePhrase = async (hebrewText) => {
    // Reads the current template from the DB on every call (instead of
    // caching it) so an edit made — and saved — from the editor engine takes
    // effect on the very next translation, with no need to restart the server.
    const template = await getPrompt('translation');
    const content = template.replace('${hebrewText}', hebrewText);

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