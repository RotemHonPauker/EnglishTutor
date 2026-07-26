import express from 'express';
import { handleReviewMessage } from '../reviewChat.js';
import { getPendingBotPromptProposal, clearPendingBotPromptProposal } from '../toolHandler.js';

const router = express.Router();
let conversationHistory = [];

router.post('/chat', async (req, res) => {
    const { message } = req.body;
    try {
        const { reply, history } = await handleReviewMessage(message, conversationHistory);
        conversationHistory = history;
        // Sent to the client at most once per proposal — cleared right after
        // so it doesn't resurface on later, unrelated turns.
        const botPromptProposal = getPendingBotPromptProposal();
        if (botPromptProposal) clearPendingBotPromptProposal();
        res.json({ reply, botPromptProposal });
    } catch (err) {
        console.error('Review chat error:', err);
        res.status(500).json({ error: 'Something went wrong' });
    }
});

router.get('/reset', (req, res) => {
    conversationHistory = [];
    clearPendingBotPromptProposal();
    res.json({ ok: true });
});

export { router as chatRouter };