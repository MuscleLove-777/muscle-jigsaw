/* ============================================================
   筋肉ジグソーパズル / Muscle Jigsaw - MuscleLove
   ============================================================ */

(() => {
  'use strict';

  // ── State ──
  const state = {
    cols: 4,
    rows: 4,
    imageIndex: 0,
    imageSrc: '',
    timer: 0,
    timerInterval: null,
    moves: 0,
    placed: 0,
    total: 16,
    soundOn: true,
    hintOn: false,
    dragPiece: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    board: [],       // which piece index is placed at each cell (-1 = empty)
    completed: false,
  };

  // ── DOM ──
  const $ = id => document.getElementById(id);
  const startScreen = $('start-screen');
  const gameScreen = $('game-screen');
  const resultScreen = $('result-screen');
  const puzzleBoard = $('puzzle-board');
  const pieceTray = $('piece-tray');
  const refImg = $('ref-img');
  const timerEl = $('timer');
  const movesEl = $('moves');
  const progressEl = $('progress');

  // ── Audio (Web Audio API) ──
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, duration, type = 'square', volume = 0.15) {
    if (!state.soundOn) return;
    try {
      ensureAudio();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(volume, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) { /* ignore */ }
  }

  function sfxPickup() { playTone(600, 0.08, 'square', 0.1); }
  function sfxCorrect() {
    playTone(800, 0.12, 'square', 0.15);
    setTimeout(() => playTone(1200, 0.15, 'square', 0.12), 80);
  }
  function sfxWrong() { playTone(200, 0.25, 'sawtooth', 0.12); }
  function sfxComplete() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => playTone(f, 0.3, 'square', 0.15), i * 150));
  }

  // ── Screens ──
  function showScreen(screen) {
    [startScreen, gameScreen, resultScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  // ── Format time ──
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ── Difficulty select ──
  document.querySelectorAll('.btn-difficulty').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-difficulty').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.cols = parseInt(btn.dataset.cols);
      state.rows = parseInt(btn.dataset.rows);
    });
  });

  // ── Start game ──
  $('btn-start').addEventListener('click', () => {
    ensureAudio();
    startGame();
  });

  $('btn-back').addEventListener('click', () => {
    stopTimer();
    showScreen(startScreen);
  });

  $('btn-sound').addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    $('btn-sound').textContent = state.soundOn ? '🔊' : '🔇';
  });

  $('btn-hint').addEventListener('click', () => {
    state.hintOn = !state.hintOn;
    $('btn-hint').style.opacity = state.hintOn ? '1' : '0.5';
    updateGhosts();
  });

  $('btn-share').addEventListener('click', shareResult);
  $('btn-retry').addEventListener('click', () => startGame());
  $('btn-new').addEventListener('click', () => {
    state.imageIndex = 0; // force re-random
    startGame();
  });

  function startGame() {
    // Pick random image
    state.imageIndex = Math.floor(Math.random() * 10) + 1;
    state.imageSrc = `images/img${state.imageIndex}.png`;
    state.total = state.cols * state.rows;
    state.moves = 0;
    state.placed = 0;
    state.timer = 0;
    state.completed = false;
    state.hintOn = false;
    state.board = new Array(state.total).fill(-1);

    // Set reference image
    refImg.src = state.imageSrc;

    // Build board
    buildBoard();

    // Build pieces
    buildPieces();

    // Update UI
    updateUI();
    $('btn-hint').style.opacity = '0.5';
    showScreen(gameScreen);
    startTimer();
  }

  function buildBoard() {
    puzzleBoard.innerHTML = '';
    puzzleBoard.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
    puzzleBoard.style.gridTemplateRows = `repeat(${state.rows}, 1fr)`;

    for (let i = 0; i < state.total; i++) {
      const cell = document.createElement('div');
      cell.className = 'board-cell';
      cell.dataset.index = i;

      // Ghost background
      const row = Math.floor(i / state.cols);
      const col = i % state.cols;
      cell.style.backgroundImage = `url(${state.imageSrc})`;
      cell.style.backgroundSize = `${state.cols * 100}% ${state.rows * 100}%`;
      cell.style.backgroundPosition = `${(col / (state.cols - 1)) * 100}% ${(row / (state.rows - 1)) * 100}%`;
      cell.classList.add('ghost');
      if (!state.hintOn) cell.style.opacity = '';

      // Drop events
      cell.addEventListener('dragover', onDragOver);
      cell.addEventListener('dragleave', onDragLeave);
      cell.addEventListener('drop', onDrop);

      // Touch drop target (handled globally)

      puzzleBoard.appendChild(cell);
    }
  }

  function updateGhosts() {
    document.querySelectorAll('.board-cell.ghost').forEach(cell => {
      if (state.board[parseInt(cell.dataset.index)] === -1) {
        cell.style.opacity = state.hintOn ? '0.2' : '';
      }
    });
  }

  function buildPieces() {
    pieceTray.innerHTML = '';

    // Create piece indices and shuffle
    const indices = Array.from({ length: state.total }, (_, i) => i);
    shuffle(indices);

    // Calculate piece size in tray
    const pieceSize = Math.max(40, Math.min(70, 280 / state.cols));

    indices.forEach(idx => {
      const piece = document.createElement('div');
      piece.className = 'puzzle-piece';
      piece.dataset.pieceIndex = idx;
      piece.draggable = true;

      const row = Math.floor(idx / state.cols);
      const col = idx % state.cols;

      piece.style.width = `${pieceSize}px`;
      piece.style.height = `${pieceSize}px`;
      piece.style.backgroundImage = `url(${state.imageSrc})`;
      piece.style.backgroundSize = `${state.cols * 100}% ${state.rows * 100}%`;
      piece.style.backgroundPosition = `${(col / (state.cols - 1 || 1)) * 100}% ${(row / (state.rows - 1 || 1)) * 100}%`;

      // Drag events
      piece.addEventListener('dragstart', onDragStart);
      piece.addEventListener('dragend', onDragEnd);

      // Touch events
      piece.addEventListener('touchstart', onTouchStart, { passive: false });

      pieceTray.appendChild(piece);
    });
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ── Drag & Drop (Mouse) ──
  function onDragStart(e) {
    sfxPickup();
    e.dataTransfer.setData('text/plain', e.target.dataset.pieceIndex);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.style.opacity = '0.5', 0);
  }

  function onDragEnd(e) {
    e.target.style.opacity = '1';
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('highlight');
  }

  function onDragLeave(e) {
    e.currentTarget.classList.remove('highlight');
  }

  function onDrop(e) {
    e.preventDefault();
    const cell = e.currentTarget;
    cell.classList.remove('highlight');
    const pieceIndex = parseInt(e.dataTransfer.getData('text/plain'));
    const cellIndex = parseInt(cell.dataset.index);
    tryPlace(pieceIndex, cellIndex);
  }

  // ── Touch Drag ──
  function onTouchStart(e) {
    if (state.completed) return;
    e.preventDefault();
    const piece = e.currentTarget;
    const touch = e.touches[0];
    const rect = piece.getBoundingClientRect();

    state.dragPiece = piece;
    state.dragOffsetX = touch.clientX - rect.left;
    state.dragOffsetY = touch.clientY - rect.top;

    sfxPickup();

    // Clone visual position
    piece.classList.add('dragging');
    piece.style.left = `${touch.clientX - state.dragOffsetX}px`;
    piece.style.top = `${touch.clientY - state.dragOffsetY}px`;
    piece.style.width = `${rect.width}px`;
    piece.style.height = `${rect.height}px`;

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: false });
  }

  function onTouchMove(e) {
    if (!state.dragPiece) return;
    e.preventDefault();
    const touch = e.touches[0];
    state.dragPiece.style.left = `${touch.clientX - state.dragOffsetX}px`;
    state.dragPiece.style.top = `${touch.clientY - state.dragOffsetY}px`;

    // Highlight cell under finger
    clearHighlights();
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.classList.contains('board-cell')) {
      el.classList.add('highlight');
    }
  }

  function onTouchEnd(e) {
    if (!state.dragPiece) return;
    e.preventDefault();
    const piece = state.dragPiece;
    const touch = e.changedTouches[0];

    clearHighlights();

    // Find cell under drop point
    piece.style.pointerEvents = 'none';
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    piece.style.pointerEvents = '';

    let placed = false;
    if (el && el.classList.contains('board-cell')) {
      const pieceIndex = parseInt(piece.dataset.pieceIndex);
      const cellIndex = parseInt(el.dataset.index);
      placed = tryPlace(pieceIndex, cellIndex);
    }

    if (!placed) {
      // Return to tray
      piece.classList.remove('dragging');
      piece.style.left = '';
      piece.style.top = '';
      piece.style.position = '';
      piece.style.width = '';
      piece.style.height = '';
    }

    state.dragPiece = null;
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
  }

  function clearHighlights() {
    document.querySelectorAll('.board-cell.highlight').forEach(c => c.classList.remove('highlight'));
  }

  // ── Place piece ──
  function tryPlace(pieceIndex, cellIndex) {
    state.moves++;
    updateUI();

    const cell = puzzleBoard.children[cellIndex];

    // Already filled?
    if (state.board[cellIndex] !== -1) {
      sfxWrong();
      animateWrong(pieceIndex);
      return false;
    }

    // Correct placement?
    if (pieceIndex === cellIndex) {
      // Place it!
      state.board[cellIndex] = pieceIndex;
      state.placed++;

      // Remove piece from tray
      const piece = pieceTray.querySelector(`[data-piece-index="${pieceIndex}"]`);
      if (piece) piece.remove();

      // Show placed piece on board
      const placedDiv = document.createElement('div');
      placedDiv.className = 'placed-piece';
      const row = Math.floor(pieceIndex / state.cols);
      const col = pieceIndex % state.cols;
      placedDiv.style.backgroundImage = `url(${state.imageSrc})`;
      placedDiv.style.backgroundSize = `${state.cols * 100}% ${state.rows * 100}%`;
      placedDiv.style.backgroundPosition = `${(col / (state.cols - 1 || 1)) * 100}% ${(row / (state.rows - 1 || 1)) * 100}%`;
      cell.appendChild(placedDiv);
      cell.classList.add('filled');

      sfxCorrect();
      cell.querySelector('.placed-piece').classList.add('correct');

      updateUI();

      // Check win
      if (state.placed === state.total) {
        onComplete();
      }

      return true;
    } else {
      // Wrong position
      sfxWrong();
      animateWrong(pieceIndex);
      return false;
    }
  }

  function animateWrong(pieceIndex) {
    const piece = pieceTray.querySelector(`[data-piece-index="${pieceIndex}"]`);
    if (piece) {
      piece.classList.remove('dragging');
      piece.style.left = '';
      piece.style.top = '';
      piece.style.position = '';
      piece.style.width = '';
      piece.style.height = '';
      piece.classList.add('wrong');
      setTimeout(() => piece.classList.remove('wrong'), 400);
    }
  }

  // ── Timer ──
  function startTimer() {
    stopTimer();
    state.timer = 0;
    state.timerInterval = setInterval(() => {
      state.timer++;
      timerEl.textContent = `⏱ ${formatTime(state.timer)}`;
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  // ── UI update ──
  function updateUI() {
    movesEl.textContent = `🔢 ${state.moves}手`;
    const pct = Math.round((state.placed / state.total) * 100);
    progressEl.textContent = `📊 ${pct}%`;
  }

  // ── Completion ──
  function onComplete() {
    state.completed = true;
    stopTimer();
    sfxComplete();

    setTimeout(() => {
      showResult();
    }, 600);
  }

  function showResult() {
    // Set result data
    $('result-time').textContent = formatTime(state.timer);
    $('result-moves').textContent = state.moves;
    const diffNames = { 9: 'Easy (3x3)', 16: 'Normal (4x4)', 25: 'Hard (5x5)' };
    $('result-difficulty').textContent = diffNames[state.total] || `${state.cols}x${state.rows}`;

    // Result image
    const resultImg = $('result-image');
    resultImg.innerHTML = '';
    const img = document.createElement('img');
    img.src = state.imageSrc;
    img.alt = 'Completed puzzle';
    resultImg.appendChild(img);

    showScreen(resultScreen);
    launchConfetti();
  }

  // ── Confetti ──
  function launchConfetti() {
    const container = $('confetti-container');
    container.innerHTML = '';
    const colors = ['#ff2d78', '#00f5ff', '#ffd700', '#ff6b9d', '#00c4cc', '#fff'];

    for (let i = 0; i < 80; i++) {
      const conf = document.createElement('div');
      conf.className = 'confetti';
      conf.style.left = `${Math.random() * 100}%`;
      conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      conf.style.width = `${6 + Math.random() * 8}px`;
      conf.style.height = `${6 + Math.random() * 8}px`;
      conf.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
      conf.style.animationDuration = `${2 + Math.random() * 3}s`;
      conf.style.animationDelay = `${Math.random() * 1.5}s`;
      container.appendChild(conf);
    }
  }

  // ── Share ──
  function shareResult() {
    const diffNames = { 9: 'Easy', 16: 'Normal', 25: 'Hard' };
    const diff = diffNames[state.total] || `${state.cols}x${state.rows}`;
    const text = `【筋肉ジグソー】${state.moves}手・${formatTime(state.timer)}でクリア！(${diff}) 💪🧩\n#MuscleLove #筋肉パズル\nhttps://www.patreon.com/cw/MuscleLove`;

    if (navigator.share) {
      navigator.share({ text }).catch(() => copyToClipboard(text));
    } else {
      copyToClipboard(text);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      alert('クリップボードにコピーしました！\nCopied to clipboard!');
    }).catch(() => {
      prompt('コピーしてシェア / Copy & share:', text);
    });
  }

})();
