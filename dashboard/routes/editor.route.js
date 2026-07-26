import express from 'express';
import { handleReviewMessage } from '../editor/editorEngine.js';
import {
    getPendingTranslationPromptProposal, clearPendingTranslationPromptProposal,
    getPendingEditorPromptProposal, clearPendingEditorPromptProposal
} from '../editor/toolHandler.js';

const router = express.Router();
let conversationHistory = [];

router.post('/editor', async (req, res) => {
    const { message } = req.body;
    try {
        const { reply, history } = await handleReviewMessage(message, conversationHistory);
        conversationHistory = history;
        // Sent to the client at most once per proposal — cleared right after
        // so it doesn't resurface on later, unrelated turns.
        const translationPromptProposal = getPendingTranslationPromptProposal();
        if (translationPromptProposal) clearPendingTranslationPromptProposal();
        const editorPromptProposal = getPendingEditorPromptProposal();
        if (editorPromptProposal) clearPendingEditorPromptProposal();
        res.json({ reply, translationPromptProposal, editorPromptProposal });
    } catch (err) {
        console.error('Review editor error:', err);
        res.status(500).json({ error: 'Something went wrong' });
    }
});

router.get('/reset', (req, res) => {
    conversationHistory = [];
    clearPendingTranslationPromptProposal();
    clearPendingEditorPromptProposal();
    res.json({ ok: true });
});

export { router as editorRouter };