import express from 'express';
import { getSpaces, createSpace, updateSpace, getSpaceRules, saveSpaceRules } from '../../database.js';
import { clearPendingSpaceRulesProposal } from '../editor/toolHandler.js';

const router = express.Router();

router.get('/spaces', async (req, res) => {
    try {
        const spaces = await getSpaces();
        res.json(spaces);
    } catch (err) {
        console.error('Error fetching spaces:', err);
        res.status(500).json({ error: 'Failed to fetch spaces' });
    }
});

router.post('/spaces', async (req, res) => {
    const { name, hasOrder } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
    }
    if (typeof hasOrder !== 'boolean') {
        return res.status(400).json({ error: 'hasOrder (true/false) is required' });
    }
    try {
        const space = await createSpace({ name: name.trim(), hasOrder });
        res.json(space);
    } catch (err) {
        console.error('Error creating space:', err);
        res.status(500).json({ error: 'Failed to create space' });
    }
});

router.put('/spaces/:id', async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
    }
    try {
        const space = await updateSpace({ id: req.params.id, name: name.trim() });
        res.json(space);
    } catch (err) {
        console.error('Error renaming space:', err);
        res.status(500).json({ error: 'Failed to rename space' });
    }
});

// A brand new space has no rules yet — content comes back null rather
// than 404, so the editor can recognize "nothing written yet" and offer to
// draft some, instead of treating it as an error.
router.get('/spaces/:id/prompt', async (req, res) => {
    try {
        const content = await getSpaceRules(req.params.id);
        res.json({ content });
    } catch (err) {
        console.error('Error fetching space rules:', err);
        res.status(500).json({ error: 'Failed to fetch space rules' });
    }
});

router.post('/spaces/:id/prompt', async (req, res) => {
    const { content } = req.body;
    try {
        await saveSpaceRules(req.params.id, content);
        clearPendingSpaceRulesProposal();
        res.json({ ok: true });
    } catch (err) {
        console.error('Space rules save error:', err);
        res.status(500).json({ error: 'Failed to save space rules' });
    }
});

router.post('/spaces/:id/prompt/discard', (req, res) => {
    clearPendingSpaceRulesProposal();
    res.json({ ok: true });
});

export { router as spacesRouter };