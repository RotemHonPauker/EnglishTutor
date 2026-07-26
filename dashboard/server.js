import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import express from 'express';
import { connectDB } from '../database.js';

import { editorRouter } from  './routes/editor.route.js';
import { phrasesRouter } from './routes/phrases.route.js';
import { tagsRouter } from './routes/tags.route.js';
import { editorPromptRouter } from './routes/editorPrompt.route.js';
import botPromptRouter from './routes/botPrompt.route.js';

const app = express();
const PORT = 3000;

app.use(express.static('dashboard/public'));
app.use(express.json());

app.use(editorRouter);
app.use(phrasesRouter);
app.use(tagsRouter);
app.use(editorPromptRouter);
app.use(botPromptRouter);

app.listen(PORT, async () => {
    await connectDB();
    console.log(`Dashboard running at http://localhost:${PORT}`);
});