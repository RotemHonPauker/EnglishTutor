import express from 'express';
import rateLimit from 'express-rate-limit';
import { getPhrases, getPhraseById, saveSentence, updatePhraseSubtag, updatePhraseSequenceOrder, updatePhraseTtsUrl, deletePhrase } from '../../database.js';
import { translatePhrase } from '../translation/translationEngine.js';
import { generateSpeech, deleteSpeechFile } from '../tts/ttsEngine.js';
import { RATE_LIMIT_WINDOW_MS, TRANSLATE_RATE_LIMIT_MAX } from '../limitsConfig.js';

const router = express.Router();

// Only this route calls the Claude API (to translate) — rate limited to
// protect against runaway usage/abuse burning through API tokens. GET
// /phrases below doesn't call Claude at all, so it isn't limited.
const translateLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: TRANSLATE_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many phrases translated recently. Please wait a bit and try again.' }
});

router.get('/phrases', async (req, res) => {
    const { spaceId } = req.query;
    if (!spaceId) {
        return res.status(400).json({ error: 'spaceId is required' });
    }
    try {
        const phrases = await getPhrases(spaceId);
        res.json(phrases);
    } catch (err) {
        console.error('Error fetching phrases:', err);
        res.status(500).json({ error: 'Failed to fetch phrases' });
    }
});

// New-phrase capture: takes raw Hebrew, corrects transcription, produces two English variants
// using the active space's own translation prompt, and saves it immediately as uncategorized —
// no confirmation step, by design.
router.post('/phrases', translateLimiter, async (req, res) => {
    const { hebrewText, spaceId, mode } = req.body;
    if (!hebrewText || !hebrewText.trim()) {
        return res.status(400).json({ error: 'Hebrew text is required' });
    }
    if (!spaceId) {
        return res.status(400).json({ error: 'spaceId is required' });
    }
    try {
        const result = await translatePhrase(hebrewText.trim(), spaceId, mode);
        const phrase = await saveSentence({
            hebrewText: result.correctedHebrew,
            variant1: result.variant1,
            variant2: result.variant2,
            spaceId
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

// Manual override of a phrase's order number — only meaningful in spaces
// that opted into ordering, but not restricted here; the frontend only
// exposes this control for such spaces.
router.patch('/phrases/:id/sequence-order', async (req, res) => {
    const { id } = req.params;
    const { sequenceOrder } = req.body;
    const parsed = Number(sequenceOrder);
    if (!Number.isInteger(parsed)) {
        return res.status(400).json({ error: 'sequenceOrder must be an integer' });
    }
    try {
        const phrase = await updatePhraseSequenceOrder({ id, sequenceOrder: parsed });
        res.json(phrase);
    } catch (err) {
        console.error('Error updating sequence order:', err);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// Lazy audio generation: returns the already-cached URL if this variant
// was played before, and only calls the Gemini TTS API (and saves a new
// file) the first time. Reuses the same translate rate limiter, since this
// also calls an external AI API and should be protected the same way.
router.post('/phrases/:id/tts', translateLimiter, async (req, res) => {
    const { id } = req.params;
    const variant = Number(req.body.variant);
    if (![1, 2].includes(variant)) {
        return res.status(400).json({ error: 'variant must be 1 or 2' });
    }
    try {
        const phrase = await getPhraseById(id);
        if (!phrase) {
            return res.status(404).json({ error: 'Phrase not found' });
        }

        const existingUrl = variant === 1 ? phrase.tts_url_variant1 : phrase.tts_url_variant2;
        if (existingUrl) {
            return res.json({ url: existingUrl });
        }

        const text = variant === 1 ? phrase.variant_1 : phrase.variant_2;
        if (!text) {
            return res.status(400).json({ error: 'This variant has no text yet' });
        }

        const filename = `${id}-v${variant}.wav`;
        const url = await generateSpeech(text, filename);
        await updatePhraseTtsUrl({ id, variant, url });

        res.json({ url });
    } catch (err) {
        console.error('TTS generation error:', err);
        res.status(500).json({ error: 'Failed to generate audio' });
    }
});

router.delete('/phrases/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const phrase = await deletePhrase(id);
        if (!phrase) {
            return res.status(404).json({ error: 'Phrase not found' });
        }
        // Best-effort — clears cached audio files for this phrase so they
        // don't linger on disk with nothing pointing to them anymore.
        await deleteSpeechFile(phrase.tts_url_variant1);
        await deleteSpeechFile(phrase.tts_url_variant2);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error deleting phrase:', err);
        res.status(500).json({ error: 'Failed to delete phrase' });
    }
});

export { router as phrasesRouter };