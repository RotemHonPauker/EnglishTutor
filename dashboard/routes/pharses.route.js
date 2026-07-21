import express from 'express';
import { getPhrases } from '../../database.js';

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

export { router as phrasesRouter };