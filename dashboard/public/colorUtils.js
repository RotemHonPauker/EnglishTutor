// Fixed palette for a time slot's color (slots.js). Size must match
// localDb.js's MAX_SLOTS_TOTAL.
const COLORS = [
    '#AD1457', '#D81B60', '#E67C73', '#F4511E',
    '#F09300', '#F6BF26', '#7CB342', '#0B8043',
    '#009688', '#33B679', '#039BE5', '#3F51B5',
    '#B39DDB', '#9E69AF', '#8E24AA', '#795548'
];

function getContrastColor(hex) {
    if (!hex) return '#ccc';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
}