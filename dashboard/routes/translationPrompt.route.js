import express from 'express';
import { getPrompt, savePrompt } from '../../database.js';
import { clearPendingTranslationPromptProposal } from '../editor/toolHandler.js';

const router = express.Router();

router.get('/translation-prompt', async (req, res) => {
    try {
        const content = await getPrompt('translation');
        res.json({ content });
    } catch (err) {
        console.error('Translation prompt fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch translation prompt' });
    }
});

router.post('/translation-prompt', async (req, res) => {
    const { content } = req.body;
    try {
        await savePrompt('translation', content);
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