import { translatePrompt, suggestCategoriesPrompt } from './prompts.js';
import { parseTranslationResponse, formatTranslationReply } from './responseHandler.js';
import { connectDB, saveSentence, getDistinctCategories } from './database.js';
import { isBotOwnMessage } from './botMessages.js';

import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const client = new Client();
const CHAT_ID = process.env.CHAT_ID;

// Tracks the sentence waiting for a category (persists between messages)
let pendingSentence = null;
let pendingCategoryChoices = null; // holds the suggested categories array
let awaitingNewCategoryName = false;

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Scan the QR code above with your WhatsApp');
});

client.on('ready', async () => {
    console.log('Bot is ready!');
    await connectDB();
});

client.on('disconnected', (reason) => {
    console.log('Bot disconnected:', reason);
    client.initialize();
});

client.on('message_create', async (msg) => {
    // Only respond to messages YOU send
    if (!msg.fromMe) return;

    const chat = await msg.getChat();
    if (chat.id._serialized !== CHAT_ID) return;

    // Skip messages the bot itself sent (avoid infinite loop)
    if (isBotOwnMessage(msg.body)) return;
    console.log('Message received:', msg.body);

    // STATE 1: waiting for a brand new category name
    if (pendingSentence) {
        const category = msg.body.trim();
        await saveSentence({
            hebrew: pendingSentence.hebrew,
            rephrasedHebrew: pendingSentence.rephrased,
            englishTranslation: pendingSentence.translation,
            category
        });
        pendingSentence = null;
        await msg.reply(`✅ Saved under category: "${category}"`);
        return;
    }

    const hasHebrew = /[\u0590-\u05FF]/.test(msg.body);
    if (!hasHebrew) return;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: translatePrompt(msg.body)
            }]
        });

        const result = parseTranslationResponse(response.content[0].text);
        await msg.reply(formatTranslationReply(result));

        pendingSentence = {
            hebrew: msg.body,
            rephrased: result.rephrased,
            translation: result.translation
        };

        await msg.reply('Which category is this? (e.g. dining, bath time, walk)');
    } catch (err) {
        console.error('Translation error:', err);
    }
});

client.initialize();