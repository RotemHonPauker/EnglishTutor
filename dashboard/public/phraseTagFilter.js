let filterMainIds = new Set();
let filterSubtagIds = new Set();

// A phrase matches the tag filter if no tag filter is active, if its own
// subtag was picked individually, or if its subtag's parent (main tag) was
// picked as a whole group — multiple selections combine with OR, same as
// picking several statuses would.
function phraseMatchesTagFilter(phrase) {
    if (filterMainIds.size === 0 && filterSubtagIds.size === 0) return true;
    if (filterSubtagIds.has(phrase.subtag_id)) return true;
    const subtag = tags.find(t => t.id === phrase.subtag_id);
    return !!(subtag && filterMainIds.has(subtag.parent_id));
}

function openTagFilterModal() {
    renderTagFilterModal();
    document.getElementById('tag-filter-modal-overlay').style.display = 'flex';
}

function closeTagFilterModal() {
    document.getElementById('tag-filter-modal-overlay').style.display = 'none';
}

function renderTagFilterModal() {
    const mainTags = tags.filter(t => !t.parent_id);
    document.getElementById('tag-filter-groups').innerHTML = mainTags.map(mt => {
        const contrast = getContrastColor(mt.color);
        const mainSelected = filterMainIds.has(mt.id);
        const subtags = tags.filter(t => t.parent_id === mt.id);
        const mainChip = `<div class="tag-chip ${mainSelected ? 'selected' : ''}" style="background:${mt.color || '#333'}; color:${contrast}" onclick="toggleFilterMain('${mt.id}')">${mt.name}</div>`;
        const subChips = subtags.map(s => {
            const subSelected = filterSubtagIds.has(s.id);
            return `<div class="tag-chip ${subSelected ? 'selected' : ''}" style="background:${mt.color || '#333'}; color:${contrast}" onclick="toggleFilterSubtag('${s.id}')">${s.name}</div>`;
        }).join('');
        return `
        <div class="tag-filter-group">
            ${mainChip}
            <div class="tag-picker-chip-list">${subChips}</div>
        </div>
    `;
    }).join('');
}

function toggleFilterMain(id) {
    if (filterMainIds.has(id)) filterMainIds.delete(id); else filterMainIds.add(id);
    renderTagFilterModal();
}

function toggleFilterSubtag(id) {
    if (filterSubtagIds.has(id)) filterSubtagIds.delete(id); else filterSubtagIds.add(id);
    renderTagFilterModal();
}

function clearTagFilter() {
    filterMainIds.clear();
    filterSubtagIds.clear();
    renderTagFilterModal();
}

function applyTagFilter() {
    closeTagFilterModal();
    renderActiveFilterChips();
    renderTable();
}

function removeMainFilter(id) {
    filterMainIds.delete(id);
    renderActiveFilterChips();
    renderTable();
}

function removeSubtagFilter(id) {
    filterSubtagIds.delete(id);
    renderActiveFilterChips();
    renderTable();
}

function renderActiveFilterChips() {
    const row = document.getElementById('active-tag-filters');
    const mainChips = [...filterMainIds].map(id => {
        const tag = tags.find(t => t.id === id);
        if (!tag) return '';
        const contrast = getContrastColor(tag.color);
        return `<span class="active-filter-chip" style="background:${tag.color || '#333'}; color:${contrast}">${tag.name}<button onclick="removeMainFilter('${id}')">✕</button></span>`;
    }).join('');
    const subChips = [...filterSubtagIds].map(id => {
        const tag = tags.find(t => t.id === id);
        if (!tag) return '';
        const parentColor = getTagColor(tag.parent_id);
        const contrast = getContrastColor(parentColor);
        return `<span class="active-filter-chip" style="background:${parentColor || '#333'}; color:${contrast}">${tag.name}<button onclick="removeSubtagFilter('${id}')">✕</button></span>`;
    }).join('');
    row.innerHTML = mainChips + subChips;
    row.style.display = (filterMainIds.size || filterSubtagIds.size) ? 'flex' : 'none';
}