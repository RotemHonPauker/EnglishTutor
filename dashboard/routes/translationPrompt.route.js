import express from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import { clearPendingTranslationPromptProposal } from '../toolHandler.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const translationPromptPath = join(__dirname, '..', 'translation', 'translationPrompt.txt');

router.get('/translation-prompt', (req, res) => {
    const content = readFileSync(translationPromptPath, 'utf-8');
    res.json({ content });
});

router.post('/translation-prompt', (req, res) => {
    const { content } = req.body;
    try {
        writeFileSync(translationPromptPath, content, 'utf-8');
        execSync(
            'git add dashboard/translation/translationPrompt.txt && git commit -m "update translation prompt from dashboard" && git push',
            { cwd: join(__dirname, '..', '..') }
        );
        clearPendingTranslationPromptProposal();
        res.json({ ok: true });
    } catch (err) {
        console.error('Translation prompt save error:', err);
        res.status(500).json({ error: 'Failed to save translation prompt' });
    }
});

router.post('/translation-prompt/discard', (req, res) => {
    clearPendingTranslationPromptProposal();
    res.json({ ok: true });
});

export default router;