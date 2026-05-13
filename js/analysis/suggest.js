import { DEFAULT_ANALYSIS_WEIGHTS } from "./config.js";
import { GAME_RULES } from "./constants.js";
import { computeCombinedScores } from "./combineScores.js";
import { pickSetA, pickSetB } from "./mixer.js";
import { computeDatePermutationZScores } from "./permutation.js";

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

  const w = DEFAULT_ANALYSIS_WEIGHTS;
  const freqOn = w.frequency.enabled && w.frequency.weight > 0;
  const transOn = w.transition.enabled && w.transition.weight > 0;
  const coOn = w.cooccurrence.enabled && w.cooccurrence.weight > 0;
  const specOn = w.spectral.enabled && w.spectral.weight > 0;
  const compOn = w.compressibility.enabled && w.compressibility.weight > 0;
  const wdOn = w.weekday.enabled && w.weekday.weight > 0;
  const moonOn = w.moon.enabled && w.moon.weight > 0;
  const ssOn = w.sumSpread.enabled && w.sumSpread.weight > 0;

  if (!freqOn && !transOn && !coOn && !specOn && !compOn && !wdOn && !moonOn && !ssOn) {
    return null;
  }

  const { combined, captionParts } = computeCombinedScores(game, historyRows, w);

  const setA = pickSetA(combined, game);
  if (!setA) return null;

  const permCfg = w.permutationNull;
  const permOn = permCfg?.enabled && (permCfg.replicates ?? 0) >= 8;

  let setB;
  if (permOn) {
    const z = computeDatePermutationZScores(game, historyRows, combined, {
      replicates: permCfg.replicates,
      weights: w,
    });
    setB = pickSetB(z, game, setA);
    captionParts.push(
      `${permCfg.label} (Set B ranked on z vs ${permCfg.replicates} date-shuffled replicas)`,
    );
  } else {
    setB = pickSetB(combined, game, setA);
  }

  if (!setB) return null;

  const caption =
    `${captionParts.join(" · ")}. ` +
    "Set A uses the combined per-ball scores as-is. " +
    (permOn
      ? "Set B ranks the same way but on z-scores from shuffled draw dates (Monte Carlo null)."
      : "Set B takes the next-best whites after excluding Set A, and a different bonus when possible.");

  return { setA, setB, caption };
}
