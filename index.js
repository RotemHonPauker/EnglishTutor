require('dotenv').config();
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const client = new Client();

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Scan the QR code above with your WhatsApp');
});

client.on('ready', () => {
    console.log('Bot is ready!');
});

client.on('message', async (msg) => {
    const hasHebrew = /[\u0590-\u05FF]/.test(msg.body);
    if (!hasHebrew) return;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: `Translate this Hebrew text to English. Return only the translation:\n\n${msg.body}`
            }]
        });
        await msg.reply(`🇬🇧 ${response.content[0].text}`);
    } catch (err) {
        console.error('Translation error:', err);
    }
});

client.initialize();