// translationEngine.js (client) — mirrors the server's
// dashboard/translation/translationEngine.js + translationPrompt.txt +
// variantGuidance.txt exactly, just reading prompt text from
// promptTemplates.js (no filesystem in a browser) and calling Gemini
// directly (geminiClient.js) instead of going through a server route.
// Wrapped in an IIFE so its internal helpers stay private — several of
// them share a name with helpers in dictionaryEngine.js / audioEngine.js
// (e.g. parseResponse-style JSON cleanup), and as plain global scripts
// those would otherwise silently collide.
// Needs promptTemplates.js, geminiClient.js, remoteDb.js and slots.js
// (findActiveSlotNow) loaded first.

const translatePhrase = (function () {
    function parseTranslationResponse(rawText) {
        const cleaned = rawText.trim().replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    }

    // Deliberately never invites the model to invent a new tag — only to
    // pick from what's given, or say null. If there are no candidate tags
    // to offer, skip asking entirely.
    function buildExistingTagsSection(candidateTags) {
        if (!candidateTags.length) {
            return 'There are no candidate tags for this phrase right now, so always put null for "tag".';
        }
        const names = candidateTags.map(t => t.name).join(', ');
        return `The following tags are candidates for this phrase: ${names}\nIf one of these tags clearly and confidently fits this phrase's topic, put its exact name (as written above) in "tag". If none fit well, or you're not confident, put null instead — never guess, and never invent a tag name that isn't in the list above.`;
    }

    // Never trusts the model's tag name directly — resolves it against the
    // candidate tags actually passed in (case-insensitive exact match).
    function resolveTagId(tagName, candidateTags) {
        if (!tagName) return null;
        const match = candidateTags.find(t => t.name.toLowerCase() === String(tagName).toLowerCase());
        return match ? match.id : null;
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

    // Returns { correctedSource, variant1, variant2, tagId }.
    return async function translatePhrase(sourceText, spaceId) {
        const [spaceFields, spaceTags] = await Promise.all([
            getSpaceRuleFields(spaceId),
            getTags(spaceId)
        ]);

        // Tagging is now driven entirely by whichever Slot is active right
        // now (see slots.js's findActiveSlotNow) — NOT by this routine's
        // whole tag list, the way it used to work. No active slot (or one
        // belonging to a different routine) means no candidate tags at
        // all, so Gemini is only ever offered — and can only ever pick
        // from — the active slot's own tag(s). Same resolveTagId lookup as
        // before; it just runs against this narrower candidate list now.
        const activeSlot = typeof findActiveSlotNow === 'function' ? await findActiveSlotNow() : null;
        const candidateTags = (activeSlot && activeSlot.space_id === spaceId)
            ? spaceTags.filter(t => (activeSlot.tag_ids || []).includes(t.id))
            : [];

        const content = TRANSLATION_PROMPT_TEMPLATE
            .replace(/\$\{sourceLanguage\}/g, spaceFields.sourceLanguage)
            .replace(/\$\{targetLanguage\}/g, spaceFields.targetLanguage)
            .replace('${translationStep}', buildTranslationStep(spaceFields))
            .replace('${spaceRulesSection}', buildSpaceRulesSection(spaceFields))
            .replace('${existingTagsSection}', buildExistingTagsSection(candidateTags))
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
            tagId: resolveTagId(result.tag, candidateTags)
        };
    };
})();