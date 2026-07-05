export const tools = [
    {
        name: 'fetch_next_uncategorized',
        description: 'Fetch the next uncategorized phrase from the database',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'save_approved',
        description: 'Save the approved phrase with final variants and tag to the database',
        input_schema: {
            type: 'object',
            properties: {
                variant1: { type: 'string', description: 'First English variant' },
                variant2: { type: 'string', description: 'Second English variant' },
                tag: { type: 'string', description: 'Single tag for this phrase' }
            },
            required: ['variant1', 'variant2', 'tag']
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
    }
];