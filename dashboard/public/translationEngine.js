// translationEngine.js — calls Gemini directly (geminiClient.js) using the
// prompt text in promptTemplates.js. Wrapped in an IIFE since its helpers
// share names with dictionaryEngine.js's/audioEngine.js's.
// Needs promptTemplates.js, geminiClient.js, localDb.js and slots.js
// (findActiveSlotNow) loaded first.

const translatePhrase = (function () {
    function parseTranslationResponse(rawText) {
        const cleaned = rawText.trim().replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    }

    function buildSpaceRulesSection(spaceFields) {
        return spaceFields.aboutThisSpace
            ? `## About This Space\n${spaceFields.aboutThisSpace}\n\n`
            : '';
    }

    // progression: both variants are the target language, variant2 a step
    // up in fluency. bridge: variant1 is the target language, variant2 is
    // a third, reference-only language.
    function buildTranslationStep(spaceFields) {
        if (spaceFields.spaceType === 'bridge') {
            let section = `Produce two translations of the corrected text:\n- "variant1": a natural translation into ${spaceFields.targetLanguage}.\n- "variant2": a natural translation into ${spaceFields.bridgeLanguage}, included purely as a reference/comparison language. It is a separate language, not a more advanced or different version of ${spaceFields.targetLanguage} — translate independently into it.\nDo not use dashes in either translation.`;
            if (spaceFields.variant1Notes) section += `\n\n${spaceFields.targetLanguage} notes: ${spaceFields.variant1Notes}`;
            if (spaceFields.variant2Notes) section += `\n\n${spaceFields.bridgeLanguage} notes: ${spaceFields.variant2Notes}`;
            return section;
        }

        const resolvedGuidance = VARIANT_GUIDANCE_TEMPLATE.replace(/\$\{targetLanguage\}/g, spaceFields.targetLanguage);
        if (!spaceFields.variant1Notes && !spaceFields.variant2Notes) {
            return resolvedGuidance;
        }
        let section = `${resolvedGuidance}\n\n## This Space's Level Guidance\n`;
        if (spaceFields.variant1Notes) section += `Level 1: ${spaceFields.variant1Notes}\n`;
        if (spaceFields.variant2Notes) section += `Level 2: ${spaceFields.variant2Notes}\n`;
        return section;
    }

    // Returns { correctedSource, variant1, variant2, slotId }.
    return async function translatePhrase(sourceText, spaceId) {
        const spaceFields = await getSpaceRuleFields(spaceId);

        // Slot assignment is a plain time-of-day lookup, not something
        // Gemini is asked about — whichever slot is active now becomes the
        // phrase's slot, as long as it belongs to this space.
        const activeSlot = typeof findActiveSlotNow === 'function' ? await findActiveSlotNow() : null;
        const slotId = (activeSlot && activeSlot.space_id === spaceId) ? activeSlot.id : null;

        const content = TRANSLATION_PROMPT_TEMPLATE
            .replace(/\$\{sourceLanguage\}/g, spaceFields.sourceLanguage)
            .replace(/\$\{targetLanguage\}/g, spaceFields.targetLanguage)
            .replace('${translationStep}', buildTranslationStep(spaceFields))
            .replace('${spaceRulesSection}', buildSpaceRulesSection(spaceFields))
            .replace('${phrase}', sourceText);

        const response = await geminiGenerateContent({
            model: 'gemini-3.6-flash',
            contents: [{ parts: [{ text: content }] }],
            generationConfig: { responseMimeType: 'application/json' }
        });

        const rawText = geminiExtractText(response);
        const result = parseTranslationResponse(rawText);

        return {
            correctedSource: result.correctedSource,
            variant1: result.variant1,
            variant2: result.variant2,
            slotId
        };
    };
})();