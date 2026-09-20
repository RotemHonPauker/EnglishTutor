import express from 'express';
import rateLimit from 'express-rate-limit';
import { createTranscript, getTranscripts, deleteTranscript } from '../../database.js';
import { processRecording } from '../audio/audioEngine.js';
import { RATE_LIMIT_WINDOW_MS, TRANSLATE_RATE_LIMIT_MAX } from '../limitsConfig.js';

const router = express.Router();

// Reuses the same limiter numbers as translation — this also calls the
// Gemini API and should be protected the same way.
const recordingLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: TRANSLATE_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many recordings processed recently. Please wait a bit and try again.' }
});

// Body: { audioBase64, mimeType, spaceId }. Transcribes the recording and
// saves the transcript — that's the whole job now. No phrases are created
// here: the person picks what's worth keeping from the transcript itself
// (see the selection-to-input flow in captureTab.js), and each pick is
// translated one at a time through the normal /phrases POST, same as
// anything typed by hand.
router.post('/recordings', recordingLimiter, async (req, res) => {
    const { audioBase64, mimeType, spaceId, mode } = req.body;
    if (!audioBase64 || !spaceId) {
        return res.status(400).json({ error: 'audioBase64 and spaceId are required' });
    }
    try {
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const { transcript } = await processRecording(
            audioBuffer,
            mimeType || 'audio/mp4',
            spaceId,
            mode
        );

        const saved = await createTranscript({ spaceId, content: transcript });

        res.json({ transcript: saved });
    } catch (err) {
        console.error('Recording processing error:', err);
        res.status(400).json({ error: err.message || 'Failed to process recording' });
    }
});

router.get('/transcripts', async (req, res) => {
    const { spaceId } = req.query;
    if (!spaceId) {
        return res.status(400).json({ error: 'spaceId is required' });
    }
    try {
        const transcripts = await getTranscripts(spaceId);
        res.json(transcripts);
    } catch (err) {
        console.error('Error fetching transcripts:', err);
        res.status(500).json({ error: 'Failed to fetch transcripts' });
    }
});

router.delete('/transcripts/:id', async (req, res) => {
    try {
        const transcript = await deleteTranscript(req.params.id);
        if (!transcript) {
            return res.status(404).json({ error: 'Transcript not found' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Error deleting transcript:', err);
        res.status(500).json({ error: 'Failed to delete transcript' });
    }
});

export { router as recordingsRouter };