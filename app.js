// ===== SRT Parser =====
function parseSRT(text) {
  const blocks = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\n+/);
  const entries = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    const index = parseInt(lines[0].trim(), 10);
    const timeLine = lines[1].trim();
    const textLines = lines.slice(2).join(' ').replace(/<[^>]+>/g, '').trim();

    const timeMatch = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!timeMatch) continue;

    const startMs = toMs(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
    const endMs   = toMs(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);

    entries.push({ index, start: startMs, end: endMs, duration: endMs - startMs, text: textLines });
  }
  return entries;
}

function toMs(h, m, s, ms) {
  return (+h * 3600000) + (+m * 60000) + (+s * 1000) + +ms;
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return `${pad(h)}:${pad(m % 60)}:${pad(s % 60)}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// ===== State =====
let srtEntries = [];
let currentIndex = 0;
let isPaused = false;
let isStopped = true;
let pausedAt = 0;
let currentUtterance = null;
let speakTimeout = null;

// ===== Voice Loading =====
const voiceSelect = document.getElementById('voiceSelect');

function populateVoices() {
  const voices = speechSynthesis.getVoices();

  // Microsoft Khmer voices (highest priority)
  const msKhmerVoices = voices.filter(v =>
    v.name.toLowerCase().includes('microsoft') &&
    (v.lang.startsWith('km') || v.name.toLowerCase().includes('khmer'))
  );
  // Other Khmer voices (non-Microsoft)
  const otherKhmerVoices = voices.filter(v =>
    !v.name.toLowerCase().includes('microsoft') &&
    (v.lang.startsWith('km') || v.name.toLowerCase().includes('khmer'))
  );
  // Other Microsoft voices (non-Khmer)
  const otherMsVoices = voices.filter(v =>
    v.name.toLowerCase().includes('microsoft') &&
    !v.lang.startsWith('km') && !v.name.toLowerCase().includes('khmer')
  );
  // All remaining voices
  const otherVoices = voices.filter(v =>
    !v.name.toLowerCase().includes('microsoft') &&
    !v.lang.startsWith('km') && !v.name.toLowerCase().includes('khmer')
  );

  voiceSelect.innerHTML = '';

  // Group 1: Microsoft Khmer (first priority)
  if (msKhmerVoices.length > 0) {
    const g1 = document.createElement('optgroup');
    g1.label = '🪟🇰🇭 Microsoft Khmer';
    msKhmerVoices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      g1.appendChild(opt);
    });
    voiceSelect.appendChild(g1);
  }

  // Group 2: Other Khmer voices
  if (otherKhmerVoices.length > 0) {
    const g2 = document.createElement('optgroup');
    g2.label = '🇰🇭 ខ្មែរ';
    otherKhmerVoices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      g2.appendChild(opt);
    });
    voiceSelect.appendChild(g2);
  }

  // Group 3: Other Microsoft voices
  if (otherMsVoices.length > 0) {
    const g3 = document.createElement('optgroup');
    g3.label = '🪟 Microsoft';
    otherMsVoices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      g3.appendChild(opt);
    });
    voiceSelect.appendChild(g3);
  }

  // Group 4: All other voices
  if (otherVoices.length > 0) {
    const g4 = document.createElement('optgroup');
    g4.label = '🌐 ទាំងអស់';
    otherVoices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      g4.appendChild(opt);
    });
    voiceSelect.appendChild(g4);
  }

  // Auto-select: Microsoft Khmer > Other Khmer > Any Microsoft
  if (msKhmerVoices.length > 0) {
    voiceSelect.value = msKhmerVoices[0].name;
  } else if (otherKhmerVoices.length > 0) {
    voiceSelect.value = otherKhmerVoices[0].name;
  } else if (otherMsVoices.length > 0) {
    voiceSelect.value = otherMsVoices[0].name;
  }

  // Show warning if no Khmer voice found
  const voiceWarning = document.getElementById('voiceWarning');
  const hasKhmer = msKhmerVoices.length > 0 || otherKhmerVoices.length > 0;
  voiceWarning.style.display = hasKhmer ? 'none' : 'block';
}

// Retry loading voices up to 10 times (fixes slow-load browsers)
let voiceLoadAttempts = 0;
function tryLoadVoices() {
  const voices = speechSynthesis.getVoices();
  if (voices.length > 0) {
    populateVoices();
  } else if (voiceLoadAttempts < 10) {
    voiceLoadAttempts++;
    setTimeout(tryLoadVoices, 300);
  }
}

speechSynthesis.onvoiceschanged = () => { voiceLoadAttempts = 0; populateVoices(); };
tryLoadVoices();

document.getElementById('btnRefreshVoices').addEventListener('click', () => {
  voiceLoadAttempts = 0;
  tryLoadVoices();
});

// ===== Rate & Pitch =====
const rateRange = document.getElementById('rateRange');
const pitchRange = document.getElementById('pitchRange');
const rateValue = document.getElementById('rateValue');
const pitchValue = document.getElementById('pitchValue');

rateRange.addEventListener('input', () => { rateValue.textContent = parseFloat(rateRange.value).toFixed(1); });
pitchRange.addEventListener('input', () => { pitchValue.textContent = parseFloat(pitchRange.value).toFixed(1); });

// ===== File Input =====
const srtFile = document.getElementById('srtFile');
const fileNameSpan = document.getElementById('fileName');
const previewSection = document.getElementById('previewSection');
const exportSection = document.getElementById('exportSection');
const srtList = document.getElementById('srtList');
const btnPlay = document.getElementById('btnPlay');

srtFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  fileNameSpan.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (evt) => {
    srtEntries = parseSRT(evt.target.result);
    renderSRTList();
    if (srtEntries.length > 0) {
      previewSection.style.display = 'block';
      exportSection.style.display = 'block';
      btnPlay.disabled = false;
    }
  };
  reader.readAsText(file, 'UTF-8');
});

function renderSRTList() {
  srtList.innerHTML = '';
  srtEntries.forEach((entry, i) => {
    const div = document.createElement('div');
    div.className = 'srt-item';
    div.id = `srt-item-${i}`;
    div.innerHTML = `
      <span class="srt-index">${entry.index}</span>
      <span class="srt-time">${formatTime(entry.start)}</span>
      <span class="srt-text">${entry.text}</span>
    `;
    srtList.appendChild(div);
  });
}

// ===== Controls =====
const btnPause = document.getElementById('btnPause');
const btnStop  = document.getElementById('btnStop');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const currentIdxEl = document.getElementById('currentIdx');
const totalIdxEl   = document.getElementById('totalIdx');
const currentSubtitle = document.getElementById('currentSubtitle');

btnPlay.addEventListener('click', () => {
  if (srtEntries.length === 0) return;

  if (isPaused) {
    isPaused = false;
    speechSynthesis.resume();
    btnPause.disabled = false;
    btnPlay.disabled = true;
    return;
  }

  isStopped = false;
  currentIndex = 0;
  progressSection.style.display = 'block';
  totalIdxEl.textContent = srtEntries.length;
  btnPlay.disabled = true;
  btnPause.disabled = false;
  btnStop.disabled = false;

  speakNext();
});

btnPause.addEventListener('click', () => {
  if (speechSynthesis.speaking && !isPaused) {
    isPaused = true;
    speechSynthesis.pause();
    btnPause.disabled = true;
    btnPlay.disabled = false;
    btnPlay.textContent = '▶ បន្ត';
  }
});

btnStop.addEventListener('click', () => {
  stopAll();
});

function stopAll() {
  isStopped = true;
  isPaused = false;
  clearTimeout(speakTimeout);
  speechSynthesis.cancel();
  btnPlay.disabled = false;
  btnPlay.textContent = '▶ ចាក់';
  btnPause.disabled = true;
  btnStop.disabled = true;
  currentSubtitle.textContent = '';
  progressFill.style.width = '0%';
  document.querySelectorAll('.srt-item.active').forEach(el => el.classList.remove('active'));
}

// ===== Timed Speech with SRT timing =====
function speakNext() {
  if (isStopped || currentIndex >= srtEntries.length) {
    if (!isStopped) {
      currentSubtitle.textContent = '✅ បញ្ចប់ការចាក់!';
      btnPlay.disabled = false;
      btnPlay.textContent = '▶ ចាក់ម្តងទៀត';
      btnPause.disabled = true;
      btnStop.disabled = true;
    }
    return;
  }

  const entry = srtEntries[currentIndex];
  const startOffset = currentIndex === 0 ? entry.start : 0;

  // Update UI
  currentIdxEl.textContent = currentIndex + 1;
  progressFill.style.width = `${((currentIndex + 1) / srtEntries.length) * 100}%`;
  currentSubtitle.textContent = entry.text;

  // Highlight in list
  document.querySelectorAll('.srt-item.active').forEach(el => el.classList.remove('active'));
  const activeItem = document.getElementById(`srt-item-${currentIndex}`);
  if (activeItem) {
    activeItem.classList.add('active');
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Speak with SRT gap (delay for first entry start time, then use duration)
  const gapDelay = currentIndex === 0 ? entry.start : 0;
  const afterDelay = currentIndex > 0 ? computeGap(currentIndex) : 0;

  speakTimeout = setTimeout(() => {
    if (isStopped) return;
    const utter = new SpeechSynthesisUtterance(entry.text);

    // Set voice
    const voices = speechSynthesis.getVoices();
    const selectedVoice = voices.find(v => v.name === voiceSelect.value);
    if (selectedVoice) utter.voice = selectedVoice;
    utter.lang = selectedVoice ? selectedVoice.lang : 'km-KH';
    utter.rate = parseFloat(rateRange.value);
    utter.pitch = parseFloat(pitchRange.value);

    utter.onend = () => {
      if (isStopped) return;
      currentIndex++;
      speakNext();
    };

    utter.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      currentIndex++;
      speakNext();
    };

    currentUtterance = utter;
    speechSynthesis.speak(utter);
  }, gapDelay + afterDelay);
}

function computeGap(idx) {
  if (idx === 0) return srtEntries[0].start;
  const prev = srtEntries[idx - 1];
  const curr = srtEntries[idx];
  const gap = curr.start - prev.end;
  return gap > 0 ? gap : 0;
}

// ===== Export (Record via MediaRecorder + SpeechSynthesis) =====
document.getElementById('btnExport').addEventListener('click', async () => {
  if (srtEntries.length === 0) return;

  // Use AudioContext + MediaStreamDestination to capture speech
  try {
    const btn = document.getElementById('btnExport');
    btn.textContent = '⏳ កំពុងថត...';
    btn.disabled = true;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();

    // MediaRecorder
    const recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'khmer-speech.webm';
      a.click();
      URL.revokeObjectURL(url);
      btn.textContent = '📥 ទាញយក MP3 (ផ្សំសំឡេង)';
      btn.disabled = false;
    };

    recorder.start();

    // Speak all entries sequentially with timing
    let totalDelay = 0;
    for (let i = 0; i < srtEntries.length; i++) {
      const entry = srtEntries[i];
      const gap = i === 0 ? entry.start : Math.max(0, entry.start - srtEntries[i-1].end);
      totalDelay += gap;
      await new Promise(resolve => {
        setTimeout(() => {
          const utter = new SpeechSynthesisUtterance(entry.text);
          const voices = speechSynthesis.getVoices();
          const selectedVoice = voices.find(v => v.name === voiceSelect.value);
          if (selectedVoice) utter.voice = selectedVoice;
          utter.lang = selectedVoice ? selectedVoice.lang : 'km-KH';
          utter.rate = parseFloat(rateRange.value);
          utter.pitch = parseFloat(pitchRange.value);
          utter.onend = resolve;
          utter.onerror = resolve;
          speechSynthesis.speak(utter);
        }, totalDelay);
      });
    }

    setTimeout(() => recorder.stop(), 500);
  } catch (err) {
    alert('មិនអាចថតបាន: ' + err.message + '\nសូមប្រើ Chrome ឬ Edge ។');
    const btn = document.getElementById('btnExport');
    btn.textContent = '📥 ទាញយក MP3 (ផ្សំសំឡេង)';
    btn.disabled = false;
  }
});
