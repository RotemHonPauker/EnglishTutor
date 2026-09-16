import express from 'express';
import rateLimit from 'express-rate-limit';
import { getDictionaryEntries, saveDictionaryEntry, updateDictionaryEntryLearned, deleteDictionaryEntry } from '../../database.js';
import { lookupWord } from '../dictionary/dictionaryEngine.js';
import { RATE_LIMIT_WINDOW_MS, TRANSLATE_RATE_LIMIT_MAX } from '../limitsConfig.js';

const router = express.Router();

// Reuses the same limiter numbers as translation — this also calls Gemini
// and should be protected the same way.
const lookupLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: TRANSLATE_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many lookups recently. Please wait a bit and try again.' }
});

router.get('/dictionary', async (req, res) => {
    try {
        const entries = await getDictionaryEntries();
        res.json(entries);
    } catch (err) {
        console.error('Error fetching dictionary entries:', err);
        res.status(500).json({ error: 'Failed to fetch dictionary entries' });
    }
});

// Body: { query, hebrewQuery? }. hebrewQuery is only passed when this call
// is resolving a word the person picked from an earlier options list, so
// the original Hebrew search stays attached to the entry that gets saved.
router.post('/dictionary/lookup', lookupLimiter, async (req, res) => {
    const { query, hebrewQuery } = req.body;
    if (!query || !query.trim()) {
        return res.status(400).json({ error: 'query is required' });
    }
    try {
        const result = await lookupWord(query.trim());

        if (result.type === 'options') {
            return res.json({ type: 'options', options: result.options || [] });
        }

        const entry = await saveDictionaryEntry({
            hebrewQuery: hebrewQuery || null,
            word: result.word,
            partOfSpeech: result.partOfSpeech,
            hebrewSynonyms: (result.hebrewSynonyms || []).join(', '),
            exampleSentence: result.exampleSentence,
            englishSynonyms: (result.englishSynonyms || []).join(', ')
        });
        res.json({ type: 'saved', entry });
    } catch (err) {
        console.error('Error looking up word:', err);
        res.status(500).json({ error: 'Failed to look up word' });
    }
});

router.patch('/dictionary/:id/learned', async (req, res) => {
    const { id } = req.params;
    const { learned } = req.body;
    try {
        const entry = await updateDictionaryEntryLearned({ id, learned: !!learned });
        res.json(entry);
    } catch (err) {
        console.error('Error updating dictionary learned status:', err);
        res.status(500).json({ error: 'Failed to update learned status' });
    }
});

router.delete('/dictionary/:id', async (req, res) => {
    try {
        const entry = await deleteDictionaryEntry(req.params.id);
        if (!entry) {
            return res.status(404).json({ error: 'Entry not found' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Error deleting dictionary entry:', err);
        res.status(500).json({ error: 'Failed to delete entry' });
    }
});

export { router as dictionaryRouter };