# EnglishTutor

# WhatsApp Hebrew Translation Bot

A WhatsApp bot that automatically detects Hebrew messages and translates them to English using the Claude AI API.

---

## Dependencies

| Package             | What it does                                                                         |
| ------------------- | ------------------------------------------------------------------------------------ |
| `whatsapp-web.js`   | Controls WhatsApp Web like a virtual browser — lets your code send/receive messages  |
| `qrcode-terminal`   | Displays the QR code in your terminal so you can scan it with your phone to log in   |
| `@anthropic-ai/sdk` | The official Anthropic library — lets your code talk to Claude's API for translation |
| `dotenv`            | Reads your `.env` file and loads your secret API key into the app safely             |

---

## Installation

```bash
npm install whatsapp-web.js qrcode-terminal @anthropic-ai/sdk dotenv
```

---

## Setup

Create a `.env` file in the root of the project and add your Anthropic API key:

```
ANTHROPIC_API_KEY=your_actual_key_here
```

> ⚠️ Never commit your `.env` file to GitHub. It is already ignored via `.gitignore`.

---

## Usage

```bash
node index.js
```

A QR code will appear in your terminal. Scan it with your phone via WhatsApp (just like linking WhatsApp Web). Once scanned, the bot is live and will automatically translate any Hebrew messages it receives.

---

## How It Works

1. The bot listens for incoming WhatsApp messages
2. It checks if the message contains Hebrew characters
3. If Hebrew is detected, it sends the message to Claude's API for translation
4. The bot replies to the original message with the English translation, prefixed with 🇬🇧

---

## Project Structure

```
EnglishTutor/
├── index.js               ← messaging/event logic only
├── prompts.js             ← AI prompt templates
├── responseHandler.js     ← parsing & formatting Claude's responses
├── botMessages.js         ← bot's own-message detection
├── database.js            ← MongoDB read/write functions
├── .env                   ← your secret API key (do not commit)
└── package.json           ← project configuration
```

---

## Notes

- This project uses `whatsapp-web.js`, an unofficial WhatsApp library. It is intended for personal/internal use only.
- Make sure to keep your `.env` file and WhatsApp session data private.
