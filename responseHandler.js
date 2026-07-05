export const parseTranslationResponse = (rawText) => {
    const cleaned = rawText.trim().replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
};

export const formatTranslationReply = ({ variant1, variant2 }) => {
    return `1. ${variant1}\n2. ${variant2}`;
};