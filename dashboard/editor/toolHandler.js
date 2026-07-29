import { getPhraseById, updatePhrase, getSpaceRules } from '../../database.js';

let currentPhrase = null;
let currentSpaceId = null;
let pendingSpaceRulesProposal = null;

// Set on every /editor request (see editor.route.js) from the space the
// frontend currently has active — so fetch/propose tools below always work
// against the right space's rules, without needing to thread an argument
// through the whole Claude tool-call loop.
export const setCurrentSpace = (spaceId) => { currentSpaceId = spaceId; };

export const getPendingSpaceRulesProposal = () => pendingSpaceRulesProposal;
export const clearPendingSpaceRulesProposal = () => { pendingSpaceRulesProposal = null; };

export const handleToolCall = async (toolName, toolInput) => {
    if (toolName === 'fetch_phrase_by_id') {
        currentPhrase = await getPhraseById(toolInput.phraseId);
        if (!currentPhrase) return 'Phrase not found.';
        // Only pass along what the editor should ever see/discuss — never the
        // raw row, which also contains subtag_id, id, and dates.
        return JSON.stringify({
            hebrewText: currentPhrase.hebrew_text,
            variant1: currentPhrase.variant_1,
            variant2: currentPhrase.variant_2
        });
    }

    if (toolName === 'save_phrase') {
        await updatePhrase({
            id: currentPhrase.id,
            hebrewText: toolInput.hebrewText,
            variant1: toolInput.variant1,
            variant2: toolInput.variant2
        });
        currentPhrase = null;
        return 'Saved successfully.';
    }

    if (toolName === 'skip') {
        currentPhrase = null;
        return 'Skipped.';
    }

    // Read-only: lets Claude see the active space's current ADDITIONAL
    // translation rules (not the full prompt — that's a fixed base file,
    // never edited here) so it can propose an accurate edit. Returns null
    // if this space has no rules yet, which is a normal state, not an
    // error — translation still works fine off the base template alone.
    // The matching write/commit only ever happens through
    // propose_space_rules_update below plus the user's explicit approval
    // in the dashboard — never directly from this tool.
    if (toolName === 'fetch_space_rules') {
        return await getSpaceRules(currentSpaceId);
    }

    // Records a proposed replacement for the active space's additional
    // rules. Never writes to the DB — it just stakes out the old/new pair
    // so the frontend can render a diff and let the user approve or
    // discard it explicitly. oldContent may be null/empty for a space with
    // no rules yet — that's fine, the diff just shows everything as added.
    if (toolName === 'propose_space_rules_update') {
        const oldContent = await getSpaceRules(currentSpaceId);
        pendingSpaceRulesProposal = { oldContent: oldContent || '', newContent: toolInput.newContent };
        return 'Proposal recorded and will be shown to the user as a diff. Do not repeat the wording in your text reply — just briefly say the draft is ready for review.';
    }
};