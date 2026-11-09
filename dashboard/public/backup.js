// backup.js — Export/Import for this device's IndexedDB data (see
// localDb.js). This is the only way data ever moves between devices now
// that there's no shared database — two separate uses in one feature:
//
//   1. A safety-net backup (clearing browser data, losing the device,
//      switching browsers) — export occasionally, keep the file somewhere.
//   2. A one-time transfer to a new device — export on the old one,
//      import on the new one.
//
// It is NOT a sync mechanism: import replaces a store's rows wholesale
// (by id) rather than merging intelligently, so it's meant for restoring
// into an empty/fresh install, not for reconciling two devices that have
// both been used independently. See the Setup tab UI (spaceRules.js) for
// where these are wired to buttons.

// 'slots' added here (was missing before — export/import silently skipped
// reminders entirely until now). Listed after 'tags' since a slot's
// tag_ids reference tag rows, same dependency-order reasoning as the rest
// of this list.
const BACKUP_STORE_ORDER = ['spaces', 'tags', 'slots', 'phrases', 'dictionary', 'transcripts'];

// Reads every row from every store, in one object, and triggers a
// download of it as a timestamped .json file. IDs are kept exactly as
// stored, so an import can restore them with all their original
// relationships (phrase.tag_id -> tag.id, tag.space_id -> space.id, etc.)
// intact.
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

// Opens the device's default mail app with a prefilled draft, as a
// reminder to attach the just-downloaded backup file and send it
// somewhere off this device. Browsers don't allow a file download to be
// attached to a mailto: draft automatically — the person still has to
// manually attach it from Downloads in whatever mail app opens — so this
// is a convenience nudge, not a real attachment.
function openBackupMailtoReminder(filename) {
    const subject = `Fraza backup — ${filename}`;
    const body = `Reminder: attach "${filename}" from your Downloads folder before sending.\n\n` +
        `(Browsers can't attach a downloaded file to an email automatically — this draft is just a nudge so you don't forget.)`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
}

// Restores a backup file produced by exportAllData(). Meant for an
// empty/fresh install: rows are written with their original ids via put()
// (insert-or-overwrite), inserted in dependency order (spaces, then
// everything that references them) inside one transaction, so a restore
// into a database that already has data with the SAME ids would silently
// overwrite those rows rather than merge or duplicate them — by design,
// since this isn't a sync tool (see the file-level note above).
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

// Reads a File (from an <input type="file"> change event) as parsed JSON.
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

// --- Setup-tab UI glue ---------------------------------------------------
// Wired to the "Backup" section in index.html (view-tags). Kept here
// rather than in spaceRules.js so the whole backup feature — logic and
// UI handler — lives in one file.

// Friendly singular/plural labels for the per-table counts shown after an
// export, keyed by store name.
const BACKUP_STORE_LABELS = {
    spaces: 'space',
    tags: 'tag',
    slots: 'reminder',
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
    inputEl.value = ''; // allow re-selecting the same file later
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