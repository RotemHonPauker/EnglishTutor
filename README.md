# Hebrew-English Phrase Bot

A personal WhatsApp bot for capturing Hebrew phrases on the go and practicing their
English translations with Dror during daily moments.

---

## How it works

1. Send a Hebrew phrase from your watch or phone to a dedicated WhatsApp chat
2. The bot silently corrects any voice transcription errors
3. It replies immediately with two natural English variants
4. The phrase is saved to the database as uncategorized — no further action needed in the moment
5. Later, a review chat at `localhost:3000` lets you refine, assign a tag, and approve phrases
6. If a refinement suggests the bot's translation prompt itself should change, the review chat can propose an edit to `bot/botPrompt.txt` and commit it — changes apply to the very next WhatsApp message, no restart needed. The review chat's own instructions (`dashboard/systemPrompt.txt`) can be edited the same way, started from the chat's home screen — every proposed change still needs your explicit approval before it's committed
7. Approved phrases are browsable by tag at `localhost:3000/practice` for quick pre-session review

---

## Stack

| Piece                | Technology                               |
| -------------------- | ---------------------------------------- |
| WhatsApp integration | whatsapp-web.js                          |
| LLM                  | Anthropic Claude (claude-sonnet-4-6)     |
| Database             | Postgres via Supabase (pgvector enabled) |
| Server               | VPS (DigitalOcean / Hetzner)             |

---

## Project structure

```
EnglishTutor/
├── bot/
│   ├── botMessages.js
│   ├── botPrompt.js
│   ├── botPrompt.txt
│   ├── index.js
│   └── responseHandler.js
├── dashboard/
│   ├── public/
│   |   ├── styles/
│   |   ├── app.js
│   |   ├── chat.js
│   |   ├── colorUtils.js
│   |   ├── index.html
│   |   ├── phrasesTable.js
│   |   ├── phrasesTagFilter.js
│   |   ├── phrasesTagPicker.js
│   |   ├── tagsMerge.js
│   |   ├── tagsSidebar.js
│   |   └── tagsState.js
│   ├── routes/
│   |   ├── botPrompt.route.js
│   |   ├── chat.route.js
│   |   ├── phrases.route.js
│   |   ├── systemPrompt.route.js
│   |   └── tags.route.js
│   ├── chatEngine.js
│   ├── server.js
│   ├── systemPrompt.js
│   ├── systemPrompt.txt
│   ├── toolHandler.js
│   └── tools.js
├── .env
├── database.js
├── package.json
└── README.md
```

---

## Setup

```bash
npm install
```

Create a `.env` file:

```
ANTHROPIC_API_KEY=your_key
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
CHAT_ID=your_whatsapp_chat_id@c.us
```

Run the WhatsApp bot:

```bash
node bot/index.js
```

Run the review dashboard:

```bash
node dashboard/server.js
```

Scan the QR code with WhatsApp on your phone. The bot is live once you see `Bot is ready!`

---

## Notes

- Uses whatsapp-web.js, an unofficial WhatsApp library — intended for personal use only
- Never commit your `.env` file
- The session pooler connection string (not direct connection) is required for Supabase
- Two prompt files, both editable through the review chat itself, both requiring explicit approval before anything is committed: `bot/botPrompt.txt` (the WhatsApp bot's translation prompt) and `dashboard/systemPrompt.txt` (the review chat's own instructions). Editing either one is always user-initiated — from the chat's home screen — never suggested by the LLM on its own