let tags = [];

const COLORS = [
    '#8DB600', '#875692', '#E25822', '#A1CAF1',
    '#BE0032', '#C2B280', '#848482', '#008856',
    '#E68FAC', '#0067A5', '#F99379', '#654522',
    '#F6A600', '#B3446C', '#DCD300', '#882D17'
];

async function loadTags() {
    const res = await fetch('/tags');
    tags = await res.json();
    renderSidebar();
}