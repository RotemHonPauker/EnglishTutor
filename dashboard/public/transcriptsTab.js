let transcripts = [];

// Renders straight into #capture-log (owned by captureTab.js) — this file
// only supplies the transcripts data and their accordion behavior.
async function loadTranscripts() {
    const res = await fetch(`/transcripts?spaceId=${activeSpaceId}`);
    transcripts = await res.json();
    renderTranscripts();
}

function renderTranscripts() {
    const warningHtml = transcripts.length > 3
        ? `<div id="transcripts-warning">You have ${transcripts.length} saved transcripts — consider deleting old ones you've already reviewed.</div>`
        : '';

    const listHtml = transcripts.map(t => {
        const label = new Date(t.created_at).toLocaleString([], {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
        return `
        <div class="transcript-card">
            <div class="transcript-card-header" onclick="toggleTranscript('${t.id}')">
                <span>${label}</span>
                <div class="transcript-card-actions">
                    <button title="Delete" onclick="event.stopPropagation(); deleteTranscriptRow('${t.id}')">🗑</button>
                </div>
            </div>
            <div class="transcript-card-body" id="transcript-body-${t.id}" style="display:none">${t.content}</div>
        </div>
    `;
    }).join('');

    captureLog.innerHTML = warningHtml + (listHtml || '<div class="capture-log-item error">No recordings processed yet.</div>');
}

// Accordion: one click expands/collapses that entry in place.
function toggleTranscript(id) {
    const body = document.getElementById(`transcript-body-${id}`);
    if (!body) return;
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
}

async function deleteTranscriptRow(id) {
    try {
        const res = await fetch(`/transcripts/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete transcript');
        await loadTranscripts();
    } catch (err) {
        alert('Failed to delete transcript');
    }
}