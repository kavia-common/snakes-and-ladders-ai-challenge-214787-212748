//
// PUBLIC_INTERFACE
// simpleAI.js - lightweight rule-based AI opponent and taunt generator (no external services)

/**
 * PUBLIC_INTERFACE
 * rollDice
 * Returns a pseudo-random integer in [1..6]
 */
export function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * PUBLIC_INTERFACE
 * chooseTaunt
 * Returns a taunt based on simple game context.
 * @param {Object} ctx - { aiCell, humanCell, lastRoll, movedTo, eventType }
 */
export function chooseTaunt(ctx) {
  const { aiCell = 1, humanCell = 1, lastRoll = 1, movedTo = 1, eventType = "neutral" } = ctx;

  const distance = movedTo - aiCell;
  const lead = aiCell - humanCell;

  if (eventType === "ladder") {
    return "Up I go! That view from the top is nice, isn’t it?";
  }
  if (eventType === "snake") {
    return "Ouch! That snake had attitude. I’ll be back though.";
  }
  if (eventType === "win") {
    return "Victory! Better luck next time, human.";
  }
  if (eventType === "human_snake") {
    return "Snakes like you today! Rough slide.";
  }
  if (eventType === "human_ladder") {
    return "You got lucky with that ladder. Don’t get used to it.";
  }

  if (lead > 15) return "I’m miles ahead. Are you even trying?";
  if (lead > 5) return "Keeping a comfy lead!";
  if (lead < -10) return "Alright, alright, you’re ahead for now...";
  if (distance >= 6) return `A roll of ${lastRoll}? Nice boost!`;
  if (lastRoll === 6) return "Another 6? The dice like me today.";

  const generics = [
    "Your move, challenger.",
    "Let’s keep this rolling.",
    "I sense a ladder... or maybe not.",
    "Slow and steady wins my race.",
  ];
  return generics[Math.floor(Math.random() * generics.length)];
}

/**
 * PUBLIC_INTERFACE
 * aiTakeTurn
 * Computes AI dice roll and new position.
 * @param {number} aiCell - current AI cell (1..100)
 * @param {(roll:number)=>number} applyMove - function that takes roll and returns final cell after S/L
 * @returns {Object} { roll, finalCell, intermediateCell, eventType }
 */
export function aiTakeTurn(aiCell, applyMove) {
  const roll = rollDice();
  const { finalCell, intermediateCell, eventType } = applyMove(roll);
  return { roll, finalCell, intermediateCell, eventType };
}
