import express from 'express';
import { getPhrases, updatePhraseSubtag, updatePhraseStatus } from '../../database.js';

const router = express.Router();

router.get('/phrases', async (req, res) => {
    const { status } = req.query;
    try {
        const phrases = await getPhrases(status || null);
        res.json(phrases);
    } catch (err) {
        console.error('Error fetching phrases:', err);
        res.status(500).json({ error: 'Failed to fetch phrases' });
    }
});

router.patch('/phrases/:id/subtag', async (req, res) => {
    const { id } = req.params;
    const { subtagId } = req.body;
    try {
        const phrase = await updatePhraseSubtag({ id, subtagId });
        res.json(phrase);
    } catch (err) {
        console.error('Error updating phrase subtag:', err);
        res.status(500).json({ error: 'Failed to update tag' });
    }
});

router.patch('/phrases/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!['uncategorized', 'approved'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    try {
        const phrase = await updatePhraseStatus({ id, status });
        res.json(phrase);
    } catch (err) {
        console.error('Error updating phrase status:', err);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

export { router as phrasesRouter };