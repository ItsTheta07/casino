// Teen Patti Game Engine
let tpGame = null, tpResolve = null;
const TP_BOOT = 100, TP_CHIPS = 100000, TP_MAX_BLIND_TURNS = 4;
const TP_HANDS = ['High Card','Pair','Color','Sequence','Pure Sequence','Trail'];
const TP_AI = [
    {name:'Ravi',tight:0.5,aggr:0.6,bluff:0.2},
    {name:'Priya',tight:0.4,aggr:0.5,bluff:0.3},
    {name:'Arjun',tight:0.3,aggr:0.8,bluff:0.35},
    {name:'Meera',tight:0.65,aggr:0.35,bluff:0.1}
];

function evaluateTP(cards) {
    const r = cards.map(c=>c.rank).sort((a,b)=>b-a);
    const s = cards.map(c=>c.suit);
    const flush = s[0]===s[1]&&s[1]===s[2];
    const sorted = [...r].sort((a,b)=>a-b);
    let straight = (sorted[2]-sorted[1]===1&&sorted[1]-sorted[0]===1);
    if(sorted[0]===2&&sorted[1]===3&&sorted[2]===14) straight=true; // A-2-3
    const counts = {}; r.forEach(v=>counts[v]=(counts[v]||0)+1);
    const vals = Object.values(counts).sort((a,b)=>b-a);
    if(vals[0]===3) return {rank:5,name:'Trail',score:[5,r[0]]};
    if(straight&&flush) { const h=sorted[2]===14&&sorted[0]===2?3:r[0]; return {rank:4,name:'Pure Sequence',score:[4,h]}; }
    if(straight) { const h=sorted[2]===14&&sorted[0]===2?3:r[0]; return {rank:3,name:'Sequence',score:[3,h]}; }
    if(flush) return {rank:2,name:'Color',score:[2,...r]};
    if(vals[0]===2) { const pk=parseInt(Object.keys(counts).find(k=>counts[k]===2));
        const kk=parseInt(Object.keys(counts).find(k=>counts[k]===1));
        return {rank:1,name:'Pair',score:[1,pk,kk]}; }
    return {rank:0,name:'High Card',score:[0,...r]};
}

function tpCompare(a,b) {
    for(let i=0;i<Math.max(a.length,b.length);i++){
        if((a[i]||0)>(b[i]||0)) return 1;
        if((a[i]||0)<(b[i]||0)) return -1;
    } return 0;
}

function tpStrength(ev) { return ev.rank/5 + (ev.score[1]||0)/14*0.15; }

function createTPGame(buyIn) {
    const players = [{name:'You',isHuman:true,ai:null,chips:buyIn,hand:[],folded:false,eliminated:false,
        isBlind:true,isSeen:false,currentRoundBet:0,totalBet:0,showCards:false,isWinner:false,blindTurns:0}];
    for(const a of TP_AI) {
        players.push({name:a.name,isHuman:false,ai:a,chips:Math.floor(buyIn * (0.8 + Math.random() * 0.4)),hand:[],folded:false,eliminated:false,
        isBlind:true,isSeen:false,currentRoundBet:0,totalBet:0,showCards:false,isWinner:false,blindTurns:0});
    }
    const bootAmt = Math.max(10, Math.floor(buyIn * 0.001));
    return {players,deck:[],pot:0,currentBet:bootAmt,currentPlayerIndex:-1,dealerIndex:4,
        smallBlindIndex:0,bigBlindIndex:1,roundNumber:0,handOver:false,showdown:false,
        gameOver:false,boot:bootAmt,stake:bootAmt,gameType:'teenpatti'};
}

async function tpPlayRound(g) {
    g.roundNumber++; g.handOver=false; g.showdown=false; g.pot=0; g.currentBet=g.boot; g.stake=g.boot;
    UI.resetTracking();
    for(const p of g.players){p.hand=[];p.folded=p.eliminated;p.isBlind=true;p.isSeen=false;
        p.currentRoundBet=0;p.totalBet=0;p.showCards=false;p.isWinner=false;p.blindTurns=0;}
    g.deck=shuffleDeck(createDeck());
    UI.clearLog('tp'); UI.log(`=== Round #${g.roundNumber} ===`,1,'tp');
    document.getElementById('tp-round-number').textContent='Round #'+g.roundNumber;
    // Boot ante
    for(let i=0;i<g.players.length;i++){
        if(!g.players[i].eliminated){const a=Math.min(g.boot,g.players[i].chips);
            g.players[i].chips-=a;g.players[i].totalBet+=a;g.pot+=a;}
    }
    // Deal 3 cards
    for(let r=0;r<3;r++) for(const p of g.players) if(!p.eliminated) p.hand.push(g.deck.pop());
    do{g.dealerIndex=(g.dealerIndex+1)%g.players.length;}while(g.players[g.dealerIndex].eliminated);
    tpRender(g); await delay(600);
    // Betting rounds
    let idx=(g.dealerIndex+1)%g.players.length, safety=0;
    while(safety++<200) {
        const active=g.players.filter(p=>!p.folded&&!p.eliminated);
        if(active.length<=1) break;
        const p=g.players[idx];
        if(p.folded||p.eliminated){idx=(idx+1)%g.players.length;continue;}
        g.currentPlayerIndex=idx; tpRender(g);
        let action;
        if(p.isHuman){
            // Show/hide see button
            const seeBtn=document.getElementById('tp-btn-see');
            if(seeBtn) seeBtn.classList.toggle('hidden',p.isSeen);
            const showBtn=document.getElementById('tp-btn-show');
            if(showBtn) showBtn.classList.toggle('hidden',active.length>2);
            UI.showActionPanel(g,'tp');
            action=await new Promise(r=>{tpResolve=r;});
            UI.hideActionPanel('tp');
        } else {
            await delay(600+Math.random()*600);
            action=tpAiDecide(p,g);
        }
        // Process
        if(action.action==='see'){
            p.isBlind=false;p.isSeen=true;
            UI.showBadge('tp-seat-'+idx,'seen');
            UI.log(`${p.name} sees cards`,0,'tp');
            continue; // Keep the turn on the same player
        } else if(action.action==='fold'||action.action==='pack'){
            p.folded=true;
            UI.showBadge('tp-seat-'+idx,'pack');
            UI.log(`${p.name} packs`,0,'tp');
        } else if(action.action==='sideshow'){
            const amt=p.isSeen?g.stake*2:g.stake;
            if(p.chips<amt){
                p.folded=true;UI.showBadge('tp-seat-'+idx,'pack');UI.log(`${p.name} packs (Out of Coins)`,0,'tp');
            } else {
                p.chips-=amt;p.totalBet+=amt;g.pot+=amt;
                UI.showBadge('tp-seat-'+idx,'call',amt);
                // Find previous player
                const myIdx=active.indexOf(p);
                const prevIdx=(myIdx-1+active.length)%active.length;
                const prevP=active[prevIdx];
                UI.log(`${p.name} asks ${prevP.name} for Side Show`,1,'tp');
                await delay(800);
                // AI decide to accept side show
                let accept=true;
                if(!prevP.isHuman){
                    const prevEv=evaluateTP(prevP.hand);
                    accept=Math.random()<tpStrength(prevEv)*1.5; // Accept if strong
                } else {
                    // Automatically accept for human for now to prevent blocking (or assume they accept)
                    // (Ideally we would prompt the human, but for simplicity, we auto-accept)
                    accept=true;
                }
                if(accept){
                    UI.log(`${prevP.name} ACCEPTED Side Show!`,1,'tp');
                    const ev1=evaluateTP(p.hand),ev2=evaluateTP(prevP.hand);
                    const cmp=tpCompare(ev1.score,ev2.score);
                    if(cmp>=0){prevP.folded=true;UI.log(`${p.name} wins Side Show!`,1,'tp');}
                    else{p.folded=true;UI.log(`${prevP.name} wins Side Show!`,1,'tp');}
                } else {
                    UI.log(`${prevP.name} DENIED Side Show`,1,'tp');
                }
            }
        } else if(action.action==='call'||action.action==='chaal'){
            const amt=p.isSeen?g.stake*2:g.stake;
            if(p.chips<amt){
                p.folded=true;UI.showBadge('tp-seat-'+idx,'pack');UI.log(`${p.name} packs (Out of Coins)`,0,'tp');
            } else {
                p.chips-=amt;p.totalBet+=amt;g.pot+=amt;
                UI.showBadge('tp-seat-'+idx,'call',amt);
                UI.log(`${p.name} chaals ${amt}`,0,'tp');
            }
        } else if(action.action==='raise'){
            let amt=action.amount||g.stake*2;
            g.stake=Math.min(amt,p.isSeen?amt:amt);
            const pay=p.isSeen?g.stake*2:g.stake;
            if(p.chips<pay){
                p.folded=true;UI.showBadge('tp-seat-'+idx,'pack');UI.log(`${p.name} packs (Out of Coins)`,0,'tp');
            } else {
                p.chips-=pay;p.totalBet+=pay;g.pot+=pay;
                UI.showBadge('tp-seat-'+idx,'raise',pay);
                UI.log(`${p.name} raises to ${g.stake}`,0,'tp');
            }
        } else if(action.action==='show'){
            // Compare with previous active player
            const others=active.filter(x=>x!==p);
            if(others.length===1){
                const opp=others[0];
                const showCost=p.isSeen?g.stake*2:g.stake;
                if(p.chips<showCost){
                    p.folded=true;UI.showBadge('tp-seat-'+idx,'pack');UI.log(`${p.name} packs (Out of Coins)`,0,'tp');
                } else {
                    p.chips-=showCost;p.totalBet+=showCost;g.pot+=showCost;
                    p.showCards=true;opp.showCards=true;p.isSeen=true;
                    const myEv=evaluateTP(p.hand), oppEv=evaluateTP(opp.hand);
                    const cmp=tpCompare(myEv.score,oppEv.score);
                    if(cmp>=0){opp.folded=true;UI.log(`${p.name} shows — beats ${opp.name}! (${myEv.name} vs ${oppEv.name})`,1,'tp');}
                    else{p.folded=true;UI.log(`${p.name} shows — loses to ${opp.name}! (${myEv.name} vs ${oppEv.name})`,1,'tp');}
                }
            }
        }
        if(p.isBlind) p.blindTurns++;
        if(p.blindTurns>=TP_MAX_BLIND_TURNS&&p.isBlind&&!p.isHuman){p.isBlind=false;p.isSeen=true;}
        tpRender(g);
        const stillIn=g.players.filter(x=>!x.folded&&!x.eliminated);
        if(stillIn.length<=1) break;
        idx=(idx+1)%g.players.length;
    }
    // Award pot
    g.handOver=true; g.currentPlayerIndex=-1;
    const winners=g.players.filter(p=>!p.folded&&!p.eliminated);
    if(winners.length===1){
        winners[0].chips+=g.pot;winners[0].isWinner=true;
        UI.updateLeaderboardStat('teenpatti', winners[0].name, winners[0].chips);
        tpRender(g);
        UI.showWinner(`<h3>🏆 Winner</h3><p>${winners[0].name} wins <span class="win-amt">${g.pot}</span></p>`,'tp');
    } else if(winners.length>1){
        g.showdown=true;
        for(const w of winners) w.showCards=true;
        let best=null,ws=[];
        for(const w of winners){const ev=evaluateTP(w.hand);
            if(!best||tpCompare(ev.score,best)>0){best=ev.score;ws=[{p:w,ev}];}
            else if(tpCompare(ev.score,best)===0) ws.push({p:w,ev});}
        const share=Math.floor(g.pot/ws.length);
        for(const w of ws){
            w.p.chips+=share;w.p.isWinner=true;
            UI.updateLeaderboardStat('teenpatti', w.p.name, w.p.chips);
        }
        tpRender(g);
        UI.showWinner(`<h3>🏆 Showdown</h3>${ws.map(w=>`<p>${w.p.name} wins <span class="win-amt">${share}</span> — ${w.ev.name}</p>`).join('')}`,'tp');
    }
    for(const p of g.players) if(p.chips<=0&&!p.eliminated){p.eliminated=true;UI.log(`${p.name} eliminated!`,1,'tp');}
    tpRender(g);
    const rem=g.players.filter(p=>!p.eliminated);
    if(rem.length<=1||g.players[0].eliminated){
        g.gameOver=true;
        const t=document.getElementById('tp-go-title'),m=document.getElementById('tp-go-msg');
        if(g.players[0].eliminated){t.textContent='Game Over';m.textContent='You were eliminated.';}
        else{t.textContent='🏆 You Win!';m.textContent=`Won with ${g.players[0].chips} chips!`;}
        document.getElementById('tp-gameover').classList.remove('hidden'); return;
    }
    UI.showNextBtn('tp');
}

function tpRender(g) {
    for(let i=0;i<g.players.length;i++) UI.renderPlayerSeat(g.players[i],i,g,'tp');
    UI.updatePot(g.pot,'tp');
    // Strength meter when human has seen cards
    const h=g.players[0];
    if(h&&h.isSeen&&h.hand.length===3&&!h.folded){
        const ev=evaluateTP(h.hand);
        UI.updateStrength(Math.min(1,tpStrength(ev)),ev.name,'tp');
    } else { UI.updateStrength(-1,'','tp'); }
}

function tpAiDecide(p,g) {
    const ai=p.ai, active=g.players.filter(x=>!x.folded&&!x.eliminated);
    // Auto-see after some blind turns
    if(p.isBlind&&p.blindTurns>=2&&Math.random()<0.5) return {action:'see'};
    const ev=p.isSeen?evaluateTP(p.hand):null;
    const str=ev?tpStrength(ev):0.3+Math.random()*0.2;
    const adjusted=str+(Math.random()-0.5)*0.15+(Math.random()<ai.bluff?0.25:0);
    // Show when 2 players left and strong
    if(active.length===2&&p.isSeen&&adjusted>0.5) return {action:'show'};
    if(adjusted<ai.tight*0.35) return {action:'fold'};
    if(adjusted>ai.tight*0.6&&Math.random()<ai.aggr){
        return {action:'raise',amount:g.stake+g.boot};
    }
    return {action:'call'};
}

function tpAction(type) {
    if(!tpResolve) return;
    const r=tpResolve; tpResolve=null;
    r(type === 'see' ? {action:'see'} : {action:type});
}

function startTeenPatti(buyIn = 100000) { 
    const go = document.getElementById('tp-gameover'); if (go) go.classList.add('hidden');
    tpGame=createTPGame(buyIn); tpPlayRound(tpGame); 
}
function tpNextRound() { UI.hideNextBtn('tp'); if(tpGame&&!tpGame.gameOver) tpPlayRound(tpGame); }
function resetTP() { tpGame=null; tpResolve=null; }
