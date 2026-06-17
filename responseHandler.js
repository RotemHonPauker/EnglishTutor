export const parseTranslationResponse = (rawText) => {
    const cleaned = rawText.trim().replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleaned);
    return result;
};

export const formatTranslationReply = (result) => {
    return `📝 ${result.rephrased}\n🇬🇧 ${result.translation}`;
};
