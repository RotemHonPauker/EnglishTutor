// Centralized, easy-to-tweak limits — each can be overridden via .env
// without touching any logic; sensible defaults are used otherwise.

export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MINUTES || 15) * 60 * 1000;

// Max requests per window, per IP.
export const TRANSLATE_RATE_LIMIT_MAX = Number(process.env.TRANSLATE_RATE_LIMIT_MAX || 30);
export const EDITOR_RATE_LIMIT_MAX = Number(process.env.EDITOR_RATE_LIMIT_MAX || 60);

// Max tool-use rounds Claude can chain within a single /editor request.
export const MAX_TOOL_ROUNDS = Number(process.env.MAX_TOOL_ROUNDS || 5);

// Max real user messages kept in conversation history before older ones
// are dropped — keeps a long-running/abandoned session from growing (and
// costing) unboundedly. A normal review session never needs anywhere near
// this many turns.
export const MAX_CONVERSATION_TURNS = Number(process.env.MAX_CONVERSATION_TURNS || 20);