import { DEFAULT_ANALYSIS_WEIGHTS } from "./config.js";
import { GAME_RULES } from "./constants.js";
import { computeCompressibilityScores } from "./compressibility.js";
import {
  buildCooccurrenceMatrices,
  cooccurrenceScoresForContext,
} from "./cooccurrence.js";
import { computeFrequencyCounts } from "./frequency.js";
import { mergeScores, scaleScores } from "./mixer.js";
import {
  computeMoonPhaseScores,
  MOON_PHASE_LABELS,
  nextScheduledDrawMoonPhaseBucket,
} from "./moon.js";
import { computeSpectralScores } from "./spectral.js";
import { computeSumSpreadScores } from "./sumSpread.js";
import {
  computeWeekdayScores,
  DOW_SHORT,
  nextScheduledDrawDayOfWeek,
} from "./weekday.js";
import {
  buildTransitionMatrices,
  transitionScoresForNextDraw,
  zeroScoreMaps,
} from "./transitions.js";

/**
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} rows
 */
export function sortChronological(rows) {
  return [...rows].sort((a, b) => a.draw_date.localeCompare(b.draw_date));
}

/**
 * Full weighted merge used for Set A (and for permutation draws under date shuffle).
 *
 * @param {"mega_millions"|"powerball"} game
 * @param {{ draw_date: string, whites: number[], bonus: number, multiplier?: string, source?: string }[]} historyRows
 * @param {typeof DEFAULT_ANALYSIS_WEIGHTS} weights
 * @returns {{ combined: { white: Record<number, number>, bonus: Record<number, number> }, captionParts: string[] }}
 */
export function computeCombinedScores(game, historyRows, weights = DEFAULT_ANALYSIS_WEIGHTS) {
  const rules = GAME_RULES[game];
  const captionParts = [];

  const freqCfg = weights.frequency;
  const transCfg = weights.transition;
  const coCfg = weights.cooccurrence;
  const specCfg = weights.spectral;
  const compCfg = weights.compressibility;
  const wdCfg = weights.weekday;
  const moonCfg = weights.moon;
  const ssCfg = weights.sumSpread;

  const freqOn = freqCfg.enabled && freqCfg.weight > 0;
  const transOn = transCfg.enabled && transCfg.weight > 0;
  const coOn = coCfg.enabled && coCfg.weight > 0;
  const specOn = specCfg.enabled && specCfg.weight > 0;
  const compOn = compCfg.enabled && compCfg.weight > 0;
  const wdOn = wdCfg.enabled && wdCfg.weight > 0;
  const moonOn = moonCfg.enabled && moonCfg.weight > 0;
  const ssOn = ssCfg.enabled && ssCfg.weight > 0;

  let combined = zeroScoreMaps(game);

  const ordered =
    transOn || coOn || compOn ? sortChronological(historyRows) : null;
  const last = ordered?.length ? ordered[ordered.length - 1] : null;

  if (freqOn) {
    const counts = computeFrequencyCounts(historyRows, rules);
    combined = mergeScores(combined, scaleScores(counts, freqCfg.weight), game);
    const fw = freqCfg.weight === 1 ? "×1" : `×${freqCfg.weight}`;
    captionParts.push(`${freqCfg.label} (${fw})`);
  }

  if (transOn && ordered && last) {
    if (ordered.length >= 2) {
      const matrices = buildTransitionMatrices(ordered, rules);
      const rawTrans = transitionScoresForNextDraw(matrices, last, rules);
      combined = mergeScores(combined, scaleScores(rawTrans, transCfg.weight), game);
      const tw = transCfg.weight === 1 ? "×1" : `×${transCfg.weight}`;
      captionParts.push(
        `${transCfg.label} (${tw}; context = latest draw ${last.draw_date})`,
      );
    } else {
      captionParts.push(`${transCfg.label} (skipped — need 2+ draws for pairs)`);
    }
  }

  if (coOn && ordered && last) {
    const coMats = buildCooccurrenceMatrices(historyRows, rules);
    const rawCo = cooccurrenceScoresForContext(coMats, last, rules);
    combined = mergeScores(combined, scaleScores(rawCo, coCfg.weight), game);
    const cw = coCfg.weight === 1 ? "×1" : `×${coCfg.weight}`;
    captionParts.push(
      `${coCfg.label} (${cw}; white–white pairs + white–bonus with latest draw ${last.draw_date})`,
    );
  }

  if (specOn) {
    const rawSpec = computeSpectralScores(game, historyRows);
    combined = mergeScores(combined, scaleScores(rawSpec, specCfg.weight), game);
    const sw = specCfg.weight === 1 ? "×1" : `×${specCfg.weight}`;
    captionParts.push(
      `${specCfg.label} (${sw}; 2nd mode on white graph, Perron on bonus coupling)`,
    );
  }

  if (compOn && ordered?.length) {
    const rawComp = computeCompressibilityScores(ordered, rules);
    combined = mergeScores(combined, scaleScores(rawComp, compCfg.weight), game);
    const kw = compCfg.weight === 1 ? "×1" : `×${compCfg.weight}`;
    captionParts.push(
      `${compCfg.label} (${kw}; last-256-draw entropy + Markov-1 on hit indicators)`,
    );
  }

  if (wdOn) {
    const targetDow = nextScheduledDrawDayOfWeek(game);
    const rawWd = computeWeekdayScores(game, historyRows, targetDow);
    combined = mergeScores(combined, scaleScores(rawWd, wdCfg.weight), game);
    const ww = wdCfg.weight === 1 ? "×1" : `×${wdCfg.weight}`;
    captionParts.push(
      `${wdCfg.label} (${ww}; rates on ${DOW_SHORT[targetDow]} draws only — next scheduled draw weekday, local calendar; not causal)`,
    );
  }

  if (moonOn) {
    const targetBucket = nextScheduledDrawMoonPhaseBucket(game);
    const rawMoon = computeMoonPhaseScores(game, historyRows, targetBucket);
    combined = mergeScores(combined, scaleScores(rawMoon, moonCfg.weight), game);
    const mw = moonCfg.weight === 1 ? "×1" : `×${moonCfg.weight}`;
    const phaseName = MOON_PHASE_LABELS[targetBucket] ?? "?";
    captionParts.push(
      `${moonCfg.label} (${mw}; 8 synodic slices; context = ${phaseName} on next scheduled draw — local noon; not causal)`,
    );
  }

  if (ssOn) {
    const rawSs = computeSumSpreadScores(game, historyRows);
    combined = mergeScores(combined, scaleScores(rawSs, ssCfg.weight), game);
    const ssw = ssCfg.weight === 1 ? "×1" : `×${ssCfg.weight}`;
    captionParts.push(
      `${ssCfg.label} (${ssw}; log P(sum, spread) bucket per draw; whites vs bonus tallied separately)`,
    );
  }

  return { combined, captionParts };
}
