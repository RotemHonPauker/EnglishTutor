// promptTemplates.js — the exact text of the server's four prompt files
// (translationPrompt.txt, variantGuidance.txt, dictionaryPrompt.txt,
// audioPrompt.txt), as plain JS string constants instead of files on
// disk — there's no filesystem to readFileSync() from in a browser.
// Every ${...} placeholder below is deliberately escaped (\${...}) so
// it stays literal text for the engines to .replace() themselves,
// instead of being evaluated as a real JS template expression right
// here (there's no local variable named sourceLanguage etc. at this
// point — these are filled in later, per call, by translationEngine.js /
// dictionaryEngine.js / audioEngine.js).
// Content must stay byte-for-byte identical to the .txt files it mirrors
// — if those change on the server side (while it still exists) or get
// deleted later, update this file to match.

const TRANSLATION_PROMPT_TEMPLATE = `## Input
You will receive a phrase.

## Step 1: Detect Language and Process
Look at the phrase itself and decide which of these two cases it is — do not rely on anything except the phrase's own text.

If it is in \${sourceLanguage}:
Silently correct any errors, preserving the original meaning exactly, and put the corrected text in "correctedSource".
Then translate it into \${targetLanguage} for "variant1" and "variant2" below.

If it is already in \${targetLanguage}, or a mix of \${targetLanguage} and \${sourceLanguage} (e.g. a \${targetLanguage} sentence with a word or two in \${sourceLanguage} where the writer didn't know the \${targetLanguage} word):
Put the input as-is, with only obvious typos fixed, into "correctedSource" — do not translate it there.
Then produce two corrected, natural \${targetLanguage} versions of it for "variant1" and "variant2" below, fixing grammar and phrasing while preserving the original meaning and intent.
If any \${sourceLanguage} words are mixed in, translate just those words into \${targetLanguage} as part of the correction.

## Step 2: Translate
\${translationStep}
\${spaceRulesSection}

## Step 3: Suggest a Tag
\${existingTagsSection}

## Phrase
"\${phrase}"

## Output
Respond ONLY with valid JSON in this exact format, no other text:
{"correctedSource": "...", "variant1": "...", "variant2": "...", "tag": "..." or null}`;

const VARIANT_GUIDANCE_TEMPLATE = `Translate into two natural \${targetLanguage} variants that convey the same meaning but differ slightly in character. Guidance on how each variant should specifically sound is provided below, if this space has defined any.

## General Rules
* Do not use dashes anywhere in the translated variants.
* Where possible use different vocabulary from variant 1 — avoid repeating the same key words across both variants.

## Level Progression
These two variants are shown to the learner as "Level 1" and "Level 2" — a small step up in fluency, not just an alternate phrasing. Variant 2 should feel like a natural next step from Variant 1: slightly more advanced, native-sounding, or idiomatic vocabulary/phrasing, while remaining just as understandable and no longer than Variant 1. Both must stay fully natural — Level 2 is a step toward native-like phrasing, not a display of obscure vocabulary.`;

const DICTIONARY_PROMPT_TEMPLATE = `## Role
You are a precise \${sourceLanguage}-\${targetLanguage} dictionary.

## Input
You will receive a single word or short term: "\${query}"
\${partOfSpeechHintSection}

## Step 1: Correct the Input
Before anything else, decide what the person most likely meant to type — the same way a human reader would silently read past a typo. In particular, the input may have been typed in the wrong keyboard layout (so \${sourceLanguage} or \${targetLanguage} comes out as nonsense letters in the other alphabet/script); if so, recognize what was actually meant and use that corrected form for everything below instead of the literal text. Also silently fix any other obvious typos the same way. If the input is already correct as given, just use it as-is.

## Rules
Apply these to the corrected input from Step 1, not the literal text above.
1. If the (corrected) input is in \${sourceLanguage}: identify the possible distinct \${targetLanguage} translations of it. For each one, give the \${targetLanguage} word itself and a short (a few words) context/nuance note that distinguishes it from the others — enough for someone to tell them apart and pick the one they actually meant. Return these as a translations-type options list. Do not pick one yourself.
2. If the input is in \${targetLanguage} and a part-of-speech hint was given above: define the word specifically as that part of speech — skip straight to the full definition, even if the word would otherwise be ambiguous.
3. If the input is in \${targetLanguage}, no hint was given, and the word has one clearly dominant common part of speech/sense: define it directly.
4. If the input is in \${targetLanguage}, no hint was given, and the word has more than one common, genuinely distinct part of speech or sense (e.g. "slate" as a noun vs. a verb): return a senses-type options list instead of picking one yourself — one entry per distinct part of speech, with a short context note distinguishing them.

## Output
Respond ONLY with valid JSON, no other text, in ONE of these three exact shapes depending on which rule applied:

Rule 1 (\${sourceLanguage} input, needs word disambiguation):
{"type": "options", "kind": "translations", "options": [{"word": "...", "context": "..."}]}

Rule 4 (\${targetLanguage} input, needs sense disambiguation):
{"type": "options", "kind": "senses", "options": [{"partOfSpeech": "...", "context": "..."}]}

Rule 2 or 3 (ready to define — exactly one part of speech, everything else matching that same sense):
{"type": "detail", "word": "...", "partOfSpeech": "one single part of speech, e.g. \\"noun\\" — never more than one", "sourceSynonyms": ["...", "..."], "exampleSentence": "one natural \${targetLanguage} sentence using the word in that same sense", "targetSynonyms": ["...", "..."]}

The "word" field (here and in translations-type options) should always be capitalized (first letter uppercase). If \${targetLanguage} marks verb citation forms with a leading word (like English "to run"), drop that marker and give the bare verb instead (e.g. "Run", not "to run").`;

const AUDIO_PROMPT_TEMPLATE = `## Input
You will receive an audio recording and a mode.

\${spaceRulesSection}

## Step 1: Transcribe
The mode for this request is: "\${mode}"

If mode is "capture":
Transcribe the audio into \${sourceLanguage} text, focusing on the primary/main speaker.
Treat other voices or background sound as context, not something to transcribe verbatim.

If mode is "check":
Transcribe the audio, focusing on the primary/main speaker.
The speech is in \${targetLanguage}, or a mix of \${targetLanguage} and \${sourceLanguage} (e.g. a \${targetLanguage} sentence with a word or two in \${sourceLanguage} where the speaker didn't know the \${targetLanguage} word).
Transcribe it as spoken — grammar and phrasing correction happen in a later step, not here.

\${audioRecordingSection}

## Output
Respond ONLY with valid JSON in this exact format, no other text:
{"transcript": "the cleaned transcript as continuous text"}`;