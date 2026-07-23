import express from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const botPromptPath = join(__dirname, '..', '..', 'bot', 'translatePrompt.txt');

router.get('/bot-prompt', (req, res) => {
    const content = readFileSync(botPromptPath, 'utf-8');
    res.json({ content });
});

router.post('/bot-prompt', (req, res) => {
    const { content } = req.body;
    try {
        writeFileSync(botPromptPath, content, 'utf-8');
        execSync(
            'git add bot/translatePrompt.txt && git commit -m "update bot prompt from dashboard" && git push',
            { cwd: join(__dirname, '..', '..') }
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('Bot prompt save error:', err);
        res.status(500).json({ error: 'Failed to save bot prompt' });
    }
});

export default router;