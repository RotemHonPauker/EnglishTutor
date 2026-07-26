import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, 'translationPrompt.txt');

// Reads translationPrompt.txt fresh on every call (instead of caching it at
// module load) so an edit made — and committed — from the review chat takes
// effect on the very next translation, with no need to restart the server.
export const translationPrompt = (hebrewText) => {
    const template = readFileSync(templatePath, 'utf-8');
    return template.replace('${hebrewText}', hebrewText);
};