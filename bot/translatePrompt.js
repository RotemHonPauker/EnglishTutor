import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const translatePromptTemplate = readFileSync(
    join(__dirname, 'translatePrompt.txt'),
    'utf-8'
);

export const translatePrompt = (hebrewText) => 
    translatePromptTemplate.replace('${hebrewText}', hebrewText);