import express from 'express';
import rateLimit from 'express-rate-limit';
import { handleReviewMessage } from '../editor/editorEngine.js';
import {
    setCurrentSpace,
    getPendingSpaceRulesProposal, clearPendingSpaceRulesProposal
} from '../editor/toolHandler.js';
import { RATE_LIMIT_WINDOW_MS, EDITOR_RATE_LIMIT_MAX, MAX_CONVERSATION_TURNS } from '../limitsConfig.js';

const router = express.Router();
let conversationHistory = [];

// Only a real, plain-text user message (typed by the user, not a tool
// result) marks a safe place to cut history — tool-result entries also
// have role 'user' but their content is an array, and cutting there would
// separate a tool_use from its matching tool_result, which Claude's API
// requires to stay paired together.
function trimConversationHistory(history) {
    const userTurnIndices = history
        .map((entry, i) => (entry.role === 'user' && typeof entry.content === 'string') ? i : -1)
        .filter(i => i !== -1);

    if (userTurnIndices.length <= MAX_CONVERSATION_TURNS) return history;

    const cutIndex = userTurnIndices[userTurnIndices.length - MAX_CONVERSATION_TURNS];
    return history.slice(cutIndex);
}

// This route calls Claude on every message — higher limit than translation
// since a normal review conversation naturally has many back-and-forth
// turns, but still capped to protect against runaway usage/abuse.
const editorLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: EDITOR_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many messages recently. Please wait a bit and try again.' }
});

router.post('/editor', editorLimiter, async (req, res) => {
    const { message, spaceId } = req.body;
    try {
        setCurrentSpace(spaceId);
        const { reply, history } = await handleReviewMessage(message, conversationHistory);
        conversationHistory = trimConversationHistory(history);
        // Sent to the client at most once per proposal — cleared right after
        // so it doesn't resurface on later, unrelated turns.
        const spaceRulesProposal = getPendingSpaceRulesProposal();
        if (spaceRulesProposal) clearPendingSpaceRulesProposal();
        res.json({ reply, spaceRulesProposal });
    } catch (err) {
        console.error('Review editor error:', err);
        res.status(500).json({ error: 'Something went wrong' });
    }
});

router.get('/reset', (req, res) => {
    conversationHistory = [];
    clearPendingSpaceRulesProposal();
    res.json({ ok: true });
});

export { router as editorRouter };