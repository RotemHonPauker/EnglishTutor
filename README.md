# Hebrew-English Phrase Practice App

A personal, mobile-first app for capturing Hebrew phrases, translating them into English, and practicing them.

---

## How it works

1. **New tab** — type or paste a Hebrew phrase, hit send. It's translated instantly (transcription errors corrected, two English variants) and saved as uncategorized — no confirmation step, by design, so capturing a phrase stays as fast as it used to be over WhatsApp
2. **Table tab** — your full phrase list as cards, and also your practice screen: filter by status and/or tag, browse
3. Tapping ✎ on a card jumps into the **Editor tab**, which resets and loads that phrase — refine the wording conversationally, approve when it's ready
4. Opening the Editor tab directly (not via a card) shows a home screen with 3 things you can do from there: edit a phrase (back to the table), edit the translation prompt, or edit the editor's own instructions — each is a deliberate, user-started flow, never something the LLM offers on its own, and every proposed change is shown as a diff you approve or discard before anything is committed
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
│   ├── editor/
│   |   ├── editorEngine.js
│   |   ├── editorPrompt.js
│   |   ├── editorPrompt.txt
│   |   ├── toolHandler.js
│   |   └── tools.js
│   ├── public/
│   |   ├── styles/
│   |   ├── app.js
│   |   ├── colorUtils.js
│   |   ├── editor.js
│   |   ├── index.html
│   |   ├── newPhrase.js
│   |   ├── phrasesTable.js
│   |   ├── phraseTagFilter.js
│   |   ├── phraseTagPicker.js
│   |   ├── tagsMerge.js
│   |   ├── tagsSidebar.js
│   |   └── tagsState.js
│   ├── routes/
│   |   ├── editor.route.js
│   |   ├── editorPrompt.route.js
│   |   ├── phrases.route.js
│   |   ├── tags.route.js
│   |   └── translationPrompt.route.js
│   ├── translation/
│   |   ├── translationEngine.js
│   |   ├── translationPrompt.js
│   |   ├── translationPrompt.txt
│   |   └── parseTranslationResponse.js
│   └── server.js
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