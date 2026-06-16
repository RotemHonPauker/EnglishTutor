# WhatsApp English Learning Bot — Project Roadmap

## Vision
A personal WhatsApp bot that helps practice English with your daughter during daily moments (bath time, dining, walks, etc.).
You send Hebrew voice transcriptions → the bot cleans and translates them → saves them → and later suggests practice batches at the right moment.

---

## Phase 1: Basic Translation ✅ (in progress)
A private WhatsApp chat where you send a Hebrew sentence and the bot replies with an English translation.

### Tasks:
- [x] Set up Node.js project with whatsapp-web.js and Anthropic SDK
- [x] Write basic `index.js` bot code
- [x] Push project to GitHub
- [ ] Run the bot successfully and scan QR code
- [ ] Create a dedicated WhatsApp chat for the bot (e.g. message your own number)
- [ ] Test: send a Hebrew sentence and receive an English translation

---

## Phase 2: Smart Translation (Rephrase + Translate)
WhatsApp voice transcriptions can be inaccurate. Before translating, the bot will clean up and rephrase the Hebrew sentence, then translate it.

### Tasks:
- [ ] Update the Claude prompt to first rephrase the Hebrew (fix grammar, transcription errors)
- [ ] Then translate the rephrased version to English
- [ ] Reply with both: the rephrased Hebrew AND the English translation
- [ ] Test with real voice transcription examples

### Example:
> You send: *"לקחת את הכלב לטיול בבוקר טוב לו"*
> Bot replies:
> 📝 Rephrased: *"לקחת את הכלב לטיול בבוקר זה טוב לו"*
> 🇬🇧 Translation: *"Taking the dog for a walk in the morning is good for him"*

---

## Phase 3: Database — Save Sentences
Save each sentence, its translation, a category, and the date to a database.

### Tasks:
- [ ] Choose a database (SQLite for simplicity — no server needed)
- [ ] Create a `sentences` table with fields:
  - `id`
  - `hebrew` (original)
  - `rephrased_hebrew`
  - `english_translation`
  - `category` (bath time, dining, walk, etc.)
  - `created_at`
- [ ] After each translation, ask the user in the chat: "Which category is this? (e.g. dining, bath time, walk)"
- [ ] Save the sentence + category to the database
- [ ] Test: verify sentences are saved correctly

---

## Phase 4: Batch Grouping
Group sentences into batches of 5 from the same category and close dates.

### Tasks:
- [ ] Write logic to group sentences: same category + nearest dates = one batch
- [ ] Each batch contains exactly 5 sentences
- [ ] Store batch metadata (category, date range, batch ID)
- [ ] Test: add 10+ sentences in one category and verify batches are created correctly

---

## Phase 5: Practice Mode
You tell the bot what you're doing, and it suggests a batch of 5 sentences to practice with your daughter.

### Tasks:
- [ ] Detect "practice trigger" messages (e.g. "I am dining with my daughter")
- [ ] Identify the relevant category from the message
- [ ] Ask the user: "Would you like the most recent batch or a random one?"
- [ ] Display the batch: 5 Hebrew sentences + their English translations
- [ ] If user says "give me a different one" → fetch another batch from the same category
- [ ] Test the full flow end to end

### Example conversation:
> You: *"I am dining with my daughter"*
> Bot: *"Great! I found 3 batches in the 'dining' category. Would you like the most recent one or a random one?"*
> You: *"Random"*
> Bot: *"Here's your batch:*
> *1. ... → ...*
> *2. ... → ...*
> *3. ... → ...*
> *4. ... → ...*
> *5. ... → "*
> You: *"Give me a different one"*
> Bot: *"Sure! Here's another batch: ..."*

---

## Future Ideas (Backlog)
- [ ] Web dashboard to view all saved sentences and batches
- [ ] Export batches to PDF for offline use
- [ ] Track which batches were practiced and when
- [ ] Add difficulty rating per sentence
- [ ] Host the bot 24/7 on a cloud server (Railway or Render)