// Fixed palette offered when picking a tag's color. There's no backend
// anymore to fetch this from (the old GET /colors route is gone, and so
// is dashboard/colors.js), so the palette is just inlined here directly
// — same values as before. COLORS is populated immediately at
// script-load time, so nothing needs to await it anymore. This same
// palette is also duplicated as TAG_COLORS inside remoteDb.js, which
// needs it for migrateSpace's color-collision resolution and can't
// depend on this file loading first — see the comment there.

const DEFAULT_TAG_COLOR = '#ccc';

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

function getTagColor(tagId) {
    if (!tagId) return null;
    const tag = tags.find(t => t.id === tagId);
    return (tag && tag.color) || null;
}