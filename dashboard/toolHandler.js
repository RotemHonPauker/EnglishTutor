import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getNextUncategorized, updatePhrase, getTags } from '../database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const botPromptPath = join(__dirname, '..', 'bot', 'botPrompt.txt');

let currentPhrase = null;

export const handleToolCall = async (toolName, toolInput) => {
    if (toolName === 'fetch_next_uncategorized') {
        currentPhrase = await getNextUncategorized();
        if (!currentPhrase) return 'No more uncategorized phrases.';
        
        // Also fetch available tags so Claude can suggest one
        const tags = await getTags();
        return JSON.stringify({ phrase: currentPhrase, availableTags: tags });
    }

    if (toolName === 'save_approved') {
        await updatePhrase({
            id: currentPhrase.id,
            variant1: toolInput.variant1,
            variant2: toolInput.variant2,
            subtagId: toolInput.subtagId,
            status: 'approved'
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