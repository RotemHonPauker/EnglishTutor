import express from 'express';
import { getSpaces, createSpace, updateSpace, migrateSpace } from '../../database.js';

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
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
    }
    try {
        const space = await createSpace({ name: name.trim() });
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

router.post('/spaces/migrate', async (req, res) => {
    const { sourceId, targetId, dropSourceTranscripts } = req.body;
    if (!sourceId || !targetId) {
        return res.status(400).json({ error: 'sourceId and targetId are required' });
    }
    try {
        await migrateSpace({ sourceId, targetId, dropSourceTranscripts: !!dropSourceTranscripts });
        res.json({ ok: true });
    } catch (err) {
        if (err.code === 'TOO_MANY_TRANSCRIPTS') {
            return res.status(409).json({
                error: 'too_many_transcripts',
                sourceCount: err.sourceCount,
                targetCount: err.targetCount
            });
        }
        console.error('Error migrating space:', err);
        res.status(400).json({ error: err.message || 'Failed to migrate space' });
    }
});

export { router as spacesRouter };