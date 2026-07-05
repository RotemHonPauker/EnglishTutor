import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import express from 'express';
import { handleReviewMessage } from './reviewChat.js';
import { connectDB } from '../database.js';

const app = express();
const PORT = 3000;

// Serve static files (index.html) from the public folder
app.use(express.static('dashboard/public'));

// Parse incoming JSON messages
app.use(express.json());

// Conversation history lives here — resets when server restarts
let conversationHistory = [];

// Chat endpoint — receives your message, returns Claude's reply
app.post('/chat', async (req, res) => {
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

// Reset endpoint — clears conversation history to start a fresh session
app.get('/reset', (req, res) => {
    conversationHistory = [];
    res.json({ ok: true });
});

app.listen(PORT, async () => {
    await connectDB();
    console.log(`Dashboard running at http://localhost:${PORT}`);
});