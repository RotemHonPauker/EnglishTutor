import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import Anthropic from '@anthropic-ai/sdk';

import { translatePrompt, suggestCategoriesPrompt } from './prompts.js';
import { connectDB, saveSentence, getDistinctCategories } from './database.js';
import { isBotOwnMessage } from './botMessages.js';
import {
    parseTranslationResponse,
    parseCategorySuggestions,
    formatTranslationReply,
    formatCategoryOptions,
    formatSavedConfirmation,
    formatNewCategoryConfirmation
} from './responseHandler.js';

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
    if (awaitingNewCategoryName) {
        const category = msg.body.trim();
        await saveSentence({
            hebrew: pendingSentence.hebrew,
            rephrasedHebrew: pendingSentence.rephrased,
            englishTranslation: pendingSentence.translation,
            category
        });
        pendingSentence = null;
        awaitingNewCategoryName = false;
        await msg.reply(formatNewCategoryConfirmation(category));
        return;
    }

    // STATE 2: waiting for user to pick option 1/2/3/other
    if (pendingCategoryChoices) {
        const choice = msg.body.trim();
        const choiceIndex = parseInt(choice, 10) - 1;

        if (choiceIndex >= 0 && choiceIndex < pendingCategoryChoices.length) {
            const category = pendingCategoryChoices[choiceIndex];
            await saveSentence({
                hebrew: pendingSentence.hebrew,
                rephrasedHebrew: pendingSentence.rephrased,
                englishTranslation: pendingSentence.translation,
                category
            });
            pendingSentence = null;
            pendingCategoryChoices = null;
            await msg.reply(formatSavedConfirmation(category))
        } else {
            // They chose "create new" (the last number) or typed something invalid
            pendingCategoryChoices = null;
            awaitingNewCategoryName = true;
            await msg.reply('What should the new category be called?');
        }
        return;
    }

    // STATE 3: new sentence — translate it
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

        // Fetch existing categories and ask Claude to suggest relevant ones
        const existingCategories = await getDistinctCategories();
        let suggestions = [];

        if (existingCategories.length > 0) {
            const suggestResponse = await anthropic.messages.create({
                model: 'claude-sonnet-4-6',
                max_tokens: 512,
                messages: [{ 
                    role: 'user', 
                    content: suggestCategoriesPrompt(result.translation, existingCategories) 
                }]
            });
            suggestions = parseCategorySuggestions(suggestResponse.content[0].text);
        }

        pendingCategoryChoices = suggestions;

        // Build the numbered list message
        await msg.reply(formatCategoryOptions(suggestions));
    } catch (err) {
        console.error('Translation error:', err);
    }
});

client.initialize();