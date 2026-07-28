import express from 'express';
import { getPhrases, saveSentence, updatePhraseSubtag, deletePhrase } from '../../database.js';
import { translatePhrase } from '../translation/translationEngine.js';

const router = express.Router();

router.get('/phrases', async (req, res) => {
    try {
        const phrases = await getPhrases();
        res.json(phrases);
    } catch (err) {
        console.error('Error fetching phrases:', err);
        res.status(500).json({ error: 'Failed to fetch phrases' });
    }
});

// New-phrase capture: takes raw Hebrew, corrects transcription, produces two English variants,
// and saves it immediately as uncategorized — no confirmation step, by design.
router.post('/phrases', async (req, res) => {
    const { hebrewText } = req.body;
    if (!hebrewText || !hebrewText.trim()) {
        return res.status(400).json({ error: 'Hebrew text is required' });
    }
    try {
        const result = await translatePhrase(hebrewText.trim());
        const phrase = await saveSentence({
            hebrewText: result.correctedHebrew,
            variant1: result.variant1,
            variant2: result.variant2
        });
        res.json(phrase);
    } catch (err) {
        console.error('Error translating/saving phrase:', err);
        res.status(500).json({ error: 'Failed to translate phrase' });
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

router.delete('/phrases/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const phrase = await deletePhrase(id);
        if (!phrase) {
            return res.status(404).json({ error: 'Phrase not found' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Error deleting phrase:', err);
        res.status(500).json({ error: 'Failed to delete phrase' });
    }
});

export { router as phrasesRouter };