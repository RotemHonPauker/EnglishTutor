export const parseTranslationResponse = (rawText) => {
    const cleaned = rawText.trim().replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
};