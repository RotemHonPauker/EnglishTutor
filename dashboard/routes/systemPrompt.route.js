import express from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPromptPath = join(__dirname, '..', 'systemPrompt.txt');

router.get('/system-prompt', (req, res) => {
    const content = readFileSync(systemPromptPath, 'utf-8');
    res.json({ content });
});

router.post('/system-prompt', (req, res) => {
    const { content } = req.body;
    try {
        writeFileSync(systemPromptPath, content, 'utf-8');
        execSync(
            'git add dashboard/systemPrompt.txt && git commit -m "update system prompt from review session" && git push',
            { cwd: join(__dirname, '..', '..') }
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('Prompt save error:', err);
        res.status(500).json({ error: 'Failed to save prompt' });
    }
});

export { router as systemPromptRouter };

