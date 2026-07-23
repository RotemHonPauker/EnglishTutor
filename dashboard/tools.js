export const tools = [
    {
        name: 'fetch_next_uncategorized',
        description: 'Fetch the next uncategorized phrase from the database, along with the available tags to choose from',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'save_approved',
        description: 'Save the approved phrase with final variants and subtag to the database',
        input_schema: {
            type: 'object',
            properties: {
                variant1: { type: 'string', description: 'First English variant' },
                variant2: { type: 'string', description: 'Second English variant' },
                subtagId: { type: 'string', description: 'UUID of the chosen subtag from the available tags list' }
            },
            required: ['variant1', 'variant2', 'subtagId']
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