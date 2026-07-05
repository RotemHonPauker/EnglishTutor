const chat = document.getElementById('chat');
const input = document.getElementById('input');
const tableBody = document.getElementById('table-body');

let currentFilter = null;
let sortAsc = false;
let allPhrases = [];

// --- TABLE ---

async function loadTable() {
    const url = currentFilter ? `/phrases?status=${currentFilter}` : '/phrases';
    const res = await fetch(url);
    allPhrases = await res.json();
    renderTable();
}

function renderTable() {
    const sorted = [...allPhrases].sort((a, b) => {
        const da = new Date(a.created_at);
        const db = new Date(b.created_at);
        return sortAsc ? da - db : db - da;
    });

    tableBody.innerHTML = sorted.map(p => `
        <tr>
            <td>${p.hebrew_text || ''}</td>
            <td>${p.variant_1 || ''}</td>
            <td>${p.variant_2 || ''}</td>
            <td>${p.tag || '—'}</td>
            <td><span class="status-badge ${p.status}">${p.status}</span></td>
            <td>${new Date(p.created_at).toLocaleDateString('en-GB')}</td>
        </tr>
    `).join('');
}

function filterTable(status, btn) {
    currentFilter = status === 'all' ? null : status;
    document.querySelectorAll('#table-toolbar button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadTable();
}

function toggleSort() {
    sortAsc = !sortAsc;
    const header = document.querySelector('th.sortable');
    header.textContent = `Date ${sortAsc ? '↑' : '↓'}`;
    renderTable();
}

// --- CHAT ---

input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
});

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    if (role === 'assistant') {
        div.innerHTML = marked.parse(text);
    } else {
        div.textContent = text;
    }
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    addMessage('user', text);
    input.value = '';
    input.style.height = 'auto';

    try {
        const res = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        addMessage('assistant', data.reply);
        loadTable(); // refresh table after every message
    } catch (err) {
        addMessage('system', 'Something went wrong. Try again.');
    }
}

async function startSession() {
    const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'start' })
    });
    const data = await res.json();
    addMessage('assistant', data.reply);
}

async function resetSession() {
    await fetch('/reset');
    chat.innerHTML = '';
    addMessage('system', 'Session reset.');
    await startSession();
}

async function commitPrompt() {
    await openModal();
}

async function openModal() {
    const res = await fetch('/system-prompt');
    const data = await res.json();
    document.getElementById('prompt-editor').value = data.content;
    document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
}

async function savePrompt() {
    const content = document.getElementById('prompt-editor').value;
    try {
        await fetch('/system-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        addMessage('system', 'System prompt saved and committed.');
        closeModal();
    } catch (err) {
        addMessage('system', 'Failed to save prompt.');
    }
}

window.onload = async () => {
    await loadTable();
    await startSession();
};