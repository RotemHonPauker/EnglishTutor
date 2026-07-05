import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import express from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import { handleReviewMessage } from './reviewChat.js';
import { connectDB, saveSentence, getPhrases } from '../database.js';

const app = express();
const PORT = 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPromptPath = join(__dirname, 'systemPrompt.txt');

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

app.get('/phrases', async (req, res) => {
    const { status } = req.query;
    try {
        const phrases = await getPhrases(status || null);
        res.json(phrases);
    } catch (err) {
        console.error('Error fetching phrases:', err);
        res.status(500).json({ error: 'Failed to fetch phrases' });
    }
});

app.get('/system-prompt', (req, res) => {
    const content = readFileSync(systemPromptPath, 'utf-8');
    res.json({ content });
});

app.post('/system-prompt', (req, res) => {
    const { content } = req.body;
    try {
        writeFileSync(systemPromptPath, content, 'utf-8');
        execSync(
            'git add dashboard/systemPrompt.txt && git commit -m "update system prompt from review session" && git push',
            { cwd: join(__dirname, '..') }
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('Prompt save error:', err);
        res.status(500).json({ error: 'Failed to save prompt' });
    }
});

app.listen(PORT, async () => {
    await connectDB();
    console.log(`Dashboard running at http://localhost:${PORT}`);
});