# Hebrew-English Phrase Bot — Project Roadmap

## Vision

A personal WhatsApp bot to help practice English with Dror during daily moments.
You send a Hebrew phrase (voice or text from your watch) → the bot corrects transcription errors,
translates it into two natural English variants, and saves it silently.
Later, a review chat helps you refine and approve phrases, and a voice prep mode
reads approved phrases aloud before heading out.

---

## Phase 1: Infrastructure ✅

- [x] Set up Node.js project with whatsapp-web.js and Anthropic SDK
- [x] Push project to GitHub
- [x] Run the bot and scan QR code
- [x] Create dedicated WhatsApp chat for the bot
- [x] Set up Postgres database on Supabase with pgvector enabled
- [x] Create `phrases` table (hebrew_text, variant_1, variant_2, tag, status, embedding, created_at, approved_at)

---

## Phase 2: Capture and Instant Retrieval ✅

Hebrew phrase in → two English variants out → saved silently as uncategorized.

- [x] Prompt Claude to silently correct transcription errors, then return two English variants
- [x] Reply to WhatsApp with the two variants immediately
- [x] Save corrected Hebrew + both variants to Postgres, status = uncategorized
- [x] Test: send a Hebrew phrase, confirm reply and database row appear correctly

---

## Phase 3: Review Chat (conversational editor)

A web chat inside a dashboard where you review uncategorized phrases at the end of the day.
The LLM helps you rephrase variants, assign a tag, and approve — one phrase at a time.

- [ ] Build basic web dashboard with an embedded chat interface
- [ ] Wire LLM tools: fetch_next_uncategorized, propose_rephrase, propose_tag, save_approved, skip, update_system_prompt, commit_system_prompt
- [ ] Tag suggestion based on existing approved tags (embedding similarity pre-step)
- [ ] Nothing writes to the database until you explicitly say approve
- [ ] Test: clear a queue of 5 uncategorized phrases through conversation

---

## Phase 4: Approved Browser

Browse and filter everything you've approved.

- [ ] List view of all approved phrases
- [ ] Filter by tag

---

## Phase 5: Voice Prep (situational retrieval)

Before heading out, describe the situation → bot reads 5 relevant phrases aloud.

- [ ] Populate embedding column on approval (Hebrew + variants combined)
- [ ] pgvector similarity search: situation text → top 5 approved phrases
- [ ] Google Cloud TTS (Chirp 3 HD): Hebrew phrase → pause → variant 1 → variant 2, ×5
- [ ] Wire as second WhatsApp intent (keyword-routed)
- [ ] Test: "I'm going to the playground with Dror" → voice note with 5 relevant phrases
- [ ] Deploy to VPS so bot runs 24/7 without needing your laptop on

---

## Backlog

- [ ] Session drop alerting for whatsapp-web.js (silent failure protection)
- [ ] Backup capture path (basic web form) in case of WhatsApp ban
