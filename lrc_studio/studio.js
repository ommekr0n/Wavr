/**
 * Enhanced LRC Studio - Standalone Client Logic
 * Smooth 60fps Karaoke Renderer & Micro-Nudge Editor
 */

let audioPlayer = new Audio();
let audioFile = null;
let currentLrcData = []; // Array of { start, end, text, words: [{word, start, end}] }
let activeLineIndex = -1;
let animFrameId = null;
let currentDecimals = 3;

document.addEventListener('DOMContentLoaded', () => {
  initUI();
  setupAudioListeners();
});

function initUI() {
  const dropzone = document.getElementById('dropzone');
  const audioInput = document.getElementById('audioInput');
  const playBtn = document.getElementById('playBtn');
  const timelineRange = document.getElementById('timelineRange');
  const alignBtn = document.getElementById('alignBtn');
  const copyLrcBtn = document.getElementById('copyLrcBtn');
  const downloadLrcBtn = document.getElementById('downloadLrcBtn');
  const tabEditor = document.getElementById('tabEditor');
  const tabRaw = document.getElementById('tabRaw');

  dropzone.addEventListener('click', () => audioInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleAudioSelected(e.dataTransfer.files[0]);
    }
  });

  audioInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleAudioSelected(e.target.files[0]);
    }
  });

  playBtn.addEventListener('click', () => {
    if (!audioPlayer.src) return;
    if (audioPlayer.paused) {
      audioPlayer.play();
      playBtn.textContent = '⏸';
      startSmoothLoop();
    } else {
      audioPlayer.pause();
      playBtn.textContent = '▶';
      stopSmoothLoop();
    }
  });

  timelineRange.addEventListener('input', (e) => {
    if (!audioPlayer.duration) return;
    const targetTime = (e.target.value / 100) * audioPlayer.duration;
    audioPlayer.currentTime = targetTime;
    updateKaraokeDisplay(targetTime);
  });

  alignBtn.addEventListener('click', runAutoAlignment);

  copyLrcBtn.addEventListener('click', copyLrcToClipboard);
  downloadLrcBtn.addEventListener('click', downloadLrcFile);

  tabEditor.addEventListener('click', () => switchTab('editor'));
  tabRaw.addEventListener('click', () => switchTab('raw'));
}

function handleAudioSelected(file) {
  audioFile = file;
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileInfo').style.display = 'flex';
  
  const objectUrl = URL.createObjectURL(file);
  audioPlayer.src = objectUrl;
  audioPlayer.load();
}

function setupAudioListeners() {
  audioPlayer.addEventListener('loadedmetadata', () => {
    document.getElementById('totalTime').textContent = formatTime(audioPlayer.duration, currentDecimals);
  });

  audioPlayer.addEventListener('pause', () => {
    document.getElementById('playBtn').textContent = '▶';
    stopSmoothLoop();
  });

  audioPlayer.addEventListener('play', () => {
    document.getElementById('playBtn').textContent = '⏸';
    startSmoothLoop();
  });

  audioPlayer.addEventListener('ended', () => {
    document.getElementById('playBtn').textContent = '▶';
    stopSmoothLoop();
  });
}

function startSmoothLoop() {
  stopSmoothLoop();
  function loop() {
    if (!audioPlayer.paused) {
      const cur = audioPlayer.currentTime;
      const dur = audioPlayer.duration || 1;
      document.getElementById('currentTime').textContent = formatTime(cur, currentDecimals);
      document.getElementById('timelineRange').value = (cur / dur) * 100;
      updateKaraokeDisplay(cur);
      animFrameId = requestAnimationFrame(loop);
    }
  }
  animFrameId = requestAnimationFrame(loop);
}

function stopSmoothLoop() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

function formatTime(seconds, decimals = 3) {
  if (!seconds || isNaN(seconds)) return decimals === 3 ? "00:00.000" : "00:00.00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (decimals === 3) {
    return `${m.toString().padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
  } else {
    return `${m.toString().padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
  }
}

async function runAutoAlignment() {
  const lyricsText = document.getElementById('lyricsInput').value.trim();
  if (!lyricsText) {
    alert("Vui lòng nhập văn bản lời bài hát (Plain Text Lyrics).");
    return;
  }
  if (!audioFile) {
    alert("Vui lòng tải lên file âm thanh.");
    return;
  }

  const alignBtn = document.getElementById('alignBtn');
  const progressBox = document.getElementById('progressBox');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');

  currentDecimals = 3;

  alignBtn.disabled = true;
  progressBox.style.display = 'flex';
  progressFill.style.width = '25%';
  progressText.textContent = 'Đang xử lý âm thanh & phân tích tự động...';

  try {
    let apiUrl = document.getElementById('apiUrlInput').value.trim() || '/api/align';
    if (!apiUrl.includes('/api/align')) {
      if (apiUrl.endsWith('/')) apiUrl += 'api/align';
      else apiUrl += '/api/align';
    }

    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('lyrics', lyricsText);

    progressFill.style.width = '65%';
    progressText.textContent = 'Đang căn chỉnh lời Rap (Meta AI MMS-300M)...';

    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error(`HTTP Error: ${response.statusText}`);

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    progressFill.style.width = '100%';
    progressText.textContent = 'Hoàn tất bắt lời độ chính xác cao!';

    currentLrcData = data.lines;
    renderTimelineEditor();
    renderRawLrcText(data.lrc);

    setTimeout(() => {
      progressBox.style.display = 'none';
      alignBtn.disabled = false;
    }, 800);

  } catch (err) {
    console.warn("Client fallback alignment triggered...", err);
    progressText.textContent = 'Chạy chế độ căn lề Client-side...';
    runClientSideFallbackAligner(lyricsText);

    setTimeout(() => {
      progressBox.style.display = 'none';
      alignBtn.disabled = false;
    }, 600);
  }
}

function runClientSideFallbackAligner(text) {
  const duration = audioPlayer.duration || 180;
  const rawLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const totalWords = rawLines.reduce((acc, l) => acc + l.split(/\s+/).length, 0);
  const timePerWord = Math.min(0.35, (duration * 0.85) / totalWords);

  let currentTime = 3.0;
  const resultLines = [];

  for (let lIndex = 0; lIndex < rawLines.length; lIndex++) {
    const lineText = rawLines[lIndex];
    const words = lineText.split(/\s+/);
    const lineStart = currentTime;
    const wordList = [];

    for (let wIndex = 0; wIndex < words.length; wIndex++) {
      const wStr = words[wIndex];
      const wStart = currentTime;
      const wEnd = currentTime + timePerWord;
      currentTime = wEnd;
      
      wordList.push({
        word: wStr,
        start: parseFloat(wStart.toFixed(currentDecimals)),
        end: parseFloat(wEnd.toFixed(currentDecimals))
      });
    }

    const lineEnd = wordList[wordList.length - 1].end;
    resultLines.push({
      start: parseFloat(lineStart.toFixed(currentDecimals)),
      end: parseFloat(lineEnd.toFixed(currentDecimals)),
      text: lineText,
      words: wordList
    });

    currentTime += 0.8;
  }

  currentLrcData = resultLines;
  renderTimelineEditor();
  generateAndDisplayLrcFromData();
}

function updateKaraokeDisplay(time) {
  if (!currentLrcData || currentLrcData.length === 0) return;

  // Instant Line Search: Find the exact line whose start time has arrived
  let lineIdx = -1;
  for (let i = 0; i < currentLrcData.length; i++) {
    if (time >= currentLrcData[i].start) {
      lineIdx = i;
    } else {
      break;
    }
  }
  if (lineIdx === -1) lineIdx = 0;

  if (lineIdx !== activeLineIndex) {
    activeLineIndex = lineIdx;
    const prevLineText = lineIdx > 0 ? currentLrcData[lineIdx - 1].text : '';
    const nextLineText = lineIdx < currentLrcData.length - 1 ? currentLrcData[lineIdx + 1].text : '';
    document.getElementById('karaokePrev').textContent = prevLineText;
    document.getElementById('karaokeNext').textContent = nextLineText;
    
    const curLineContainer = document.getElementById('karaokeCurrent');
    curLineContainer.innerHTML = '';
    currentLrcData[lineIdx].words.forEach((w) => {
      const span = document.createElement('span');
      span.className = 'karaoke-word';
      span.textContent = w.word;
      curLineContainer.appendChild(span);
    });

    highlightActiveLineInEditor(lineIdx);
  }

  const currentLineObj = currentLrcData[activeLineIndex];
  if (currentLineObj && currentLineObj.words) {
    const wordSpans = document.querySelectorAll('#karaokeCurrent .karaoke-word');
    const numWords = currentLineObj.words.length;

    currentLineObj.words.forEach((w, wIdx) => {
      const span = wordSpans[wIdx];
      if (!span) return;

      const nextWordStart = (wIdx < numWords - 1) ? currentLineObj.words[wIdx + 1].start : currentLineObj.end;

      if (time >= w.start && time < nextWordStart) {
        if (!span.classList.contains('active')) {
          span.className = 'karaoke-word active';
        }
      } else if (time >= nextWordStart) {
        if (!span.classList.contains('passed')) {
          span.className = 'karaoke-word passed';
        }
      } else {
        span.className = 'karaoke-word';
      }
    });
  }
}

function renderTimelineEditor() {
  const container = document.getElementById('timelineList');
  container.innerHTML = '';

  currentLrcData.forEach((line, lIdx) => {
    const card = document.createElement('div');
    card.className = 'line-item-card';
    card.dataset.index = lIdx;
    card.onclick = () => {
      audioPlayer.currentTime = line.start;
      updateKaraokeDisplay(line.start);
    };

    const header = document.createElement('div');
    header.className = 'line-header';

    const tsBadge = document.createElement('span');
    tsBadge.className = 'timestamp-badge';
    tsBadge.textContent = `[${formatTime(line.start, currentDecimals)}] - [${formatTime(line.end, currentDecimals)}]`;

    const lineTextSpan = document.createElement('span');
    lineTextSpan.style.fontWeight = '600';
    lineTextSpan.style.color = '#f1f5f9';
    lineTextSpan.textContent = line.text;

    header.appendChild(tsBadge);
    header.appendChild(lineTextSpan);
    card.appendChild(header);

    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'words-chip-container';

    line.words.forEach((w, wIdx) => {
      const chip = document.createElement('div');
      chip.className = 'word-chip';
      chip.onclick = (e) => {
        e.stopPropagation();
        audioPlayer.currentTime = w.start;
        updateKaraokeDisplay(w.start);
      };

      const wordSpan = document.createElement('span');
      wordSpan.textContent = w.word;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'chip-time';
      timeSpan.textContent = formatTime(w.start, currentDecimals);

      const btnMinus = document.createElement('button');
      btnMinus.className = 'nudge-btn';
      btnMinus.textContent = '-';
      btnMinus.title = 'Giảm 0.05s';
      btnMinus.onclick = (e) => {
        e.stopPropagation();
        nudgeWordTime(lIdx, wIdx, -0.05);
      };

      const btnPlus = document.createElement('button');
      btnPlus.className = 'nudge-btn';
      btnPlus.textContent = '+';
      btnPlus.title = 'Tăng 0.05s';
      btnPlus.onclick = (e) => {
        e.stopPropagation();
        nudgeWordTime(lIdx, wIdx, 0.05);
      };

      chip.appendChild(wordSpan);
      chip.appendChild(timeSpan);
      chip.appendChild(btnMinus);
      chip.appendChild(btnPlus);

      chipsContainer.appendChild(chip);
    });

    // Add End-Of-Line Chip
    const eolChip = document.createElement('div');
    eolChip.className = 'word-chip eol-chip';
    eolChip.style.background = 'rgba(234, 179, 8, 0.15)';
    eolChip.style.borderColor = 'rgba(234, 179, 8, 0.4)';
    eolChip.style.color = '#fef08a';

    const eolLabel = document.createElement('span');
    eolLabel.textContent = '↵ end of line';
    eolLabel.style.fontWeight = '600';

    const eolTimeSpan = document.createElement('span');
    eolTimeSpan.className = 'chip-time';
    eolTimeSpan.textContent = formatTime(line.end, currentDecimals);

    eolChip.appendChild(eolLabel);
    eolChip.appendChild(eolTimeSpan);
    chipsContainer.appendChild(eolChip);

    card.appendChild(chipsContainer);
    container.appendChild(card);
  });
}

function nudgeWordTime(lineIdx, wordIdx, delta) {
  const targetWord = currentLrcData[lineIdx].words[wordIdx];
  targetWord.start = Math.max(0, parseFloat((targetWord.start + delta).toFixed(currentDecimals)));
  targetWord.end = Math.max(targetWord.start + 0.03, parseFloat((targetWord.end + delta).toFixed(currentDecimals)));

  if (wordIdx === 0) {
    currentLrcData[lineIdx].start = targetWord.start;
  }
  if (wordIdx === currentLrcData[lineIdx].words.length - 1) {
    currentLrcData[lineIdx].end = targetWord.end;
  }

  renderTimelineEditor();
  generateAndDisplayLrcFromData();
}

function highlightActiveLineInEditor(activeIdx) {
  const cards = document.querySelectorAll('.line-item-card');
  cards.forEach((card, idx) => {
    if (idx === activeIdx) {
      card.classList.add('active-playing');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      card.classList.remove('active-playing');
    }
  });
}

function generateAndDisplayLrcFromData() {
  const lrcLines = [
    "[ar:Enhanced LRC Studio]",
    "[al:Meta AI MMS-300M Neural Aligner]",
    "[by:Antigravity AI]",
    ""
  ];

  currentLrcData.forEach(line => {
    const lineTs = formatTime(line.start, currentDecimals);
    const wordParts = line.words.map(w => `<${formatTime(w.start, currentDecimals)}>${w.word}`);
    const endTs = formatTime(line.end, currentDecimals);
    wordParts.push(`<${endTs}>`);
    lrcLines.push(`[${lineTs}] ${wordParts.join(' ')}`);
  });

  const lrcText = lrcLines.join('\n');
  renderRawLrcText(lrcText);
}

function renderRawLrcText(text) {
  document.getElementById('rawLrcTextarea').value = text;
}

function switchTab(tabName) {
  const tabEditor = document.getElementById('tabEditor');
  const tabRaw = document.getElementById('tabRaw');
  const timelineList = document.getElementById('timelineList');
  const rawLrcBox = document.getElementById('rawLrcBox');

  if (tabName === 'editor') {
    tabEditor.classList.add('active');
    tabRaw.classList.remove('active');
    timelineList.style.display = 'flex';
    rawLrcBox.style.display = 'none';
  } else {
    tabRaw.classList.add('active');
    tabEditor.classList.remove('active');
    timelineList.style.display = 'none';
    rawLrcBox.style.display = 'block';
  }
}

function copyLrcToClipboard() {
  let text = document.getElementById('rawLrcTextarea').value;
  if (!text && currentLrcData && currentLrcData.length > 0) {
    generateAndDisplayLrcFromData();
    text = document.getElementById('rawLrcTextarea').value;
  }
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    alert("Đã sao chép nội dung Enhanced LRC!");
  });
}

function downloadLrcFile() {
  let text = document.getElementById('rawLrcTextarea').value;
  if (!text && currentLrcData && currentLrcData.length > 0) {
    generateAndDisplayLrcFromData();
    text = document.getElementById('rawLrcTextarea').value;
  }
  if (!text) {
    alert("Vui lòng thực hiện Bắt Lời trước khi tải file .lrc");
    return;
  }

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileName = audioFile ? audioFile.name.replace(/\.[^/.]+$/, "") + ".lrc" : "lyrics.lrc";
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
