export const BOT_REPLY_PREFIXES = [
    '📝',
    '🇬🇧',
    '1.',
];

export const isBotOwnMessage = (text) => {
    return BOT_REPLY_PREFIXES.some(prefix => text.startsWith(prefix));
}; 
