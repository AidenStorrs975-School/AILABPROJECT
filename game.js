'use strict';

const SUITS = [
  { name: 'Spades', symbol: '\u2660', red: false },
  { name: 'Hearts', symbol: '\u2665', red: true },
  { name: 'Diamonds', symbol: '\u2666', red: true },
  { name: 'Clubs', symbol: '\u2663', red: false },
];
const RANKS = [
  { label: 'A', value: 11 }, { label: '2', value: 2 }, { label: '3', value: 3 },
  { label: '4', value: 4 }, { label: '5', value: 5 }, { label: '6', value: 6 },
  { label: '7', value: 7 }, { label: '8', value: 8 }, { label: '9', value: 9 },
  { label: '10', value: 10 }, { label: 'J', value: 10 }, { label: 'Q', value: 10 },
  { label: 'K', value: 10 },
];
const MIN_BET = 10;
const BET_STEP = 10;
const INITIAL_BANKROLL = 500;
const UINT32_RANGE = 0x100000000;

const elements = {
  balance: document.getElementById('balance'),
  bet: document.getElementById('bet'),
  dealerCards: document.getElementById('dealer-cards'),
  dealerTotal: document.getElementById('dealer-total'),
  playerCards: document.getElementById('player-cards'),
  playerTotal: document.getElementById('player-total'),
  message: document.getElementById('round-message'),
  hit: document.getElementById('hit'),
  stand: document.getElementById('stand'),
  double: document.getElementById('double'),
  deal: document.getElementById('deal'),
};

let bankroll = INITIAL_BANKROLL;
let deck = [];
let playerHand = [];
let dealerHand = [];
let wager = 0;
let phase = 'ready';
let message = 'Choose your bet, then deal in.';
let rngUnavailable = false;

function randomInt(upperBound) {
  if (!Number.isInteger(upperBound) || upperBound < 1 || upperBound > UINT32_RANGE) {
    throw new RangeError('Random bound is outside the supported range.');
  }
  if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') {
    throw new Error('Secure randomness is unavailable in this browser.');
  }

  const limit = Math.floor(UINT32_RANGE / upperBound) * upperBound;
  const sample = new Uint32Array(1);
  do {
    window.crypto.getRandomValues(sample);
  } while (sample[0] >= limit);
  return sample[0] % upperBound;
}

function shuffledDeck() {
  const cards = SUITS.flatMap((suit) => RANKS.map((rank) => ({
    suit: suit.name,
    symbol: suit.symbol,
    red: suit.red,
    label: rank.label,
    value: rank.value,
  })));

  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
  return cards;
}

function handValue(hand) {
  let total = hand.reduce((sum, card) => sum + card.value, 0);
  let aces = hand.filter((card) => card.label === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function isNatural(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

function draw(hand) {
  if (deck.length === 0) {
    throw new Error('The deck is empty. Start a new round to reshuffle.');
  }
  hand.push(deck.pop());
}

function createCard(card, hidden = false) {
  const element = document.createElement('div');
  element.className = `playing-card${hidden ? ' face-down' : card.red ? ' red' : ''}`;
  element.setAttribute('role', 'img');

  if (hidden) {
    element.setAttribute('aria-label', 'Face-down card');
    return element;
  }

  element.setAttribute('aria-label', `${card.label} of ${card.suit}`);
  const corner = document.createElement('span');
  corner.className = 'card-corner';
  corner.textContent = card.label;
  const suit = document.createElement('span');
  suit.className = 'card-suit';
  suit.textContent = card.symbol;
  const cornerBottom = document.createElement('span');
  cornerBottom.className = 'card-corner card-corner-bottom';
  cornerBottom.textContent = card.label;
  const face = document.createElement('span');
  face.className = 'card-face';
  face.append(suit);
  element.append(corner, face, cornerBottom);
  return element;
}

function renderHand(container, hand, hideHoleCard = false) {
  container.replaceChildren();
  hand.forEach((card, index) => {
    container.append(createCard(card, hideHoleCard && index === 1));
  });
}

function render() {
  const hideHoleCard = phase === 'player';
  renderHand(elements.playerCards, playerHand);
  renderHand(elements.dealerCards, dealerHand, hideHoleCard);

  elements.balance.textContent = String(bankroll);
  elements.playerTotal.textContent = playerHand.length ? String(handValue(playerHand)) : '—';
  elements.dealerTotal.textContent = hideHoleCard
    ? String(dealerHand[0] ? handValue([dealerHand[0]]) : '—')
    : dealerHand.length ? String(handValue(dealerHand)) : '—';
  elements.message.textContent = message;

  const roundActive = phase === 'player';
  elements.hit.disabled = !roundActive;
  elements.stand.disabled = !roundActive;
  elements.double.disabled = !roundActive || playerHand.length !== 2 || bankroll < wager;
  elements.deal.disabled = roundActive || bankroll < MIN_BET || rngUnavailable;
  elements.deal.textContent = roundActive ? 'Round in progress' : phase === 'ready' ? 'Deal cards' : 'Deal again';
  elements.bet.disabled = roundActive || bankroll < MIN_BET;

  const maximumBet = Math.max(MIN_BET, Math.floor(bankroll / BET_STEP) * BET_STEP);
  elements.bet.max = String(maximumBet);
  if (!roundActive) {
    const currentBet = Number(elements.bet.value);
    const displayBet = Number.isSafeInteger(currentBet) && currentBet >= MIN_BET
      ? Math.min(currentBet, maximumBet)
      : MIN_BET;
    elements.bet.value = String(displayBet);
  }
}

function settle(outcome) {
  phase = 'over';
  if (outcome === 'blackjack') {
    bankroll += wager * 2.5;
    message = `Blackjack! You win ${wager * 1.5} credits.`;
  } else if (outcome === 'win') {
    bankroll += wager * 2;
    message = `You win ${wager} credits.`;
  } else if (outcome === 'push') {
    bankroll += wager;
    message = 'Push. Your bet is returned.';
  } else {
    message = outcome === 'bust' ? 'Bust. Dealer wins.' : 'Dealer wins this round.';
  }
  render();
}

function resolveDealerTurn() {
  while (handValue(dealerHand) < 17) {
    draw(dealerHand);
  }

  const playerTotal = handValue(playerHand);
  const dealerTotal = handValue(dealerHand);
  if (dealerTotal > 21 || playerTotal > dealerTotal) {
    settle('win');
  } else if (playerTotal === dealerTotal) {
    settle('push');
  } else {
    settle('loss');
  }
}

function dealRound() {
  if (phase === 'player') return;
  const requestedBet = Number(elements.bet.value);
  if (!Number.isSafeInteger(requestedBet) || requestedBet < MIN_BET
      || requestedBet % BET_STEP !== 0 || requestedBet > bankroll) {
    message = `Enter a whole-credit bet from ${MIN_BET} to ${bankroll}, in steps of ${BET_STEP}.`;
    render();
    return;
  }

  try {
    deck = shuffledDeck();
  } catch {
    rngUnavailable = true;
    phase = 'over';
    message = 'Secure card shuffling is unavailable. Try a modern browser on a secure page.';
    render();
    return;
  }

  wager = requestedBet;
  bankroll -= wager;
  playerHand = [];
  dealerHand = [];
  draw(playerHand);
  draw(dealerHand);
  draw(playerHand);
  draw(dealerHand);
  phase = 'player';
  message = 'Your move. Hit, stand, or double your bet.';

  const playerNatural = isNatural(playerHand);
  const dealerNatural = isNatural(dealerHand);
  if (playerNatural || dealerNatural) {
    if (playerNatural && dealerNatural) {
      settle('push');
    } else if (playerNatural) {
      settle('blackjack');
    } else {
      settle('loss');
    }
    return;
  }
  render();
}

function hit() {
  if (phase !== 'player') return;
  draw(playerHand);
  if (handValue(playerHand) > 21) {
    settle('bust');
  } else if (handValue(playerHand) === 21) {
    resolveDealerTurn();
  } else {
    render();
  }
}

function stand() {
  if (phase !== 'player') return;
  resolveDealerTurn();
}

function doubleDown() {
  if (phase !== 'player' || playerHand.length !== 2 || bankroll < wager) return;
  bankroll -= wager;
  wager *= 2;
  draw(playerHand);
  if (handValue(playerHand) > 21) {
    settle('bust');
  } else {
    resolveDealerTurn();
  }
}

elements.deal.addEventListener('click', dealRound);
elements.hit.addEventListener('click', hit);
elements.stand.addEventListener('click', stand);
elements.double.addEventListener('click', doubleDown);
elements.bet.addEventListener('input', () => {
  const value = Number(elements.bet.value);
  if (Number.isSafeInteger(value) && value >= MIN_BET) {
    elements.message.textContent = 'Bet updated. Deal when you are ready.';
  }
});

try {
  randomInt(2);
  render();
} catch {
  rngUnavailable = true;
  message = 'Secure card shuffling is unavailable. Try a modern browser on a secure page.';
  render();
}