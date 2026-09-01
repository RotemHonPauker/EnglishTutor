import express from 'express';
import { getSpaces, createSpace, updateSpace } from '../../database.js';

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

export { router as spacesRouter };