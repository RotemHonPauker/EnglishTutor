# Hebrew-English Phrase Practice App

A personal, mobile-first app for capturing Hebrew phrases, translating them into English, and practicing them. Installable as a PWA — runs like a native app on your phone's home screen.

---

## How it works

1. **New tab** — type or paste a Hebrew phrase, hit send. It's translated instantly (transcription errors corrected, two English variants) and saved as uncategorized — no confirmation step, by design, so capturing a phrase stays as fast as it used to be over WhatsApp
2. **Table tab** — your full phrase list as cards, and also your practice screen: filter by status and/or tag, browse
3. Tapping ✎ on a card jumps into the **Editor tab**, which resets and loads that phrase — refine the wording conversationally, approve when it's ready
4. Opening the Editor tab directly (not via a card) shows a home screen with 3 things you can do from there: edit a phrase (back to the table), edit the translation prompt, or edit the editor's own instructions — each is a deliberate, user-started flow, never something the LLM offers on its own, and every proposed change is shown as a diff you approve or discard before anything is committed
5. **Tags tab** — manage your main-tag / subtag hierarchy and colors

---

## Stack

| Piece         | Technology                                    |
| ------------- | ---------------------------------------------- |
| LLM           | Anthropic Claude (claude-sonnet-4-6)          |
| Database      | Postgres via Supabase (pgvector enabled)      |
| Server        | VPS (DigitalOcean)                            |
| Process manager | PM2 (keeps the app alive, restarts on reboot) |
| Reverse proxy | Nginx                                         |
| HTTPS         | Let's Encrypt via Certbot                     |
| Domain        | DuckDNS (free dynamic DNS)                    |
| App install   | PWA (manifest + service worker)               |

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
│   |   ├── icons/
│   |   |   ├── icon-192.png
│   |   |   ├── icon-512.png
│   |   |   └── icon-512-maskable.png
│   |   ├── styles/
│   |   ├── app.js
│   |   ├── colorUtils.js
│   |   ├── editor.js
│   |   ├── index.html
│   |   ├── manifest.json
│   |   ├── newPhrase.js
│   |   ├── phrasesTable.js
│   |   ├── phraseTagFilter.js
│   |   ├── phraseTagPicker.js
│   |   ├── sw.js
│   |   ├── tagsMerge.js
│   |   ├── tagsMigrate.js
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

## Local development setup

```bash
npm install
```

Create a `.env` file:

```
ANTHROPIC_API_KEY=your_key
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

Run the dashboard locally:

```bash
node dashboard/server.js
```

Open `localhost:3000` in your browser to develop and test changes.

To test on your phone during development, your computer and phone must be on the same Wi-Fi network. Find your computer's local IP (`ipconfig` on Windows) and open `http://<your-local-ip>:3000` on your phone. This requires allowing port 3000 through your computer's firewall.

For everyday use, use the deployed production URL instead (see below) — it works from anywhere, not just your home network.

---

## Deployment (production)

The app runs 24/7 on a DigitalOcean VPS, reachable at:

```
https://phrase-app.duckdns.org
```

**Architecture**: Nginx receives all traffic on ports 80/443, terminates HTTPS (via a Let's Encrypt certificate managed by Certbot), and reverse-proxies requests to the Node app running on `localhost:3000`. PM2 keeps the Node process alive and restarts it automatically on crash or server reboot.

### Updating the live app after making changes

1. Push your changes from your computer as usual:
   ```bash
   git add .
   git commit -m "your message"
   git push
   ```

2. SSH into the server and pull the changes:
   ```bash
   ssh root@<server-ip>
   cd ~/EnglishTutor
   git pull
   npm install    # only if package.json changed
   pm2 restart phrase-app
   ```

### Useful PM2 commands

```bash
pm2 status              # check if the app is running
pm2 logs phrase-app     # view live logs (Ctrl+C to exit)
pm2 restart phrase-app  # restart after an update
```

---

## PWA (installing as an app)

The app is installable to your phone's home screen, where it opens full-screen without browser chrome, like a native app.

- `dashboard/public/manifest.json` — app name, icons, colors, display mode
- `dashboard/public/sw.js` — minimal service worker (required for installability; does not currently cache anything for offline use)
- `dashboard/public/icons/` — app icons (192px, 512px, and a maskable 512px variant for Android's adaptive icon shapes)

**To install**: open the production URL on your phone, then use "Add to Home Screen" (Safari, via the share button) or "Install app" (Chrome, via the ⋮ menu).

**Note**: HTTPS is required for installability — this is why the app must be accessed via the production URL, not `localhost` or a local-network IP.

---

## Notes

- Never commit your `.env` file
- The session pooler connection string (not direct connection) is required for Supabase