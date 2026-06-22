export const SIGNAL_TYPES = ["funding", "job_posting", "company_news", "executive_change", "technology_change"] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export const SIGNAL_BASE_SCORES: Record<SignalType, number> = {
  funding: 35,
  job_posting: 25,
  company_news: 20,
  executive_change: 30,
  technology_change: 20,
};

export function calculateSignalEventScore(signalType: SignalType, strength: number): number {
  const safeStrength = Math.max(1, Math.min(5, strength));
  const base = SIGNAL_BASE_SCORES[signalType];
  return Math.max(1, Math.round((base * safeStrength) / 5));
}

export function calculateAccountSignalScore(previousScore: number, latestSignalScore: number): number {
  const safePrevious = Math.max(0, Math.min(100, previousScore));
  const safeSignal = Math.max(0, Math.min(100, latestSignalScore));
  const blended = Math.round(safePrevious * 0.65 + safeSignal * 1.25);
  return Math.max(0, Math.min(100, blended));
}
