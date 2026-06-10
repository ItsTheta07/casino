// AI Player Decision Engine
const AI_PROFILES = [
    { name: 'Viktor', style: 'shark', tightness: 0.6, aggression: 0.7, bluff: 0.15 },
    { name: 'Luna', style: 'fox', tightness: 0.45, aggression: 0.55, bluff: 0.25 },
    { name: 'Big Mike', style: 'maniac', tightness: 0.25, aggression: 0.85, bluff: 0.35 },
    { name: 'Sarah', style: 'rock', tightness: 0.75, aggression: 0.3, bluff: 0.05 },
    { name: 'Johnny', style: 'fish', tightness: 0.3, aggression: 0.35, bluff: 0.2 }
];

// Pre-flop hand strength (0-1)
function preflopStrength(c1, c2) {
    const hi = Math.max(c1.rank, c2.rank), lo = Math.min(c1.rank, c2.rank);
    const paired = c1.rank === c2.rank;
    const suited = c1.suit === c2.suit;
    let s = 0;
    if (paired) {
        s = 0.4 + (hi - 2) * 0.05; // 0.4 (22) to 1.0 (AA)
    } else {
        s = (hi - 2) * 0.03 + (lo - 2) * 0.015;
        if (suited) s += 0.06;
        if (hi - lo === 1) s += 0.04; // connectors
        if (hi - lo <= 3) s += 0.02; // gappers
    }
    // Premium hand bonuses
    if (hi === 14 && lo === 13) s = suited ? 0.95 : 0.9;
    if (hi === 14 && lo === 12) s = suited ? 0.88 : 0.82;
    if (hi === 14 && lo >= 10) s = Math.max(s, suited ? 0.78 : 0.72);
    return Math.min(1, Math.max(0, s));
}

function handStrengthScore(handEval) {
    if (!handEval || !handEval.score) return 0;
    const base = handEval.score[0] / 9;
    const sub = (handEval.score[1] || 0) / 14 * 0.1;
    return Math.min(1, base + sub);
}

function aiDecide(player, game) {
    const profile = player.aiProfile;
    const hole = player.hand;
    const community = game.communityCards;
    const currentBet = game.currentBet;
    const myBet = player.currentRoundBet;
    const toCall = currentBet - myBet;
    const pot = game.pot;
    const myChips = player.chips;

    // Calculate hand strength
    let strength;
    if (community.length === 0) {
        strength = preflopStrength(hole[0], hole[1]);
    } else {
        const allCards = [...hole, ...community];
        const eval_ = evaluateHand(allCards);
        strength = handStrengthScore(eval_);
        // Boost for made hands
        if (eval_.score[0] >= 1) strength = Math.max(strength, 0.35);
        if (eval_.score[0] >= 2) strength = Math.max(strength, 0.55);
        if (eval_.score[0] >= 3) strength = Math.max(strength, 0.65);
        if (eval_.score[0] >= 4) strength = Math.max(strength, 0.75);
        if (eval_.score[0] >= 6) strength = Math.max(strength, 0.88);
    }

    // Add randomness
    strength += (Math.random() - 0.5) * 0.15;

    // Bluff chance
    const isBluffing = Math.random() < profile.bluff;
    if (isBluffing) strength += 0.3;

    // Pot odds consideration
    const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;

    // Decision thresholds adjusted by profile
    const foldThreshold = profile.tightness * 0.4;
    const callThreshold = profile.tightness * 0.55;
    const raiseThreshold = profile.tightness * 0.5 + (1 - profile.aggression) * 0.2;

    // Free check
    if (toCall === 0) {
        if (strength > raiseThreshold && Math.random() < profile.aggression) {
            const raiseAmt = calcRaise(strength, pot, myChips, currentBet, game.bigBlind, profile, community.length === 0);
            return { action: 'raise', amount: raiseAmt };
        }
        return { action: 'check' };
    }

    // Must pay to continue
    if (toCall >= myChips) {
        // All-in decision
        let allInThresh = community.length === 0 ? 0.82 : 0.65;
        if (strength > allInThresh || (isBluffing && strength > 0.6)) {
            return { action: 'allin' };
        }
        return { action: 'fold' };
    }

    if (strength < foldThreshold && !isBluffing) {
        // Consider pot odds
        if (potOdds < 0.15 && strength > foldThreshold * 0.6) {
            return { action: 'call' };
        }
        return { action: 'fold' };
    }

    if (strength > raiseThreshold && Math.random() < profile.aggression) {
        const raiseAmt = calcRaise(strength, pot, myChips, currentBet, game.bigBlind, profile, community.length === 0);
        if (raiseAmt >= myChips) return { action: 'allin' };
        return { action: 'raise', amount: raiseAmt };
    }

    return { action: 'call' };
}

function calcRaise(strength, pot, chips, currentBet, bigBlind, profile, isPreflop) {
    const minRaise = currentBet + bigBlind;
    let raiseAmount;
    if (isPreflop) {
        let bbMult = strength > 0.85 ? 4 : (strength > 0.65 ? 3 : 2);
        if (currentBet > bigBlind) {
            raiseAmount = Math.max(minRaise, Math.floor(currentBet * (2 + Math.random())));
        } else {
            raiseAmount = Math.max(minRaise, bigBlind * bbMult);
        }
    } else {
        if (strength > 0.85) {
            raiseAmount = Math.max(minRaise, Math.floor(pot * (0.8 + Math.random() * 0.5)));
        } else if (strength > 0.65) {
            raiseAmount = Math.max(minRaise, Math.floor(pot * (0.5 + Math.random() * 0.3)));
        } else {
            raiseAmount = Math.max(minRaise, Math.floor(pot * (0.3 + Math.random() * 0.2)));
        }
    }
    // Aggressive players raise more
    raiseAmount = Math.floor(raiseAmount * (0.8 + profile.aggression * 0.6));
    return Math.min(raiseAmount, chips);
}
