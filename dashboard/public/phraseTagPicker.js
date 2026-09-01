let tagPickerPhraseId = null;
let tagPickerSelectedTag = null;

function openTagPicker(phraseId) {
    const phrase = allPhrases.find(p => p.id === phraseId);
    if (!phrase) return;
    tagPickerPhraseId = phraseId;
    tagPickerSelectedTag = phrase.tag_id || null;
    renderTagPickerList();
    document.getElementById('tag-picker-modal-overlay').style.display = 'flex';
}

function closeTagPicker() {
    tagPickerPhraseId = null;
    tagPickerSelectedTag = null;
    document.getElementById('tag-picker-modal-overlay').style.display = 'none';
}

function renderTagPickerList() {
    const noneChip = `<div class="tag-chip none ${!tagPickerSelectedTag ? 'selected' : ''}" onclick="selectPickerTag(null)">—</div>`;
    const chips = tags.map(t => {
        const contrast = getContrastColor(t.color);
        const selected = tagPickerSelectedTag === t.id;
        return `<div class="tag-chip ${selected ? 'selected' : ''}" style="background:${t.color || '#333'}; color:${contrast}" onclick="selectPickerTag('${t.id}')">${t.name}</div>`;
    }).join('');
    document.getElementById('tag-picker-list').innerHTML = noneChip + chips;
}

function selectPickerTag(tagId) {
    tagPickerSelectedTag = tagId;
    renderTagPickerList();
}

async function confirmTagPick() {
    if (!tagPickerPhraseId) return;
    const phraseId = tagPickerPhraseId;
    const tagId = tagPickerSelectedTag;
    closeTagPicker();
    await updatePhraseTagAssignment(phraseId, tagId);
}