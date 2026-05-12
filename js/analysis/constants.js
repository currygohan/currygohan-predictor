/** @typedef {{ whiteMin: number, whiteMax: number, whitePick: number, bonusMin: number, bonusMax: number }} GameRules */

/** @type {Record<"mega_millions"|"powerball", GameRules>} */
export const GAME_RULES = {
  mega_millions: {
    whiteMin: 1,
    whiteMax: 70,
    whitePick: 5,
    bonusMin: 1,
    bonusMax: 24,
  },
  powerball: {
    whiteMin: 1,
    whiteMax: 69,
    whitePick: 5,
    bonusMin: 1,
    bonusMax: 26,
  },
};
