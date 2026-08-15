const recordingLog = document.getElementById('recording-log');

function enterRecordingTab(btnEl) {
    showView('recording', btnEl);
    recordingLog.innerHTML = '';
}

async function handleRecordingFileSelected(inputEl) {
    const file = inputEl.files[0];
    inputEl.value = ''; // allow picking the same file again later
    if (!file) return;

    const uploadBtn = document.getElementById('recording-upload-btn');
    const originalText = uploadBtn.textContent;
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Processing... this can take a minute';

    addRecordingStatus('Uploading and processing your recording...');

    try {
        const audioBase64 = await fileToBase64(file);

        const res = await fetch('/recordings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audioBase64,
                mimeType: file.type || 'audio/mp4',
                spaceId: activeSpaceId
            })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to process recording');
        }
        const data = await res.json();

        recordingLog.innerHTML = '';
        if (!data.phrases || data.phrases.length === 0) {
            addRecordingStatus("Didn't find any phrases worth capturing in that recording.");
        } else {
            data.phrases.forEach(addRecordingResult);
        }

        await loadTable(); // the new phrases are already saved — refresh the table too
    } catch (err) {
        recordingLog.innerHTML = '';
        addRecordingStatus(err.message || "Something went wrong processing that recording — try again.");
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = originalText;
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function addRecordingResult(phrase) {
    const div = document.createElement('div');
    div.className = 'new-phrase-item';
    div.innerHTML = `
        <div class="phrase-hebrew">${phrase.hebrew_text || ''}</div>
        <div class="phrase-variant">${phrase.variant_1 || ''}</div>
        <div class="phrase-variant">${phrase.variant_2 || ''}</div>
    `;
    recordingLog.appendChild(div);
    recordingLog.scrollTop = recordingLog.scrollHeight;
}

function addRecordingStatus(text) {
    const div = document.createElement('div');
    div.className = 'new-phrase-item error';
    div.textContent = text;
    recordingLog.appendChild(div);
    recordingLog.scrollTop = recordingLog.scrollHeight;
}