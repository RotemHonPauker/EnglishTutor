# Fraza: Real-World Language Companion

**Capture the phrases you actually need. Express yourself naturally.**

Fraza is built for learners who already have a basic grasp of a language, helping them overcome the hurdle of getting stuck on real-life phrasing. Instead of teaching grammar or pronunciation from scratch, the app lets you capture flashcards from short typed notes, word lookups, or hands-free voice recordings up to 30 minutes long. Custom AI prompts automatically generate dual translations tailored to your preferred tone, register, or even a third reference language. You can organize your phrases into dedicated spaces — such as work, parenting, or travel — with custom tags and personal prompts. With an integrated personal dictionary and smart transcript filtering, Fraza turns your everyday routine into a tailored vocabulary collection.

---

## Contents

- [📱 Screenshots](#-screenshots)
- [🔧 How it works](#-how-it-works)
  - [🌍 Spaces](#-spaces)
  - [➕ Add tab](#-add-tab)
  - [📋 Practice tab](#-practice-tab)
  - [📊 Analytics tab](#-analytics-tab)
  - [🔩 Setup tab](#-setup-tab)
- [🧱 Stack](#-stack)
- [💾 Backup](#-backup)
- [🔑 Keys, and what actually protects your data](#-keys-and-what-actually-protects-your-data)
- [🚀 Setup](#-setup)
  - [1. Get a Gemini API key](#1-get-a-gemini-api-key)
  - [2. Open the app and install it](#2-open-the-app-and-install-it)

---

## 📱 Screenshots

<p align="center">
  <img src="screenshots/Screenshot_spaces_list.jpg" width="23%" />
  <img src="screenshots/Screenshot_spaces_progression.jpg" width="23%" />
  <img src="screenshots/Screenshot_spaces_bridge.jpg" width="23%" />
  <img src="screenshots/Screenshot_add_recording.jpg" width="23%" />
</p>
<p align="center">
  <img src="screenshots/Screenshot_add_transcript.jpg" width="23%" />
  <img src="screenshots/Screenshot_add_type.jpg" width="23%" />
  <img src="screenshots/Screenshot_practice_cards.jpg" width="23%" />
  <img src="screenshots/Screenshot_practice_filter.jpg" width="23%" />
</p>
<p align="center">
  <img src="screenshots/Screenshot_practice_dictionary.jpg" width="23%" />
  <img src="screenshots/Screenshot_analysis.jpg" width="23%" />
  <img src="screenshots/Screenshot_setup_rules.jpg" width="23%" />
  <img src="screenshots/Screenshot_setup_tags.jpg" width="23%" />
</p>

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
- **Mode mismatch check**: if what you typed doesn't match the selected icon (a single word while ⌨️ Type is active, or a full phrase while 📖 Dictionary is active), a quick prompt offers to send it the other way instead — catches the easy mistake of forgetting which mode is selected.
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
- **Select**: a toolbar toggle for multi-select — pick several cards, then **Move to...** moves them all into another space at once. Level and learned status carry over; tags don't, since a tag belongs to the space you're leaving.

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

- **Appearance** — switch between **🌙 Dark** (default) and **☀️ Light** mode.
- **Backup** — export or import all your data. See [💾 Backup](#-backup) below.
- **Space Setup** this is where you help sharpen the translations: each field you fill in becomes part of the AI prompt that shapes this space's transcription and translation. Four fields, each opening one at a time with its own Save/Cancel and a "Copy from..." option to pull that field's content from another space:
  - **About this space** — who's speaking, common topics, and terminology particular to this space, so translations sound like they belong in it.
  - **Level 1 / Level 2** (labeled with the actual target/bridge language names in a Bridge space) — how each level should sound: Level 1 sets the baseline phrasing, Level 2 a step up in fluency from it. In a Bridge space, the second field shapes how that reference-language translation should sound so that it actually helps you learn the target language.
  - **Audio Recording** — anything that helps transcribe this space's recordings accurately: background noise to expect, long silences, or other quirks particular to how you record.
- **Tags** — a flat set of tags per space (a chip cloud, each with a color and phrase count). Tap one to edit it, merge it into another tag, or delete it.

---

## 🧱 Stack

| Piece                           | Technology                                                   |
| -------------------------------- | -------------------------------------------------------------- |
| Translation & audio processing  | Google Gemini (`gemini-3.6-flash`), called straight from the browser |
| Text-to-speech                  | Google Gemini TTS (`gemini-3.1-flash-tts-preview`), called straight from the browser |
| Storage                         | IndexedDB, built into the browser — nothing leaves this device unless you export it |
| Hosting                         | Any static file host (GitHub Pages, Netlify, or your own computer for local use) — plain HTML/CSS/JS, no build step, no server process |
| App install                     | PWA (manifest + service worker)                                |

---

## 💾 Backup
There's no backend at all, and no database to set up — the app is a set of static files, and your data lives only in this device's browser storage. On first launch on any device, it asks once for your Gemini API key, and remembers it on that device from then on (see [🔑 Keys, and what actually protects your data](#-keys-and-what-actually-protects-your-data))

Since your data lives only on this device, **Backup** (in the Setup tab) is the only way it ever moves anywhere else. Two reasons you'd use it:

- **A safety copy** — in case you clear your browser's data, lose the device, or something goes wrong. Export every so often and keep the file somewhere safe (email it to yourself, save it to Drive, etc.).
- **Switching devices** — export on the old device, then import that same file on the new one, to carry everything over.

**Export** reads everything — every space, tag, phrase, dictionary entry, and transcript — and downloads it as a single `.json` file, then opens your mail app with a draft reminding you to attach it. Browsers can't attach a downloaded file to an email automatically, so you still need to attach it yourself from Downloads if you're sending it somewhere.

**Import** reads a file produced this way and restores it onto this device. It's meant for restoring into a fresh install, not for merging two devices that have each been used independently: importing overwrites any existing row that shares an ID with the file, rather than combining them. If you've used two devices separately and want everything in one place, there's no automatic way to merge them — you'd need to pick one device's data as the one to keep.

---

## 🔑 Keys, and what actually protects your data

Your Gemini API key lives only in this device's browser storage (`localStorage`), never in the repo. It isn't encrypted beyond that.

**How someone could actually get it:**

1. **A rooted/jailbroken phone** — breaks the OS sandbox that normally keeps one app from reading another app's storage.
2. **A malicious browser extension** — installed in the same browser, with permission to read page content.
3. **Physical access to an unlocked phone, or forensic recovery tools** — reads device storage directly.

Put simply: it can't be stolen unless your phone is already compromised (rooted/jailbroken) or physically in someone else's hands. Short of that, the browser itself is what keeps it safe — every website gets its own completely isolated storage, so no *other* app on your phone and no *other* website you visit can ever read Fraza's `localStorage`. Installing Fraza as a PWA doesn't change any of this — it still runs inside the browser's engine, under that same storage isolation, like any website.

The same is true of your actual data — your phrases, tags, transcripts — which also lives only in this device’s browser storage (IndexedDB), nowhere else, while the recording itself is never stored anywhere at all, only the resulting transcript text is kept.

---

## 🚀 Setup

Total setup time: roughly 2 minutes. Nothing to install on a computer, no account to create — just a key and a link.

### 1. Get a Gemini API key

- Go to **aistudio.google.com** → **API Keys** in the left sidebar → **Create API Key** (pick or create a Google Cloud project if prompted).
- You'll paste this into the app itself in step 2 — it isn't needed anywhere else.

### 2. Open the app and install it

- Open **[rotemhonpauker.github.io/EnglishTutor](https://rotemhonpauker.github.io/EnglishTutor/)** on your phone (or computer).
- The first time, it asks for your Gemini API key — paste the one from step 1. It's saved on this device and won't ask again.
- To install it as an app on your phone: "Add to Home Screen" (Safari, via the share button) or "Install app" (Chrome, via the ⋮ menu). It opens full-screen from then on, like a native app.
- Repeat this once per new device (phone, another computer) — nothing carries over between devices on its own, except what you move yourself with **Backup** (export on the old device, import on the new one — see [💾 Backup](#-backup) above).