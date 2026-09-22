import express from 'express';
import rateLimit from 'express-rate-limit';
import { getDictionaryEntries, saveDictionaryEntry, updateDictionaryEntryLearned, deleteDictionaryEntry, getSpaceRuleFields } from '../../database.js';
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

// Dictionaries are space-scoped now (space_type = 'dictionary') — more
// than one can exist, each with its own language pair — so every route
// here needs to know which one.
router.get('/dictionary', async (req, res) => {
    const { spaceId } = req.query;
    if (!spaceId) {
        return res.status(400).json({ error: 'spaceId is required' });
    }
    try {
        const entries = await getDictionaryEntries(spaceId);
        res.json(entries);
    } catch (err) {
        console.error('Error fetching dictionary entries:', err);
        res.status(500).json({ error: 'Failed to fetch dictionary entries' });
    }
});

// Body: { spaceId, query, sourceQuery? }. sourceQuery is only passed when
// this call is resolving a word the person picked from an earlier options
// list, so the original source-language search stays attached to the
// entry that gets saved. spaceId's own source/target language (fetched via
// getSpaceRuleFields, same helper the translation routes use) tells
// lookupWord which two languages this dictionary is between.
router.post('/dictionary/lookup', lookupLimiter, async (req, res) => {
    const { spaceId, query, sourceQuery, partOfSpeechHint } = req.body;
    if (!spaceId) {
        return res.status(400).json({ error: 'spaceId is required' });
    }
    if (!query || !query.trim()) {
        return res.status(400).json({ error: 'query is required' });
    }
    try {
        const spaceFields = await getSpaceRuleFields(spaceId);
        const result = await lookupWord(query.trim(), spaceFields.sourceLanguage, spaceFields.targetLanguage, partOfSpeechHint || null);

        if (result.type === 'options') {
            return res.json({ type: 'options', kind: result.kind, options: result.options || [] });
        }

        const entry = await saveDictionaryEntry({
            spaceId,
            sourceQuery: sourceQuery || null,
            word: result.word,
            partOfSpeech: result.partOfSpeech,
            sourceSynonyms: (result.sourceSynonyms || []).join(', '),
            exampleSentence: result.exampleSentence,
            targetSynonyms: (result.targetSynonyms || []).join(', ')
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