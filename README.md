# Fraza: Hebrew-English Phrase Capture and Practice App

This isn't about learning English. It's about wanting to speak it — in the actual moment, in your actual day — and getting stuck. The word isn't there. You're not sure the phrasing is right. The sentence breaks halfway through, and with it, your confidence to keep going.

But it doesn't have to happen the same way twice. In your next five free minutes, you write that phrase into the app — and maybe two or three more you already know you'll need for a similar moment tomorrow. At the office, with your colleagues. At the playground, with the daughter you're teaching English to. At the front desk, with the hotel receptionist on your next destination.

Now you had that exact phrase ready, in your pocket.

That's what this app does: capture a Hebrew phrase, get an English translation back, and hear it spoken aloud to practice how it actually sounds. Because context shapes what "the right phrasing" even means, you can also describe the environment you're building vocabulary for — who you're talking to, what tone fits — so translations are shaped around it instead of generic. And since different parts of life call for entirely different vocabularies, the app lets you keep separate environments and switch between them.

*(Technically, "Hebrew" and "English" above are just this app's own default — any space can be set up with a different source/target language pair, or a third reference language for comparing against a language you already know. See [Database](#database) and [How it works](#how-it-works) for the space-type/language model.)*

## What it's for

A few examples of the kind of need this covers:

- **Instilling English in my daughter's everyday life** — playing at the playground, doing crafts together, splashing in the bath, reading her a story.
- **Sounding like myself at work** — chatting over coffee, contributing in meetings, presenting to managers and teams.
- **Getting ready for a trip** — starting conversations with service providers, talking about myself and my life when meeting new people, getting a feel for the local culture and way of life.

This app is deliberately not built for use in the moment itself — not while your hands (and attention) are full. It's built for the five minutes you didn't know you'd have: the line at the supermarket, the gap between meetings, the minute right before or after. That's when a phrase gets captured, or practiced, or refined — never in the middle of the moment it was meant for.

---

## How it works

1. **Spaces** — the app always shows exactly one active space, named in the header at the top of every tab, with a small colored dot next to it: a purely visual, never-enforced nudge for how active that space has been in the last 7 days (green = 3+ phrases, yellow = 1–2, gray = none). Tap the name to switch to another space, or create a new one. Creating a space asks for its **type** — **Progression** (the default: Level 1 → Level 2 of one target language), **Bridge** (adds a third, reference-only language), or **Dictionary** (a standalone word-lookup list, no phrase practice) — and its **source/target language** (plus a **bridge language** for Bridge spaces), each chosen from a fixed list so every language's name and code stay consistent everywhere. A dictionary space's name defaults to "Dictionary (XX→YY)" from its language codes, editable like any name. You can also migrate one space into another — moves its phrases, tags, and transcripts into the target
2. **Dictionary spaces** — just another space type, picked from the same space picker as anything else — not a separate global mode anymore. While one is active, Analytics and Setup are disabled (neither applies), and in the Add tab the icon-button selector is locked onto **📖** (the other two are disabled). Type a word and hit Send: source-language input returns a list of possible target-language translations to choose from (tap one to resolve it); target-language input resolves directly. Either way, once resolved it's saved immediately — word, part of speech, both languages' synonyms, an example sentence — and shown in Practice under the same date strip, learned toggle, and sorting as phrase cards, just with no tags and no 🔊. **Looking a word up doesn't require switching to a dictionary space at all** — tapping **📖** in any space's Add tab routes Send to the same lookup pipeline; if more than one dictionary space exists, a quick picker asks which one first (if there's only one, it's used directly; if there are none yet, you're told to create one). Tap **⌨️** when done. A dictionary space itself is really for browsing its full list — the Add-tab icon from elsewhere is for adding to it on the fly without leaving whatever space you're actually working in
3. **Add tab** — a single text input, with three small icon buttons (**⌨️ 📖 🎙️**) plus a **Transcriptions** text button together in the input box's own footer, next to Send. The three icons are a 3-way selector (exactly one active at a time) deciding what the input is for; there's no label on any of them — tapping one changes the input's placeholder (or swaps it out) to make the choice clear instead. **Transcriptions** stands apart — a standalone action, not part of that selector, and given a text label on purpose rather than a fourth icon, since a row of icons alone started to feel like too much to parse at a glance. (In a dictionary space, only **📖** applies — see above.)
   - **⌨️** (the default): write in the space's source or target language (or a mix — a phrase, a sentence, a short paragraph) and hit Send — which language is detected automatically, so there's nothing to pick beforehand: source-language text gets translated, target-language (or mixed) text gets grammar/phrasing-corrected instead. Saved right away into the shared log — the same AI call also tries to match it to one of the space's existing tags, only when confident (otherwise it's left untagged, and you can always tag or retag it yourself from Practice). No confirmation step, by design.
   - **📖**: the same text input, placeholder swapped to make clear it's a dictionary lookup now — see [Dictionary spaces](#how-it-works) above for where it saves to.
   - **🎙️**: swaps the text input out for two buttons — "Recording in {source language}" and "Recording in {target language}" — telling Gemini up front which language to expect (the one language hint left in the app; typed text doesn't need one). Nothing opens until one of the two is actually tapped, which then opens the file picker (up to ~30 minutes). Picking this also fills the log area above with a large, centered reminder of the limit, instead of a note squeezed next to the input that used to shove it up and down every time it appeared. As soon as a recording finishes processing, the view jumps straight to **Transcriptions** with that fresh transcript already expanded — no extra tap needed to start picking lines from it
   - **Transcriptions**: swaps the whole log area over to a list of past recording transcripts (tap one to expand/collapse, delete once you're done with it; a nudge appears once more than 3 are saved) and dims just the input's content area (the footer buttons stay live, since the button itself becomes **Back**). Selecting text inside an expanded transcript surfaces an "Add to input" bar — tap it to drop that exact selection into the input (switching to ⌨️ automatically), edit if needed, then Send, same as typing it fresh. Repeat per phrase
4. **Practice tab** — your full phrase list as cards (progression/bridge spaces only — a dictionary space shows its word list here instead, see above). A horizontal date strip up top (Daily / Weekly / Monthly) jumps to a specific day, week, or month — periods with nothing in them aren't shown, and an "Older" bucket covers anything further back; picking one filters the cards below, combined with the tag filter and a learned/not-learned filter. Each card shows only its current level's wording — a badge next to the tag toggles which one, independent of learned state: "Level 1"/"Level 2" in a progression space, or the actual language code (e.g. "EN"/"CS") in a bridge space, since there variant_2 is a different language, not a more advanced version of variant_1. Tap the 👑 crown to mark a phrase learned — it stays in the list, just dimmed with a gold accent, nothing disappears, and it doesn't touch which variant is showing. Tap the 🔊 to hear the shown variant spoken aloud — generated once on first play and cached from then on, so repeat listens never call the API again. Tap ✎ to edit a phrase's wording — see [Editing a phrase](#editing-a-phrase)
5. **Analytics tab** — a horizontal stacked-bar chart, one row per day/week/month (same Daily / Weekly / Monthly toggle as Practice), scrolling vertically with the most recent period at the top. A second toggle switches what each bar breaks down by: **By tag** (color-coded per tag, plus a "no tag" segment) or **Learned** (how much of what was created in that period is now marked learned vs. not, as of right now). Both toggles group phrases by *when they were added*, not by when they reached their current status — a note under the chart spells this out
6. **Setup tab** — a flat set of tags per space (chip cloud, each with a color and phrase count; tap one to edit, merge into another tag, or delete), plus a **Space Setup** accordion above it that shapes how this space's phrases get transcribed and translated: four fields — _About this space_, two variant-notes fields (labeled _Level 1_/_Level 2_ in a progression space, or the actual target/bridge language names in a bridge space), and _Audio Recording_ (transcription notes — background noise, long silences, anything particular to how this space's recordings sound) — each opening one at a time with its own Save/Cancel and a "Copy from..." option to pull that field's content from another space. Switching tabs or spaces with an unsaved field left open is blocked with a prompt to discard the change or go back and review it — Save is deliberately never offered directly from that prompt. Not shown at all for a dictionary space (see above)

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

Postgres via Supabase. Five tables:

- **`spaces`**
  - `id` (PK)
  - `name`
  - `space_type` — text, `'progression'` (default), `'bridge'`, or `'dictionary'`. Set once at creation, not editable after — changing a space's language pair midway would make its existing phrases meaningless. Decides what `variant_1`/`variant_2` on this space's phrases even mean, and which UI restrictions apply (see [How it works](#how-it-works))
  - `source_language` / `target_language` — text, e.g. `"Hebrew"`, `"English"`. Chosen at creation from a fixed list (`languages.js` — the frontend fetches it via `GET /languages` rather than keeping its own copy), never free text, so every space's language name and code stay consistent everywhere they're used (prompts, badges, dictionary space names)
  - `bridge_language` — text, `NULL` unless `space_type = 'bridge'`. A third, reference-only language shown alongside the main translation — not a "more advanced" version of anything, just a different language for comparison
  - `about_this_space` — text, `NULL` until set. General background for this space (who's speaking, common topics, terminology)
  - `variant_1_notes` / `variant_2_notes` — text, `NULL` until set. What these mean depends on `space_type`: in a **progression** space, guidance for how Level 1 / Level 2 should specifically sound, layered on top of the shared `variantGuidance.txt`; in a **bridge** space, notes for the target language and the bridge language respectively (the Setup tab relabels the fields accordingly)
  - `audio_recording_notes` — text, `NULL` until set. This space's own transcription notes (background noise, long silences, anything else particular to how its recordings sound) — only read by the audio pipeline, applied to Step 1 (transcribe), since that's the only step a recording still goes through automatically
  - `created_at`

  These fields are edited from the **Setup tab**, not the database directly (see [How it works](#how-it-works)). A **dictionary** space has no Setup tab at all (Analytics and Setup are both disabled while one is active) — its `variant_*`/`audio_recording_notes` fields go unused

- **`tags`** — a flat set of tags per space, no hierarchy
  - `id` (PK)
  - `name`
  - `color`
  - `space_id` (FK → `spaces.id`) — required
  - `created_at`

- **`phrases`** — only exist under `progression`/`bridge` spaces, never `dictionary` ones
  - `id` (PK)
  - `hebrew_text` — the source-language text (name kept as-is; not renamed to something more generic, to limit how many files a purely cosmetic rename would touch)
  - `variant_1` / `variant_2` — two translations. In a **progression** space, both are the target language, shown to the learner as Level 1 and Level 2 (Level 2 a step up in fluency). In a **bridge** space, `variant_1` is the target language and `variant_2` is the bridge language — a separate language, not a more advanced version of `variant_1`. Both are always generated; only one is shown on a card at a time, per that phrase's `level`
  - `level` — smallint, `1` or `2`, default `1`. Which of the two variants the card currently shows — an independent toggle, unrelated to `learned_at`. The level badge shows "Level 1"/"Level 2" in a progression space, or the actual language code (e.g. "EN"/"CS") in a bridge space
  - `tag_id` (FK → `tags.id`) — `NULL` when untagged
  - `mode` — text, `'capture'` or `'check'`; which of the two language-detection branches produced this phrase's wording. `NULL` on phrases saved before this column existed — treated as `'capture'`. Set at creation, and updated when a phrase is edited (see [Editing a phrase](#editing-a-phrase))
  - `learned_at` — timestamptz, `NULL` until marked learned; toggled from the 👑 crown on a phrase card, independent of `level`
  - `tts_url_variant1` / `tts_url_variant2` — text, `NULL` until first played; path to a cached audio file on disk, not the audio itself
  - `embedding` — vector, pgvector, not currently used
  - `space_id` (FK → `spaces.id`) — required on every row
  - `created_at`

- **`transcripts`** — a backup of the cleaned transcript produced when processing a recording (see [Recording & audio processing](#recording--audio-processing)). Only the text is kept, never the original audio
  - `id` (PK)
  - `space_id` (FK → `spaces.id`, `ON DELETE CASCADE`)
  - `content`
  - `created_at`

- **`dictionary`** — space-scoped (`space_type = 'dictionary'`), not global. More than one dictionary space can exist, each with its own `source_language`/`target_language` pair
  - `id` (PK)
  - `space_id` (FK → `spaces.id`) — required; which dictionary this entry belongs to
  - `source_query` — the original source-language word searched, if that's how this entry was found (`NULL` if looked up directly in the target language)
  - `word` — the resolved target-language word
  - `part_of_speech`
  - `source_synonyms` / `target_synonyms` — comma-separated text
  - `example_sentence`
  - `learned_at` — same toggle mechanic as `phrases.learned_at`
  - `created_at`

A one-time migration (`migration_space_types_languages.sql`) adds `space_type`/language columns to `spaces`, moves `dictionary` from a single global list to space-scoped (creating one auto-generated space, "Dictionary (HE→EN)", to hold whatever entries already existed), and renames `dictionary`'s Hebrew/English-specific columns to the generic names above. Every space that existed before the migration becomes `space_type = 'progression'`, Hebrew → English — unchanged in practice.

---

## Prompts: base files + per-space rules

Both translation (typed phrases) and audio processing (recordings) share the same underlying approach — a fixed base prompt, combined with the active space's own rules at request time:

- **`dashboard/translation/translationPrompt.txt`** — the base prompt for typed phrases. Fully language-agnostic now — `${sourceLanguage}`/`${targetLanguage}` placeholders are filled in per-request from the active space's own language pair (input may be either language, or a mix), correct/translate, suggest a tag, output JSON. Plain file, not editable through the app.
- **`dashboard/audio/audioPrompt.txt`** — the base prompt for recordings, same `${sourceLanguage}`/`${targetLanguage}` substitution. Transcription only now (Step 1) — no phrase splitting, translation, or tagging happens here (see [Recording & audio processing](#recording--audio-processing)).
- **`dashboard/translation/variantGuidance.txt`** — in a **progression** space, the instructions for how the two target-language levels should sound, including a "Level Progression" note: Level 2 should feel like a genuine step up in fluency from Level 1, not just an alternate wording of the same difficulty. Not used at all in a **bridge** space — there, `translationEngine.js` builds Step 2 itself (a translation into the target language plus a separate one into the bridge language, explicitly told *not* to treat the second as "more advanced")
- **The active space's own rules**, edited from the Setup tab's fields — _About this space_ fills a `${spaceRulesSection}` placeholder in both prompts (background, terminology, who's speaking); the two variant-notes fields get appended onto Step 2 (meaning depends on space type — see the `spaces` table above), used only by the typed-phrase pipeline; _Audio Recording_ notes fill a `${audioRecordingSection}` placeholder used only in `audioPrompt.txt`'s transcription step. A space with nothing filled in yet is a normal state — the relevant section is simply omitted.
- **Tag suggestion** — the typed-phrase prompt receives the active space's current tag names and asks for a best-fit tag per phrase (`null` if none fit confidently, or if the space has no tags yet). The model is never allowed to invent a tag: its answer is matched case-insensitively against the tags actually fetched for that space, in `translationEngine.js` — anything that doesn't match a real tag (including a hallucinated name) just falls back to untagged
- **Dictionary lookups are a separate pipeline** (`dashboard/dictionary/dictionaryPrompt.txt` via `dictionaryEngine.js`) — no `${spaceRulesSection}`/tags, just the word itself plus the dictionary space's own `${sourceLanguage}`/`${targetLanguage}`. No script-based language detection anymore (that only worked for pairs like Hebrew/English that don't share an alphabet) — the model is told explicitly which two languages the dictionary is between and decides which side the query is on from that. Returns one of two JSON shapes: a disambiguation list (source-language input) or the full definition directly (target-language input, including a word just chosen from that list)

---

## Text-to-speech audio

Tapping 🔊 next to a variant generates spoken audio via Gemini TTS (voice: **Achernar**) the first time only — the file is saved to `dashboard/public/audio-cache/` on whichever machine's server handled the request, and its path is stored in `phrases.tts_url_variant1`/`tts_url_variant2`. Every play after that just serves the cached file, no API call.

A few things worth knowing:

- **The audio lives on disk, not in the database** — a raw audio column would count against Supabase's free-tier storage limit and get pulled along with every ordinary phrase-list query. A text path costs almost nothing either way.
- **`audio-cache/` is gitignored** — it's generated at runtime, not synced via `git push`/`pull`. Local dev and production each build up their own cache independently, on their own disk.
- **Deleting a phrase deletes its cached audio files too**, so nothing lingers with no phrase pointing to it.

---

## Editing a phrase

Tapping ✎ on a phrase card takes you to the Add tab with that phrase's Hebrew text pre-filled and a banner showing what's being edited (with a ✕ Cancel to back out without saving). Editing the text and hitting Send re-translates it through the same engine as a fresh capture, then overwrites that phrase **in place** — same row, same `id`, same `created_at` — rather than creating a new card.

- **The tag is left untouched.** Same as a plain create, tagging stays entirely table-driven — editing wording never changes or re-suggests a tag.
- **Cached audio is cleared.** The old 🔊 files no longer match the new wording, so they're deleted and `tts_url_variant1`/`tts_url_variant2` reset to `NULL` — the next tap regenerates fresh audio for the new text.
- **Typed text detects its own language.** `translationPrompt.txt` decides for itself whether a phrase is Hebrew or English/mixed (Step 1) and returns which it detected — stored in `phrases.mode`, same column as before, just filled in by the model now instead of a toggle the person set. Recordings are the exception: picking 🎙️ in the Add tab shows two explicit buttons, "Recording in Hebrew" and "Recording in English" — Gemini still gets a real hint about which language it's listening for before transcribing, one of them has to be tapped before the file picker even opens.

---

## Recording & audio processing

The recording path in the Add tab does exactly one thing: transcribe. No phrases are created automatically, and no translation or tagging happens on a recording — those only ever run on a phrase a person actually chose (typed, or selected out of a transcript), through the same pipeline described above under [Prompts](#prompts-base-files--per-space-rules).

- **Why:** phrase splitting and translation used to run automatically over the whole recording, which meant paying — in tokens, and in after-the-fact cleanup — for every aside, filler word, or repeated reaction Gemini decided to carve into its own card. Splitting "what's worth keeping" out into a manual step removes that cost entirely: nothing gets translated unless it was picked.
- **Selecting from a transcript.** Opening **Transcriptions** and selecting text inside an expanded transcript body (the phone's normal long-press selection) surfaces an "Add to input" bar; tapping it drops that exact selection into the Add tab's input, switching back to ⌨️ so it can be edited and sent like any typed phrase. Repeat per phrase.
- **The space's own Audio Recording notes still apply.** Background noise to expect, long silences, anything particular to how a space's recordings sound — set from the Setup tab, folded into Step 1 (transcribe) only. Nothing about phrase splitting belongs there anymore, since that step no longer exists.
- **~30 minute limit.** Requests are sent inline (embedded directly in the API call) rather than through a separate upload step, which is simpler but size-capped — 60MB of raw audio is the ceiling, comfortably under Gemini's 100MB inline request limit once base64 overhead is factored in. Based on this app's actual recording weight (~1.5MB/minute), that's roughly half an hour. Oversized files are rejected with a clear message rather than silently failing.
- **No audio is ever stored.** Only the resulting transcript text (saved to `transcripts`) survives past the request — nothing else, until a person selects something from it.
- **The file picker deliberately accepts more than `audio/*`.** Some phones (Samsung in particular) save voice recordings as `.mp4` but report it as a video MIME type — with a strict `audio/*` filter, the browser's file picker would hide those files entirely, not just refuse them.

---

## Rate limiting & usage caps

A layer protects the Gemini API usage from runaway cost (abuse, a bug, or an abandoned browser tab): **per-route rate limits** (`express-rate-limit`) on `/phrases` (translation), `/recordings` (transcription), and `/dictionary/lookup` (word lookups) — capped requests per IP per time window.

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