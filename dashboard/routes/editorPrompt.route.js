import express from 'express';
import { getPrompt, savePrompt } from '../../database.js';
import { clearPendingEditorPromptProposal } from '../editor/toolHandler.js';

const router = express.Router();

router.get('/editor-prompt', async (req, res) => {
    try {
        const content = await getPrompt('editor');
        res.json({ content });
    } catch (err) {
        console.error('Editor prompt fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch prompt' });
    }
});

router.post('/editor-prompt', async (req, res) => {
    const { content } = req.body;
    try {
        await savePrompt('editor', content);
        clearPendingEditorPromptProposal();
        res.json({ ok: true });
    } catch (err) {
        console.error('Prompt save error:', err);
        res.status(500).json({ error: 'Failed to save prompt' });
    }
});

router.post('/editor-prompt/discard', (req, res) => {
    clearPendingEditorPromptProposal();
    res.json({ ok: true });
});

export { router as editorPromptRouter };