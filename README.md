# Hebrew-English Phrase Practice App

This isn't about learning English. It's about wanting to speak it — in the actual moment, in your actual day — and getting stuck. The word isn't there. You're not sure the phrasing is right. The sentence breaks halfway through, and with it, your confidence to keep going.

But it doesn't have to happen the same way twice. In your next five free minutes, you write that phrase into the app — and maybe two or three more you already know you'll need for a similar moment tomorrow. At the office, with your colleagues. At the playground, with the daughter you're teaching English to. At the front desk, with the hotel receptionist on your next destination.

Now you had that exact phrase ready, in your pocket.

That's what this app does: capture a Hebrew phrase, get two variants of English translations back, and hear either one spoken aloud to practice how it actually sounds. Because context shapes what "the right phrasing" even means, you can also describe the environment you're building vocabulary for — who you're talking to, what tone fits — so translations are shaped around it instead of generic. And since different parts of life call for entirely different vocabularies, the app lets you keep separate environments and switch between them.

## What it's for

A few examples of the kind of need this covers:

- **Instilling English in my daughter's everyday life** — playing at the playground, doing crafts together, splashing in the bath, reading her a story.
- **Sounding like myself at work** — chatting over coffee, contributing in meetings, presenting to managers and teams.
- **Getting ready for a trip** — starting conversations with service providers, talking about myself and my life when meeting new people, getting a feel for the local culture and way of life.

This app is deliberately not built for use in the moment itself — not while your hands (and attention) are full. It's built for the five minutes you didn't know you'd have: the line at the supermarket, the gap between meetings, the minute right before or after. That's when a phrase gets captured, or practiced, or refined — never in the middle of the moment it was meant for.

---

## How it works

1. **Spaces** — the app always shows exactly one active space, named in the header at the top of every tab. Tap the name to switch to another space or create a new one. Each space is fully self contained: its own phrases, its own tag hierarchy, and its own additional translation rules — nothing is shared or filterable across spaces. At creation, a space is set to either use ordering or not (e.g. for translating a book's chunks in sequence) — this can't be changed afterward
2. **New tab** — type or paste a Hebrew phrase, hit send. It's translated instantly (typos corrected, two English variants) and saved right away, untagged — no confirmation step, by design, so capturing a phrase stays as fast as it used to be over WhatsApp
3. **Table tab** — your full phrase list as cards, and also your practice screen: filter by tag, browse. Sorts by date, or — in a space that uses ordering — by each phrase's order number instead, shown right on the card and editable by tapping it (a phrase inherits "last in its tag" by default when tagged). Tap the 🔊 next to either English variant to hear it spoken aloud — generated once on first play and cached from then on, so repeat listens never call the API again
4. **Editor tab** — tapping ✎ on a card jumps into the , which resets and loads that phrase — refine the wording (Hebrew or either English variant) conversationally, save when it's ready. Opening the Editor tab directly (not via a card) shows a home screen with 2 things you can do from there: edit a phrase (back to the table), or edit the active space's additional translation rules — a deliberate, user-started flow, never something the LLM offers on its own, and every proposed change is shown as a diff you approve or discard before anything is committed
5. **Tags tab** — manage the main-tag / subtag hierarchy and colors for the active space

---

## Stack

| Piece           | Technology                                         |
| --------------- | -------------------------------------------------- |
| LLM             | Anthropic Claude (claude-sonnet-4-6)               |
| Text-to-speech  | Google Gemini TTS (`gemini-3.1-flash-tts-preview`) |
| Database        | Postgres via Supabase (pgvector enabled)           |
| Server          | VPS (DigitalOcean)                                 |
| Process manager | PM2 (keeps the app alive, restarts on reboot)      |
| Reverse proxy   | Nginx                                              |
| HTTPS           | Let's Encrypt via Certbot                          |
| Domain          | DuckDNS (free dynamic DNS)                         |
| App install     | PWA (manifest + service worker)                    |

---

## Database

Postgres via Supabase. Five tables:

- **`spaces`**
  - `id` (PK)
  - `name`
  - `has_order` — boolean, set once at creation and never changed afterward (enforced by the app, not the DB)
  - `created_at`

- **`space_prompts`** — each space's own additional translation rules, combined with the fixed base prompt at translation time. Every save inserts a new row; only the 3 most recent rows per space are kept (current + 2 previous), older ones pruned automatically
  - `id` (PK)
  - `space_id` (FK → `spaces.id`, `ON DELETE CASCADE`)
  - `content`
  - `created_at`

- **`tags`** — main tags and subtags in one table, distinguished by `parent_id`
  - `id` (PK)
  - `name`
  - `color` — only set on main tags; subtags render using their parent's color
  - `parent_id` (FK → `tags.id`, self-referencing) — `NULL` for a main tag, set for a subtag
  - `space_id` (FK → `spaces.id`) — required only on main tags via a `CHECK` constraint; subtags inherit their space through `parent_id` and leave this `NULL`
  - `created_at`

- **`phrases`**
  - `id` (PK)
  - `hebrew_text`
  - `variant_1` — first phrasing
  - `variant_2` — Second phrasing
  - `subtag_id` (FK → `tags.id`) — `NULL` when untagged
  - `sequence_order` — int4, only meaningful in a `has_order` space; auto-assigned to "last in this subtag" when a phrase is tagged, freely editable afterward, duplicates allowed
  - `sequence_id` — uuid, unused, kept in place but no longer read or written by the app
  - `tts_url_variant1` / `tts_url_variant2` — text, `NULL` until first played; path to a cached audio file on disk, not the audio itself
  - `embedding` — vector, pgvector, not currently used
  - `space_id` (FK → `spaces.id`) — required on every row
  - `created_at`

---

## Translation prompts: base + per-space rules

Every translation combines two things:

- A fixed base prompt (`dashboard/translation/translationPrompt.txt`) — the core instructions (correct typos, produce two variants, output JSON). Plain file, not editable through the app.
- The active space's own additional rules (stored in the database, edited through the Editor tab's "Edit `<space name>` rules" flow) — things like who's speaking, the tone each variant should have, or how to resolve a recurring ambiguity for that space specifically. A space with no additional rules yet is a normal state; translation still works fine off the base prompt alone.

The editor's own behavior (`dashboard/editor/editorPrompt.txt`) is a separate, fixed file — not per-space, and not editable through the app.

---

## Text-to-speech audio

Tapping 🔊 next to a variant generates spoken audio via Gemini TTS (voice: **Achernar**) the first time only — the file is saved to `dashboard/public/audio-cache/` on whichever machine's server handled the request, and its path is stored in `phrases.tts_url_variant1`/`tts_url_variant2`. Every play after that just serves the cached file, no API call.

A few things worth knowing:

- **The audio lives on disk, not in the database** — a raw audio column would count against Supabase's free-tier storage limit and get pulled along with every ordinary phrase-list query. A text path costs almost nothing either way.
- **`audio-cache/` is gitignored** — it's generated at runtime, not synced via `git push`/`pull`. Local dev and production each build up their own cache independently, on their own disk.
- **Deleting a phrase deletes its cached audio files too**, so nothing lingers with no phrase pointing to it.

---

## Rate limiting & usage caps

A few layers protect the Claude/Gemini API usage from runaway cost (abuse, a bug, or an abandoned browser tab):

- **Per-route rate limits** (`express-rate-limit`) on `/editor` and the AI-calling parts of `/phrases` — capped requests per IP per time window.
- **Tool-loop cap** — a single `/editor` request can chain several tool-use rounds (fetch a phrase, propose a rule update, etc.); `editorEngine.js` caps how many rounds one request can trigger before giving up gracefully.
- **Conversation history trimming** — `/editor`'s history is trimmed to the most recent N real user messages once a session runs long, cut only at safe boundaries (never splitting a `tool_use`/`tool_result` pair).

---

```
EnglishTutor/
├── dashboard/
│   ├── editor/
│   |   ├── editorEngine.js
│   |   ├── editorPrompt.txt
│   |   ├── toolHandler.js
│   |   └── tools.js
│   ├── public/
│   |   ├── audio-cache/        (gitignored — generated at runtime)
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
│   ├── tts/
│   |   └── ttsEngine.js
│   ├── limitsConfig.js
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
GEMINI_API_KEY=
DATABASE_PASSWORD=
DATABASE_URI_SESSION=
```

Optional overrides (see [Rate limiting & usage caps](#rate-limiting--usage-caps) — sensible defaults are used if omitted):

```
RATE_LIMIT_WINDOW_MINUTES=
TRANSLATE_RATE_LIMIT_MAX=
EDITOR_RATE_LIMIT_MAX=
MAX_TOOL_ROUNDS=
MAX_CONVERSATION_TURNS=
```

Run the dashboard locally:

```bash
node dashboard/server.js
```

Open `localhost:3000` in your browser to develop and test changes.

---

## Deployment (production)

The app runs 24/7 on a DigitalOcean VPS, reachable at:

```
https://phrase-app.duckdns.org
```

**Architecture**: Nginx receives all traffic on ports 80/443, terminates HTTPS (via a Let's Encrypt certificate managed by Certbot), and reverse-proxies requests to the Node app running on `localhost:3000`. PM2 keeps the Node process alive and restarts it automatically on crash or server reboot.

## Full server setup guide (reproducing the deployment from scratch)

This is the exact sequence used to get from a blank VPS to the live app. Useful if the server is ever lost and needs to be rebuilt. Total time: roughly 1–2 hours.

### 1. Create the VPS

- Provider: DigitalOcean → Create → Droplet
- Image: Ubuntu 24.04 LTS
- Plan: Basic → Regular SSD → cheapest tier ($4–6/mo, 1GB RAM is enough)
- Authentication: SSH key (generate locally first if you don't have one — see step 2)
- Leave Volumes, Backups, IPv6, and Managed Database unchecked
- Note the assigned public IP address after creation

### 2. Generate an SSH key (on your own computer, one time only)

Windows PowerShell:

```powershell
ssh-keygen -t ed25519 -C "phrase-app"
```

Accept the default file location, empty passphrase is fine for personal use. Copy the public key to add to DigitalOcean:

```powershell
cat $env:USERPROFILE\.ssh\id_ed25519.pub
```

**Back this up** — copy the `.ssh` folder somewhere safe (e.g. a password manager or encrypted drive). Losing the private key means losing SSH access (recoverable via DigitalOcean's browser-based Console + adding a new key, but inconvenient).

### 3. Connect to the server

```bash
ssh root@<server-ip>
```

Type `yes` to accept the host fingerprint on first connection.

### 4. Install core software on the server

```bash
apt update && apt upgrade -y
# If asked about sshd_config during upgrade: keep the local version currently installed

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v && npm -v   # sanity check

apt install -y git
npm install -g pm2
```

### 5. Clone the repo and configure environment

```bash
cd ~
git clone https://github.com/<your-username>/EnglishTutor.git
cd EnglishTutor
npm install

nano .env
```

Paste in (real values, never commit this file):

```
ANTHROPIC_API_KEY=your_key
GEMINI_API_KEY=...
DATABASE_PASSWORD=...
DATABASE_URI_SESSION=...
RATE_LIMIT_WINDOW_MINUTES=...
TRANSLATE_RATE_LIMIT_MAX=...
EDITOR_RATE_LIMIT_MAX=...
MAX_TOOL_ROUNDS=...
```

Save (`Ctrl+O`, Enter) and exit (`Ctrl+X`).

### 6. Start the app with PM2

```bash
pm2 start dashboard/server.js --name phrase-app
pm2 status              # confirm "online"
pm2 startup              # sets up auto-start on reboot (may run automatically in recent PM2 versions)
pm2 save                 # freezes the current process list for restart-on-boot
```

### 7. Point a domain at the server (DuckDNS, free)

1. Go to duckdns.org, log in, complete the reCAPTCHA
2. Add a subdomain (e.g. `phrase-app`) → this gives you `phrase-app.duckdns.org`
3. Set its IP field to the server's public IP, click "update ip"
4. Verify from your computer: `ping phrase-app.duckdns.org` should resolve to the server IP

### 8. Install and configure Nginx as a reverse proxy

```bash
apt install -y nginx certbot python3-certbot-nginx

nano /etc/nginx/sites-available/phrase-app
```

Paste:

```nginx
server {
    listen 80;
    server_name phrase-app.duckdns.org;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Save and exit, then:

```bash
ln -s /etc/nginx/sites-available/phrase-app /etc/nginx/sites-enabled/
nginx -t                    # should say "syntax is ok" / "test is successful"
systemctl restart nginx
```

### 9. Add HTTPS with Certbot

```bash
certbot --nginx -d phrase-app.duckdns.org
```

Follow the prompts (email, agree to terms, decline EFF email sharing if you like). Certbot automatically rewrites the Nginx config to add the SSL server block and an HTTP→HTTPS redirect, and sets up auto-renewal (certificates renew every 90 days without manual action).

### 10. Add Basic Auth (password-protect the whole app)

```bash
apt install -y apache2-utils
htpasswd -c /etc/nginx/.htpasswd <your-username>
```

(You'll be prompted to set a password. Omit `-c` if adding additional users later — it overwrites the file.)

Edit the config again:

```bash
nano /etc/nginx/sites-available/phrase-app
```

Inside the **HTTPS** `server` block (the one with `listen 443 ssl;`, not the HTTP-redirect block), add two lines at the top of `location / { }`:

```nginx
    location / {
        auth_basic "Restricted";
        auth_basic_user_file /etc/nginx/.htpasswd;

        proxy_pass http://localhost:3000;
        ...
    }
```

Save, exit, then:

```bash
nginx -t
systemctl restart nginx
```

### 11. Verify

Open `https://phrase-app.duckdns.org` in an incognito/private browser window — you should be prompted for the username/password before anything loads.

---

## PWA (installing as an app)

The app is installable to your phone's home screen, where it opens full-screen without browser chrome, like a native app.

- `dashboard/public/manifest.json` — app name, icons, colors, display mode
- `dashboard/public/sw.js` — minimal service worker (required for installability; does not currently cache anything for offline use)
- `dashboard/public/icons/` — app icons (192px, 512px, and a maskable 512px variant for Android's adaptive icon shapes)

**To install**: open the production URL on your phone, then use "Add to Home Screen" (Safari, via the share button) or "Install app" (Chrome, via the ⋮ menu).

**Note**: HTTPS is required for installability — this is why the app must be accessed via the production URL, not `localhost` or a local-network IP.

---

## Updating the live app after making changes

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

## Useful PM2 commands

```bash
pm2 status              # check if the app is running
pm2 logs phrase-app     # view live logs (Ctrl+C to exit)
pm2 restart phrase-app  # restart after an update
```
