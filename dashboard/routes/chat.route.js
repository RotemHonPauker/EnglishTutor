import express from 'express';
import { handleReviewMessage } from '../reviewChat.js';

const router = express.Router();
let conversationHistory = [];

router.post('/chat', async (req, res) => {
    const { message } = req.body;
    try {
        const { reply, history } = await handleReviewMessage(message, conversationHistory);
        conversationHistory = history;
        res.json({ reply });
    } catch (err) {
        console.error('Review chat error:', err);
        res.status(500).json({ error: 'Something went wrong' });
    }
});

router.get('/reset', (req, res) => {
    conversationHistory = [];
    res.json({ ok: true });
});

export { router as chatRouter };