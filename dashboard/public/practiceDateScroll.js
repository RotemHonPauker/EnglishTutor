// ===== Practice date scroll =====
// A horizontal strip of day/week buckets above the phrase list. Exactly one
// bucket is always selected (there's no "show everything" state here — if
// you want to see more at once, switch to weekly, which groups more into
// each column). Anything older than the visible range collapses into a
// single "Older" bucket at the start of the strip.
//
// bucketIdFor/bucketLabelFor/startOfDay/startOfWeek are also reused by
// analyticsChart.js, so this file loads before it.

const MAX_DATE_BUCKETS = 30;

let dateGranularity = 'day'; // 'day' | 'week' | 'month'
let selectedBucketId = null; // a bucket id, or 'older'
let dateBuckets = [];        // [{ id, label, count }] — non-empty only, 'older' first when present
let earliestBucketId = null; // boundary used to decide what counts as "older"

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
// unambiguous, and identical everywhere.
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
    return `${startLabel}\u2013${endLabel}`;
}

// Builds the last MAX_DATE_BUCKETS buckets up to and including today's, with
// phrase counts from allPhrases, plus a single "Older" bucket for anything
// before that range. Empty columns (no phrases at all) are dropped — an
// empty day/week isn't worth scrolling past, and can't be selected.
function generateDateBuckets() {
    const today = new Date();
    const rawBuckets = [];
    for (let i = MAX_DATE_BUCKETS - 1; i >= 0; i--) {
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
            rawBuckets.push({ id, label: bucketLabelFor(id, dateGranularity), count: 0 });
        }
    }

    earliestBucketId = rawBuckets[0].id;
    let olderCount = 0;

    (typeof allPhrases !== 'undefined' ? allPhrases : []).forEach(p => {
        const id = bucketIdFor(new Date(p.created_at), dateGranularity);
        if (id < earliestBucketId) {
            olderCount++;
            return;
        }
        const bucket = rawBuckets.find(b => b.id === id);
        if (bucket) bucket.count++;
    });

    const nonEmptyBuckets = rawBuckets.filter(b => b.count > 0);
    dateBuckets = olderCount > 0
        ? [{ id: 'older', label: 'Older', count: olderCount }, ...nonEmptyBuckets]
        : nonEmptyBuckets;

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

    track.innerHTML = dateBuckets.map(b => `
        <button class="date-bucket-pill ${b.id === selectedBucketId ? 'selected' : ''}" onclick="selectDateBucket('${b.id}')">
            <span class="date-bucket-label">${b.label}</span>
            <span class="date-bucket-count">${b.count}</span>
        </button>
    `).join('');

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

function setDateGranularity(granularity, btnEl) {
    dateGranularity = granularity;
    document.querySelectorAll('#date-granularity-toggle .mode-toggle-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    selectedBucketId = null; // re-pick today's/this-week's bucket in the new granularity
    generateDateBuckets();
    renderDateScroll();
    renderTable();
}

function phraseMatchesDateFilter(phrase) {
    if (!selectedBucketId) return true;
    if (selectedBucketId === 'older') {
        if (!earliestBucketId) return false;
        return bucketIdFor(new Date(phrase.created_at), dateGranularity) < earliestBucketId;
    }
    return bucketIdFor(new Date(phrase.created_at), dateGranularity) === selectedBucketId;
}

// Called on space switch — back to daily view, landed on today.
function resetDateScroll() {
    dateGranularity = 'day';
    selectedBucketId = null;
    document.querySelectorAll('#date-granularity-toggle .mode-toggle-btn').forEach(b => b.classList.remove('active'));
    const dayBtn = document.querySelector('#date-granularity-toggle .mode-toggle-btn[data-granularity="day"]');
    if (dayBtn) dayBtn.classList.add('active');
}