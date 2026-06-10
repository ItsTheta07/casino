// Card constants and deck management
const SUITS = ['clubs','diamonds','hearts','spades'];
const SUIT_SYMBOLS = {clubs:'♣',diamonds:'♦',hearts:'♥',spades:'♠'};
const RANK_NAMES = {2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A'};
const HAND_NAMES = ['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush','Royal Flush'];

function createDeck() {
    const deck = [];
    for (const s of SUITS) for (let r = 2; r <= 14; r++) deck.push({suit: s, rank: r});
    return deck;
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function isRed(card) { return card.suit === 'hearts' || card.suit === 'diamonds'; }

// Hand Evaluation - evaluate best 5-card hand from up to 7 cards
function getCombinations(arr, k) {
    const result = [];
    function combo(start, chosen) {
        if (chosen.length === k) { result.push([...chosen]); return; }
        for (let i = start; i < arr.length; i++) {
            chosen.push(arr[i]);
            combo(i + 1, chosen);
            chosen.pop();
        }
    }
    combo(0, []);
    return result;
}

function evaluate5(cards) {
    const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);
    const isFlush = suits.every(s => s === suits[0]);

    // Check straight
    let isStraight = false, straightHigh = 0;
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
    if (uniqueRanks.length === 5) {
        if (uniqueRanks[0] - uniqueRanks[4] === 4) {
            isStraight = true; straightHigh = uniqueRanks[0];
        }
        // Wheel: A-2-3-4-5
        if (uniqueRanks[0] === 14 && uniqueRanks[1] === 5 && uniqueRanks[2] === 4 && uniqueRanks[3] === 3 && uniqueRanks[4] === 2) {
            isStraight = true; straightHigh = 5;
        }
    }

    // Count ranks
    const counts = {};
    for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
    const groups = Object.entries(counts)
        .map(([r, c]) => ({rank: parseInt(r), count: c}))
        .sort((a, b) => b.count - a.count || b.rank - a.rank);

    if (isStraight && isFlush) {
        return straightHigh === 14 ? [9, 14] : [8, straightHigh];
    }
    if (groups[0].count === 4) {
        const kicker = groups[1].rank;
        return [7, groups[0].rank, kicker];
    }
    if (groups[0].count === 3 && groups[1].count === 2) {
        return [6, groups[0].rank, groups[1].rank];
    }
    if (isFlush) return [5, ...ranks];
    if (isStraight) return [4, straightHigh];
    if (groups[0].count === 3) {
        return [3, groups[0].rank, groups[1].rank, groups[2].rank];
    }
    if (groups[0].count === 2 && groups[1].count === 2) {
        const hp = Math.max(groups[0].rank, groups[1].rank);
        const lp = Math.min(groups[0].rank, groups[1].rank);
        return [2, hp, lp, groups[2].rank];
    }
    if (groups[0].count === 2) {
        const kickers = groups.slice(1).map(g => g.rank).sort((a, b) => b - a);
        return [1, groups[0].rank, ...kickers];
    }
    return [0, ...ranks];
}

function evaluateHand(cards) {
    if (cards.length < 5) return { score: [0, 0], name: 'Incomplete' };
    const combos = cards.length === 5 ? [cards] : getCombinations(cards, 5);
    let bestScore = null, bestName = '';
    for (const combo of combos) {
        const score = evaluate5(combo);
        if (!bestScore || compareScores(score, bestScore) > 0) {
            bestScore = score;
            bestName = HAND_NAMES[score[0]];
        }
    }
    return { score: bestScore, name: bestName };
}

function compareScores(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const va = a[i] || 0, vb = b[i] || 0;
        if (va > vb) return 1;
        if (va < vb) return -1;
    }
    return 0;
}
