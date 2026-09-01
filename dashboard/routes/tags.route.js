import express from 'express';
import { getTags, createTag, updateTag, deleteTag, mergeTags } from '../../database.js';

const router = express.Router();

router.get('/tags', async (req, res) => {
    const { spaceId } = req.query;
    if (!spaceId) {
        return res.status(400).json({ error: 'spaceId is required' });
    }
    try {
        const tags = await getTags(spaceId);
        res.json(tags);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch tags' });
    }
});

router.post('/tags', async (req, res) => {
    const { name, color, spaceId } = req.body;
    if (!spaceId) {
        return res.status(400).json({ error: 'spaceId is required' });
    }
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
    }
    try {
        const tag = await createTag({ name: name.trim(), color, spaceId });
        res.json(tag);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create tag' });
    }
});

router.put('/tags/:id', async (req, res) => {
    const { name, color } = req.body;
    try {
        const tag = await updateTag({ id: req.params.id, name, color });
        res.json(tag);
    } catch (err) {
        res.status(400).json({ error: err.message || 'Failed to update tag' });
    }
});

router.delete('/tags/:id', async (req, res) => {
    try {
        await deleteTag(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message || 'Failed to delete tag' });
    }
});

router.post('/tags/merge', async (req, res) => {
    const { sourceId, targetId } = req.body;
    try {
        await mergeTags({ sourceId, targetId });
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message || 'Failed to merge tags' });
    }
});

export { router as tagsRouter };