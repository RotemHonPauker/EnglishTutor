const DEFAULT_TAG_COLOR = '#ccc';

// The fixed palette offered when picking a tag's color (used by tags.js).
// Fetched once from the backend (the actual source of truth, colors.js)
// rather than kept as a second hardcoded copy here — same pattern as
// languagesUtils.js's LANGUAGES. Starts empty and is filled in by
// loadColors(), called once from app.js's window.onload.
let COLORS = [];

async function loadColors() {
    try {
        const res = await fetch('/colors');
        COLORS = await res.json();
    } catch (err) {
        console.error('Failed to load colors:', err);
    }
}

function getContrastColor(hex) {
    if (!hex) return '#ccc';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
}

function getTagColor(tagId) {
    if (!tagId) return null;
    const tag = tags.find(t => t.id === tagId);
    return (tag && tag.color) || null;
}