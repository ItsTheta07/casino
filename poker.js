// Poker Engine — expanded with blind escalation, stats, timer, keyboard shortcuts
let game = null, playerActionResolve = null, turnTimer = null;
const pkStats = { wins: 0, hands: 0, bestPot: 0 };

function createPlayer(name, isHuman, aiProfile) {
    return { name, isHuman, aiProfile: aiProfile || null, chips: 100000, hand: [],
        folded: false, allIn: false, eliminated: false, currentRoundBet: 0, totalBet: 0,
        showCards: false, isWinner: false };
}
function createPokerGame(buyIn) {
    const p = [createPlayer('You', true, null)];
    p[0].chips = buyIn;
    for (const a of AI_PROFILES) {
        const aiPlayer = createPlayer(a.name, false, a);
        // AI stacks +/- 20% of human buy-in
        aiPlayer.chips = Math.floor(buyIn * (0.8 + Math.random() * 0.4));
        p.push(aiPlayer);
    }
    const bb = Math.max(20, Math.floor(buyIn * 0.002));
    const sb = Math.floor(bb / 2);
    return { players: p, deck: [], communityCards: [], pot: 0, currentBet: 0,
        dealerIndex: 5, smallBlindIndex: 0, bigBlindIndex: 1, currentPlayerIndex: -1,
        handNumber: 0, bigBlind: bb, smallBlind: sb, handOver: false, showdown: false,
        gameOver: false, gameType: 'poker' };
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function activePl(g) { return g.players.filter(p => !p.folded && !p.eliminated); }
function activeNoAI(g) { return g.players.filter(p => !p.folded && !p.eliminated && !p.allIn); }
function nextAct(g, from) {
    for (let i = 1; i <= g.players.length; i++) {
        const idx = (from + i) % g.players.length;
        if (!g.players[idx].folded && !g.players[idx].eliminated && !g.players[idx].allIn) return idx;
    }
    return -1;
}
function postBlinds(g) {
    let sb = -1, bb = -1;
    for (let i = 1; i <= g.players.length; i++) {
        const idx = (g.dealerIndex + i) % g.players.length;
        if (!g.players[idx].eliminated) { if (sb < 0) sb = idx; else if (bb < 0) { bb = idx; break; } }
    }
    g.smallBlindIndex = sb; g.bigBlindIndex = bb;
    const sba = Math.min(g.smallBlind, g.players[sb].chips);
    const bba = Math.min(g.bigBlind, g.players[bb].chips);
    placeBet(g, sb, sba); placeBet(g, bb, bba); g.currentBet = bba;
    UI.log(`${g.players[sb].name} posts SB ${sba}`, false, 'pk');
    UI.log(`${g.players[bb].name} posts BB ${bba}`, false, 'pk');
}
function placeBet(g, i, amt) {
    const p = g.players[i], a = Math.min(amt, p.chips);
    p.chips -= a; p.currentRoundBet += a; p.totalBet += a; g.pot += a;
    if (p.chips === 0) p.allIn = true;
}
function resetRound(g) { for (const p of g.players) p.currentRoundBet = 0; g.currentBet = 0; }

function calcPots(g) {
    const levels = [...new Set(g.players.filter(p => p.totalBet > 0).map(p => p.totalBet))].sort((a, b) => a - b);
    const pots = []; let prev = 0;
    for (const lv of levels) {
        const pot = { amount: 0, eligible: [] };
        for (const p of g.players) {
            const c = Math.min(p.totalBet, lv) - Math.min(p.totalBet, prev);
            if (c > 0) pot.amount += c;
            if (!p.folded && !p.eliminated && p.totalBet >= lv) pot.eligible.push(p);
        }
        if (pot.amount > 0) pots.push(pot); prev = lv;
    }
    return pots;
}

// Turn timer
function startTimer(seconds) {
    const bar = document.getElementById('pk-timer-bar');
    const fill = document.getElementById('pk-timer-fill');
    bar.classList.remove('hidden'); fill.style.width = '100%';
    const start = Date.now(), dur = seconds * 1000;
    clearInterval(turnTimer);
    turnTimer = setInterval(() => {
        const elapsed = Date.now() - start, pct = Math.max(0, 1 - elapsed / dur) * 100;
        fill.style.width = pct + '%';
        if (elapsed >= dur) { clearInterval(turnTimer); bar.classList.add('hidden'); if (playerActionResolve) playerAction('fold'); }
    }, 50);
}
function stopTimer() {
    clearInterval(turnTimer);
    const bar = document.getElementById('pk-timer-bar');
    if (bar) bar.classList.add('hidden');
}

async function bettingRound(g, startIdx) {
    const toAct = new Set();
    for (let i = 0; i < g.players.length; i++) {
        const p = g.players[i]; if (!p.folded && !p.eliminated && !p.allIn) toAct.add(i);
    }
    let idx = startIdx, safety = 0;
    while (!toAct.has(idx) && safety++ < 10) idx = (idx + 1) % g.players.length;
    safety = 0;
    while (toAct.size > 0 && safety++ < 60) {
        if (!toAct.has(idx)) { idx = (idx + 1) % g.players.length; continue; }
        const p = g.players[idx]; g.currentPlayerIndex = idx;
        UI.renderAllPoker(g);
        let action;
        if (p.isHuman) {
            UI.showActionPanel(g, 'pk'); startTimer(30);
            action = await waitForAction(); stopTimer();
            UI.hideActionPanel('pk');
        } else {
            await delay(700 + Math.random() * 700); action = aiDecide(p, g);
        }
        const toCall = g.currentBet - p.currentRoundBet;
        switch (action.action) {
            case 'fold': p.folded = true; UI.showBadge('pk-seat-'+idx,'fold'); UI.log(`${p.name} folds`,0,'pk'); break;
            case 'check': UI.showBadge('pk-seat-'+idx,'check'); UI.log(`${p.name} checks`,0,'pk'); break;
            case 'call': { const a=Math.min(toCall,p.chips); placeBet(g,idx,a);
                UI.showBadge('pk-seat-'+idx, p.allIn?'allin':'call', a);
                UI.log(`${p.name} calls ${a}${p.allIn?' (ALL IN)':''}`,0,'pk'); break; }
            case 'raise': { let rt=Math.max(action.amount||g.currentBet+g.bigBlind, g.currentBet+g.bigBlind);
                placeBet(g,idx,rt-p.currentRoundBet); g.currentBet=p.currentRoundBet;
                UI.showBadge('pk-seat-'+idx, p.allIn?'allin':'raise', p.currentRoundBet);
                UI.log(`${p.name} raises to ${p.currentRoundBet}${p.allIn?' (ALL IN)':''}`,0,'pk');
                for(let i=0;i<g.players.length;i++){const pp=g.players[i]; if(i!==idx&&!pp.folded&&!pp.eliminated&&!pp.allIn)toAct.add(i);}
                break; }
            case 'allin': { const a=p.chips; placeBet(g,idx,a);
                if(p.currentRoundBet>g.currentBet){g.currentBet=p.currentRoundBet;
                    for(let i=0;i<g.players.length;i++){const pp=g.players[i];if(i!==idx&&!pp.folded&&!pp.eliminated&&!pp.allIn)toAct.add(i);}}
                UI.showBadge('pk-seat-'+idx,'allin'); UI.log(`${p.name} ALL IN ${a}`,0,'pk'); break; }
        }
        toAct.delete(idx); UI.renderAllPoker(g);
        if (activePl(g).length <= 1) return true;
        idx = (idx + 1) % g.players.length;
    }
    return activePl(g).length <= 1;
}

function waitForAction() { return new Promise(r => { playerActionResolve = r; }); }
function playerAction(type) {
    if (!playerActionResolve) return;
    const r = playerActionResolve; playerActionResolve = null;
    const slider = document.getElementById('pk-raise-slider');
    if (type === 'raise') r({ action: 'raise', amount: parseInt(slider.value) });
    else if (type === 'call') { const tc = game.currentBet - game.players[0].currentRoundBet; r(tc <= 0 ? {action:'check'} : {action:'call'}); }
    else r({ action: type });
}
function setRaisePreset(m) {
    const s = document.getElementById('pk-raise-slider');
    const v = Math.floor(game.pot * m), mn = game.currentBet + game.bigBlind;
    s.value = Math.max(mn, Math.min(v, parseInt(s.max))); UI.updateRaiseDisplay('pk');
}

async function showdownPk(g) {
    g.showdown = true;
    for (const p of activePl(g)) p.showCards = true;
    UI.renderAllPoker(g); await delay(1000);
    const pots = calcPots(g); let msgs = [];
    for (const pot of pots) {
        if (!pot.eligible.length) continue;
        if (pot.eligible.length === 1) {
            pot.eligible[0].chips += pot.amount; pot.eligible[0].isWinner = true;
            msgs.push(`<p>${pot.eligible[0].name} wins <span class="win-amt">${pot.amount}</span></p>`);
            UI.log(`${pot.eligible[0].name} wins ${pot.amount}`,1,'pk'); continue;
        }
        let best = null, winners = [];
        for (const p of pot.eligible) {
            const ev = evaluateHand([...p.hand, ...g.communityCards]);
            if (!best || compareScores(ev.score, best) > 0) { best = ev.score; winners = [{p, ev}]; }
            else if (compareScores(ev.score, best) === 0) winners.push({p, ev});
        }
        const share = Math.floor(pot.amount / winners.length);
        for (const w of winners) {
            w.p.chips += share; w.p.isWinner = true;
            msgs.push(`<p>${w.p.name} wins <span class="win-amt">${share}</span> — ${w.ev.name}</p>`);
            UI.log(`${w.p.name} wins ${share} with ${w.ev.name}`,1,'pk');
        }
    }
    UI.renderAllPoker(g);
    UI.showWinner(`<h3>🏆 Showdown</h3>${msgs.join('')}`, 'pk');
}

function updateStats() {
    const s = document.getElementById('pk-stat-wins'), h = document.getElementById('pk-stat-hands'), b = document.getElementById('pk-stat-best');
    if (s) s.textContent = 'W: ' + pkStats.wins;
    if (h) h.textContent = 'H: ' + pkStats.hands;
    if (b) b.textContent = 'Best: ' + pkStats.bestPot;
}

async function playHand(g) {
    g.handNumber++; pkStats.hands++;
    g.handOver = false; g.showdown = false; g.currentBet = 0; g.pot = 0; g.communityCards = [];
    UI.resetTracking(); UI.clearCommunity('pk');
    for (const p of g.players) { p.hand=[]; p.folded=p.eliminated; p.allIn=false; p.currentRoundBet=0; p.totalBet=0; p.showCards=false; p.isWinner=false; }
    // Blind escalation every 10 hands
    if (g.handNumber > 1 && (g.handNumber - 1) % 10 === 0) {
        g.smallBlind = Math.min(g.smallBlind * 2, 500); g.bigBlind = Math.min(g.bigBlind * 2, 1000);
        UI.log(`⬆ Blinds up: ${g.smallBlind}/${g.bigBlind}`, 1, 'pk');
    }
    g.deck = shuffleDeck(createDeck());
    UI.clearLog('pk'); UI.log(`=== Hand #${g.handNumber} ===`, 1, 'pk');
    do { g.dealerIndex = (g.dealerIndex + 1) % g.players.length; } while (g.players[g.dealerIndex].eliminated);
    postBlinds(g);
    for (let r = 0; r < 2; r++) for (const p of g.players) if (!p.eliminated) p.hand.push(g.deck.pop());
    UI.renderAllPoker(g); await delay(700);
    let si = (g.bigBlindIndex + 1) % g.players.length, one = await bettingRound(g, si);
    if (!one) { resetRound(g); UI.log('--- Flop ---',1,'pk');
        for(let i=0;i<3;i++) g.communityCards.push(g.deck.pop());
        UI.renderAllPoker(g); await delay(500);
        si=nextAct(g,g.dealerIndex); if(si>=0&&activeNoAI(g).length>0) one=await bettingRound(g,si); }
    if (!one&&activePl(g).length>1) { resetRound(g); UI.log('--- Turn ---',1,'pk');
        g.communityCards.push(g.deck.pop()); UI.renderAllPoker(g); await delay(500);
        si=nextAct(g,g.dealerIndex); if(si>=0&&activeNoAI(g).length>0) one=await bettingRound(g,si); }
    if (!one&&activePl(g).length>1) { resetRound(g); UI.log('--- River ---',1,'pk');
        g.communityCards.push(g.deck.pop()); UI.renderAllPoker(g); await delay(500);
        si=nextAct(g,g.dealerIndex); if(si>=0&&activeNoAI(g).length>0) one=await bettingRound(g,si); }
    g.handOver = true; g.currentPlayerIndex = -1;
    if (activePl(g).length === 1) {
        const w = activePl(g)[0]; w.chips += g.pot; w.isWinner = true;
        UI.updateLeaderboardStat('poker', w.name, w.chips);
        if (w.isHuman) pkStats.wins++;
        pkStats.bestPot = Math.max(pkStats.bestPot, g.pot);
        UI.renderAllPoker(g); UI.showWinner(`<h3>🏆 Winner</h3><p>${w.name} wins <span class="win-amt">${g.pot}</span></p>`, 'pk');
        UI.log(`${w.name} wins ${g.pot}`,1,'pk');
    } else {
        while (g.communityCards.length < 5) g.communityCards.push(g.deck.pop());
        pkStats.bestPot = Math.max(pkStats.bestPot, g.pot);
        await showdownPk(g);
        if (game.players[0].isWinner) pkStats.wins++;
        for (const p of g.players) {
            UI.updateLeaderboardStat('poker', p.name, p.chips);
        }
    }
    for (const p of g.players) if (p.chips <= 0 && !p.eliminated) { p.eliminated = true; UI.log(`${p.name} eliminated!`,1,'pk'); }
    UI.renderAllPoker(g); updateStats();
    const rem = g.players.filter(p => !p.eliminated);
    if (rem.length <= 1 || g.players[0].eliminated) {
        g.gameOver = true;
        const t = document.getElementById('pk-go-title'), m = document.getElementById('pk-go-msg');
        if (g.players[0].eliminated) { t.textContent='Game Over'; m.textContent=`Eliminated after ${g.handNumber} hands.`; }
        else { t.textContent='🏆 You Win!'; m.textContent=`Won with ${g.players[0].chips} chips in ${g.handNumber} hands!`; }
        document.getElementById('pk-gameover').classList.remove('hidden'); return;
    }
    UI.showNextBtn('pk');
}

function startPokerGame(buyIn = 100000) { 
    const go = document.getElementById('pk-gameover'); if (go) go.classList.add('hidden');
    game = createPokerGame(buyIn); pkStats.wins=0; pkStats.hands=0; pkStats.bestPot=0; updateStats(); UI.renderAllPoker(game); playHand(game); 
}
function nextHand() { UI.hideNextBtn('pk'); if (game && !game.gameOver) playHand(game); }
function resetPoker() { game = null; playerActionResolve = null; stopTimer(); }

// Keyboard shortcuts
document.addEventListener('keydown', e => {
    if (!playerActionResolve || !game) return;
    if (e.key === 'f' || e.key === 'F') playerAction('fold');
    else if (e.key === 'c' || e.key === 'C') playerAction('call');
    else if (e.key === 'r' || e.key === 'R') playerAction('raise');
    else if (e.key === 'a' || e.key === 'A') playerAction('allin');
});
