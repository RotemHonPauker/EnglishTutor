import express from 'express';
import { handleReviewMessage } from '../editor/editorEngine.js';
import {
    setCurrentSpace,
    getPendingSpaceRulesProposal, clearPendingSpaceRulesProposal
} from '../editor/toolHandler.js';

const router = express.Router();
let conversationHistory = [];

router.post('/editor', async (req, res) => {
    const { message, spaceId } = req.body;
    try {
        setCurrentSpace(spaceId);
        const { reply, history } = await handleReviewMessage(message, conversationHistory);
        conversationHistory = history;
        // Sent to the client at most once per proposal — cleared right after
        // so it doesn't resurface on later, unrelated turns.
        const spaceRulesProposal = getPendingSpaceRulesProposal();
        if (spaceRulesProposal) clearPendingSpaceRulesProposal();
        res.json({ reply, spaceRulesProposal });
    } catch (err) {
        console.error('Review editor error:', err);
        res.status(500).json({ error: 'Something went wrong' });
    }
});

router.get('/reset', (req, res) => {
    conversationHistory = [];
    clearPendingSpaceRulesProposal();
    res.json({ ok: true });
});

export { router as editorRouter };