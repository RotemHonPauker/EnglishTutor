let filterTagIds = new Set();

function phraseMatchesTagFilter(phrase) {
    if (filterTagIds.size === 0) return true;
    return filterTagIds.has(phrase.tag_id);
}

function openTagFilterModal() {
    renderTagFilterModal();
    document.getElementById('tag-filter-modal-overlay').style.display = 'flex';
}

function closeTagFilterModal() {
    document.getElementById('tag-filter-modal-overlay').style.display = 'none';
}

function renderTagFilterModal() {
    const chips = tags.map(t => {
        const contrast = getContrastColor(t.color);
        const selected = filterTagIds.has(t.id);
        return `<div class="tag-chip ${selected ? 'selected' : ''}" style="background:${t.color || '#333'}; color:${contrast}" onclick="toggleFilterTag('${t.id}')">${t.name}</div>`;
    }).join('');
    document.getElementById('tag-filter-groups').innerHTML = `<div class="tag-picker-chip-list">${chips}</div>`;
}

function toggleFilterTag(id) {
    if (filterTagIds.has(id)) {
        filterTagIds.delete(id);
    } else {
        filterTagIds.add(id);
    }
    renderTagFilterModal();
}

function clearTagFilter() {
    filterTagIds.clear();
    renderTagFilterModal();
}

// Full reset for contexts outside the filter modal itself (e.g. switching
// spaces) — clears the filter AND updates what's actually visible in the
// table toolbar, not just the modal's own internal state.
function resetTagFilter() {
    filterTagIds.clear();
    renderActiveFilterChips();
}

function applyTagFilter() {
    closeTagFilterModal();
    renderActiveFilterChips();
    renderTable();
}

function removeTagFilter(id) {
    filterTagIds.delete(id);
    renderActiveFilterChips();
    renderTable();
}

function renderActiveFilterChips() {
    const row = document.getElementById('active-tag-filters');
    row.innerHTML = [...filterTagIds].map(id => {
        const tag = tags.find(t => t.id === id);
        if (!tag) return '';
        const contrast = getContrastColor(tag.color);
        return `<span class="active-filter-chip" style="background:${tag.color || '#333'}; color:${contrast}">${tag.name}<button onclick="removeTagFilter('${id}')">✕</button></span>`;
    }).join('');
    row.style.display = filterTagIds.size ? 'flex' : 'none';
}