import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, 'botPrompt.txt');

// Reads botPrompt.txt fresh on every call (instead of caching it at module
// load) so edits made — and committed — from the review chat take effect
// on the very next WhatsApp message, with no need to restart the bot.
export const botPrompt = (hebrewText) => {
    const translatePromptTemplate = readFileSync(templatePath, 'utf-8');
    return translatePromptTemplate.replace('${hebrewText}', hebrewText);
};