import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import express from 'express';
import { connectDB } from '../database.js';

import { editorRouter } from  './routes/editor.route.js';
import { phrasesRouter } from './routes/phrases.route.js';
import { tagsRouter } from './routes/tags.route.js';
import { spacesRouter } from './routes/spaces.route.js';
import { recordingsRouter } from './routes/recordings.route.js';

const app = express();
const PORT = 3000;

app.use(express.static('dashboard/public'));
// Default JSON body limit (~100kb) is far too small for base64-encoded
// audio uploads — raised specifically to accommodate those.
app.use(express.json({ limit: '50mb' }));

app.use(editorRouter);
app.use(phrasesRouter);
app.use(tagsRouter);
app.use(spacesRouter);
app.use(recordingsRouter);

app.listen(PORT, async () => {
    await connectDB();
    console.log(`Dashboard running at http://localhost:${PORT}`);
});