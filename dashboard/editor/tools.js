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
        name: 'fetch_translation_prompt',
        description: 'Read-only: fetch the current content of dashboard/translation/translationPrompt.txt (the translation prompt used when a new phrase is captured), so any suggested wording change is based on the actual current text rather than a guess. This tool cannot write or commit — it only returns the current content for reference.',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'propose_translation_prompt_update',
        description: 'Propose a replacement for dashboard/translation/translationPrompt.txt. Always call fetch_translation_prompt first. Pass the FULL new file content (not a diff, not just the changed lines) — the user will see a compact diff against the current version in the UI and can approve (commit) or discard it themselves. This tool never writes or commits anything by itself. Keep the change as minimal as possible relative to the current content — only touch the wording that actually needs to change.',
        input_schema: {
            type: 'object',
            properties: {
                newContent: { type: 'string', description: 'The full proposed new content of dashboard/translation/translationPrompt.txt' }
            },
            required: ['newContent']
        }
    },
    {
        name: 'fetch_editor_prompt',
        description: 'Read-only: fetch the current content of dashboard/editor/editorPrompt.txt (this editor\'s own instructions), so any suggested wording change is based on the actual current text rather than a guess. Only call this after the user explicitly asked to edit the editor prompt (an "EDIT_EDITOR_PROMPT" message). This tool cannot write or commit — it only returns the current content for reference.',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'propose_editor_prompt_update',
        description: 'Propose a replacement for dashboard/editor/editorPrompt.txt. Always call fetch_editor_prompt first. Pass the FULL new file content (not a diff, not just the changed lines) — the user will see a compact diff against the current version in the UI and can approve (commit) or discard it themselves. This tool never writes or commits anything by itself. Keep the change as minimal as possible relative to the current content — only touch the wording that actually needs to change.',
        input_schema: {
            type: 'object',
            properties: {
                newContent: { type: 'string', description: 'The full proposed new content of dashboard/editor/editorPrompt.txt' }
            },
            required: ['newContent']
        }
    }
];