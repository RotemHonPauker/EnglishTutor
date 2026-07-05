# Hebrew-English Phrase Bot

A personal WhatsApp bot for capturing Hebrew phrases on the go and practicing their
English translations with Dror during daily moments.

---

## How it works

1. Send a Hebrew phrase from your watch or phone to a dedicated WhatsApp chat
2. The bot silently corrects any voice transcription errors
3. It replies immediately with two natural English variants
4. The phrase is saved to the database as uncategorized — no further action needed in the moment
5. Later, a review chat (Phase 3) lets you refine, tag, and approve phrases
6. Before heading out, a voice prep mode (Phase 5) reads relevant phrases aloud

---

## Stack

| Piece                | Technology                               |
| -------------------- | ---------------------------------------- |
| WhatsApp integration | whatsapp-web.js                          |
| LLM                  | Anthropic Claude (claude-sonnet-4-6)     |
| Database             | Postgres via Supabase (pgvector enabled) |
| TTS (Phase 5)        | Google Cloud TTS, Chirp 3 HD             |
| Server               | VPS (DigitalOcean / Hetzner)             |

---

## Project structure

```
EnglishTutor/
├── bot/
│   ├── botMessages.js
│   ├── index.js
│   ├── prompts.js
│   └── responseHandler.js
├── dashboard/
│   ├── public/
│   |   └── index.html
│   ├── reviewChat.js
│   ├── server.js
│   ├── systemPrompt.js
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
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
CHAT_ID=your_whatsapp_chat_id@c.us
```

Run:

```bash
node index.js
```

Scan the QR code with WhatsApp on your phone. The bot is live once you see `Bot is ready!`

---

## Notes

- Uses whatsapp-web.js, an unofficial WhatsApp library — intended for personal use only
- Never commit your `.env` file
