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
};
