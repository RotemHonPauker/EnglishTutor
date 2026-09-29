import express from 'express';
import { getSpaces, createSpace, updateSpace, deleteSpace, migrateSpace, getPhrases } from '../../database.js';
import { deleteSpeechFile } from '../tts/ttsEngine.js';
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

// Deletes a space and everything scoped to it — tags, phrases, dictionary
// entries, and transcripts all cascade at the database level (see the
// schema). At least one space always has to remain, since the app always
// shows exactly one active space.
router.delete('/spaces/:id', async (req, res) => {
    try {
        const existing = await getSpaces();
        if (existing.length <= 1) {
            return res.status(400).json({ error: 'Cannot delete the only remaining space' });
        }
        const target = existing.find(s => s.id === req.params.id);
        if (!target) {
            return res.status(404).json({ error: 'Space not found' });
        }

        // Fetched before the delete — the cascade removes these rows, so
        // this is the last chance to know which TTS files to clean up.
        const phrases = target.space_type === 'dictionary' ? [] : await getPhrases(req.params.id);

        await deleteSpace(req.params.id);

        // Best-effort, same as a single phrase delete — just for every
        // phrase this space had at once.
        for (const phrase of phrases) {
            await deleteSpeechFile(phrase.tts_url_variant1);
            await deleteSpeechFile(phrase.tts_url_variant2);
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('Error deleting space:', err);
        res.status(500).json({ error: 'Failed to delete space' });
    }
});

router.post('/spaces/migrate', async (req, res) => {
    const { sourceId, targetId, dropSourceTranscripts } = req.body;
    if (!sourceId || !targetId) {
        return res.status(400).json({ error: 'sourceId and targetId are required' });
    }
    try {
        const existing = await getSpaces();
        const source = existing.find(s => s.id === sourceId);
        const target = existing.find(s => s.id === targetId);
        if (!source || !target) {
            return res.status(404).json({ error: 'Space not found' });
        }
        // migrateSpace only ever moves tags and phrases — a dictionary
        // space's entries live in a separate table it never touches, so
        // merging across types would silently lose them (or strand phrases
        // inside a space whose UI only shows dictionary entries). Blocked
        // outright rather than risking that.
        if (source.space_type !== target.space_type) {
            return res.status(400).json({ error: `Can't migrate a ${source.space_type} space into a ${target.space_type} space — they hold different kinds of data` });
        }
        // Phrases carry no language tag of their own — a space's language
        // pair is how the app knows what they're in. Merging across
        // languages would mix, say, Hebrew→English phrases into a
        // French→English space with nothing to tell them apart.
        if (source.source_language !== target.source_language || source.target_language !== target.target_language) {
            return res.status(400).json({ error: "Can't migrate between spaces with different languages" });
        }
        if (source.space_type === 'bridge' && source.bridge_language !== target.bridge_language) {
            return res.status(400).json({ error: "Can't migrate between Bridge spaces with different bridge languages" });
        }

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