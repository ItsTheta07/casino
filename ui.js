// UI Rendering Module — Fixed: no card re-animation, clear turn indicator
const UI = {
    _renderedCards: {}, // track rendered card counts per seat
    _communityCount: 0,

    cardId(card) { return card.suit + card.rank; },

    renderCard(card, faceDown = false) {
        const div = document.createElement('div');
        div.className = 'card ' + (faceDown ? 'card-back' : 'card-front ' + (isRed(card) ? 'red' : 'black'));
        div.dataset.cid = this.cardId(card);
        if (!faceDown) {
            const rn = RANK_NAMES[card.rank], ss = SUIT_SYMBOLS[card.suit];
            div.innerHTML = `<span class="card-corner-top">${rn}<br>${ss}</span><span class="card-rank">${rn}</span><span class="card-suit">${ss}</span><span class="card-corner-bottom">${rn}<br>${ss}</span>`;
        }
        return div;
    },

    renderPlayerSeat(player, index, game, prefix) {
        prefix = prefix || 'pk';
        const seat = document.getElementById(prefix + '-seat-' + index);
        if (!seat) return;
        seat.className = seat.className.replace(/\s*(active-turn|folded|winner)/g, '');
        // Re-apply base classes
        const baseClasses = seat.getAttribute('data-base-class');
        if (!baseClasses) seat.setAttribute('data-base-class', seat.className);
        seat.className = seat.getAttribute('data-base-class') || seat.className;

        if (player.folded || player.eliminated) seat.classList.add('folded');
        if (game.currentPlayerIndex === index && !game.handOver) seat.classList.add('active-turn');
        if (player.isWinner) seat.classList.add('winner');

        const isHuman = player.isHuman;
        const showCards = isHuman && !player.isBlind || player.showCards || (game.handOver && !player.folded && game.showdown);
        const dealerMark = game.dealerIndex === index ? '<span class="dealer-chip">D</span> ' : '';
        const blindTag = game.smallBlindIndex === index ? ' <small>(SB)</small>' : game.bigBlindIndex === index ? ' <small>(BB)</small>' : '';

        // Build info HTML (always update)
        let betHtml = '';
        if (player.currentRoundBet > 0 && !game.handOver) {
            betHtml = `<div class="player-bet-display">Bet: ${player.currentRoundBet}</div>`;
        }
        let handNameHtml = '';
        if (showCards && player.hand.length >= 2 && !player.folded) {
            const cc = game.communityCards || [];
            if (cc.length >= 3 || game.gameType === 'teenpatti') {
                const allC = game.gameType === 'teenpatti' ? player.hand : [...player.hand, ...cc];
                if (allC.length >= 3) {
                    const ev = game.gameType === 'teenpatti' ? evaluateTP(allC) : evaluateHand(allC);
                    handNameHtml = `<div class="player-hand-name">${ev.name}</div>`;
                }
            }
        }
        let statusHtml = '';
        if (player.isBlind && !player.folded && game.gameType === 'teenpatti') statusHtml = '<div class="player-status">Blind</div>';
        if (player.isSeen && game.gameType === 'teenpatti') statusHtml = '<div class="player-status">Seen</div>';

        // Turn indicator
        let turnHtml = '';
        if (game.currentPlayerIndex === index && !game.handOver) {
            if (player.isHuman) {
                turnHtml = '<div class="turn-indicator turn-you">⚡ YOUR TURN</div>';
            } else {
                turnHtml = '<div class="turn-indicator turn-thinking">⏳ Thinking...</div>';
            }
        }

        // Only rebuild cards if count changed
        const cardKey = prefix + '-' + index;
        const prevCount = this._renderedCards[cardKey] || 0;
        const newCount = (player.hand && !player.eliminated) ? player.hand.length : 0;
        const prevShown = seat.dataset.cardsShown === 'true';
        const cardsChanged = newCount !== prevCount || (showCards !== prevShown);

        // Get or create sub-elements
        let cardsDiv = seat.querySelector('.player-cards');
        let infoDiv = seat.querySelector('.player-info');

        if (!cardsDiv || !infoDiv || cardsChanged) {
            seat.dataset.cardsShown = showCards;
            // Full rebuild
            seat.innerHTML = `${turnHtml}<div class="player-cards" id="${prefix}-cards-${index}"></div>
                <div class="player-info"><div class="player-name">${dealerMark}${player.name}${blindTag}</div><div class="player-chips">💰 ${player.chips}</div>${statusHtml}</div>${betHtml}${handNameHtml}`;
            cardsDiv = seat.querySelector('.player-cards');
            if (newCount > 0 && !player.eliminated) {
                for (const card of player.hand) {
                    const el = this.renderCard(card, !showCards);
                    if (newCount > prevCount) el.classList.add('dealing');
                    cardsDiv.appendChild(el);
                }
            }
            this._renderedCards[cardKey] = newCount;
        } else {
            // Update only info, keep cards stable
            const oldTurn = seat.querySelector('.turn-indicator');
            if (oldTurn) oldTurn.remove();
            if (turnHtml) seat.insertAdjacentHTML('afterbegin', turnHtml);
            infoDiv.innerHTML = `<div class="player-name">${dealerMark}${player.name}${blindTag}</div><div class="player-chips">💰 ${player.chips}</div>${statusHtml}`;
            // Update bet/hand-name
            const oldBet = seat.querySelector('.player-bet-display');
            const oldHand = seat.querySelector('.player-hand-name');
            if (oldBet) oldBet.remove();
            if (oldHand) oldHand.remove();
            if (betHtml) seat.insertAdjacentHTML('beforeend', betHtml);
            if (handNameHtml) seat.insertAdjacentHTML('beforeend', handNameHtml);
        }
    },

    renderCommunity(cards, prefix) {
        prefix = prefix || 'pk';
        const cont = document.getElementById(prefix + '-community-cards');
        if (!cont) return;
        const currentCount = cont.children.length;
        // Only append new cards
        for (let i = currentCount; i < cards.length; i++) {
            const el = this.renderCard(cards[i]);
            el.classList.add('dealing');
            cont.appendChild(el);
        }
        this._communityCount = cards.length;
    },

    clearCommunity(prefix) {
        prefix = prefix || 'pk';
        const cont = document.getElementById(prefix + '-community-cards');
        if (cont) cont.innerHTML = '';
        this._communityCount = 0;
    },

    updatePot(amount, prefix) {
        prefix = prefix || 'pk';
        const el = document.getElementById(prefix + '-pot-amount');
        if (el) el.textContent = amount;
    },

    updateStrength(score, name, prefix) {
        prefix = prefix || 'pk';
        const meter = document.getElementById(prefix + '-strength-meter');
        const fill = document.getElementById(prefix + '-strength-fill');
        const label = document.getElementById(prefix + '-strength-label');
        if (!meter || !fill || !label) return;
        if (score < 0) { meter.classList.add('hidden'); return; }
        meter.classList.remove('hidden');
        const pct = Math.round(score * 100);
        fill.style.width = pct + '%';
        const hue = Math.round(score * 120);
        fill.style.background = `hsl(${hue}, 80%, 50%)`;
        label.textContent = name;
    },

    showActionPanel(game, prefix) {
        prefix = prefix || 'pk';
        const panel = document.getElementById(prefix + '-action-panel');
        if (!panel) return;
        panel.classList.remove('hidden');
        const player = game.players.find(p => p.isHuman);
        if (!player) return;

        if (prefix === 'tp') {
            const amt = player.isSeen ? game.stake * 2 : game.stake;
            const ca = document.getElementById('tp-call-amount');
            if (ca) ca.textContent = amt;
            const ra = document.getElementById('tp-raise-amount');
            if (ra) ra.textContent = amt * 2;
            
            // Side Show visibility
            const ssBtn = document.getElementById('tp-btn-sideshow');
            if (ssBtn) {
                // Determine previous active player
                const active = game.players.filter(p => !p.folded && !p.eliminated);
                const myIdx = active.indexOf(player);
                const prevIdx = (myIdx - 1 + active.length) % active.length;
                const prevPlayer = active[prevIdx];
                if (player.isSeen && prevPlayer && prevPlayer.isSeen && active.length > 2) {
                    ssBtn.classList.remove('hidden');
                    const ssa = document.getElementById('tp-sideshow-amount');
                    if (ssa) ssa.textContent = amt;
                } else {
                    ssBtn.classList.add('hidden');
                }
            }
        } else {
            const toCall = game.currentBet - player.currentRoundBet;
            const ccLabel = document.getElementById(prefix + '-cc-label') || document.getElementById(prefix + '-call-label');
            const ccAmt = document.getElementById(prefix + '-cc-amount') || document.getElementById(prefix + '-call-amount');
            if (ccLabel) {
                if (toCall <= 0) { ccLabel.textContent = 'Check'; if (ccAmt) ccAmt.textContent = ''; }
                else { ccLabel.textContent = 'Call'; if (ccAmt) ccAmt.textContent = Math.min(toCall, player.chips); }
            }
            const rl = document.getElementById(prefix + '-raise-label');
            if (rl) rl.textContent = toCall > 0 ? 'Raise to' : 'Bet';
            const slider = document.getElementById(prefix + '-raise-slider');
            if (slider) {
                const minR = game.currentBet + (game.bigBlind || 10);
                slider.min = minR; slider.max = player.chips;
                slider.value = Math.min(minR * 2, player.chips);
                this.updateRaiseDisplay(prefix);
            }
        }
    },

    hideActionPanel(prefix) {
        prefix = prefix || 'pk';
        const panel = document.getElementById(prefix + '-action-panel');
        if (panel) panel.classList.add('hidden');
    },

    updateRaiseDisplay(prefix) {
        prefix = prefix || 'pk';
        const slider = document.getElementById(prefix + '-raise-slider');
        const disp = document.getElementById(prefix + '-raise-value');
        const amt = document.getElementById(prefix + '-raise-amount');
        if (slider && disp) disp.textContent = slider.value;
        if (slider && amt) amt.textContent = slider.value;
    },

    showBadge(seatId, action, amount) {
        const seat = document.getElementById(seatId);
        if (!seat) return;
        const old = seat.querySelector('.player-action-badge');
        if (old) old.remove();
        const badge = document.createElement('div');
        let cls = 'badge-' + action.replace(/\s/g, '');
        let text = action.toUpperCase();
        if (['call','raise','bet','chaal'].includes(action) && amount) text += ' ' + amount;
        if (action === 'allin') { text = 'ALL IN'; cls = 'badge-allin'; }
        badge.className = 'player-action-badge ' + cls;
        badge.textContent = text;
        seat.appendChild(badge);
        setTimeout(() => { if (badge.parentNode) badge.remove(); }, 2500);
    },

    log(msg, hl, prefix) {
        prefix = prefix || 'pk';
        const c = document.getElementById(prefix + '-log-content');
        if (!c) return;
        const e = document.createElement('div');
        e.className = 'log-entry' + (hl ? ' log-hl' : '');
        e.textContent = msg;
        c.appendChild(e);
        c.scrollTop = c.scrollHeight;
    },

    clearLog(prefix) {
        prefix = prefix || 'pk';
        const c = document.getElementById(prefix + '-log-content');
        if (c) c.innerHTML = '';
    },

    showWinner(msg, prefix) {
        prefix = prefix || 'pk';
        const o = document.getElementById(prefix + '-winner-overlay');
        const m = document.getElementById(prefix + '-winner-msg');
        if (!o || !m) return;
        m.innerHTML = msg;
        o.classList.remove('hidden');
        setTimeout(() => o.classList.add('hidden'), 3500);
    },

    showNextBtn(prefix) { const b = document.getElementById(prefix + '-btn-next'); if (b) b.classList.remove('hidden'); },
    hideNextBtn(prefix) { const b = document.getElementById(prefix + '-btn-next'); if (b) b.classList.add('hidden'); },

    resetTracking() {
        this._renderedCards = {};
        this._communityCount = 0;
    },

    renderAllPoker(game) {
        for (let i = 0; i < game.players.length; i++) this.renderPlayerSeat(game.players[i], i, game, 'pk');
        this.renderCommunity(game.communityCards, 'pk');
        this.updatePot(game.pot, 'pk');
        document.getElementById('pk-hand-number').textContent = 'Hand #' + game.handNumber;
        document.getElementById('pk-blind-info').textContent = 'Blinds: ' + game.smallBlind + '/' + game.bigBlind;
        // Strength meter for human
        const human = game.players[0];
        if (human && human.hand.length === 2 && game.communityCards.length >= 3 && !human.folded) {
            const ev = evaluateHand([...human.hand, ...game.communityCards]);
            const s = ev.score[0] / 9 + (ev.score[1] || 0) / 14 * 0.1;
            this.updateStrength(Math.min(1, s), ev.name, 'pk');
        } else {
            this.updateStrength(-1, '', 'pk');
        }
    },

    // Wallet Logic
    getWalletBalance() {
        const bal = localStorage.getItem('rc_wallet');
        return bal ? parseInt(bal) : 1000000;
    },
    updateWalletBalance(amount) {
        let bal = this.getWalletBalance();
        bal += amount;
        if (bal < 0) bal = 0;
        localStorage.setItem('rc_wallet', bal);
        this.refreshHubWallet();
        return bal;
    },
    refreshHubWallet() {
        const el = document.getElementById('hub-wallet-amount');
        if (el) el.textContent = this.getWalletBalance();
    },
    initWallet() {
        if (!localStorage.getItem('rc_wallet')) {
            localStorage.setItem('rc_wallet', 1000000);
        }
        this.refreshHubWallet();
    },
    promptRedeem() {
        const code = prompt("Enter Redeem Code:");
        if (!code) return;
        const match = code.trim().match(/^\?give coins (\d+)$/i);
        if (match) {
            let amt = parseInt(match[1]);
            if (amt > 1000000) amt = 1000000;
            this.updateWalletBalance(amt);
            alert(`Successfully redeemed ${amt} coins!`);
        } else {
            alert("Invalid code format.");
        }
    },
    cashOut(pkGameObj, tpGameObj, rouletteAmt) {
        // Find if human has chips in active games
        if (pkGameObj && !pkGameObj.gameOver && pkGameObj.players[0]) {
            const chips = pkGameObj.players[0].chips;
            if (chips > 0) this.updateWalletBalance(chips);
            pkGameObj.players[0].chips = 0; // prevent double cashout
        }
        if (tpGameObj && !tpGameObj.gameOver && tpGameObj.players[0]) {
            const chips = tpGameObj.players[0].chips;
            if (chips > 0) this.updateWalletBalance(chips);
            tpGameObj.players[0].chips = 0;
        }
        if (rouletteAmt > 0) {
            this.updateWalletBalance(rouletteAmt);
        }
    },

    // Leaderboard Logic
    getLeaderboardData() {
        const data = localStorage.getItem('rc_leaderboards');
        return data ? JSON.parse(data) : { poker: {}, teenpatti: {}, bhabhi: {} };
    },
    saveLeaderboardData(data) {
        localStorage.setItem('rc_leaderboards', JSON.stringify(data));
    },
    updateLeaderboardStat(gameType, playerName, score, scoreType = 'chips') {
        const data = this.getLeaderboardData();
        if (!data[gameType]) data[gameType] = {};
        
        if (scoreType === 'chips') {
            // High score tracking for chips
            const current = data[gameType][playerName] || 0;
            if (score > current) data[gameType][playerName] = score;
        } else if (scoreType === 'add') {
            // Accumulative tracking for Bhabhi wins
            const current = data[gameType][playerName] || 0;
            data[gameType][playerName] = current + score;
        }
        this.saveLeaderboardData(data);
    },
    showLeaderboard(defaultTab = 'poker') {
        document.getElementById('leaderboard-modal').classList.remove('hidden');
        this.switchLbTab(defaultTab);
    },
    switchLbTab(tabName) {
        const tabs = document.querySelectorAll('.lb-tab');
        tabs.forEach(t => {
            if (t.textContent.toLowerCase().replace(/\s/g, '') === tabName) t.classList.add('active');
            else t.classList.remove('active');
        });
        
        const list = document.getElementById('lb-list');
        list.innerHTML = '';
        const data = this.getLeaderboardData()[tabName] || {};
        
        const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) {
            list.innerHTML = '<div style="text-align:center;color:var(--txt2);padding:20px;">No data yet. Play a game!</div>';
            return;
        }
        
        sorted.forEach(([name, score], idx) => {
            const isHuman = name === 'You';
            const suffix = tabName === 'bhabhi' ? ' Wins' : ' 💰';
            const html = `
                <div class="lb-item ${isHuman ? 'human' : ''}">
                    <span class="lb-rank">#${idx + 1}</span>
                    <span class="lb-name">${name}</span>
                    <span class="lb-score">${score}${suffix}</span>
                </div>
            `;
            list.insertAdjacentHTML('beforeend', html);
        });
    }
};

function updateRaiseDisplay() { UI.updateRaiseDisplay('pk'); }
