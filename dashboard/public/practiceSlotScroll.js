// ===== Practice slot scroll =====
// Replaces practiceDateScroll.js entirely (delete that file — nothing
// references it any more) and, with it, the whole card-lifetime/saved/
// trash + day/week date-bucket machinery that used to live alongside it.
// Rotem's own call: too much mechanism for what the app actually needed.
// Cards are now browsed by which time slot of the CURRENT routine they
// belong to, not by when they were captured.
//
// A horizontal strip of pills, one per this routine's own slot (in
// schedule order, via `slots` — slots.js, scoped to the active routine
// only), plus a single "📌 Unscheduled" pill for any card with no slot_id
// at all. Exactly one pill is always selected — same "never 'show
// everything'" rule the old date-scroll had, just keyed by slot id now.
// Nothing here touches the Practice tab's OTHER, separate strip
// (#practice-slots-scroll, slots.js's renderPracticeSlotsScroll) — that
// one is cross-routine and display-only (today's reminder schedule across
// every routine); this one is single-routine and does the actual
// filtering of the card list below it.

let selectedSlotBucketId = null; // a real slot id, 'unscheduled', or null (nothing to select yet)
let slotBuckets = [];            // [{ id, label, color, count }] — schedule order, 'unscheduled' last when present

// Dictionary entries have no slot concept at all (dictionary.js) — the
// whole strip (and the filtering below) just gets out of the way there.
function slotScrollApplies() {
    return !(typeof isDictionarySpace === 'function' && isDictionarySpace());
}

// Builds one bucket per this routine's own slot, in schedule order, plus
// 'unscheduled' when at least one card has no slot_id — a real slot's own
// bucket is always shown, even at zero, since browsing to an empty one on
// purpose (to then assign something into it) is a real use case; an empty
// Unscheduled bucket would just be clutter, so that one only appears when
// there's actually something in it.
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
        // Land on whichever slot is active right now, if any; otherwise
        // the first bucket there is (first slot in schedule order, or
        // Unscheduled if this routine has no slots of its own at all).
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

    // Land on the current selection instead of making the person scroll
    // there manually.
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

// Whether a card belongs in whichever bucket is currently selected — read
// by renderTable (phrasesTable.js). Dictionary entries never reach this
// (slotScrollApplies() is false there, and renderDictionaryCards doesn't
// call it at all).
function phraseMatchesSlotFilter(phrase) {
    if (!slotScrollApplies()) return true;
    if (!selectedSlotBucketId) return true;
    if (selectedSlotBucketId === 'unscheduled') return !phrase.slot_id;
    return phrase.slot_id === selectedSlotBucketId;
}

// Called on routine switch (spacesState.js) — the new routine's own slots
// (and so its own bucket ids) are completely different, so there's
// nothing to carry over; generateSlotBuckets picks a fresh default the
// next time loadTable runs.
function resetSlotScroll() {
    selectedSlotBucketId = null;
}

// The Practice tab button calls this instead of showView directly. Used
// to also jump the old date-scroll back to "today" when arriving from
// Add — the nearest equivalent now is landing on whichever slot the
// phrase just captured there actually got (if any), so it's immediately
// visible without having to go hunting for it.
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