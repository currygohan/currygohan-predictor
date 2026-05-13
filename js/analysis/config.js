/**
 * Per-analyzer weights (0 = disabled). Scores are combined additively per ball
 * before the mixer picks tickets.
 *
 * @type {{
 *   frequency: { enabled: boolean; weight: number; label: string };
 *   transition: { enabled: boolean; weight: number; label: string };
 *   cooccurrence: { enabled: boolean; weight: number; label: string };
 *   spectral: { enabled: boolean; weight: number; label: string };
 *   compressibility: { enabled: boolean; weight: number; label: string };
 *   weekday: { enabled: boolean; weight: number; label: string };
 *   moon: { enabled: boolean; weight: number; label: string };
 *   sumSpread: { enabled: boolean; weight: number; label: string };
 *   permutationNull: { enabled: boolean; replicates: number; label: string };
 * }}
 */
export const DEFAULT_ANALYSIS_WEIGHTS = {
  frequency: {
    enabled: true,
    weight: 1,
    label: "Historical frequency",
  },
  transition: {
    enabled: true,
    weight: 0.55,
    label: "After previous draw (pairs)",
  },
  cooccurrence: {
    enabled: true,
    weight: 0.45,
    label: "Same-draw co-occurrence",
  },
  spectral: {
    enabled: true,
    weight: 0.35,
    label: "Spectral (graph modes)",
  },
  compressibility: {
    enabled: true,
    weight: 0.3,
    label: "Entropy-rate proxy",
  },
  weekday: {
    enabled: true,
    weight: 0.22,
    label: "Weekday of draw (spurious)",
  },
  moon: {
    enabled: true,
    weight: 0.2,
    label: "Moon phase at draw (spurious)",
  },
  sumSpread: {
    enabled: true,
    weight: 0.28,
    label: "Sum & spread of whites",
  },
  permutationNull: {
    enabled: true,
    replicates: 72,
    label: "Date-shuffle MC null (Set B only)",
  },
};

const SCORE_ANALYZER_KEYS = [
  "frequency",
  "transition",
  "cooccurrence",
  "spectral",
  "compressibility",
  "weekday",
  "moon",
  "sumSpread",
];

/**
 * Single-line summary of which weighted signals feed the combined score,
 * plus whether Set B uses the permutation null (shown on the page).
 */
export function summarizeActiveAnalyzersForUi() {
  const parts = [];
  for (const key of SCORE_ANALYZER_KEYS) {
    const c = DEFAULT_ANALYSIS_WEIGHTS[key];
    if (!c?.enabled || !(c.weight > 0)) continue;
    const w = c.weight === 1 ? "×1" : `×${c.weight}`;
    parts.push(`${c.label} ${w}`);
  }
  const p = DEFAULT_ANALYSIS_WEIGHTS.permutationNull;
  if (p?.enabled && (p.replicates ?? 0) >= 8) {
    parts.push(`${p.label} (${p.replicates} reps)`);
  }
  return parts.length ? parts.join(" · ") : "(no score analyzers enabled)";
}
