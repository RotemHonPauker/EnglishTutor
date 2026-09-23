import express from 'express';
import { getSpaces, createSpace, updateSpace, migrateSpace } from '../../database.js';
import { LANGUAGES } from '../../languages.js';

const VALID_LANGUAGE_NAMES = new Set(LANGUAGES.map(l => l.name));

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

// The single source of truth for supported languages — the frontend
// fetches this once at load instead of keeping its own hardcoded copy, so
// there's nothing to keep in sync by hand.
router.get('/languages', (req, res) => {
    res.json(LANGUAGES);
});

router.post('/spaces', async (req, res) => {
    const { name, spaceType, sourceLanguage, targetLanguage, bridgeLanguage } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
    }
    if (!sourceLanguage || !targetLanguage) {
        return res.status(400).json({ error: 'Source and target language are required' });
    }
    if (!VALID_LANGUAGE_NAMES.has(sourceLanguage) || !VALID_LANGUAGE_NAMES.has(targetLanguage)) {
        return res.status(400).json({ error: 'Source and target language must be from the supported list' });
    }
    if (spaceType === 'bridge' && !bridgeLanguage) {
        return res.status(400).json({ error: 'Bridge language is required for a Bridge space' });
    }
    if (spaceType === 'bridge' && !VALID_LANGUAGE_NAMES.has(bridgeLanguage)) {
        return res.status(400).json({ error: 'Bridge language must be from the supported list' });
    }
    try {
        const existing = await getSpaces();
        if (existing.some(s => s.name.trim().toLowerCase() === name.trim().toLowerCase())) {
            return res.status(409).json({ error: 'A space with this name already exists' });
        }
        const space = await createSpace({
            name: name.trim(),
            spaceType: spaceType || 'progression',
            sourceLanguage,
            targetLanguage,
            bridgeLanguage: spaceType === 'bridge' ? bridgeLanguage : null
        });
        res.json(space);
    } catch (err) {
        console.error('Error creating space:', err);
        res.status(500).json({ error: 'Failed to create space' });
    }
});

router.put('/spaces/:id', async (req, res) => {
    const { name, aboutThisSpace, variant1Notes, variant2Notes, audioRecordingNotes } = req.body;
    if (name !== undefined && !name.trim()) {
        return res.status(400).json({ error: 'Name cannot be empty' });
    }
    try {
        if (name !== undefined) {
            const existing = await getSpaces();
            const current = existing.find(s => s.id === req.params.id);
            if (current?.space_type === 'dictionary') {
                return res.status(400).json({ error: "A dictionary space's name can't be changed — it stays locked to its language pair" });
            }
            if (existing.some(s => s.id !== req.params.id && s.name.trim().toLowerCase() === name.trim().toLowerCase())) {
                return res.status(409).json({ error: 'A space with this name already exists' });
            }
        }
        const space = await updateSpace({
            id: req.params.id,
            name: name !== undefined ? name.trim() : undefined,
            aboutThisSpace,
            variant1Notes,
            variant2Notes,
            audioRecordingNotes
        });
        res.json(space);
    } catch (err) {
        console.error('Error updating space:', err);
        res.status(500).json({ error: 'Failed to update space' });
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