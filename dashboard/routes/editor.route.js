import express from 'express';
import { handleReviewMessage } from '../editorEngine.js';
import {
    getPendingBotPromptProposal, clearPendingBotPromptProposal,
    getPendingEditorPromptProposal, clearPendingEditorPromptProposal
} from '../toolHandler.js';

const router = express.Router();
let conversationHistory = [];

router.post('/editor', async (req, res) => {
    const { message } = req.body;
    try {
        const { reply, history } = await handleReviewMessage(message, conversationHistory);
        conversationHistory = history;
        // Sent to the client at most once per proposal — cleared right after
        // so it doesn't resurface on later, unrelated turns.
        const botPromptProposal = getPendingBotPromptProposal();
        if (botPromptProposal) clearPendingBotPromptProposal();
        const editorPromptProposal = getPendingEditorPromptProposal();
        if (editorPromptProposal) clearPendingEditorPromptProposal();
        res.json({ reply, botPromptProposal, editorPromptProposal });
    } catch (err) {
        console.error('Review editor error:', err);
        res.status(500).json({ error: 'Something went wrong' });
    }
});

router.get('/reset', (req, res) => {
    conversationHistory = [];
    clearPendingBotPromptProposal();
    clearPendingEditorPromptProposal();
    res.json({ ok: true });
});

export { router as editorRouter };