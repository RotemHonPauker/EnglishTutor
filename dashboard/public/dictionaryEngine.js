// dictionaryEngine.js (client) — mirrors the server's
// dashboard/dictionary/dictionaryEngine.js + dictionaryPrompt.txt
// exactly, reading the prompt from promptTemplates.js and calling Gemini
// directly (geminiClient.js) instead of a server route.
// Wrapped in an IIFE so its internal helpers (some share a name with
// helpers in translationEngine.js / audioEngine.js) stay private.
// Needs promptTemplates.js and geminiClient.js loaded first.

const lookupWord = (function () {
    function parseDictionaryResponse(rawText) {
        const cleaned = rawText.trim().replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    }

    // Enforces the app's word display convention regardless of what the
    // model happened to return — capitalized first letter, and (for
    // languages that mark it, like English "to run") no leading
    // infinitive marker.
    function normalizeWord(word) {
        if (!word) return word;
        const trimmed = word.trim().replace(/^to\s+/i, '');
        if (!trimmed) return trimmed;
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }

    // Returns one of:
    //   { type: 'options', kind: 'translations', options: [{ word, context }] }
    //   { type: 'options', kind: 'senses', options: [{ partOfSpeech, context }] }
    //   { type: 'detail', word, partOfSpeech, sourceSynonyms, exampleSentence, targetSynonyms }
    return async function lookupWord(query, sourceLanguage, targetLanguage, partOfSpeechHint) {
        const hintSection = partOfSpeechHint
            ? `The person has already specified this should be defined as a: ${partOfSpeechHint}. Skip disambiguation and define it directly as that part of speech.`
            : '';
        const content = DICTIONARY_PROMPT_TEMPLATE
            .replace(/\$\{sourceLanguage\}/g, sourceLanguage)
            .replace(/\$\{targetLanguage\}/g, targetLanguage)
            .replace('${query}', query)
            .replace('${partOfSpeechHintSection}', hintSection);

        const response = await geminiGenerateContent({
            model: 'gemini-3.6-flash',
            contents: [{ parts: [{ text: content }] }],
            generationConfig: { responseMimeType: 'application/json' }
        });

        const rawText = geminiExtractText(response);
        const result = parseDictionaryResponse(rawText);

        if (result.type === 'detail' && result.word) {
            result.word = normalizeWord(result.word);
        }
        if (result.type === 'options' && result.kind === 'translations' && Array.isArray(result.options)) {
            result.options = result.options.map(o => ({ ...o, word: normalizeWord(o.word) }));
        }

        return result;
    };
})();