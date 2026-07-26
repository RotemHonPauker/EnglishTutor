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
    }
];