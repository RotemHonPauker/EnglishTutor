export const translatePrompt = (text) => ` 
    The following Hebrew text was transcribed from a voice message
    and may contain transcription errors 
    (wrong words, missing context, awkward phrasing).

    1. First, rephrase it into clear, grammatically correct Hebrew, 
    fixing likely transcription mistakes while preserving the original meaning.
    2. Then translate the rephrased Hebrew into natural English.

    Original text: "${text}"

    Respond ONLY with valid JSON in this exact format, no other text:
    {"rephrased": "...", "translation": "..."}
`;

export const suggestCategoriesPrompt = (sentence, existingCategories) => `
    Given this English sentence: "${sentence}"

    And this list of existing categories: ${JSON.stringify(existingCategories)}

    Pick up to 3 categories from the list that are MOST relevant to this sentence,
    ordered by relevance (most relevant first).
    If none are relevant, return an empty array.

    Respond ONLY with valid JSON in this exact format, no other text:
    {"suggestions": ["category1", "category2", "category3"]}
`;