import Anthropic from '@anthropic-ai/sdk';
import { translationPrompt } from './translationPrompt.js';
import { parseTranslationResponse } from './parseTranslationResponse.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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