import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import Anthropic from '@anthropic-ai/sdk';

import { translatePrompt } from './prompts.js';
import { connectDB, saveSentence } from './database.js';
import { isBotOwnMessage } from './botMessages.js';
import {parseTranslationResponse, formatTranslationReply} from './responseHandler.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const client = new Client();
const CHAT_ID = process.env.CHAT_ID;

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

        await saveSentence({
            hebrewText: result.correctedHebrew,
            variant1: result.variant1,
            variant2: result.variant2
        });

    } catch (err) {
        console.error('Translation error:', err);
    }
});

client.initialize();