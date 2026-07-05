import { getNextUncategorized, updatePhrase } from '../database.js';

let currentPhrase = null;

export const handleToolCall = async (toolName, toolInput) => {
    if (toolName === 'fetch_next_uncategorized') {
        currentPhrase = await getNextUncategorized();
        return currentPhrase
            ? JSON.stringify(currentPhrase)
            : 'No more uncategorized phrases.';
    }

    if (toolName === 'save_approved') {
        await updatePhrase({
            id: currentPhrase.id,
            variant1: toolInput.variant1,
            variant2: toolInput.variant2,
            tag: toolInput.tag,
            status: 'approved'
        });
        currentPhrase = null;
        return 'Saved successfully.';
    }

    if (toolName === 'skip') {
        currentPhrase = null;
        return 'Skipped.';
    }
};