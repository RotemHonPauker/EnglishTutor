# Hebrew-English Phrase Practice App

A personal, mobile-first app for capturing Hebrew phrases, translating them into English, and practicing them. Installable as a PWA — runs like a native app on your phone's home screen.

---

## How it works

1. **Spaces** — the app always shows exactly one active space, named in the header at the top of every tab. Tap the name to switch to another space or create a new one. Each space is fully self contained: its own phrases, its own tag hierarchy, and its own additional translation rules — nothing is shared or filterable across spaces.
2. **New tab** — type or paste a Hebrew phrase, hit send. It's translated instantly (typos corrected, two English variants) and saved right away, untagged — no confirmation step, by design, so capturing a phrase stays as fast as it used to be over WhatsApp
3. **Table tab** — your full phrase list as cards, and also your practice screen: filter by tag, sort by date, browse
4. Tapping ✎ on a card jumps into the **Editor tab**, which resets and loads that phrase — refine the wording (Hebrew or either English variant) conversationally, save when it's ready
5. Opening the Editor tab directly (not via a card) shows a home screen with 2 things you can do from there: edit a phrase (back to the table), or edit the active space's additional translation rules — a deliberate, user-started flow, never something the LLM offers on its own, and every proposed change is shown as a diff you approve or discard before anything is committed
6. **Tags tab** — manage the main-tag / subtag hierarchy and colors for the active space

### Translation prompts: base + per-space rules

Every translation combines two things:

- A fixed base prompt (`dashboard/translation/translationPrompt.txt`) — the core instructions (correct typos, produce two variants, output JSON). Plain file, not editable through the app.
- The active space's own additional rules (stored in the database, edited through the Editor tab's "Edit `<space name>` rules" flow) — things like who's speaking, the tone each variant should have, or how to resolve a recurring ambiguity for that space specifically. A space with no additional rules yet is a normal state; translation still works fine off the base prompt alone.

The editor's own behavior (`dashboard/editor/editorPrompt.txt`) is a separate, fixed file — not per-space, and not editable through the app.

---

## Stack

| Piece           | Technology                                    |
| --------------- | --------------------------------------------- |
| LLM             | Anthropic Claude (claude-sonnet-4-6)          |
| Database        | Postgres via Supabase (pgvector enabled)      |
| Server          | VPS (DigitalOcean)                            |
| Process manager | PM2 (keeps the app alive, restarts on reboot) |
| Reverse proxy   | Nginx                                         |
| HTTPS           | Let's Encrypt via Certbot                     |
| Domain          | DuckDNS (free dynamic DNS)                    |
| App install     | PWA (manifest + service worker)               |

---

## Database

Postgres via Supabase. Five tables:

**`spaces`**
| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid (PK) | |
| `name` | text | |
| `created_at` | timestamptz | |

**`space_prompts`** — each space's own additional translation rules (combined with the fixed base prompt at translation time). Every save inserts a new row; only the 3 most recent rows per space are kept (current + 2 previous), older ones pruned automatically.
| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid (PK) | |
| `space_id` | uuid (FK → `spaces.id`, `ON DELETE CASCADE`) | |
| `content` | text | |
| `created_at` | timestamptz | |

**`tags`** — main tags and subtags in one table, distinguished by `parent_id`.
| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid (PK) | |
| `name` | text | |
| `color` | text | only set on main tags; subtags render using their parent's color |
| `parent_id` | uuid (FK → `tags.id`, self-referencing) | `NULL` for a main tag, set for a subtag |
| `space_id` | uuid (FK → `spaces.id`) | required only on main tags (`parent_id IS NULL`) — enforced by a `CHECK` constraint. Subtags inherit their space via `parent_id`, so this stays `NULL` on them |
| `created_at` | timestamptz | |

**`phrases`**
| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid (PK) | |
| `hebrew_text` | text | |
| `variant_1` | text | Simple phrasing |
| `variant_2` | text | Adult-Level phrasing |
| `subtag_id` | uuid (FK → `tags.id`) | `NULL` when untagged |
| `sequence_id` | uuid | |
| `sequence_order` | int4 | |
| `embedding` | vector | pgvector, not currently used by the app |
| `space_id` | uuid (FK → `spaces.id`) | required on every row |
| `created_at` | timestamptz | |

```
EnglishTutor/
├── dashboard/
│   ├── editor/
│   |   ├── editorEngine.js
│   |   ├── editorPrompt.txt
│   |   ├── toolHandler.js
│   |   └── tools.js
│   ├── public/
│   |   ├── icons/
│   |   |   ├── icon-192.png
│   |   |   ├── icon-512.png
│   |   |   ├── icon-512-maskable.png
│   |   |   └── loading.svg
│   |   ├── styles/
│   |   ├── app.js
│   |   ├── colorUtils.js
│   |   ├── editor.js
│   |   ├── index.html
│   |   ├── loadingOverlay.js
│   |   ├── manifest.json
│   |   ├── newPhrase.js
│   |   ├── phrasesTable.js
│   |   ├── phraseTagFilter.js
│   |   ├── phraseTagPicker.js
│   |   ├── spacesState.js
│   |   ├── sw.js
│   |   ├── tagsMerge.js
│   |   ├── tagsMigrate.js
│   |   ├── tagsSidebar.js
│   |   └── tagsState.js
│   ├── routes/
│   |   ├── editor.route.js
│   |   ├── phrases.route.js
│   |   ├── spaces.route.js
│   |   └── tags.route.js
│   ├── translation/
│   |   ├── translationEngine.js
│   |   └── translationPrompt.txt
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
- The active space is remembered per browser (`localStorage`), not on the server — switching devices means picking the space again
