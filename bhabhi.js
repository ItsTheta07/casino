// Bhabhi Card Game Engine
let bhGame=null, bhResolve=null;
const BH_NAMES=['You','Aman','Neha','Karan','Sonia'];

function createBhabhiGame(playerCount = 5){
    const deck=shuffleDeck(createDeck());
    const validCount = Math.max(4, Math.min(6, playerCount));
    const activeNames = BH_NAMES.slice(0, validCount);
    // Fill with random if we need more
    while(activeNames.length < validCount) activeNames.push('AI_' + activeNames.length);
    const players=activeNames.map((n,i)=>({name:n,isHuman:i===0,hand:[],finished:false,tricksTaken:0}));
    // Deal all cards equally (52/5=10 each, 2 left over — give extras to first players)
    let ci=0;
    while(ci<deck.length){players[ci%players.length].hand.push(deck[ci]);ci++;}
    // Sort hands
    for(const p of players) p.hand.sort((a,b)=>a.suit===b.suit?a.rank-b.rank:SUITS.indexOf(a.suit)-SUITS.indexOf(b.suit));
    // Find who has Ace of Spades — they start
    let starter=0;
    for(let i=0;i<players.length;i++){
        if(players[i].hand.some(c=>c.suit==='spades'&&c.rank===14)){starter=i;break;}
    }
    return {players,currentPlayerIndex:starter,trickCards:[],trickPlayers:[],leadSuit:null,
        trickNumber:0,handOver:false,gameOver:false,leadPlayerIndex:starter,
        finishOrder:[],gameType:'bhabhi',dangerousSuits:new Set()};
}

function bhRender(g){
    // Render player seats (show card count for AI, face-down cards)
    for(let i=0;i<g.players.length;i++){
        const seat=document.getElementById('bh-seat-'+i);
        if(!seat) continue;
        const p=g.players[i];
        const isActive=g.currentPlayerIndex===i&&!g.handOver;
        const baseClass=seat.getAttribute('data-base-class')||seat.className;
        if(!seat.getAttribute('data-base-class')) seat.setAttribute('data-base-class',baseClass);
        seat.className=baseClass;
        if(p.finished) seat.classList.add('folded');
        if(isActive) seat.classList.add('active-turn');

        let turnHtml='';
        if(isActive&&!g.handOver){
            turnHtml=p.isHuman?'<div class="turn-indicator turn-you">⚡ YOUR TURN</div>':'<div class="turn-indicator turn-thinking">⏳ Thinking...</div>';
        }
        const cardCount=p.hand.length;
        seat.innerHTML=`${turnHtml}<div class="player-info">
            <div class="player-name">${p.name}</div>
            <div class="player-chips">🃏 ${cardCount} cards</div>
            ${p.finished?'<div class="player-status">✓ Finished</div>':''}
        </div>`;
    }
    // Trick cards
    const tArea=document.getElementById('bh-trick-cards');
    if(tArea){
        const currentCount = tArea.children.length;
        if(g.trickCards.length === 0) {
            tArea.innerHTML='';
        } else {
            for(let i=currentCount;i<g.trickCards.length;i++){
                const wrap=document.createElement('div');
                wrap.style.textAlign='center';
                const card=UI.renderCard(g.trickCards[i]);
                card.classList.add('dealing');
                const label=document.createElement('div');
                label.style.cssText='font-size:0.5rem;color:#aaa;margin-top:2px';
                label.textContent=g.players[g.trickPlayers[i]].name;
                wrap.appendChild(card);wrap.appendChild(label);
                tArea.appendChild(wrap);
            }
        }
    }
    const ls=document.getElementById('bh-lead-suit');
    if(ls) ls.textContent=g.leadSuit?'Lead: '+SUIT_SYMBOLS[g.leadSuit]:'';
    // Human hand
    renderBhHumanHand(g);
}

function renderBhHumanHand(g){
    const cont=document.getElementById('bh-my-hand');
    if(!cont) return;
    cont.innerHTML='';
    const p=g.players[0];
    if(p.finished) return;
    const isMyTurn=g.currentPlayerIndex===0&&!g.handOver;
    const validCards=isMyTurn?getValidCards(p,g):[];
    for(let i=0;i<p.hand.length;i++){
        const c=p.hand[i];
        const el=UI.renderCard(c);
        const isValid=validCards.some(vc=>vc.suit===c.suit&&vc.rank===c.rank);
        if(isMyTurn&&isValid){
            el.style.cursor='pointer';
            el.onclick=()=>bhPlayCard(i);
        } else if(isMyTurn){
            el.classList.add('disabled');
        }
        cont.appendChild(el);
    }
}

function getValidCards(player,g){
    if(!g.leadSuit) return player.hand; // Leading — can play anything (first trick must be A♠ though)
    const suited=player.hand.filter(c=>c.suit===g.leadSuit);
    if(suited.length>0) return suited; // Must follow suit
    return player.hand; // Can play anything if no cards of lead suit
}

function bhPlayCard(cardIndex){
    if(!bhResolve) return;
    const r=bhResolve; bhResolve=null;
    r(cardIndex);
}

function bhAiChoose(player,g){
    const valid=getValidCards(player,g);
    if(valid.length===0) return 0;

    if(!g.leadSuit){
        // Leading: avoid dangerous suits.
        const safeCards = valid.filter(c => !g.dangerousSuits.has(c.suit));
        const pool = safeCards.length > 0 ? safeCards : valid;
        // Play the lowest rank of the chosen pool to minimize taking the next trick
        const sorted=[...pool].sort((a,b)=>a.rank-b.rank);
        return player.hand.indexOf(sorted[0]);
    }

    const suited=valid.filter(c=>c.suit===g.leadSuit);
    if(suited.length>0){
        // Following suit
        let winCard=g.trickCards[0];
        for(const tc of g.trickCards) if(tc.suit===g.leadSuit&&tc.rank>winCard.rank) winCard=tc;

        const isDangerous = g.dangerousSuits.has(g.leadSuit);

        // If dangerous, play absolute lowest card to avoid being highest.
        if (isDangerous) {
            const sorted = [...suited].sort((a,b)=>a.rank-b.rank);
            return player.hand.indexOf(sorted[0]);
        }

        // If not known dangerous, try to duck (play highest card that is still lower than winCard)
        const duckers = suited.filter(c=>c.rank<winCard.rank).sort((a,b)=>b.rank-a.rank);
        if (duckers.length > 0) return player.hand.indexOf(duckers[0]);

        // Can't duck, must play a higher card. Play the lowest higher card.
        const beaters = suited.filter(c=>c.rank>winCard.rank).sort((a,b)=>a.rank-b.rank);
        if (beaters.length > 0) return player.hand.indexOf(beaters[0]);

        // Fallback
        const sorted=[...suited].sort((a,b)=>a.rank-b.rank);
        return player.hand.indexOf(sorted[0]);
    }

    // No suit — THULLA! Dump highest card overall
    const sorted=[...valid].sort((a,b)=>b.rank-a.rank);
    return player.hand.indexOf(sorted[0]);
}

async function bhPlayTrick(g){
    g.trickNumber++;
    g.trickCards=[];g.trickPlayers=[];g.leadSuit=null;
    document.getElementById('bh-trick-info').textContent='Trick #'+g.trickNumber;
    UI.log(`--- Trick #${g.trickNumber} ---`,1,'bh');
    bhRender(g);

    let idx=g.leadPlayerIndex;
    const activePlayers=g.players.filter(p=>!p.finished);
    if(activePlayers.length<=1){g.handOver=true;return;}

    for(let turn=0;turn<activePlayers.length;turn++){
        // Skip finished players
        while(g.players[idx].finished) idx=(idx+1)%g.players.length;
        g.currentPlayerIndex=idx;
        bhRender(g);

        let cardIdx;
        if(g.players[idx].isHuman){
            cardIdx=await new Promise(r=>{bhResolve=r;});
        } else {
            await delay(500+Math.random()*500);
            cardIdx=bhAiChoose(g.players[idx],g);
        }

        const card=g.players[idx].hand.splice(cardIdx,1)[0];
        if(!g.leadSuit) g.leadSuit=card.suit;
        g.trickCards.push(card);
        g.trickPlayers.push(idx);
        UI.log(`${g.players[idx].name} plays ${RANK_NAMES[card.rank]}${SUIT_SYMBOLS[card.suit]}`,0,'bh');
        bhRender(g);
        await delay(300);

        // Check if player finished
        if(g.players[idx].hand.length===0){
            g.players[idx].finished=true;
            g.finishOrder.push(idx);
            UI.log(`${g.players[idx].name} finished!`,1,'bh');
        }

        // Thulla logic
        if (card.suit !== g.leadSuit) {
            g.dangerousSuits.add(g.leadSuit);
            UI.log(`THULLA!`, 1, 'bh');
            let winIdx=0;
            for(let i=1;i<g.trickCards.length-1;i++){ // -1 to ignore thulla card
                if(g.trickCards[i].suit===g.leadSuit&&g.trickCards[i].rank>(g.trickCards[winIdx].suit===g.leadSuit?g.trickCards[winIdx].rank:0))
                    winIdx=i;
            }
            const victimIdx = g.trickPlayers[winIdx];
            const victim = g.players[victimIdx];
            
            victim.hand.push(...g.trickCards);
            victim.hand.sort((a,b)=>a.suit===b.suit?a.rank-b.rank:SUITS.indexOf(a.suit)-SUITS.indexOf(b.suit));
            
            if (victim.finished) {
                victim.finished = false;
                g.finishOrder = g.finishOrder.filter(x => x !== victimIdx);
                UI.log(`${victim.name} is back in the game!`, 1, 'bh');
            }
            
            UI.log(`${victim.name} gets hit and takes ${g.trickCards.length} cards!`, 1, 'bh');
            UI.showBadge('bh-seat-'+victimIdx,'pack');
            g.leadPlayerIndex = victimIdx;
            
            await delay(800);
            return; // trick ends immediately
        }

        idx=(idx+1)%g.players.length;
    }

    // Normal trick clear (everyone followed suit)
    let winIdx=0;
    for(let i=1;i<g.trickCards.length;i++){
        if(g.trickCards[i].suit===g.leadSuit&&g.trickCards[i].rank>(g.trickCards[winIdx].suit===g.leadSuit?g.trickCards[winIdx].rank:0))
            winIdx=i;
    }
    const winPlayerIdx=g.trickPlayers[winIdx];
    g.players[winPlayerIdx].tricksTaken++;
    UI.log(`${g.players[winPlayerIdx].name} clears the trick`,1,'bh');
    UI.showBadge('bh-seat-'+winPlayerIdx,'check');

    g.leadPlayerIndex=winPlayerIdx;
    if(g.players[winPlayerIdx].finished){
        let next=winPlayerIdx;
        for(let i=0;i<g.players.length;i++){next=(next+1)%g.players.length;if(!g.players[next].finished)break;}
        g.leadPlayerIndex=next;
    }
    await delay(800);
}

async function bhPlayGame(g){
    while(!g.handOver){
        const active=g.players.filter(p=>!p.finished);
        if(active.length<=1){
            g.handOver=true;
            if(active.length===1){
                g.finishOrder.push(g.players.indexOf(active[0]));
            }
            break;
        }
        await bhPlayTrick(g);
    }
    g.currentPlayerIndex=-1;
    bhRender(g);

    // Last player to finish is Bhabhi
    const bhabhi=g.finishOrder.length>0?g.players[g.finishOrder[g.finishOrder.length-1]]:null;
    const winner=g.finishOrder.length>0?g.players[g.finishOrder[0]]:null;

    if (winner) UI.updateLeaderboardStat('bhabhi', winner.name, 1, 'add');

    const t=document.getElementById('bh-go-title'),m=document.getElementById('bh-go-msg');
    if(g.players[0].finished&&g.finishOrder[0]===0){
        t.textContent='🏆 You Win!';m.textContent='You got rid of all your cards first!';
    } else if(bhabhi&&bhabhi.isHuman){
        t.textContent='😅 You\'re the Bhabhi!';m.textContent='You were the last one with cards.';
    } else {
        t.textContent='Game Over';
        m.textContent=`${winner?winner.name:'Nobody'} won! ${bhabhi?bhabhi.name+' is the Bhabhi!':''}`;
    }
    document.getElementById('bh-gameover').classList.remove('hidden');
}

function startBhabhi(playersCount = 5){
    const go = document.getElementById('bh-gameover'); if (go) go.classList.add('hidden');
    bhGame=createBhabhiGame(playersCount);UI.clearLog('bh');UI.log('Ace of Spades starts!',1,'bh');bhPlayGame(bhGame);
}
function resetBhabhi(){bhGame=null;bhResolve=null;}
