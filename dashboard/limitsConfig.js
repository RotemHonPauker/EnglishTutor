// Centralized, easy-to-tweak limits — each can be overridden via .env
// without touching any logic; sensible defaults are used otherwise.

export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MINUTES || 15) * 60 * 1000;

// Max requests per window, per IP. Used by both /phrases (typed
// translation) and /recordings (audio processing) — both call an AI API.
export const TRANSLATE_RATE_LIMIT_MAX = Number(process.env.TRANSLATE_RATE_LIMIT_MAX || 30);