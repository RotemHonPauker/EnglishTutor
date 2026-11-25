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
//
// NOTE: TRANSLATION_PROMPT_TEMPLATE used to have a "Step 3: Suggest a
// Tag" section asking Gemini to pick a tag out of the active slot's
// candidate list. That's gone — a captured phrase's slot is now decided
// entirely in code (translationEngine.js just checks which slot's time
// window is open right now), so there's nothing left for the model to be
// asked about here.

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

## Phrase
"\${phrase}"

## Output
Respond ONLY with valid JSON in this exact format, no other text:
{"correctedSource": "...", "variant1": "...", "variant2": "..."}`;

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
You will receive an audio recording.

\${spaceRulesSection}

## Step 1: Transcribe
Transcribe the audio exactly as spoken, focusing on the primary/main speaker — do not translate anything, and do not correct grammar or phrasing (that happens in a later step, not here).
The only two languages that will ever be spoken are \${sourceLanguage} and \${targetLanguage} — everything is one of these two, or a mix of the two (e.g. a sentence mostly in one with a word or two from the other mixed in, where the speaker reached for a word they didn't know in their main language). Never transcribe anything as, or assume, any other language.
Treat other voices or background sound as context, not something to transcribe verbatim.

\${audioRecordingSection}

## Output
Respond ONLY with valid JSON in this exact format, no other text:
{"transcript": "the cleaned transcript as continuous text"}`;

// Not one of the original server's four prompt files — added for
// transcriptsTab.js's getTranscriptSuggestions, which asks Gemini to
// point out which sentences of an already-transcribed recording look
// worth turning into a practice phrase card. Deliberately works off a
// pre-split, numbered list of sentences (built in code, not by the
// model) rather than asking the model to return the sentence text
// itself — returning plain indices is far more robust than hoping a
// quoted excerpt matches the original text exactly.
const TRANSCRIPT_SUGGESTIONS_PROMPT_TEMPLATE = `## Input
You will receive a numbered list of sentences, taken from a transcript of someone speaking \${sourceLanguage} (possibly mixed with \${targetLanguage}) during their day. They're learning \${targetLanguage} and use recordings like this one to capture things worth practicing.

## Task
Decide which of these sentences would be worth turning into a \${targetLanguage} practice phrase card — something specific, concrete and reusable (a real thing that was said, or worth being able to say again), not filler, small talk with no real content, or a fragment too vague to translate meaningfully on its own.

For every sentence worth suggesting, give it a confidence level:
- 1: a strong candidate — clearly worth a card.
- 2: a maybe — could be worth it, but less certain.

Leave out any sentence you wouldn't suggest at either level — don't list it at all.

## Sentences
\${numberedSentences}

## Output
Respond ONLY with valid JSON in this exact format, no other text:
{"suggestions": [{"index": 0, "level": 1}, {"index": 3, "level": 2}]}`;