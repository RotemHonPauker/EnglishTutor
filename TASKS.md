# Hebrew-English Phrase Bot — Project Roadmap

## Vision

A personal WhatsApp bot to help practice English with Dror during daily moments.
You send a Hebrew phrase (voice or text from your watch) → the bot corrects transcription errors, 
translates it into two natural English variants, and saves it silently.
Later, a review chat helps you refine and approve phrases, and a mobile-friendly practice page
lets you browse approved phrases by topic before heading out with Dror.

---

## Phase 1: Infrastructure ✅

- [x] Set up Node.js project with whatsapp-web.js and Anthropic SDK
- [x] Push project to GitHub
- [x] Run the bot and scan QR code
- [x] Create dedicated WhatsApp chat for the bot
- [x] Set up Postgres database on Supabase with pgvector enabled
- [x] Migrate database from MongoDB to Postgres (pg)
- [x] Reorganize project into bot/ and dashboard/ folders
- [x] Create `phrases` table and `tags` table (with parent/child hierarchy and color)

---

## Phase 2: Capture and Instant Retrieval ✅

Hebrew phrase in → two English variants out → saved silently as uncategorized.

- [x] Prompt Claude to silently correct transcription errors, then return two English variants
- [x] Reply to WhatsApp with the two variants immediately
- [x] Save corrected Hebrew + both variants to Postgres, status = uncategorized
- [x] Test: send a Hebrew phrase, confirm reply and database row appear correctly

---

## Phase 3: Review Chat (conversational editor) — in progress

A web chat inside a dashboard where you review uncategorized phrases at the end of the day.
The LLM helps you rephrase variants, assign a subtag, and approve — one phrase at a time.

### Dashboard backend
- [x] Express server with split route files (chat, phrases, tags, systemPrompt)
- [x] database.js: getNextUncategorized, updatePhrase, getPhrases, getTags, createTag, updateTag, deleteTag
- [x] dashboard/systemPrompt.txt — the review chat's own instructions, tracked by git, edited manually (not through the chat)
- [x] bot/botPrompt.js + bot/botPrompt.txt — WhatsApp bot's translation prompt, re-read on every message (no restart needed after an edit)
- [x] tools.js — fetch_next_uncategorized, save_approved, skip, update_bot_prompt, commit_bot_prompt
- [x] Review chat proposes edits to bot/botPrompt.txt (not its own dashboard/systemPrompt.txt) when a refinement suggests the bot prompt should change
- [x] toolHandler.js — executes each tool (DB queries, file writes, git commands)
- [x] reviewChat.js — conversation loop, tool call handling

### Dashboard frontend
- [x] index.html + app.js + split CSS files
- [x] Phrase table with status filter and date sort
- [x] System prompt modal editor with Save & Commit button
- [x] Markdown rendering in chat
- [ ] Update review chat to work with subtag IDs instead of plain text tags
- [ ] Test: clear a queue of 5 uncategorized phrases through conversation

---

## Phase 4: Tag Editor

Manage main tags and subtags — names, colors, hierarchy.

- [ ] Tag editor page at localhost:3000/tags
- [ ] Create / rename / delete main tags and subtags
- [ ] Color picker per main tag
- [ ] All phrases under a tag inherit its color in the practice page

---

## Phase 5: Practice Page (mobile browsing)

A mobile-optimized read-only page for quick pre-session phrase review.
Used in the car before pickup, or in a 2-3 minute window before heading out.

- [ ] Page at localhost:3000/practice
- [ ] Phrases grouped by main tag → subtag
- [ ] Each phrase displayed as: Hebrew / Variant 1 / Variant 2 with a blank line between phrases
- [ ] Background color per main tag
- [ ] Connected phrase sequences displayed together (sequence_id grouping)
- [ ] Filter by main tag (tap to show/hide group)
- [ ] Bookmarkable on phone home screen

---

## Backlog

- [ ] Deploy bot to VPS for 24/7 capture (Hetzner CX22)
- [ ] Session drop alerting for whatsapp-web.js (silent failure protection)
- [ ] Backup capture path (basic web form) in case of WhatsApp ban
- [ ] pgvector embeddings on approval (for future semantic search)
- [ ] Sequence support: link multiple phrases into a connected situational script