import { DEFAULT_ANALYSIS_WEIGHTS } from "./config.js";
import { GAME_RULES } from "./constants.js";
import { computeFrequencyCounts } from "./frequency.js";
import { applyFrequencyWeight, pickTwoTicketsFromScores } from "./mixer.js";

/**
 * @param {"mega_millions"|"powerball"} game
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} historyRows
 * @returns {null | {
 *   setA: { whites: number[], bonus: number };
 *   setB: { whites: number[], bonus: number };
 *   caption: string;
 * }}
 */
export function suggestSets(game, historyRows) {
  const rules = GAME_RULES[game];
  if (!rules || !historyRows?.length) return null;

  const freqCfg = DEFAULT_ANALYSIS_WEIGHTS.frequency;
  if (!freqCfg.enabled || freqCfg.weight <= 0) return null;

  const counts = computeFrequencyCounts(historyRows, rules);
  const scores = applyFrequencyWeight(counts, freqCfg.weight);
  const tickets = pickTwoTicketsFromScores(scores, game);
  if (!tickets) return null;

  const w = freqCfg.weight === 1 ? "×1" : `×${freqCfg.weight}`;
  const caption = `${freqCfg.label} (${w}) — whites and bonus scored separately; Set B uses the next-best picks after Set A.`;

  return { ...tickets, caption };
}
