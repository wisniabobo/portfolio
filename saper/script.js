const ICONS = {
    mine: 'https://win98icons.alexmeub.com/icons/mine-0.png',
    flag: 'https://win98icons.alexmeub.com/icons/indicator_flag-0.png',
    smile: 'https://win98icons.alexmeub.com/icons/face_smile-0.png',
    win: 'https://win98icons.alexmeub.com/icons/face_cool-0.png',
    dead: 'https://win98icons.alexmeub.com/icons/face_dead-0.png',
    ooh: 'https://win98icons.alexmeub.com/icons/face_ooh-0.png',
    mine_red: 'https://win98icons.alexmeub.com/icons/mine_red-0.png',
    mine_crossed: 'https://win98icons.alexmeub.com/icons/mine_crossed-0.png'
};

const difficulties = {
    easy: { rows: 9, cols: 9, mines: 10 },
    medium: { rows: 16, cols: 16, mines: 40 },
    hard: { rows: 16, cols: 30, mines: 99 }
};

let currentDiff = 'easy';
let board = [];
let gameOver = false;
let firstClick = true;
let flags = 0;
let time = 0;
let timerInt = null;

const boardEl = document.getElementById('board');
const mineCountEl = document.getElementById('mine-count');
const timerEl = document.getElementById('timer');
const faceImg = document.getElementById('face-img');
const resetBtn = document.getElementById('reset-btn');
const radios = document.querySelectorAll('input[name="difficulty"]');

function padNum(num) {
    return Math.max(0, Math.min(999, num)).toString().padStart(3, '0');
}

function initGame() {
    clearInterval(timerInt);
    time = 0;
    firstClick = true;
    gameOver = false;
    flags = 0;
    
    timerEl.innerText = padNum(time);
    faceImg.src = ICONS.smile;
    
    const diff = difficulties[currentDiff];
    mineCountEl.innerText = padNum(diff.mines);
    
    boardEl.style.gridTemplateColumns = `repeat(${diff.cols}, 1fr)`;
    boardEl.innerHTML = '';
    
    board = [];
    for (let r = 0; r < diff.rows; r++) {
        let row = [];
        for (let c = 0; c < diff.cols; c++) {
            const cell = {
                r, c,
                isMine: false,
                isRevealed: false,
                isFlagged: false,
                neighborMines: 0,
                element: document.createElement('div')
            };
            cell.element.className = 'cell';
            cell.element.dataset.r = r;
            cell.element.dataset.c = c;
            
            // Interaction
            cell.element.addEventListener('mousedown', (e) => handleCellMousedown(e, cell));
            cell.element.addEventListener('mouseup', (e) => handleCellMouseup(e, cell));
            cell.element.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleFlag(cell); });
            
            boardEl.appendChild(cell.element);
            row.push(cell);
        }
        board.push(row);
    }
}

function placeMines(avoidR, avoidC) {
    const diff = difficulties[currentDiff];
    let minesPlaced = 0;
    while (minesPlaced < diff.mines) {
        let r = Math.floor(Math.random() * diff.rows);
        let c = Math.floor(Math.random() * diff.cols);
        // Don't place on first click or already placed
        if (!board[r][c].isMine && (r !== avoidR || c !== avoidC)) {
            board[r][c].isMine = true;
            minesPlaced++;
        }
    }
    
    // Calculate neighbors
    for (let r = 0; r < diff.rows; r++) {
        for (let c = 0; c < diff.cols; c++) {
            if (!board[r][c].isMine) {
                let count = 0;
                for (let i = -1; i <= 1; i++) {
                    for (let j = -1; j <= 1; j++) {
                        if (r+i >= 0 && r+i < diff.rows && c+j >= 0 && c+j < diff.cols) {
                            if (board[r+i][c+j].isMine) count++;
                        }
                    }
                }
                board[r][c].neighborMines = count;
            }
        }
    }
}

function startTimer() {
    timerInt = setInterval(() => {
        time++;
        timerEl.innerText = padNum(time);
        if (time >= 999) clearInterval(timerInt);
    }, 1000);
}

function handleCellMousedown(e, cell) {
    if (gameOver || cell.isRevealed) return;
    if (e.button === 0 && !cell.isFlagged) {
        faceImg.src = ICONS.ooh;
    }
}

function handleCellMouseup(e, cell) {
    if (gameOver || cell.isRevealed) return;
    faceImg.src = ICONS.smile;
    if (e.button === 0) {
        if (!cell.isFlagged) revealCell(cell);
    }
}

function toggleFlag(cell) {
    if (gameOver || cell.isRevealed) return;
    const diff = difficulties[currentDiff];
    if (!cell.isFlagged && flags < diff.mines) {
        cell.isFlagged = true;
        flags++;
        cell.element.innerHTML = `<img src="${ICONS.flag}">`;
    } else if (cell.isFlagged) {
        cell.isFlagged = false;
        flags--;
        cell.element.innerHTML = '';
    }
    mineCountEl.innerText = padNum(diff.mines - flags);
    checkWin();
}

function revealCell(cell) {
    if (cell.isRevealed || cell.isFlagged) return;
    
    if (firstClick) {
        firstClick = false;
        placeMines(cell.r, cell.c);
        startTimer();
    }
    
    cell.isRevealed = true;
    cell.element.classList.add('revealed');
    
    if (cell.isMine) {
        cell.element.innerHTML = `<img src="${ICONS.mine_red}">`;
        cell.element.style.backgroundColor = 'red';
        endGame(false);
        return;
    }
    
    if (cell.neighborMines > 0) {
        cell.element.innerText = cell.neighborMines;
        cell.element.classList.add(`c${cell.neighborMines}`);
    } else {
        // Flood fill
        const diff = difficulties[currentDiff];
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                if (cell.r+i >= 0 && cell.r+i < diff.rows && cell.c+j >= 0 && cell.c+j < diff.cols) {
                    revealCell(board[cell.r+i][cell.c+j]);
                }
            }
        }
    }
    checkWin();
}

function endGame(win) {
    gameOver = true;
    clearInterval(timerInt);
    const diff = difficulties[currentDiff];
    
    if (win) {
        faceImg.src = ICONS.win;
        mineCountEl.innerText = '000';
    } else {
        faceImg.src = ICONS.dead;
    }
    
    // Reveal all mines
    for (let r = 0; r < diff.rows; r++) {
        for (let c = 0; c < diff.cols; c++) {
            const cell = board[r][c];
            if (cell.isMine && !cell.isFlagged) {
                cell.element.innerHTML = `<img src="${ICONS.mine}">`;
            } else if (!cell.isMine && cell.isFlagged) {
                cell.element.innerHTML = `<img src="${ICONS.mine_crossed}">`;
            }
        }
    }
}

function checkWin() {
    if (gameOver) return;
    const diff = difficulties[currentDiff];
    let unrevealedSafe = 0;
    
    for (let r = 0; r < diff.rows; r++) {
        for (let c = 0; c < diff.cols; c++) {
            const cell = board[r][c];
            if (!cell.isMine && !cell.isRevealed) unrevealedSafe++;
        }
    }
    
    if (unrevealedSafe === 0) {
        endGame(true);
    }
}

resetBtn.addEventListener('click', initGame);

radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        currentDiff = e.target.value;
        initGame();
    });
});

initGame();
