import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPhraseById, updatePhraseApproval } from '../database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const botPromptPath = join(__dirname, '..', 'bot', 'botPrompt.txt');

let currentPhrase = null;

export const handleToolCall = async (toolName, toolInput) => {
    if (toolName === 'fetch_phrase_by_id') {
        currentPhrase = await getPhraseById(toolInput.phraseId);
        if (!currentPhrase) return 'Phrase not found.';
        // Only pass along what the chat should ever see/discuss — never the
        // raw row, which also contains subtag_id, status, id, and dates.
        return JSON.stringify({
            hebrewText: currentPhrase.hebrew_text,
            variant1: currentPhrase.variant_1,
            variant2: currentPhrase.variant_2
        });
    }

    if (toolName === 'save_approved') {
        await updatePhraseApproval({
            id: currentPhrase.id,
            variant1: toolInput.variant1,
            variant2: toolInput.variant2
        });
        currentPhrase = null;
        return 'Saved successfully.';
    }

    if (toolName === 'skip') {
        currentPhrase = null;
        return 'Skipped.';
    }

    // Read-only: lets Claude see the bot's current translation prompt so it can
    // propose an accurate edit. There is no matching write/commit tool — the
    // user always copies any suggested wording into bot/botPrompt.txt themselves.
    if (toolName === 'fetch_bot_prompt') {
        const currentContent = readFileSync(botPromptPath, 'utf-8');
        return currentContent;
    }
};