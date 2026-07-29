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
        name: 'save_phrase',
        description: 'Save the phrase with its final Hebrew text and variant wording',
        input_schema: {
            type: 'object',
            properties: {
                hebrewText: { type: 'string', description: 'The Hebrew phrase text' },
                variant1: { type: 'string', description: 'First English variant' },
                variant2: { type: 'string', description: 'Second English variant' }
            },
            required: ['hebrewText', 'variant1', 'variant2']
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
        name: 'fetch_space_rules',
        description: 'Read-only: fetch the active space\'s current ADDITIONAL translation rules — not the full prompt, which is a fixed base template never edited here. Returns null if this space has no rules yet, which is a normal state (translation still works off the base template alone) — if null, ask the user what additional rules they want for this space instead of treating it as an error. This tool cannot write or commit — it only returns the current content for reference.',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'propose_space_rules_update',
        description: 'Propose new or replacement ADDITIONAL translation rules for the active space (not the full prompt). Always call fetch_space_rules first. Pass the FULL new rules content (not a diff, not just the changed lines) — the user will see a compact diff against the current version (or, for a space with no rules yet, against nothing) in the UI and can approve (commit) or discard it themselves. This tool never writes or commits anything by itself. When editing existing rules, keep the change as minimal as possible relative to the current content — only touch the wording that actually needs to change.',
        input_schema: {
            type: 'object',
            properties: {
                newContent: { type: 'string', description: 'The full proposed new content of the space\'s additional translation rules' }
            },
            required: ['newContent']
        }
    }
];