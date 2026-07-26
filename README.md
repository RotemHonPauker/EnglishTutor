# Hebrew-English Phrase Practice App

A personal, mobile-first app for capturing Hebrew phrases, translating them
into English, and practicing them with Dror.

---

## How it works

1. **New tab** — type or paste a Hebrew phrase, hit send. It's translated instantly (transcription errors corrected, two English variants) and saved as uncategorized — no confirmation step, by design, so capturing a phrase stays as fast as it used to be over WhatsApp
2. **Table tab** — your full phrase list as cards, and also your practice screen: filter by status and/or tag, browse
3. Tapping ✎ on a card jumps into the **Chat tab**, which resets and loads that phrase — refine the wording conversationally, approve when it's ready
4. Opening the Chat tab directly (not via a card) shows a home screen with 3 things you can do from there: edit a phrase (back to the table), edit the bot's translation prompt, or edit the review chat's own instructions — each is a deliberate, user-started flow, never something the LLM offers on its own, and every proposed change is shown as a diff you approve or discard before anything is committed
5. **Tags tab** — manage your main-tag / subtag hierarchy and colors

---

## Stack

| Piece    | Technology                               |
| -------- | ---------------------------------------- |
| LLM      | Anthropic Claude (claude-sonnet-4-6)     |
| Database | Postgres via Supabase (pgvector enabled) |
| Server   | VPS (DigitalOcean / Hetzner)             |

---

## Project structure

```
EnglishTutor/
├── dashboard/
│   ├── public/
│   |   ├── styles/
│   |   ├── app.js
│   |   ├── chat.js
│   |   ├── colorUtils.js
│   |   ├── index.html
│   |   ├── newPhrase.js
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
│   ├── translation/
│   |   ├── translationPrompt.js
│   |   ├── translationPrompt.txt
│   |   └── parseTranslationResponse.js
│   ├── chatEngine.js
│   ├── server.js
│   ├── systemPrompt.js
│   ├── systemPrompt.txt
│   ├── toolHandler.js
│   ├── tools.js
│   └── translatePhrase.js
├── .env
├── database.js
├── package.json
└── README.md
```

`bot/` no longer runs as a standalone process — `botPrompt.js`,
`botPrompt.txt`, and `responseHandler.js` are kept in place and imported
directly by `dashboard/translatePhrase.js`, so the New tab's translations
stay identical to what the old bot produced, and an "Edit bot prompt" change
from the chat still applies to both without any duplication.

---

## Setup

```bash
npm install
```

Create a `.env` file:

```
ANTHROPIC_API_KEY=your_key
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

Run the dashboard:

```bash
node dashboard/server.js
```

Open `localhost:3000` on your phone.

---

## Notes

- Never commit your `.env` file
- The session pooler connection string (not direct connection) is required for Supabase
- Two prompt files, both editable through the review chat itself, both requiring explicit approval before anything is committed: `bot/botPrompt.txt` (the translation prompt used by the New tab) and `dashboard/systemPrompt.txt` (the review chat's own instructions). Editing either one is always user-initiated — from the chat's home screen — never suggested by the LLM on its own
