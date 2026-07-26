export const tools = [
    {
        name: 'fetch_phrase_by_id',
        description: 'Fetch a specific phrase by its ID, as selected by the user from the table in the dashboard. This is the only way a phrase should enter the conversation — never call this unless the user explicitly selected a phrase.',
        input_schema: {
            type: 'object',
            properties: {
                phraseId: { type: 'string', description: 'The ID of the phrase to load' }
            },
            required: ['phraseId']
        }
    },
    {
        name: 'save_approved',
        description: 'Save the approved phrase with final variants',
        input_schema: {
            type: 'object',
            properties: {
                variant1: { type: 'string', description: 'First English variant' },
                variant2: { type: 'string', description: 'Second English variant' }
            },
            required: ['variant1', 'variant2']
        }
    },
    {
        name: 'skip',
        description: 'Skip the current phrase and move to the next one without saving',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'fetch_bot_prompt',
        description: 'Read-only: fetch the current content of bot/botPrompt.txt (the WhatsApp bot\'s translation prompt), so any suggested wording change is based on the actual current text rather than a guess. This tool cannot write or commit — it only returns the current content for reference.',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'propose_bot_prompt_update',
        description: 'Propose a replacement for bot/botPrompt.txt. Always call fetch_bot_prompt first. Pass the FULL new file content (not a diff, not just the changed lines) — the user will see a compact diff against the current version in the UI and can approve (commit) or discard it themselves. This tool never writes or commits anything by itself. Keep the change as minimal as possible relative to the current content — only touch the wording that actually needs to change.',
        input_schema: {
            type: 'object',
            properties: {
                newContent: { type: 'string', description: 'The full proposed new content of bot/botPrompt.txt' }
            },
            required: ['newContent']
        }
    },
    {
        name: 'fetch_system_prompt',
        description: 'Read-only: fetch the current content of dashboard/systemPrompt.txt (this review chat\'s own instructions), so any suggested wording change is based on the actual current text rather than a guess. Only call this after the user explicitly asked to edit the system prompt (an "EDIT_SYSTEM_PROMPT" message). This tool cannot write or commit — it only returns the current content for reference.',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'propose_system_prompt_update',
        description: 'Propose a replacement for dashboard/systemPrompt.txt. Always call fetch_system_prompt first. Pass the FULL new file content (not a diff, not just the changed lines) — the user will see a compact diff against the current version in the UI and can approve (commit) or discard it themselves. This tool never writes or commits anything by itself. Keep the change as minimal as possible relative to the current content — only touch the wording that actually needs to change.',
        input_schema: {
            type: 'object',
            properties: {
                newContent: { type: 'string', description: 'The full proposed new content of dashboard/systemPrompt.txt' }
            },
            required: ['newContent']
        }
    }
];