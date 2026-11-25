// ===== Practice slot scroll =====
// A horizontal strip of pills, one per the active space's own slots (plus
// "📌 Unscheduled" for any card with no slot_id), filtering the card list
// below it. Exactly one pill is always selected. Separate from the
// Practice tab's other strip (#practice-slots-scroll, slots.js's
// renderPracticeSlotsScroll), which is cross-space and display-only.

let selectedSlotBucketId = null; // a real slot id, 'unscheduled', or null
let slotBuckets = [];            // [{ id, label, color, count }], schedule order, 'unscheduled' last

function slotScrollApplies() {
    return !(typeof isDictionarySpace === 'function' && isDictionarySpace());
}

// A real slot's bucket is always shown, even at zero; Unscheduled only
// appears when something is actually in it.
function generateSlotBuckets() {
    if (!slotScrollApplies()) { slotBuckets = []; return; }

    const items = typeof allPhrases !== 'undefined' ? allPhrases : [];
    const activeSlots = typeof slots !== 'undefined' ? slots : [];

    const bySlotId = new Map(activeSlots.map(s => [s.id, { id: s.id, label: s.name, color: s.color, count: 0 }]));
    let unscheduledCount = 0;

    items.forEach(p => {
        const bucket = p.slot_id ? bySlotId.get(p.slot_id) : null;
        if (bucket) {
            bucket.count++;
        } else {
            unscheduledCount++;
        }
    });

    slotBuckets = activeSlots.map(s => bySlotId.get(s.id));
    if (unscheduledCount > 0) {
        slotBuckets.push({ id: 'unscheduled', label: '📌 Unscheduled', color: null, count: unscheduledCount });
    }

    if (!slotBuckets.find(b => b.id === selectedSlotBucketId)) {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const activeNow = activeSlots.find(s => s.start_minutes <= nowMinutes && nowMinutes < s.end_minutes);
        selectedSlotBucketId = (activeNow && slotBuckets.find(b => b.id === activeNow.id))
            ? activeNow.id
            : (slotBuckets[0]?.id ?? null);
    }
}

function renderSlotScroll() {
    const bar = document.getElementById('slot-scroll-bar');
    const track = document.getElementById('slot-scroll-track');
    if (!bar || !track) return;

    if (!slotScrollApplies()) {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = '';

    if (!slotBuckets.length) {
        track.innerHTML = `<div class="scroll-empty-note">No time slots yet for this routine</div>`;
        return;
    }

    track.innerHTML = slotBuckets.map(b => {
        const contrast = b.color ? getContrastColor(b.color) : null;
        const selectedStyle = (b.id === selectedSlotBucketId && b.color)
            ? `background:${b.color}; border-color:${b.color}; color:${contrast};`
            : '';
        return `
        <button class="slot-filter-pill ${b.id === selectedSlotBucketId ? 'selected' : ''}" style="${selectedStyle}" onclick="selectSlotBucket('${b.id}')">
            <span class="slot-filter-label">${escapeHtml(b.label || '')}</span>
            <span class="slot-filter-count">${b.count}</span>
        </button>
    `;
    }).join('');

    const selectedEl = track.querySelector('.slot-filter-pill.selected');
    if (selectedEl) {
        selectedEl.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
}

function selectSlotBucket(id) {
    selectedSlotBucketId = id;
    renderSlotScroll();
    renderTable();
}

function phraseMatchesSlotFilter(phrase) {
    if (!slotScrollApplies()) return true;
    if (!selectedSlotBucketId) return true;
    if (selectedSlotBucketId === 'unscheduled') return !phrase.slot_id;
    return phrase.slot_id === selectedSlotBucketId;
}

function resetSlotScroll() {
    selectedSlotBucketId = null;
}

function enterPracticeTab(btnEl) {
    const cameFromAdd = document.getElementById('view-add')?.classList.contains('active');
    showView('practice', btnEl);
    if (cameFromAdd) {
        const items = typeof allPhrases !== 'undefined' ? allPhrases : [];
        const last = [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        if (last) selectedSlotBucketId = last.slot_id || 'unscheduled';
        generateSlotBuckets();
        renderSlotScroll();
        renderTable();
    }
    if (typeof renderPracticeSlotsScroll === 'function') renderPracticeSlotsScroll();
}