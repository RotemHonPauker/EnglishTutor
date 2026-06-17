export const BOT_REPLY_PREFIXES = [
    '📝',
    '✅',
    'Which category',
    'Choose a category',
    'What should the new category'
];

export const isBotOwnMessage = (text) => {
    return BOT_REPLY_PREFIXES.some(prefix => text.startsWith(prefix));
}; 
