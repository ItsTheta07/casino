let rouletteStack = 0;
let currentBets = {};
let totalBetAmount = 0;
let isSpinning = false;
let currentBetSize = 1000;

const RED_NUMS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

function startRoulette(buyIn) {
    rouletteStack = buyIn;
    currentBets = {};
    totalBetAmount = 0;
    isSpinning = false;
    currentBetSize = 1000;
    
    updateRouletteUI();
    renderRouletteBoard();
    document.getElementById('roulette-wheel-result').textContent = 'PLACE BETS';
    document.getElementById('roulette-wheel-result').style.color = 'white';
}

function updateRouletteUI() {
    document.getElementById('roulette-stack').textContent = rouletteStack;
    document.getElementById('roulette-total-bets').textContent = totalBetAmount;
}

function renderRouletteBoard() {
    const board = document.getElementById('roulette-board');
    board.innerHTML = '';

    // Top Section (0 + Numbers)
    const topRow = document.createElement('div');
    topRow.className = 'r-row';
    
    const zeroCell = document.createElement('div');
    zeroCell.className = 'r-cell r-green';
    zeroCell.style.height = '173px'; // 3 rows of 55px + 2 gaps of 4px = 165+8 = 173
    zeroCell.textContent = '0';
    zeroCell.dataset.bet = '0';
    zeroCell.onclick = () => placeRouletteBet('0', zeroCell);
    topRow.appendChild(zeroCell);

    const numGrid = document.createElement('div');
    numGrid.style.display = 'flex';
    numGrid.style.flexDirection = 'column';
    numGrid.style.gap = '4px';

    // Rows: top (multiples of 3), middle, bottom
    for (let r = 3; r >= 1; r--) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'r-row';
        for (let c = 0; c < 12; c++) {
            const num = c * 3 + r;
            const cell = document.createElement('div');
            cell.className = 'r-cell ' + (RED_NUMS.includes(num) ? 'r-red' : 'r-black');
            cell.textContent = num;
            cell.dataset.bet = num.toString();
            cell.onclick = () => placeRouletteBet(num.toString(), cell);
            rowDiv.appendChild(cell);
        }
        numGrid.appendChild(rowDiv);
    }
    topRow.appendChild(numGrid);
    board.appendChild(topRow);

    // Dozens
    const dozRow = document.createElement('div');
    dozRow.className = 'r-row r-offset-row';
    ['1st12', '2nd12', '3rd12'].forEach(b => {
        const cell = document.createElement('div');
        cell.className = 'r-cell r-wide';
        cell.textContent = b.replace('12', ' 12');
        cell.dataset.bet = b;
        cell.onclick = () => placeRouletteBet(b, cell);
        dozRow.appendChild(cell);
    });
    board.appendChild(dozRow);

    // Outside
    const outRow = document.createElement('div');
    outRow.className = 'r-row r-offset-row';
    const outsides = [
        {k:'1-18', l:'1-18'}, {k:'even', l:'EVEN'}, {k:'red', l:'RED', c:'r-red'}, 
        {k:'black', l:'BLACK', c:'r-black'}, {k:'odd', l:'ODD'}, {k:'19-36', l:'19-36'}
    ];
    outsides.forEach(b => {
        const cell = document.createElement('div');
        cell.className = 'r-cell r-wide ' + (b.c || '');
        cell.textContent = b.l;
        cell.dataset.bet = b.k;
        cell.onclick = () => placeRouletteBet(b.k, cell);
        outRow.appendChild(cell);
    });
    board.appendChild(outRow);
}

function placeRouletteBet(betKey, cellElement) {
    if (isSpinning) return;
    if (rouletteStack < currentBetSize) {
        alert("Not enough coins in your Active Stack! You only have " + rouletteStack + " left at the table. Cash out and buy in with more from your wallet.");
        return;
    }

    rouletteStack -= currentBetSize;
    totalBetAmount += currentBetSize;
    if (!currentBets[betKey]) currentBets[betKey] = 0;
    currentBets[betKey] += currentBetSize;

    // Visual chip
    let chip = cellElement.querySelector('.r-chip');
    if (!chip) {
        chip = document.createElement('div');
        chip.className = 'r-chip';
        cellElement.appendChild(chip);
    }
    // Format chip text (e.g. 1k, 10k)
    let val = currentBets[betKey];
    chip.textContent = val >= 1000 ? (val / 1000) + 'k' : val;
    
    updateRouletteUI();
}

function setBetSize(size) {
    currentBetSize = size;
    // Visually update buttons
    document.querySelectorAll('.chip-btn').forEach(btn => btn.classList.remove('active-chip'));
    document.getElementById('chip-btn-' + size).classList.add('active-chip');
}

function clearRouletteBets() {
    if (isSpinning) return;
    rouletteStack += totalBetAmount;
    totalBetAmount = 0;
    currentBets = {};
    updateRouletteUI();
    
    document.querySelectorAll('.r-chip').forEach(c => c.remove());
}

async function spinRoulette() {
    if (isSpinning || totalBetAmount === 0) return;
    isSpinning = true;

    const wheel = document.getElementById('roulette-wheel-result');
    const container = wheel.parentElement;
    container.classList.add('wheel-spin');

    // Spin animation
    let ticks = 0;
    let finalNum = 0;
    while (ticks < 30) {
        finalNum = Math.floor(Math.random() * 37);
        wheel.textContent = finalNum;
        wheel.style.color = finalNum === 0 ? '#27ae60' : (RED_NUMS.includes(finalNum) ? '#c0392b' : '#aaa');
        await new Promise(r => setTimeout(r, 50 + ticks * 5));
        ticks++;
    }

    container.classList.remove('wheel-spin');
    
    // Resolve bets
    let winnings = 0;
    
    const isRed = RED_NUMS.includes(finalNum);
    const isBlack = finalNum !== 0 && !isRed;
    const isEven = finalNum !== 0 && finalNum % 2 === 0;
    const isOdd = finalNum !== 0 && finalNum % 2 !== 0;

    for (const [key, amt] of Object.entries(currentBets)) {
        if (key === finalNum.toString()) winnings += amt * 36;
        else if (key === 'red' && isRed) winnings += amt * 2;
        else if (key === 'black' && isBlack) winnings += amt * 2;
        else if (key === 'even' && isEven) winnings += amt * 2;
        else if (key === 'odd' && isOdd) winnings += amt * 2;
        else if (key === '1st12' && finalNum >= 1 && finalNum <= 12) winnings += amt * 3;
        else if (key === '2nd12' && finalNum >= 13 && finalNum <= 24) winnings += amt * 3;
        else if (key === '3rd12' && finalNum >= 25 && finalNum <= 36) winnings += amt * 3;
        else if (key === '1-18' && finalNum >= 1 && finalNum <= 18) winnings += amt * 2;
        else if (key === '19-36' && finalNum >= 19 && finalNum <= 36) winnings += amt * 2;
    }

    if (winnings > 0) {
        alert(`Number ${finalNum}! You won ${winnings} coins!`);
        rouletteStack += winnings;
    } else {
        // No alert for losing to keep it fast, just show on wheel
    }

    totalBetAmount = 0;
    currentBets = {};
    document.querySelectorAll('.r-chip').forEach(c => c.remove());
    updateRouletteUI();
    isSpinning = false;
    
    // Expose for cashout
    window.roulettePayout = rouletteStack;
}
