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

## How it works

1. **Spaces** — the app always shows exactly one active space, named in the header at the top of every tab. Tap the name to switch to another space, or create a new one. Creating a space asks for its:
   - **type**:
     - **Progression**: learning language in 2 levels of difficulty.
     - **Bridge**: adds a third, reference-only language.
     - **Dictionary**: a standalone word-lookup list.
   - **source/target language** (plus a **bridge language** for Bridge spaces), each chosen from a fixed list so every language's name and code stay consistent everywhere.
   - You can also migrate one space into another — moves its phrases, tags, and transcripts into the target.

2. **Add tab** — a single text input, with three small icon buttons (**⌨️ 📖 🎙️**) plus a **Transcriptions**:
   - **⌨️** (the default):
     - write in the space's source or target language (or a mix — a phrase, a sentence, a short paragraph) and hit Send.
     - which language is detected automatically, so there's nothing to pick beforehand: source-language text gets translated, target-language (or mixed) text gets grammar/phrasing-corrected instead.
     - Saved right away into the shared log.
     - the same AI call also tries to match it to one of the space's existing tags, only when confident (otherwise it's left untagged, and you can always tag or retag it yourself from Practice).
   - **📖**:
     - look up a word in the space's source or target language.
     - doesn't require switching to a dictionary space at all.
     - if more than one dictionary space exists, a quick picker asks which one first (if there's only one, it's used directly; if there are none yet, you're told to create one).
   - **🎙️**:
     - swaps the text input out for two buttons — "Recording in {source language}" and "Recording in {target language}" — telling Gemini up front which language to expect (the one language hint left in the app; typed text doesn't need one).
     - then opens the file picker (up to ~30 minutes).
     - As soon as a recording finishes processing, the view jumps straight to **Transcriptions** with that fresh transcript already expanded.
   - **Transcriptions**:
     - swaps the whole log area over to a list of past recording transcripts
     - tap one to expand/collapse, delete once you're done with it; a nudge appears once more than 3 are saved.
     - Selecting text inside an expanded transcript surfaces an "Add to input" bar — tap it to drop that exact selection into the input (switching to ⌨️ automatically), edit if needed, then Send, same as typing it fresh.
     - Repeat per phrase.

3. **Practice tab** — your full phrase list as cards (progression/bridge spaces only — a dictionary space shows its word list here instead).
   - **A horizontal date strip up top**: (Daily / Weekly / Monthly) jumps to a specific day, week, or month — periods with nothing in them aren't shown, and an "Older" bucket covers anything further back;
   - **Filter by tag**: picking one filters the cards below, combined with the tag filter and a learned/not-learned filter.
   - Each card contains this buttons:
     - **Tag**: Tap to tag your card, applies color to the card.
     - **LeveL/Language code**: Each card shows only its current level's wording — a badge next to the tag toggles which one, independent of learned state: "Level 1"/"Level 2" in a progression space, or the actual language code (e.g. "EN"/"CS") in a bridge space, since there variant_2 is a different language, not a more advanced version of variant_1.
     - 👑: Tap to mark a phrase learned — it stays in the list, just dimmed with a gold accent, nothing disappears.
       repeat listens never call the API again.
     - ✏️: Tap to edit a phrase's wording. Overwrites that phrase in place - same `id`, same `created_at`, same tag. Cached audio is cleared.
     - 🗑️: Tap to delete.
     - 🔊: Tap to hear the shown variant spoken aloud — generated once on first play and cached from then on, so

4. **Analytics tab** — a horizontal stacked-bar chart:
   - one row per day/week/month (same Daily / Weekly / Monthly toggle as Practice), scrolling vertically with the most recent period at the top.
   - A second toggle switches what each bar breaks down by:
     - **By tag**: color-coded per tag, plus a "no tag" segment.
     - **Learned**: how much of what was created in that period is now marked learned vs. not, as of right now.
   - Both toggles group phrases by _when they were added_, not by when they reached their current status.
   - Not shown at all for a dictionary space.

5. **Setup tab** —
   - **Space Setup**: shapes how this space's phrases get transcribed and translated: contains four fields. Each opening one at a time with its own Save/Cancel and a "Copy from..." option to pull that field's content from another space. Not shown at all for a dictionary space
     - _About this space_,
     - two variant-notes fields (labeled _Level 1_/_Level 2_ in a progression space, or the actual target/bridge language names in a bridge space),
     - _Audio Recording_ (transcription notes — background noise, long silences, anything particular to how this space's recordings sound)
   - A flat set of tags per space (chip cloud, each with a color and phrase count; tap one to edit, merge into another tag, or delete).

---

## Stack

| Piece                          | Technology                                         |
| ------------------------------ | -------------------------------------------------- |
| Translation & audio processing | Google Gemini (`gemini-3.6-flash`)                 |
| Text-to-speech                 | Google Gemini TTS (`gemini-3.1-flash-tts-preview`) |
| Database                       | Postgres via Supabase (pgvector enabled)           |
| Server                         | DigitalOcean VPS                                   |
| Process manager                | PM2 (keeps the app alive, restarts on reboot)      |
| Reverse proxy                  | Nginx                                              |
| HTTPS                          | Let's Encrypt via Certbot                          |
| Domain                         | DuckDNS (free dynamic DNS)                         |
| App install                    | PWA (manifest + service worker)                    |

---

## Database

- **`spaces`**
  `id`, `name`,`space_type`, `source_language`, `target_language`, `bridge_language`, `about_this_space`, `variant_1_notes`, `variant_2_notes`, `audio_recording_notes`, `created_at`.

- **`tags`**
  `id`, `name`, `color`, `space_id`, `created_at`.

- **`phrases`**
  `id`, `source_text`, `variant_1`, `variant_2`, `level`, `tag_id`, `learned_at`, `tts_url_variant1`, `tts_url_variant2`, `embedding`, `space_id`, `created_at`.

- **`dictionary`**
  `id`, `space_id`, `source_query`, `word`, `part_of_speech`, `source_synonyms`, `target_synonyms`, `example_sentence`, `learned_at`, `created_at`.

- **`transcripts`**
  `id`, `space_id`, `content`, `created_at`.

---

## Text-to-speech & recording

- Tapping 🔊 next to a variant generates spoken audio via Gemini TTS (voice: **Achernar**) the first time only — the file is saved to `dashboard/public/audio-cache/` on whichever machine's server handled the request, and its path is stored in `phrases.tts_url_variant1`/`tts_url_variant2`. Every play after that just serves the cached file, no API call. Deleting a phrase deletes its cached audio files too, so nothing lingers with no phrase pointing to it.
- While recording is sent no audio is ever stored. Only the resulting transcript text (saved to `transcripts`) survives past the request — nothing else, until a person selects something from it.

---

## Rate limiting & usage caps

A layer protects the Gemini API usage from runaway cost (abuse, a bug, or an abandoned browser tab):

- **per-route rate limits** (`express-rate-limit`) on `/phrases` (translation), `/recordings` (transcription), and `/dictionary/lookup` (word lookups) — capped requests per IP per time window.
- **~30 minute recording limit** Requests are sent inline (embedded directly in the API call) rather than through a separate upload step, which is simpler but size-capped — 60MB of raw audio is the ceiling, comfortably under Gemini's 100MB inline request limit once base64 overhead is factored in. Based on this app's actual recording weight (~1.5MB/minute), that's roughly half an hour. Oversized files are rejected with a clear message rather than silently failing.

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
- Plan: Basic → Regular SSD → 1GB RAM ($6/mo).
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

Now the app is installable to your phone's home screen, where it opens full-screen without browser chrome, like a native app.

To install open the production URL on your phone, then use "Add to Home Screen" (Safari, via the share button) or "Install app" (Chrome, via the ⋮ menu).

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
