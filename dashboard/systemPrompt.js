import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const systemPrompt = readFileSync(
    join(__dirname, 'systemPrompt.txt'), 
    'utf-8'
);