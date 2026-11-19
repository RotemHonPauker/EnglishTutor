// ===== Practice date scroll =====
// A horizontal strip of day/week buckets above the phrase list. Exactly one
// bucket is always selected (there's no "show everything" state here — if
// you want to see more at once, switch to weekly, which groups more into
// each column). Anything older than the visible range collapses into a
// single "Older" bucket at the start of the strip.
//
// bucketIdFor/bucketLabelFor/startOfDay/startOfWeek are also reused by
// analyticsChart.js, so this file loads before it.

const WEEK_LIFETIME_DAILY_BUCKETS = 9;    // ~7 days of lifetime (card_lifetime: 'week'), plus a little buffer
const MONTH_LIFETIME_WEEKLY_BUCKETS = 6;  // ~30 days of lifetime ('month', or unset — see effectiveCardLifetime), plus a little buffer

let dateGranularity = 'day'; // 'day' | 'week' — now derived automatically each time generateDateBuckets runs (see deriveDateGranularity below), not picked manually
let selectedBucketId = null; // a bucket id, 'saved', or 'trash'
let dateBuckets = [];        // [{ id, label, count }] — non-empty only, 'trash' then 'saved' first when present
let earliestBucketId = null; // boundary used to decide what counts as too-old-for-its-own-bucket (folded into 'saved' — see generateDateBuckets)

// Which bucket size to use, and how many buckets to show, derived from
// the active routine's own card_lifetime setting (Setup) — replacing the
// old manual Daily/Weekly/Monthly switcher entirely. With Trash and Saved
// now doing the "don't let old stuff clutter the board" job, a resolution
// switcher on top of that was one knob too many (Rotem's own call). A
// routine that hasn't set a lifetime yet (still null) behaves exactly like
// 'month' (see localDb.js's effectiveCardLifetime) — there's no third
// "unlimited" display mode any more.
function deriveDateGranularity() {
    const active = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    const lifetime = effectiveCardLifetime(active?.card_lifetime);
    if (lifetime === 'week') return { granularity: 'day', maxBuckets: WEEK_LIFETIME_DAILY_BUCKETS };
    return { granularity: 'week', maxBuckets: MONTH_LIFETIME_WEEKLY_BUCKETS };
}

function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Week starts Sunday.
function startOfWeek(d) {
    const day = startOfDay(d);
    day.setDate(day.getDate() - day.getDay());
    return day;
}

function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Formats a Date as YYYY-MM-DD using its *local* calendar date. Deliberately
// not toISOString() — that converts to UTC first, which in timezones ahead
// of UTC (like Israel) silently shifts local midnight back to the previous
// calendar day, throwing off every bucket id and label by a day.
function formatLocalDateId(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function bucketIdFor(date, granularity) {
    const start = granularity === 'week' ? startOfWeek(date)
        : granularity === 'month' ? startOfMonth(date)
        : startOfDay(date);
    return formatLocalDateId(start);
}

// Manual numeric formatting instead of toLocaleDateString — that relies on
// the browser/OS locale, which (in Hebrew, for example) can produce long
// month names that overflow the narrow pill/row labels. D/M is short,
// unambiguous, identical everywhere, and — unlike "Today"/"Yesterday" —
// the same length as every other label, so columns don't vary in width.
function bucketLabelFor(id, granularity) {
    const date = new Date(id + 'T00:00:00');

    if (granularity === 'day') {
        return `${date.getDate()}/${date.getMonth() + 1}`;
    }

    if (granularity === 'month') {
        return `${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`;
    }

    const weekEnd = new Date(date);
    weekEnd.setDate(weekEnd.getDate() + 6);
    // Drop the repeated month when both ends of the week fall in the same one.
    const sameMonth = date.getMonth() === weekEnd.getMonth();
    const startLabel = sameMonth ? `${date.getDate()}` : `${date.getDate()}/${date.getMonth() + 1}`;
    const endLabel = `${weekEnd.getDate()}/${weekEnd.getMonth() + 1}`;
    return `${startLabel}–${endLabel}`;
}

// Whether an item matches whatever filters are currently active — slot
// filter in phrase mode (there's no slot concept in dictionary mode).
// "Learned" used to be checked here too; that concept is gone everywhere
// now (see phrasesTable.js/dictionary.js), so the only thing left to check
// is the slot filter. Used only for the *number* shown on each date pill; a
// bucket's existence is still based on the unfiltered count below, so the
// strip's shape stays stable as filters change.
//
// NOTE: this used to call a function named phraseMatchesTagFilter, which
// hasn't existed since tags were replaced by slots (see phrasesTable.js) —
// the typeof guard below meant that call silently no-op'd instead of
// throwing, so every date pill's filtered count quietly ignored the slot
// filter instead of respecting it. Fixed here to call the real function,
// phraseMatchesSlotFilter.
function matchesActiveFilters(item) {
    if (!(typeof isDictionarySpace === 'function' && isDictionarySpace())
        && typeof phraseMatchesSlotFilter === 'function' && !phraseMatchesSlotFilter(item)) return false;
    return true;
}

// Builds the last maxBuckets buckets (deriveDateGranularity) up to and
// including today's, with phrase counts from allPhrases, folding anything
// saved — or too old for the visible range — into the single "⭐ Saved"
// bucket instead. Empty columns (no phrases at all) are dropped — an
// empty day/week isn't worth scrolling past, and can't be selected.
function generateDateBuckets() {
    const { granularity, maxBuckets } = deriveDateGranularity();
    dateGranularity = granularity;
    const activeSpace = typeof getActiveSpace === 'function' ? getActiveSpace() : null;

    const today = new Date();
    const rawBuckets = [];
    for (let i = maxBuckets - 1; i >= 0; i--) {
        let d;
        if (dateGranularity === 'month') {
            d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        } else if (dateGranularity === 'week') {
            d = new Date(today);
            d.setDate(d.getDate() - i * 7);
        } else {
            d = new Date(today);
            d.setDate(d.getDate() - i);
        }
        const id = bucketIdFor(d, dateGranularity);
        if (!rawBuckets.find(b => b.id === id)) {
            rawBuckets.push({ id, label: bucketLabelFor(id, dateGranularity), count: 0, filteredCount: 0 });
        }
    }

    earliestBucketId = rawBuckets[0].id;
    let savedCount = 0, savedFilteredCount = 0;
    let trashCount = 0, trashFilteredCount = 0;

    (typeof getPracticeItems === 'function' ? getPracticeItems() : (typeof allPhrases !== 'undefined' ? allPhrases : [])).forEach(p => {
        // Past its 24h trash grace entirely — about to be swept by the
        // next deletePastGraceCards() sweep, so it's left out everywhere,
        // same as a hard-deleted row already would be.
        if (isCardPastGrace(p, activeSpace)) return;

        if (isCardInTrash(p, activeSpace)) {
            trashCount++;
            if (matchesActiveFilters(p)) trashFilteredCount++;
            return;
        }

        const id = bucketIdFor(new Date(p.created_at), dateGranularity);
        const matches = matchesActiveFilters(p);

        // Saved is the one escape valve now — no separate "older" status
        // layered on top of it (Rotem's own call). A saved card lives here
        // permanently regardless of its own date, so it never disappears
        // once its own bucket ages out of the visible window. A
        // not-yet-expired, UNSAVED card that still somehow predates the
        // window (bucket windows are sized with slack above each
        // lifetime, so this should be rare) is folded in here too, rather
        // than inventing a second status just for that edge case.
        if (isCardSaved(p) || id < earliestBucketId) {
            savedCount++;
            if (matches) savedFilteredCount++;
            return;
        }

        const bucket = rawBuckets.find(b => b.id === id);
        if (bucket) {
            bucket.count++;
            if (matches) bucket.filteredCount++;
        }
    });

    const nonEmptyBuckets = rawBuckets.filter(b => b.count > 0);
    const specialBuckets = [];
    if (trashCount > 0) {
        specialBuckets.push({ id: 'trash', label: '🗑️ Trash', count: trashCount, filteredCount: trashFilteredCount });
    }
    if (savedCount > 0) {
        specialBuckets.push({ id: 'saved', label: '⭐ Saved', count: savedCount, filteredCount: savedFilteredCount });
    }
    dateBuckets = [...specialBuckets, ...nonEmptyBuckets];

    // Keep the current selection if it still exists (e.g. after loadTable
    // just refreshed counts); otherwise land on the most recent bucket that
    // actually has anything in it.
    if (!dateBuckets.find(b => b.id === selectedBucketId)) {
        selectedBucketId = dateBuckets.length ? dateBuckets[dateBuckets.length - 1].id : null;
    }
}

function renderDateScroll() {
    const track = document.getElementById('date-scroll-track');
    if (!track) return;

    if (!dateBuckets.length) {
        track.innerHTML = `<div class="date-scroll-empty">No phrases yet</div>`;
        return;
    }

    track.innerHTML = dateBuckets.map(b => {
        const specialClass = b.id === 'trash' ? 'bucket-trash' : b.id === 'saved' ? 'bucket-saved' : '';
        return `
        <button class="date-bucket-pill ${specialClass} ${b.id === selectedBucketId ? 'selected' : ''}" onclick="selectDateBucket('${b.id}')">
            <span class="date-bucket-label">${b.label}</span>
            <span class="date-bucket-count">${b.filteredCount}</span>
        </button>
    `;
    }).join('');

    // Land on the current selection (usually today, at the right edge)
    // instead of making the user scroll there manually.
    const selectedEl = track.querySelector('.date-bucket-pill.selected');
    if (selectedEl) {
        selectedEl.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
}

function selectDateBucket(id) {
    selectedBucketId = id;
    renderDateScroll();
    renderTable();
}

// Granularity/window size are no longer picked manually (see
// deriveDateGranularity above) — this just decides which card belongs in
// which bucket, now also accounting for a card that's saved or sitting in
// Trash, both of which bypass the date buckets entirely (see
// generateDateBuckets).
function phraseMatchesDateFilter(phrase) {
    const activeSpace = typeof getActiveSpace === 'function' ? getActiveSpace() : null;
    if (isCardPastGrace(phrase, activeSpace)) return false; // about to be swept away, never shown
    if (!selectedBucketId) return true;
    if (selectedBucketId === 'trash') {
        return isCardInTrash(phrase, activeSpace);
    }
    if (isCardInTrash(phrase, activeSpace)) return false;
    if (selectedBucketId === 'saved') {
        if (isCardSaved(phrase)) return true;
        if (!earliestBucketId) return false;
        return bucketIdFor(new Date(phrase.created_at), dateGranularity) < earliestBucketId;
    }
    if (isCardSaved(phrase)) return false;
    return bucketIdFor(new Date(phrase.created_at), dateGranularity) === selectedBucketId;
}

// Called on space switch — lands back on today/this-bucket; the actual
// granularity is re-derived from the new routine's own card_lifetime the
// next time generateDateBuckets runs (loadTable).
function resetDateScroll() {
    selectedBucketId = null;
}

// Jumps back to today's bucket — used when arriving at Practice straight
// from the Add tab (see enterPracticeTab below), so a phrase you just
// added is immediately visible without having to notice you're still
// parked on some other bucket.
function jumpDateScrollToToday() {
    selectedBucketId = null;
    generateDateBuckets();
    renderDateScroll();
    renderTable();
}

// The Practice tab button calls this instead of showView directly — it's
// the only way to reach Practice, so checking what was active right before
// the switch is enough to catch "coming from Add" reliably. Any other
// origin tab leaves the scroll exactly where you left it, same as today.
// Also refreshes the Practice-tab-only all-routines slots scroll
// (slots.js's renderPracticeSlotsScroll) — its current/next highlight
// depends on the phone's clock, which may well have moved on since the
// last time Practice was open.
function enterPracticeTab(btnEl) {
    const cameFromAdd = document.getElementById('view-add')?.classList.contains('active');
    showView('practice', btnEl);
    if (cameFromAdd) jumpDateScrollToToday();
    if (typeof renderPracticeSlotsScroll === 'function') renderPracticeSlotsScroll();
}