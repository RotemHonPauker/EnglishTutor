import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import express from 'express';
import { connectDB } from '../database.js';

import { chatRouter } from  './routes/chat.route.js';
import { phrasesRouter } from './routes/phrases.route.js';
import { tagsRouter } from './routes/tags.route.js';
import { systemPromptRouter } from './routes/systemPrompt.route.js';
import botPromptRouter from './routes/botPrompt.route.js';

const app = express();
const PORT = 3000;

app.use(express.static('dashboard/public'));
app.use(express.json());

app.use(chatRouter);
app.use(phrasesRouter);
app.use(tagsRouter);
app.use(systemPromptRouter);
app.use(botPromptRouter);

app.listen(PORT, async () => {
    await connectDB();
    console.log(`Dashboard running at http://localhost:${PORT}`);
});