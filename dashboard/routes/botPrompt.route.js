import express from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import { clearPendingBotPromptProposal } from '../toolHandler.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const botPromptPath = join(__dirname, '..', '..', 'bot', 'botPrompt.txt');

router.get('/bot-prompt', (req, res) => {
    const content = readFileSync(botPromptPath, 'utf-8');
    res.json({ content });
});

router.post('/bot-prompt', (req, res) => {
    const { content } = req.body;
    try {
        writeFileSync(botPromptPath, content, 'utf-8');
        execSync(
            'git add bot/botPrompt.txt && git commit -m "update bot prompt from dashboard" && git push',
            { cwd: join(__dirname, '..', '..') }
        );
        clearPendingBotPromptProposal();
        res.json({ ok: true });
    } catch (err) {
        console.error('Bot prompt save error:', err);
        res.status(500).json({ error: 'Failed to save bot prompt' });
    }
});

router.post('/bot-prompt/discard', (req, res) => {
    clearPendingBotPromptProposal();
    res.json({ ok: true });
});

export default router;