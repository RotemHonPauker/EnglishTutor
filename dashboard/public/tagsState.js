let tags = [];

const COLORS = [
    '#AD1457', '#D81B60', '#E67C73', '#F4511E', 
    '#F09300', '#F6BF26', '#7CB342', '#0B8043', 
    '#009688', '#33B679', '#039BE5', '#3F51B5', 
    '#B39DDB', '#9E69AF', '#8E24AA', '#795548'
];

async function loadTags() {
    const res = await fetch(`/tags?spaceId=${activeSpaceId}`);
    tags = await res.json();
    if (typeof renderTable === 'function') renderTable();
    renderSidebar();
}