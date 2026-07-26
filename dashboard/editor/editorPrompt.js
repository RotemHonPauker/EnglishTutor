import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const getEditorPrompt = () => readFileSync(
    join(__dirname, 'editorPrompt.txt'),
    'utf-8'
);