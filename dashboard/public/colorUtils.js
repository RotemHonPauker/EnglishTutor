// Fixed palette offered when picking a time slot's color (slots.js). This
// is now the direct source of a slot's visual identity — there's no
// separate Tag entity anymore, so there's no backend to fetch this from
// either (the old GET /colors route is gone, and so is
// dashboard/colors.js); the palette is just inlined here directly. COLORS
// is populated immediately at script-load time, so nothing needs to await
// it. This same palette is also duplicated as MAX_SLOTS_TOTAL's own
// implicit size inside localDb.js (one color per slot, one slot per
// color, 16 of each) — that file can't depend on this one loading first,
// so it just hardcodes the same count rather than importing this array.
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