import express from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import { clearPendingEditorPromptProposal } from '../editor/toolHandler.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const editorPromptPath = join(__dirname, '..', 'editor', 'editorPrompt.txt');

router.get('/editor-prompt', (req, res) => {
    const content = readFileSync(editorPromptPath, 'utf-8');
    res.json({ content });
});

router.post('/editor-prompt', (req, res) => {
    const { content } = req.body;
    try {
        writeFileSync(editorPromptPath, content, 'utf-8');
        execSync(
            'git add dashboard/editor/editorPrompt.txt && git commit -m "update editor prompt from review session" && git push',
            { cwd: join(__dirname, '..', '..') }
        );
        clearPendingEditorPromptProposal();
        res.json({ ok: true });
    } catch (err) {
        console.error('Prompt save error:', err);
        res.status(500).json({ error: 'Failed to save prompt' });
    }
});

router.post('/editor-prompt/discard', (req, res) => {
    clearPendingEditorPromptProposal();
    res.json({ ok: true });
});

export { router as editorPromptRouter };