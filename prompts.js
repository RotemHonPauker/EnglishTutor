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
