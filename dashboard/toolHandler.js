import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getNextUncategorized, updatePhrase } from '../database.js';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPromptPath = join(__dirname, 'systemPrompt.txt');

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

    if (toolName === 'update_system_prompt') {
        writeFileSync(systemPromptPath, toolInput.newContent, 'utf-8');
        return 'System prompt updated successfully.';
    }

    if (toolName === 'commit_system_prompt') {
        execSync(
            'git add dashboard/systemPrompt.txt && git commit -m "update system prompt from review session" && git push',
            { cwd: join(__dirname, '..') }
        );
        return 'System prompt committed and pushed to GitHub.';
    }
};