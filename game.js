// JavaScript gives the page its game behavior. 'use strict' asks the browser to catch some common coding mistakes.
'use strict';

// An array is an ordered list; an object groups named details (properties) about one thing.
// 'const' names a value this code does not reassign. The suit objects store each suit's name, symbol, and color.
const SUITS = [
  { name: 'Spades', symbol: '\u2660', red: false },
  { name: 'Hearts', symbol: '\u2665', red: true },
  { name: 'Diamonds', symbol: '\u2666', red: true },
  { name: 'Clubs', symbol: '\u2663', red: false },
];
// Each rank object stores the label shown on a card and its blackjack point value.
const RANKS = [
  { label: 'A', value: 11 }, { label: '2', value: 2 }, { label: '3', value: 3 },
  { label: '4', value: 4 }, { label: '5', value: 5 }, { label: '6', value: 6 },
  { label: '7', value: 7 }, { label: '8', value: 8 }, { label: '9', value: 9 },
  { label: '10', value: 10 }, { label: 'J', value: 10 }, { label: 'Q', value: 10 },
  { label: 'K', value: 10 },
];
// These constants (named values that are not reassigned) set the minimum bet, bet step, starting credits, and random-number range.
const MIN_BET = 10;
const BET_STEP = 10;
const INITIAL_BANKROLL = 500;
// These timings keep the opening cards spaced apart while leaving time for each card's CSS animation.
const DEAL_STAGGER_MS = 500;
const CARD_ANIMATION_DURATION_MS = 220;
const BANKROLL_STORAGE_KEY = 'twenty-one-bankroll';
const UINT32_RANGE = 0x100000000;

// The Document Object Model (DOM) is the browser's representation of the HTML elements.
// This object keeps references to the elements that the game will update or listen to.
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

// A variable is a named place to keep a value. 'let' allows these values to change as the game runs.
let bankroll = INITIAL_BANKROLL;
let deck = [];
let playerHand = [];
let dealerHand = [];
let wager = 0;
let phase = 'ready';
let message = 'Choose your bet, then deal in.';
let rngUnavailable = false;

// localStorage is browser storage that can keep small text values between visits.
// Restore the last saved whole-number credit balance when one is available.
// A function is a reusable block of instructions.
function loadBankroll() {
  try {
    const savedBankroll = window.localStorage.getItem(BANKROLL_STORAGE_KEY);
    if (savedBankroll !== null && /^\d+$/.test(savedBankroll)) {
      const parsedBankroll = Number(savedBankroll);
      if (Number.isSafeInteger(parsedBankroll)) {
        bankroll = parsedBankroll;
      }
    }
  } catch {
    message = 'Saved credits could not be loaded. This browser may block local storage.';
  }
}

// Save the settled balance so it is still there after the player reloads the page.
function saveBankroll() {
  try {
    window.localStorage.setItem(BANKROLL_STORAGE_KEY, String(bankroll));
  } catch {
    message = `${message} Your credits could not be saved in this browser.`;
  }
}

// Return a random whole number from 0 up to (but not including) the requested bound.
// Secure randomness is used so the card shuffle is not predictable.
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

// Build one standard deck, then shuffle it using the Fisher-Yates method.
// The method swaps each card with a randomly chosen card that has not been shuffled yet.
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

// Add up a hand; an ace starts at 11 points and counts as 1 if that avoids going over 21.
function handValue(hand) {
  let total = hand.reduce((sum, card) => sum + card.value, 0);
  let aces = hand.filter((card) => card.label === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

// A natural blackjack is a two-card hand totaling 21.
function isNatural(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

// Take the next card from the end of the shuffled deck and add it to a hand.
function draw(hand) {
  if (deck.length === 0) {
    throw new Error('The deck is empty. Start a new round to reshuffle.');
  }
  hand.push(deck.pop());
}

// Create the HTML element for one card, including a hidden back when the dealer's card is concealed.
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

// Clear a hand's old card elements and draw its current cards into the page.
// dealOrderOffset spaces only the opening cards; null keeps later redraws together.
function renderHand(container, hand, hideHoleCard = false, dealOrderOffset = null) {
  container.replaceChildren();
  hand.forEach((card, index) => {
    const cardElement = createCard(card, hideHoleCard && index === 1);
    if (dealOrderOffset !== null) {
      cardElement.classList.add(`deal-step-${dealOrderOffset + index * 2}`);
    }
    container.append(cardElement);
  });
}

// Refresh the visible cards, totals, message, and enabled/disabled controls from the game state.
// renderCards can be false to update the controls after dealing without replaying the card animations.
function render(renderCards = true) {
  const isDealing = phase === 'dealing';
  const isDrawing = phase === 'player-dealing';
  const dealerTurn = phase === 'dealer';
  const roundInProgress = phase === 'player' || isDealing || isDrawing || dealerTurn;
  const hideHoleCard = phase === 'player' || isDealing || isDrawing;
  if (renderCards) {
    renderHand(elements.playerCards, playerHand, false, isDealing ? 1 : null);
    renderHand(elements.dealerCards, dealerHand, hideHoleCard, isDealing ? 0 : null);
  }

  elements.balance.textContent = String(bankroll);
  elements.playerTotal.textContent = isDealing ? '—' : playerHand.length ? String(handValue(playerHand)) : '—';
  elements.dealerTotal.textContent = isDealing ? '—' : hideHoleCard
    ? String(dealerHand[0] ? handValue([dealerHand[0]]) : '—')
    : dealerHand.length ? String(handValue(dealerHand)) : '—';
  elements.message.textContent = message;

  const roundActive = phase === 'player';
  elements.hit.disabled = !roundActive;
  elements.stand.disabled = !roundActive;
  elements.double.disabled = !roundActive || playerHand.length !== 2 || bankroll < wager;
  elements.deal.disabled = roundInProgress || bankroll < MIN_BET || rngUnavailable;
  elements.deal.textContent = isDealing || isDrawing
    ? 'Dealing cards...'
    : dealerTurn ? 'Dealer playing...'
      : roundActive ? 'Round in progress' : phase === 'ready' ? 'Deal cards' : 'Deal again';
  elements.bet.disabled = roundInProgress || bankroll < MIN_BET;

  const maximumBet = Math.max(MIN_BET, Math.floor(bankroll / BET_STEP) * BET_STEP);
  elements.bet.max = String(maximumBet);
  if (!roundInProgress) {
    const currentBet = Number(elements.bet.value);
    const displayBet = Number.isSafeInteger(currentBet) && currentBet >= MIN_BET
      ? Math.min(currentBet, maximumBet)
      : MIN_BET;
    elements.bet.value = String(displayBet);
  }
}

// Finish the round, award any winnings, update the message, save the balance, and refresh the page.
function settle(outcome, renderCards = true) {
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
  saveBankroll();
  render(renderCards);
}

// Compare the finished hands and settle the round without redrawing the cards already shown.
function settleDealerTurn() {
  const playerTotal = handValue(playerHand);
  const dealerTotal = handValue(dealerHand);
  if (dealerTotal > 21 || playerTotal > dealerTotal) {
    settle('win', false);
  } else if (playerTotal === dealerTotal) {
    settle('push', false);
  } else {
    settle('loss', false);
  }
}

// Draw one dealer card at a time, waiting between cards so each one can be seen.
function dealDealerCard() {
  draw(dealerHand);
  elements.dealerCards.append(createCard(dealerHand[dealerHand.length - 1]));
  render(false);

  if (handValue(dealerHand) < 17) {
    window.setTimeout(dealDealerCard, DEAL_STAGGER_MS);
  } else {
    window.setTimeout(settleDealerTurn, CARD_ANIMATION_DURATION_MS);
  }
}

// Reveal the dealer's hidden card, then continue with one visible card at a time.
function resolveDealerTurn() {
  phase = 'dealer';
  message = 'Dealer is playing...';
  const hiddenCard = elements.dealerCards.children[1];
  if (hiddenCard) {
    elements.dealerCards.replaceChild(createCard(dealerHand[1]), hiddenCard);
  }
  render(false);

  if (handValue(dealerHand) < 17) {
    window.setTimeout(dealDealerCard, DEAL_STAGGER_MS);
  } else {
    window.setTimeout(settleDealerTurn, CARD_ANIMATION_DURATION_MS);
  }
}

// Start a round after checking the bet; the player and dealer each receive two cards, shown one at a time.
function dealRound() {
  if (phase === 'player' || phase === 'dealing') return;
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
  phase = 'dealing';
  message = 'Dealing your cards...';
  render();

  window.setTimeout(() => {
    phase = 'player';
    const playerNatural = isNatural(playerHand);
    const dealerNatural = isNatural(dealerHand);
    if (playerNatural || dealerNatural) {
      if (playerNatural && dealerNatural) {
        settle('push', false);
      } else if (playerNatural) {
        settle('blackjack', false);
      } else {
        settle('loss', false);
      }
      return;
    }

    message = 'Your move. Hit, stand, or double your bet.';
    render(false);
  }, DEAL_STAGGER_MS * 3 + CARD_ANIMATION_DURATION_MS);
}

// A hit gives the player one card; going over 21 is a bust and ends the round.
function hit() {
  if (phase !== 'player') return;
  draw(playerHand);
  elements.playerCards.append(createCard(playerHand[playerHand.length - 1]));
  phase = 'player-dealing';
  message = 'Your card is being dealt...';
  render(false);
  window.setTimeout(() => {
    phase = 'player';
    if (handValue(playerHand) > 21) {
      settle('bust', false);
    } else if (handValue(playerHand) === 21) {
      resolveDealerTurn();
    } else {
      message = 'Your move. Hit, stand, or double your bet.';
      render(false);
    }
  }, CARD_ANIMATION_DURATION_MS);
}

// Standing ends the player's turn and lets the dealer play.
function stand() {
  if (phase !== 'player') return;
  resolveDealerTurn();
}

// Doubling down doubles the bet, gives the player one final card, and ends their turn.
function doubleDown() {
  if (phase !== 'player' || playerHand.length !== 2 || bankroll < wager) return;
  bankroll -= wager;
  wager *= 2;
  draw(playerHand);
  elements.playerCards.append(createCard(playerHand[playerHand.length - 1]));
  phase = 'player-dealing';
  message = 'Your card is being dealt...';
  render(false);
  window.setTimeout(() => {
    phase = 'player';
    if (handValue(playerHand) > 21) {
      settle('bust', false);
    } else {
      resolveDealerTurn();
    }
  }, CARD_ANIMATION_DURATION_MS);
}

// An event listener is a function that runs when a user action happens, such as clicking a button.
// Connect the game actions to their buttons and update the status when the bet changes.
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

// Load saved credits before the first display, then check whether secure card shuffling is available.
loadBankroll();

try {
  randomInt(2);
  render();
} catch {
  rngUnavailable = true;
  message = 'Secure card shuffling is unavailable. Try a modern browser on a secure page.';
  render();
}