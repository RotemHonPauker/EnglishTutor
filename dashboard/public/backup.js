// backup.js — Export/Import for this device's IndexedDB data. Not a sync
// mechanism: import overwrites rows by id, meant for restoring into a
// fresh install, not merging two devices.

const BACKUP_STORE_ORDER = ['spaces', 'slots', 'phrases', 'dictionary', 'transcripts'];

async function exportAllData() {
    const db = await openDb();
    const payload = { exportedAt: new Date().toISOString(), tables: {} };

    for (const storeName of BACKUP_STORE_ORDER) {
        const tx = db.transaction(storeName, 'readonly');
        payload.tables[storeName] = (await reqToPromise(tx.objectStore(storeName).getAll())) || [];
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = payload.exportedAt.slice(0, 10);
    const filename = `fraza-backup-${stamp}.json`;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    return { payload, filename };
}

// Browsers can't attach a downloaded file to a mailto draft automatically —
// this just nudges the person to attach it themselves.
function openBackupMailtoReminder(filename) {
    const subject = `Fraza backup — ${filename}`;
    const body = `Reminder: attach "${filename}" from your Downloads folder before sending.\n\n` +
        `(Browsers can't attach a downloaded file to an email automatically — this draft is just a nudge so you don't forget.)`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
}

async function importAllData(payload) {
    if (!payload || typeof payload !== 'object' || !payload.tables) {
        throw new Error('This file doesn\'t look like a Fraza backup.');
    }

    const db = await openDb();
    const tx = db.transaction(BACKUP_STORE_ORDER, 'readwrite');

    let totalRows = 0;
    for (const storeName of BACKUP_STORE_ORDER) {
        const rows = payload.tables[storeName];
        if (!Array.isArray(rows)) continue;
        const store = tx.objectStore(storeName);
        for (const row of rows) {
            store.put(row);
            totalRows++;
        }
    }

    await txDone(tx);
    return { tablesRestored: BACKUP_STORE_ORDER.filter(s => Array.isArray(payload.tables[s])), totalRows };
}

function readFileAsJson(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                resolve(JSON.parse(reader.result));
            } catch (e) {
                reject(new Error('That file isn\'t valid JSON.'));
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

// ===== Setup-tab UI glue =====

const BACKUP_STORE_LABELS = {
    spaces: 'space',
    slots: 'time slot',
    phrases: 'phrase',
    dictionary: 'dictionary entry',
    transcripts: 'transcript',
};

function pluralize(label, count) {
    if (count === 1) return label;
    if (label.endsWith('y')) return label.slice(0, -1) + 'ies';
    return label + 's';
}

async function handleExportBackupClick() {
    const statusEl = document.getElementById('backup-export-status');
    try {
        const { payload, filename } = await exportAllData();
        const breakdown = BACKUP_STORE_ORDER
            .map(storeName => ({ storeName, count: (payload.tables[storeName] || []).length }))
            .filter(({ count }) => count > 0)
            .map(({ storeName, count }) => `${count} ${pluralize(BACKUP_STORE_LABELS[storeName], count)}`)
            .join(', ');
        if (statusEl) {
            statusEl.textContent = `Saved: ${breakdown || 'nothing to back up yet'}.`;
            statusEl.classList.remove('error');
        }
        openBackupMailtoReminder(filename);
    } catch (e) {
        if (statusEl) {
            statusEl.textContent = 'Export failed — see console.';
            statusEl.classList.add('error');
        }
        console.error('Export failed:', e);
    }
}

async function handleImportBackupFileSelected(inputEl) {
    const statusEl = document.getElementById('backup-import-status');
    const file = inputEl.files && inputEl.files[0];
    inputEl.value = '';
    if (!file) return;

    const confirmed = confirm(
        'Importing will overwrite any existing data that shares an ID with this backup. ' +
        'This is meant for restoring into a fresh install, not merging two devices. Continue?'
    );
    if (!confirmed) return;

    if (statusEl) {
        statusEl.textContent = 'Importing...';
        statusEl.classList.remove('error');
    }
    try {
        const payload = await readFileAsJson(file);
        const result = await importAllData(payload);
        if (statusEl) statusEl.textContent = `Restored ${result.totalRows} rows. Reloading...`;
        setTimeout(() => window.location.reload(), 800);
    } catch (e) {
        if (statusEl) {
            statusEl.textContent = e.message || 'Import failed — see console.';
            statusEl.classList.add('error');
        }
        console.error('Import failed:', e);
    }
}

// ===== Invite a friend (Setup tab) =====

function buildInviteMessage() {
    const active = (typeof getActiveSpace === 'function') ? getActiveSpace() : null;
    const targetLanguage = (active && active.target_language) || 'English';
    return `Meet my new daily companion — Fraza.

I use it to capture the phrases I actually need in everyday life — a quick note, a word lookup, or a hands-free voice recording — so I can start sounding like myself, naturally, in ${targetLanguage}.

Try it: https://rotemhonpauker.github.io/EnglishTutor/

It's free, runs right in your browser, and everything stays on your own device. The only thing you need is your own free Google Gemini API key — the app walks you through creating one — so everything runs through your own private account, with nothing leaking out.

Setup help or questions: https://github.com/rotemhonpauker/EnglishTutor`;
}

async function handleCopyInviteClick() {
    const statusEl = document.getElementById('invite-status');
    const message = buildInviteMessage();
    try {
        await navigator.clipboard.writeText(message);
        if (statusEl) {
            statusEl.textContent = 'Copied! Paste it into WhatsApp or wherever.';
            statusEl.classList.remove('error');
        }
    } catch (e) {
        if (statusEl) {
            statusEl.textContent = 'Could not copy automatically — select and copy the message below:';
            statusEl.classList.add('error');
        }
        console.error('Clipboard copy failed:', e);
        alert(message);
    }
}