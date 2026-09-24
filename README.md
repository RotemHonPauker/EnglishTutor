# Fraza: Hebrew-English Phrase Capture and Practice App

This isn't about learning English. It's about wanting to speak it — in the actual moment, in your actual day — and getting stuck. The word isn't there. You're not sure the phrasing is right. The sentence breaks halfway through, and with it, your confidence to keep going.

But it doesn't have to happen the same way twice. In your next five free minutes, you write that phrase into the app — and maybe two or three more you already know you'll need for a similar moment tomorrow. At the office, with your colleagues. At the playground, with the daughter you're teaching English to. At the front desk, with the hotel receptionist on your next destination.

Now you had that exact phrase ready, in your pocket.

That's what this app does: capture a Hebrew phrase, get an English translation back, and hear it spoken aloud to practice how it actually sounds. Because context shapes what "the right phrasing" even means, you can also describe the environment you're building vocabulary for — who you're talking to, what tone fits — so translations are shaped around it instead of generic. And since different parts of life call for entirely different vocabularies, the app lets you keep separate environments and switch between them.

_(Technically, "Hebrew" and "English" above are just this app's own default — any space can be set up with a different source/target language pair, or a third reference language for comparing against a language you already know. See [Database](#database) and [How it works](#how-it-works) for the space-type/language model.)_

## What it's for

A few examples of the kind of need this covers:

- **Instilling English in my daughter's everyday life** — playing at the playground, doing crafts together, splashing in the bath, reading her a story.
- **Sounding like myself at work** — chatting over coffee, contributing in meetings, presenting to managers and teams.
- **Getting ready for a trip** — starting conversations with service providers, talking about myself and my life when meeting new people, getting a feel for the local culture and way of life.

This app is deliberately not built for use in the moment itself — not while your hands (and attention) are full. It's built for the five minutes you didn't know you'd have: the line at the supermarket, the gap between meetings, the minute right before or after. That's when a phrase gets captured, or practiced, or refined — never in the middle of the moment it was meant for.

---

## Contents

- [🔧 How it works](#-how-it-works)
  - [🌍 Spaces](#-spaces)
  - [➕ Add tab](#-add-tab)
  - [📋 Practice tab](#-practice-tab)
  - [📊 Analytics tab](#-analytics-tab)
  - [🔩 Setup tab](#-setup-tab)
- [🧱 Stack](#-stack)
- [🔊 Text-to-speech & recording privacy](#-text-to-speech--recording-privacy)
- [🚦 Rate limiting & usage caps](#-rate-limiting--usage-caps)
- [🚀 Deploying from scratch](#-deploying-from-scratch)
  - [1. Create the database (Supabase)](#1-create-the-database-supabase)
  - [2. Create the VPS](#2-create-the-vps)
  - [3. Generate an SSH key](#3-generate-an-ssh-key-on-your-own-computer-one-time-only)
  - [4. Connect to the server](#4-connect-to-the-server)
  - [5. Install core software on the server](#5-install-core-software-on-the-server)
  - [6. Clone the repo and configure environment](#6-clone-the-repo-and-configure-environment)
  - [7. Start the app with PM2](#7-start-the-app-with-pm2)
  - [8. Point a domain at the server](#8-point-a-domain-at-the-server-duckdns-free)
  - [9. Install and configure Nginx](#9-install-and-configure-nginx-as-a-reverse-proxy)
  - [10. Add HTTPS with Certbot](#10-add-https-with-certbot)
  - [11. Add Basic Auth](#11-add-basic-auth-password-protect-the-whole-app)
  - [12. Verify](#12-verify)
- [🔄 Updating the live app after making changes](#-updating-the-live-app-after-making-changes)

---

## 🔧 How it works

### 🌍 Spaces

The app always shows exactly one active space, named in the header at the top of every tab. Tap the name to switch to another space, or create a new one. Creating a space asks for:

- **Type**:
  - **Progression** — practice one language at two levels of fluency, simple and advanced. Good for steady, ongoing vocabulary building in a single target language.
  - **Bridge** — translate into your target language, plus a separate reference language. Useful when you're starting a new language and want extra help from another one you already know.
  - **📖 Dictionary** — a standalone word-lookup list: look up individual words and save their definitions, synonyms, and an example sentence.
- **Source/target language** (plus a **bridge language** for Bridge spaces), each chosen from a fixed list so every language's name and code stay consistent everywhere.

You can also **⇄ migrate** one space into another — this moves its phrases, tags, and transcripts into the target space.

### ➕ Add tab

A single text input, with three small icon buttons (**⌨️ 📖 🎙️**) plus a **Transcriptions** toggle.

- **⌨️ Type** (the default):
  - Write in the space's source or target language (or a mix — a phrase, a sentence, a short paragraph) and hit Send.
  - The language is detected automatically, so there's nothing to pick beforehand: source-language text gets translated, target-language (or mixed) text gets grammar/phrasing-corrected instead.
  - Saved right away into the **capture log**.
  - The same AI call also tries to match it to one of the space's existing tags, only when confident — otherwise it's left untagged, and you can always tag or retag it yourself from Practice.
- **📖 Dictionary**:
  - Look up a word in the space's source or target language.
  - Doesn't require switching to a dictionary space at all.
  - If more than one dictionary space exists, a quick picker asks which one first (if there's only one, it's used directly; if there are none yet, you're told to create one).
- **🎙️ Record**:
  - Swaps the text input out for two buttons — "Recording in {source language}" and "Recording in {target language}" — telling Gemini up front which language to expect, making it easier to identify correctly in audio. Typed text doesn't need this hint, since the language is already obvious from the text itself.
  - Then opens the file picker to select a recording of up to ~30 minutes.
  - As soon as a recording finishes processing, the view jumps straight to **Transcriptions** with that fresh transcript already expanded.
- **Transcriptions**:
  - Swaps the whole capture log area over to a list of past recording transcripts.
  - Tap one to expand/collapse it, or delete it once you're done; a nudge appears once more than 3 are saved.
  - Selecting text inside an expanded transcript surfaces an "Add to input" bar — tap it to drop that exact selection into the input (switching to ⌨️ automatically), edit if needed, then Send, same as typing it fresh.
  - Repeat per phrase.

### 📋 Practice tab

Your full phrase list as cards — in a dictionary space, each card is a looked-up word instead of a phrase.

- **A horizontal date strip up top** (Daily / Weekly / Monthly): jumps to a specific day, week, or month. The strip covers the most recent 30 days/weeks/months (periods with nothing in them are skipped, so it's not always a full 30 pills) — anything before that falls into a single "Older" bucket at the start. Works the same in a dictionary space.
- **Filters**: a learned/not-learned filter always applies; a tag filter is layered on top of it in progression/bridge spaces (dictionary entries aren't tagged).
- **Progression/Bridge cards** have these buttons:
  - **Tag**: tap to tag the card — applies the tag's color to the whole card.
  - **Level / Language code**: each card shows only its current level's wording. A badge next to the tag toggles which one, independent of learned state — "Level 1"/"Level 2" in a progression space, or the actual language code (e.g. "EN"/"CS") in a bridge space, since there variant 2 is a different language, not a more advanced version of variant 1.
  - **👑**: tap to mark a phrase learned — it stays in the list, just dimmed with a gold accent; nothing disappears.
  - **✏️**: tap to edit a phrase's wording. Overwrites that phrase in place — same `id`, same `created_at`, same tag. Cached audio is cleared.
  - **🗑️**: tap to delete.
  - **🔊**: tap to hear the shown variant spoken aloud — generated once on first play and cached from then on, so repeat listens never call the API again.
- **Dictionary cards** show the word itself, its part of speech, synonyms in both languages, and an example sentence — with just two buttons:
  - **👑**: tap to mark a word learned, same as a phrase.
  - **🗑️**: tap to delete.

### 📊 Analytics tab

A horizontal stacked-bar chart.

- One row per day/week/month (same Daily / Weekly / Monthly toggle as Practice), scrolling vertically with the most recent period at the top.
- A second toggle switches what each bar breaks down by:
  - **By tag**: color-coded per tag, plus a "no tag" segment.
  - **Learned**: how much of what was created in that period is now marked learned vs. not, as of right now.
- Both toggles group phrases by _when they were added_, not by when they reached their current status.
- Not shown at all for a dictionary space.

### 🔩 Setup tab

Not shown at all for a dictionary space.

- **Space Setup** this is where you help sharpen the translations: each field you fill in becomes part of the AI prompt that shapes this space's transcription and translation. Four fields, each opening one at a time with its own Save/Cancel and a "Copy from..." option to pull that field's content from another space:
  - **About this space** — who's speaking, common topics, and terminology particular to this space, so translations sound like they belong in it.
  - **Level 1 / Level 2** (labeled with the actual target/bridge language names in a Bridge space) — how each level should sound: Level 1 sets the baseline phrasing, Level 2 a step up in fluency from it. In a Bridge space, the second field shapes how that reference-language translation should sound so that it actually helps you learn the target language.
  - **Audio Recording** — anything that helps transcribe this space's recordings accurately: background noise to expect, long silences, or other quirks particular to how you record.
- **Tags** — a flat set of tags per space (a chip cloud, each with a color and phrase count). Tap one to edit it, merge it into another tag, or delete it.

---

## 🧱 Stack

| Piece                          | Technology                                         |
| ------------------------------ | -------------------------------------------------- |
| Translation & audio processing | Google Gemini (`gemini-3.6-flash`)                 |
| Text-to-speech                 | Google Gemini TTS (`gemini-3.1-flash-tts-preview`) |
| Database                       | Postgres via Supabase                              |
| Server                         | DigitalOcean VPS                                   |
| Process manager                | PM2 (keeps the app alive, restarts on reboot)      |
| Reverse proxy                  | Nginx                                              |
| HTTPS                          | Let's Encrypt via Certbot                          |
| Domain                         | DuckDNS (free dynamic DNS)                         |
| App install                    | PWA (manifest + service worker)                    |

---

## 🔊 Text-to-speech & recording privacy

- Tapping 🔊 next to a variant generates spoken audio via Gemini TTS (voice: **Achernar**) the first time only — the file is saved to `dashboard/public/audio-cache/` on whichever machine's server handled the request, and its path is stored in `phrases.tts_url_variant1`/`tts_url_variant2`. Every play after that just serves the cached file, no API call. Deleting a phrase deletes its cached audio files too, so nothing lingers with no phrase pointing to it.
- A recording itself is never stored — only the resulting transcript text (saved to `transcripts`) survives past the request, and nothing else, until you select something from it.

---

## 🚦 Rate limiting & usage caps

A layer protects Gemini API usage from runaway cost (abuse, a bug, or an abandoned browser tab):

- **Per-route rate limits** (`express-rate-limit`) on `/phrases` (translation), `/recordings` (transcription), and `/dictionary/lookup` (word lookups) — capped requests per IP per time window.
- **~30-minute recording cap** — recordings are sent inline (embedded directly in the API call) rather than through a separate upload step, which is simpler but size-capped: 60MB of raw audio is the ceiling, comfortably under Gemini's 100MB inline-request limit once base64 overhead is factored in. Based on this app's actual recording weight (~1.5MB/minute), that's roughly half an hour. Oversized files are rejected with a clear message rather than silently failing.

---

```
EnglishTutor/
├── dashboard/
│   ├── audio/
│   |   ├── audioEngine.js
│   |   └── audioPrompt.txt
│   ├── dictionary/
│   |   ├── dictionaryEngine.js
│   |   └── dictionaryPrompt.txt
│   ├── public/
│   |   ├── audio-cache/         (gitignored — generated at runtime)
│   |   ├── icons/
│   |   ├── styles/
│   |   ├── analyticsChart.js
│   |   ├── app.js
│   |   ├── captureTab.js
│   |   ├── colorUtils.js
│   |   ├── dictionary.js
│   |   ├── index.html
│   |   ├── languagesUtils.js
│   |   ├── loadingOverlay.js
│   |   ├── manifest.json        (PWA — app name, icons, install behavior)
│   |   ├── phrasesTable.js
│   |   ├── practiceDateScroll.js
│   |   ├── spaceRules.js
│   |   ├── spacesState.js
│   |   ├── sw.js                (PWA — service worker, required for installability)
│   |   └── tags.js
│   ├── routes/
│   |   ├── dictionary.route.js
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
├── colors.js
├── database.js
├── languages.js
├── package.json
└── README.md
```

---

## 🚀 Deploying from scratch

This is the exact sequence used to get from nothing to the live app on your phone. Total time: roughly one hour.

### 1. Create the database (Supabase)

- Provider: supabase.com → New project
- Choose a project name, a strong database password (save it — this becomes part of `DATABASE_URI_SESSION` in a later step), and a region close to your server
- Once the project is ready, open **SQL Editor → New query**, paste the following, and run it — this creates all five tables the app needs:

```sql
CREATE TABLE spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    space_type TEXT NOT NULL DEFAULT 'progression',
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    bridge_language TEXT,
    about_this_space TEXT,
    variant_1_notes TEXT,
    variant_2_notes TEXT,
    audio_recording_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE phrases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE SET NULL,
    source_text TEXT NOT NULL,
    variant_1 TEXT,
    variant_2 TEXT,
    level INTEGER NOT NULL DEFAULT 1,
    learned_at TIMESTAMPTZ,
    tts_url_variant1 TEXT,
    tts_url_variant2 TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dictionary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    source_query TEXT,
    word TEXT NOT NULL,
    part_of_speech TEXT,
    source_synonyms TEXT,
    target_synonyms TEXT,
    example_sentence TEXT,
    learned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    content TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- From **Settings → Database → Connection string**, copy the **Session pooler** URI (not Transaction mode — the app keeps a long-lived pool, which needs session mode). This becomes `DATABASE_URI_SESSION` in a later step.

### 2. Create the VPS

- Provider: DigitalOcean → Create → Droplet
- Image: Ubuntu 24.04 LTS
- Plan: Basic → Regular SSD → 1GB RAM ($6/mo).
- Authentication: SSH key (generate locally first if you don't have one — see step 3)
- Leave Volumes, Backups, IPv6, and Managed Database unchecked
- Note the assigned public IP address after creation

### 3. Generate an SSH key (on your own computer, one time only)

Windows PowerShell:

```powershell
ssh-keygen -t ed25519 -C "phrase-app"
```

Accept the default file location, empty passphrase is fine for personal use. Copy the public key to add to DigitalOcean:

```powershell
cat $env:USERPROFILE\.ssh\id_ed25519.pub
```

**Back this up** — copy the `.ssh` folder somewhere safe (e.g. a password manager or encrypted drive). Losing the private key means losing SSH access (recoverable via DigitalOcean's browser-based Console + adding a new key, but inconvenient).

### 4. Connect to the server

```bash
ssh root@<server-ip>
```

Type `yes` to accept the host fingerprint on first connection.

### 5. Install core software on the server

```bash
apt update && apt upgrade -y
# If asked about sshd_config during upgrade: keep the local version currently installed

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v && npm -v   # sanity check

apt install -y git
npm install -g pm2
```

### 6. Clone the repo and configure environment

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

`RATE_LIMIT_WINDOW_MINUTES` and `TRANSLATE_RATE_LIMIT_MAX` are optional — `limitsConfig.js` already falls back to sensible defaults (15 minutes, 30 requests) if they're left out.

### 7. Start the app with PM2

```bash
pm2 start dashboard/server.js --name phrase-app
pm2 status              # confirm "online"
pm2 startup              # sets up auto-start on reboot (may run automatically in recent PM2 versions)
pm2 save                 # freezes the current process list for restart-on-boot
```

### 8. Point a domain at the server (DuckDNS, free)

1. Go to duckdns.org, log in, complete the reCAPTCHA
2. Add a subdomain (e.g. `phrase-app`) → this gives you `phrase-app.duckdns.org`
3. Set its IP field to the server's public IP, click "update ip"
4. Verify from your computer: `ping phrase-app.duckdns.org` should resolve to the server IP

### 9. Install and configure Nginx as a reverse proxy

```bash
apt install -y nginx certbot python3-certbot-nginx

nano /etc/nginx/sites-available/phrase-app
```

Paste:

```nginx
server {
    listen 80;
    server_name phrase-app.duckdns.org;

    client_max_body_size 100M;  # default is 1MB — far too small for a base64-encoded recording

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

### 10. Add HTTPS with Certbot

```bash
certbot --nginx -d phrase-app.duckdns.org
```

Follow the prompts (email, agree to terms, decline EFF email sharing if you like). Certbot automatically rewrites the Nginx config to add the SSL server block and an HTTP→HTTPS redirect, and sets up auto-renewal (certificates renew every 90 days without manual action).

### 11. Add Basic Auth (password-protect the whole app)

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

### 12. Verify

Open `https://phrase-app.duckdns.org` in an incognito/private browser window — you should be prompted for the username/password before anything loads.

Now the app is installable to your phone's home screen, where it opens full-screen without browser chrome, like a native app.

To install open the production URL on your phone, then use "Add to Home Screen" (Safari, via the share button) or "Install app" (Chrome, via the ⋮ menu).

---

## 🔄 Updating the live app after making changes

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
