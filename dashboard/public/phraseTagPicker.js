let tagPickerPhraseId = null;
let tagPickerSelectedMain = null;
let tagPickerSelectedSub = null;

function openTagPicker(phraseId) {
    const phrase = allPhrases.find(p => p.id === phraseId);
    if (!phrase) return;
    tagPickerPhraseId = phraseId;
    const subtag = tags.find(t => t.id === phrase.subtag_id);
    tagPickerSelectedMain = subtag ? subtag.parent_id : null;
    tagPickerSelectedSub = phrase.subtag_id || null;
    renderTagPickerMain();
    renderTagPickerSub();
    document.getElementById('tag-picker-modal-overlay').style.display = 'flex';
}

function closeTagPicker() {
    tagPickerPhraseId = null;
    tagPickerSelectedMain = null;
    tagPickerSelectedSub = null;
    document.getElementById('tag-picker-modal-overlay').style.display = 'none';
}

function renderTagPickerMain() {
    const mainTags = tags.filter(t => !t.parent_id);
    const noneChip = `<div class="tag-chip none ${!tagPickerSelectedMain ? 'selected' : ''}" onclick="selectPickerMain(null)">—</div>`;
    const chips = mainTags.map(mt => {
        const contrast = getContrastColor(mt.color);
        const selected = tagPickerSelectedMain === mt.id;
        return `<div class="tag-chip ${selected ? 'selected' : ''}" style="background:${mt.color || '#333'}; color:${contrast}" onclick="selectPickerMain('${mt.id}')">${mt.name}</div>`;
    }).join('');
    document.getElementById('tag-picker-main-list').innerHTML = noneChip + chips;
}

function selectPickerMain(mainId) {
    tagPickerSelectedMain = mainId;
    tagPickerSelectedSub = null;
    renderTagPickerMain();
    renderTagPickerSub();
}

function renderTagPickerSub() {
    const section = document.getElementById('tag-picker-sub-section');
    const container = document.getElementById('tag-picker-sub-list');
    if (!tagPickerSelectedMain) {
        section.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    section.style.display = '';
    const mainTag = tags.find(t => t.id === tagPickerSelectedMain);
    const color = (mainTag && mainTag.color) || DEFAULT_TAG_COLOR;
    const contrast = getContrastColor(color);
    const subtags = tags.filter(t => t.parent_id === tagPickerSelectedMain);
    container.innerHTML = subtags.map(s => {
        const selected = tagPickerSelectedSub === s.id;
        return `<div class="tag-chip ${selected ? 'selected' : ''}" style="background:${color}; color:${contrast}" onclick="selectPickerSub('${s.id}')">${s.name}</div>`;
    }).join('');
}

function selectPickerSub(subId) {
    tagPickerSelectedSub = subId;
    renderTagPickerSub();
}

async function confirmTagPick() {
    if (!tagPickerPhraseId) return;
    // If a main tag is picked but no subtag yet, there's nothing resolvable
    // to save — closing here just leaves the phrase's tag untouched rather
    // than saving a half-made choice.
    if (tagPickerSelectedMain && !tagPickerSelectedSub) {
        closeTagPicker();
        return;
    }
    const phraseId = tagPickerPhraseId;
    const subtagId = tagPickerSelectedSub;
    closeTagPicker();
    await updateSubtag(phraseId, subtagId);
}