# Fraza: Hebrew-English Phrase Capture and Practice App

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
2. **Type tab** — type or paste a phrase, hit send. Two modes, chosen via a toggle at the top: **Hebrew phrase** (the default — typos corrected, translated into two English variants) or **Check my English** (input is already English, or mixed English/Hebrew — corrected for grammar and phrasing instead of translated). Either way it's saved right away, untagged — no confirmation step, by design, so capturing a phrase stays as fast as it used to be over WhatsApp
3. **Record tab** — same two modes as the Type tab, via the same toggle. Pick an audio recording from your phone (up to ~30 minutes) — one AI call transcribes it, cleans it, identifies individual phrases (or sequential chunks, in an ordered space), and translates or corrects each one depending on the mode — several phrase cards appear from a single recording, the same way one appears from typing
4. **Table tab** — your full phrase list as cards, and also your practice screen: filter by tag, browse. Sorts by date, or — in a space that uses ordering — by each phrase's order number instead, shown right on the card and editable by tapping it (a phrase inherits "last in its tag" by default when tagged). Tap the 🔊 next to either English variant to hear it spoken aloud — generated once on first play and cached from then on, so repeat listens never call the API again
5. **Tags tab** — manage the main-tag / subtag hierarchy and colors for the active space
6. **Logs tab** — every recording processed leaves behind its cleaned transcript here, as a passive backup — a flat list per space, collapsed to just the date/time, tap to expand and read the full text, delete once you've confirmed the extraction looks right. A banner appears once more than 3 are saved, as a nudge to clean up old ones

---

## Stack

| Piece                          | Technology                                                  |
| ------------------------------ | ------------------------------------------------------------ |
| Translation & audio processing | Google Gemini (`gemini-3.6-flash`)                          |
| Text-to-speech                 | Google Gemini TTS (`gemini-3.1-flash-tts-preview`)          |
| Database                       | Postgres via Supabase (pgvector enabled)                    |
| Server                         | DigitalOcean VPS                                             |
| Process manager                | PM2 (keeps the app alive, restarts on reboot)                |
| Reverse proxy                  | Nginx                                                        |
| HTTPS                          | Let's Encrypt via Certbot                                    |
| Domain                         | DuckDNS (free dynamic DNS)                                   |
| App install                    | PWA (manifest + service worker)                              |

---

## Database

Postgres via Supabase. Four tables:

- **`spaces`**
  - `id` (PK)
  - `name`
  - `has_order` — boolean, set once at creation and never changed afterward (enforced by the app, not the DB)
  - `rules` — text, `NULL` until set. Each space's own additional translation rules, combined with the fixed base prompt at translation/audio-processing time. Edited directly in the database (manually) — there's no in-app editing flow
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

- **`transcripts`** — a backup of the cleaned transcript produced when processing a recording (see [Recording & audio processing](#recording--audio-processing)). Only the text is kept, never the original audio
  - `id` (PK)
  - `space_id` (FK → `spaces.id`, `ON DELETE CASCADE`)
  - `content`
  - `created_at`

---

## Prompts: base files + per-space rules

Both translation (typed phrases) and audio processing (recordings) share the same underlying approach — a fixed base prompt, combined with the active space's own rules at request time:

- **`dashboard/translation/translationPrompt.txt`** — the base prompt for typed phrases. Language-agnostic (input may be Hebrew, English, or a mix), correct/translate, output JSON. Plain file, not editable through the app.
- **`dashboard/audio/audioPrompt.txt`** — the base prompt for recordings (transcribe, identify/chunk phrases per the space's own rules, correct/translate, output JSON). Also a plain file, also language-agnostic.
- **Mode instructions** — the **Hebrew phrase** / **Check my English** toggle on the Type and Record tabs is a per-request choice, not a per-space setting. Each base prompt above has a `${modeInstructions}` placeholder, filled in by `translationEngine.js`/`audioEngine.js` with one of two fixed instruction blocks depending on which mode was selected — translate Hebrew, or correct English/mixed input for grammar and phrasing.
- **`dashboard/translation/variantGuidance.txt`** — the instructions for how each of the two English variants should sound. Shared by both prompts above (referenced via a `${variantGuidance}` placeholder each substitutes at request time) so the translation style never drifts between the typed-phrase and audio pipelines.
- **The active space's own rules** (`spaces.rules` in the database) — things like who's speaking, the tone each variant should have, how to resolve a recurring ambiguity, or (for audio) how to identify/clean/chunk that space's recordings specifically. A space with no rules yet is a normal state; both pipelines still work off the base prompts alone. Edited directly in the database — there's no in-app editing flow.

---

## Text-to-speech audio

Tapping 🔊 next to a variant generates spoken audio via Gemini TTS (voice: **Achernar**) the first time only — the file is saved to `dashboard/public/audio-cache/` on whichever machine's server handled the request, and its path is stored in `phrases.tts_url_variant1`/`tts_url_variant2`. Every play after that just serves the cached file, no API call.

A few things worth knowing:

- **The audio lives on disk, not in the database** — a raw audio column would count against Supabase's free-tier storage limit and get pulled along with every ordinary phrase-list query. A text path costs almost nothing either way.
- **`audio-cache/` is gitignored** — it's generated at runtime, not synced via `git push`/`pull`. Local dev and production each build up their own cache independently, on their own disk.
- **Deleting a phrase deletes its cached audio files too**, so nothing lingers with no phrase pointing to it.

---

## Recording & audio processing

The Record tab takes a whole audio recording and turns it into several phrase cards at once — one AI call handles transcription, cleaning, splitting into individual phrases (or sequential chunks, in a `has_order` space), and translation together, using the active space's own rules to know how.

- **~30 minute limit.** Requests are sent inline (embedded directly in the API call) rather than through a separate upload step, which is simpler but size-capped — 60MB of raw audio is the ceiling, comfortably under Gemini's 100MB inline request limit once base64 overhead is factored in. Based on this app's actual recording weight (~1.5MB/minute), that's roughly half an hour. Oversized files are rejected with a clear message rather than silently failing.
- **No audio is ever stored.** Only the resulting text — the cleaned transcript (saved to `transcripts`) and the extracted phrases (saved to `phrases`, same as if typed) — survives past the request.
- **The file picker deliberately accepts more than `audio/*`.** Some phones (Samsung in particular) save voice recordings as `.mp4` but report it as a video MIME type — with a strict `audio/*` filter, the browser's file picker would hide those files entirely, not just refuse them.

---

## Rate limiting & usage caps

A layer protects the Gemini API usage from runaway cost (abuse, a bug, or an abandoned browser tab): **per-route rate limits** (`express-rate-limit`) on `/phrases` (translation) and `/recordings` (audio processing) — capped requests per IP per time window.

---

```
EnglishTutor/
├── dashboard/
│   ├── audio/
│   |   ├── audioEngine.js
│   |   └── audioPrompt.txt
│   ├── public/
│   |   ├── audio-cache/         (gitignored — generated at runtime)
│   |   ├── icons/
│   |   |   ├── icon-192.png
│   |   |   ├── icon-512.png
│   |   |   ├── icon-512-maskable.png
│   |   |   └── loading.svg
│   |   ├── styles/
│   |   ├── app.js
│   |   ├── colorUtils.js
│   |   ├── index.html
│   |   ├── loadingOverlay.js
│   |   ├── manifest.json        (PWA — app name, icons, install behavior)
│   |   ├── newPhrase.js
│   |   ├── phrasesTable.js
│   |   ├── phraseTagFilter.js
│   |   ├── phraseTagPicker.js
│   |   ├── recordingTab.js
│   |   ├── spacesState.js
│   |   ├── sw.js                (PWA — service worker, required for installability)
│   |   ├── tagsMerge.js
│   |   ├── tagsMigrate.js
│   |   ├── tagsSidebar.js
│   |   ├── tagsState.js
│   |   └── transcriptsTab.js
│   ├── routes/
│   |   ├── phrases.route.js
│   |   ├── recordings.route.js
│   |   ├── spaces.route.js
│   |   └── tags.route.js
│   ├── translation/
│   |   ├── translationEngine.js
│   |   ├── translationPrompt.txt
│   |   └── variantGuidance.txt
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
GEMINI_API_KEY=
DATABASE_PASSWORD=
DATABASE_URI_SESSION=
```

Optional overrides (see [Rate limiting & usage caps](#rate-limiting--usage-caps) — sensible defaults are used if omitted):

```
RATE_LIMIT_WINDOW_MINUTES=
TRANSLATE_RATE_LIMIT_MAX=
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
GEMINI_API_KEY=...
DATABASE_PASSWORD=...
DATABASE_URI_SESSION=...
RATE_LIMIT_WINDOW_MINUTES=...
TRANSLATE_RATE_LIMIT_MAX=...
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

**Don't stop there — `manifest.json` and `sw.js` need to stay exempt.** The browser fetches these two files automatically in the background (not through user navigation) to check PWA installability. If they're behind the same Basic Auth as everything else, that background fetch gets a silent `401` and "Add to Home Screen" quietly stops working — the rest of the app still works fine, so this is easy to miss until you specifically try to (re)install it. Add these **above** `location / { }`, inside the same `server` block:

```nginx
    location = /manifest.json {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }

    location = /sw.js {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
```

(`location =` is an exact match and always wins over the general `location /` block, regardless of the order they appear in the file.)

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

**`.env` is NOT part of this flow.** It's gitignored on purpose (see Notes below), so `git pull` never touches it. Any new key a feature needs (like `GEMINI_API_KEY` when text-to-speech was added) has to be added to the server's `.env` **by hand**:

```bash
nano .env
# add the new line, save (Ctrl+O, Enter), exit (Ctrl+X)
pm2 restart phrase-app   # required — a running process doesn't pick up .env changes on its own
```

If something that depends on a new key works locally but fails only in production, check `.env` on the server before assuming the code is wrong — `pm2 logs phrase-app` will usually show the actual error (e.g. a missing-credentials error) right away.

**Nginx config changes never go through PM2.** If you edit `/etc/nginx/sites-available/phrase-app` (e.g. adding another auth-exempt path the way `manifest.json`/`sw.js` were), reload Nginx itself instead:

```bash
nginx -t                   # check syntax before reloading — a bad config
                           # here can take the whole site down
systemctl reload nginx
```

## Useful PM2 commands

```bash
pm2 status              # check if the app is running
pm2 logs phrase-app     # view live logs (Ctrl+C to exit)
pm2 restart phrase-app  # restart after an update
```