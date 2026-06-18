export const parseTranslationResponse = (rawText) => {
    const cleaned = rawText.trim().replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleaned);
    return result;
};

export const formatTranslationReply = (result) => {
    return `📝 ${result.rephrased}\n🇬🇧 ${result.translation}`;
};

export const parseCategorySuggestions = (rawText) => {
    const cleaned = rawText.trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return parsed.suggestions;
};

export const formatCategoryOptions = (suggestions) => {
    let text = 'Choose a category. Type the number:\n';
    suggestions.forEach((cat, i) => {
        text += `${i + 1}. ${cat}\n`;
    });
    text += `${suggestions.length + 1}. Create new category`;
    return text;
};

export const formatSavedConfirmation = (category) => {
    return `✅ Saved under category: "${category}"`;
};

export const formatNewCategoryConfirmation = (category) => {
    return `✅ Saved under new category: "${category}"`;
};