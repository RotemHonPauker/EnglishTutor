import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPhraseById, updatePhraseApproval } from '../database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const translationPromptPath = join(__dirname, 'translation', 'translationPrompt.txt');
const editorPromptPath = join(__dirname, 'editorPrompt.txt');

let currentPhrase = null;
let pendingTranslationPromptProposal = null;
let pendingEditorPromptProposal = null;

export const getPendingTranslationPromptProposal = () => pendingTranslationPromptProposal;
export const clearPendingTranslationPromptProposal = () => { pendingTranslationPromptProposal = null; };

export const getPendingEditorPromptProposal = () => pendingEditorPromptProposal;
export const clearPendingEditorPromptProposal = () => { pendingEditorPromptProposal = null; };

export const handleToolCall = async (toolName, toolInput) => {
    if (toolName === 'fetch_phrase_by_id') {
        currentPhrase = await getPhraseById(toolInput.phraseId);
        if (!currentPhrase) return 'Phrase not found.';
        // Only pass along what the editor should ever see/discuss — never the
        // raw row, which also contains subtag_id, status, id, and dates.
        return JSON.stringify({
            hebrewText: currentPhrase.hebrew_text,
            variant1: currentPhrase.variant_1,
            variant2: currentPhrase.variant_2
        });
    }

    if (toolName === 'save_approved') {
        await updatePhraseApproval({
            id: currentPhrase.id,
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

    // Read-only: lets Claude see the current translation prompt so it can
    // propose an accurate edit. The matching write/commit only ever happens
    // through propose_translation_prompt_update below plus the user's explicit approval
    // in the dashboard — never directly from this tool.
    if (toolName === 'fetch_translation_prompt') {
        const currentContent = readFileSync(translationPromptPath, 'utf-8');
        return currentContent;
    }

    // Records a proposed replacement for the translation prompt. Never writes to
    // disk and never commits — it just stakes out the old/new pair so the frontend
    // can render a diff and let the user approve or discard it explicitly.
    if (toolName === 'propose_translation_prompt_update') {
        const oldContent = readFileSync(translationPromptPath, 'utf-8');
        pendingTranslationPromptProposal = { oldContent, newContent: toolInput.newContent };
        return 'Proposal recorded and will be shown to the user as a diff. Do not repeat the wording in your text reply — just briefly say the draft is ready for review.';
    }

    // Read-only: lets Claude see its own current instructions before proposing
    // an edit. Only ever called after the user explicitly triggers editor-prompt
    // editing (an "EDIT_EDITOR_PROMPT" message) — never on Claude's own initiative.
    if (toolName === 'fetch_editor_prompt') {
        const currentContent = readFileSync(editorPromptPath, 'utf-8');
        return currentContent;
    }

    // Same pattern as propose_translation_prompt_update: stakes out an old/new pair for
    // the dashboard to diff and the user to approve or discard — never writes
    // or commits by itself.
    if (toolName === 'propose_editor_prompt_update') {
        const oldContent = readFileSync(editorPromptPath, 'utf-8');
        pendingEditorPromptProposal = { oldContent, newContent: toolInput.newContent };
        return 'Proposal recorded and will be shown to the user as a diff. Do not repeat the wording in your text reply — just briefly say the draft is ready for review.';
    }
};