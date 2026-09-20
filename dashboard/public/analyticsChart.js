// ===== Analytics chart (its own tab now) =====
// A plain div-based horizontal stacked-bar chart — no charting library,
// consistent with the rest of the app's vanilla JS. Each row is one
// day/week; the list scrolls vertically, newest at the top, so the most
// relevant row is visible without scrolling. Two independent toggles:
// granularity (day/week, up to MAX_DATE_BUCKETS rows, reused from
// practiceDateScroll.js) and mode (by tag, or by progress: Level 1 /
// Level 2 / Learned, as of right now — not a timeline of when a phrase
// moved between states).
// Unlike the Practice date scroll, there's no "Older" row here and no row
// is ever selectable — this is a trend view, not a navigation control.

let analyticsGranularity = 'day'; // 'day' | 'week' | 'month'
let analyticsMode = 'tag';        // 'tag' | 'learned'

const LEARNED_COLOR = '#f2c14e';
const LEVEL2_COLOR = '#2563eb';
const LEVEL1_COLOR = '#3a4a6b';
const NO_TAG_COLOR = '#444';

function computeAnalyticsBuckets() {
    const buckets = [];
    const today = new Date();
    for (let i = MAX_DATE_BUCKETS - 1; i >= 0; i--) {
        let d;
        if (analyticsGranularity === 'month') {
            d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        } else if (analyticsGranularity === 'week') {
            d = new Date(today);
            d.setDate(d.getDate() - i * 7);
        } else {
            d = new Date(today);
            d.setDate(d.getDate() - i);
        }
        const id = bucketIdFor(d, analyticsGranularity);
        if (!buckets.find(b => b.id === id)) {
            buckets.push({ id, label: bucketLabelFor(id, analyticsGranularity), phrases: [] });
        }
    }
    (typeof allPhrases !== 'undefined' ? allPhrases : []).forEach(p => {
        const id = bucketIdFor(new Date(p.created_at), analyticsGranularity);
        const bucket = buckets.find(b => b.id === id);
        if (bucket) bucket.phrases.push(p);
    });
    return buckets; // oldest -> newest
}

function renderAnalyticsChart() {
    const container = document.getElementById('analytics-chart-bars');
    if (!container) return; // not on the Analytics view yet — nothing to draw into

    const buckets = computeAnalyticsBuckets();
    const maxTotal = Math.max(1, ...buckets.map(b => b.phrases.length));

    // Newest first — the useful entry point sits at the top of the list
    // instead of requiring a scroll all the way down.
    const ordered = [...buckets].reverse();

    container.innerHTML = ordered.map(b => {
        const total = b.phrases.length;
        const barWidthPct = total ? Math.max(2, Math.round((total / maxTotal) * 100)) : 0;

        let segments;
        if (analyticsMode === 'tag') {
            const byTagId = {};
            b.phrases.forEach(p => {
                const key = p.tag_id || 'notag';
                byTagId[key] = (byTagId[key] || 0) + 1;
            });
            // Fixed order — follow the tags list itself, then "no tag"
            // last — so a given tag's color always sits in the same
            // position across every row, making rows comparable at a
            // glance instead of shuffling based on which phrases happen
            // to exist in that particular period.
            const orderedEntries = [
                ...tags.map(t => [t.id, byTagId[t.id] || 0]),
                ['notag', byTagId['notag'] || 0]
            ].filter(([, count]) => count > 0);

            segments = orderedEntries.map(([tagId, count]) => {
                const tag = tags.find(t => t.id === tagId);
                const color = tag ? (tag.color || NO_TAG_COLOR) : NO_TAG_COLOR;
                const name = tag ? tag.name : 'No tag';
                return `<div class="chart-segment" style="flex:${count}; background:${color};" title="${name}: ${count}"></div>`;
            }).join('');
        } else {
            // Same "current status of what was created in this period"
            // logic as before — just 3 states now instead of 2.
            const level1Count = b.phrases.filter(p => !p.learned_at && p.level !== 2).length;
            const level2Count = b.phrases.filter(p => !p.learned_at && p.level === 2).length;
            const learnedCount = b.phrases.filter(p => p.learned_at).length;
            segments = [
                level1Count ? `<div class="chart-segment" style="flex:${level1Count}; background:${LEVEL1_COLOR};" title="Level 1: ${level1Count}"></div>` : '',
                level2Count ? `<div class="chart-segment" style="flex:${level2Count}; background:${LEVEL2_COLOR};" title="Level 2: ${level2Count}"></div>` : '',
                learnedCount ? `<div class="chart-segment" style="flex:${learnedCount}; background:${LEARNED_COLOR};" title="Learned: ${learnedCount}"></div>` : ''
            ].join('');
        }

        return `
            <div class="chart-row">
                <div class="chart-row-label">${b.label}</div>
                <div class="chart-row-track">
                    <div class="chart-row-bar" style="width:${barWidthPct}%;">${segments}</div>
                </div>
                <div class="chart-row-total">${total}</div>
            </div>
        `;
    }).join('');

    renderAnalyticsLegend();
}

function renderAnalyticsLegend() {
    const legend = document.getElementById('analytics-chart-legend');
    if (!legend) return;

    if (analyticsMode === 'tag') {
        const tagDots = tags.map(t => `
            <span class="chart-legend-item"><span class="chart-legend-dot" style="background:${t.color || NO_TAG_COLOR}"></span>${t.name}</span>
        `).join('');
        legend.innerHTML = tagDots + `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${NO_TAG_COLOR}"></span>No tag</span>`;
    } else {
        legend.innerHTML = `
            <span class="chart-legend-item"><span class="chart-legend-dot" style="background:${LEVEL1_COLOR}"></span>Level 1</span>
            <span class="chart-legend-item"><span class="chart-legend-dot" style="background:${LEVEL2_COLOR}"></span>Level 2</span>
            <span class="chart-legend-item"><span class="chart-legend-dot" style="background:${LEARNED_COLOR}"></span>Learned</span>
        `;
    }
}

function setAnalyticsGranularity(granularity, btnEl) {
    analyticsGranularity = granularity;
    document.querySelectorAll('#analytics-granularity-toggle .mode-toggle-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    renderAnalyticsChart();
}

function setAnalyticsMode(mode, btnEl) {
    analyticsMode = mode;
    document.querySelectorAll('#analytics-mode-toggle .mode-toggle-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    renderAnalyticsChart();
}