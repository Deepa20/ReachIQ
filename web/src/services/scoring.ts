export type LeadClassification = "HOT" | "WARM" | "COLD";

export type ReachIqScoringSignals = {
  jobChange: boolean;
  fundingEvent: boolean;
  jobPosting: boolean;
  companyNews: boolean;
  techStackMatch: boolean;
  companySizeMatch: boolean;
  validatedEmail: boolean;
  decisionMaker: boolean;
};

export const REACHIQ_SCORING_WEIGHTS = {
  jobChange: 25,
  fundingEvent: 20,
  jobPosting: 20,
  companyNews: 15,
  techStackMatch: 15,
  companySizeMatch: 10,
  validatedEmail: 5,
  decisionMaker: 10,
} as const;

export type ReachIqScoreBreakdown = {
  [K in keyof ReachIqScoringSignals]: number;
};

export type ReachIqScoreResult = {
  score: number;
  classification: LeadClassification;
  breakdown: ReachIqScoreBreakdown;
};

export function classifyReachIqScore(score: number): LeadClassification {
  if (score >= 70) return "HOT";
  if (score >= 40) return "WARM";
  return "COLD";
}

export function scoreReachIqSignals(signals: ReachIqScoringSignals): ReachIqScoreResult {
  const breakdown: ReachIqScoreBreakdown = {
    jobChange: signals.jobChange ? REACHIQ_SCORING_WEIGHTS.jobChange : 0,
    fundingEvent: signals.fundingEvent ? REACHIQ_SCORING_WEIGHTS.fundingEvent : 0,
    jobPosting: signals.jobPosting ? REACHIQ_SCORING_WEIGHTS.jobPosting : 0,
    companyNews: signals.companyNews ? REACHIQ_SCORING_WEIGHTS.companyNews : 0,
    techStackMatch: signals.techStackMatch ? REACHIQ_SCORING_WEIGHTS.techStackMatch : 0,
    companySizeMatch: signals.companySizeMatch ? REACHIQ_SCORING_WEIGHTS.companySizeMatch : 0,
    validatedEmail: signals.validatedEmail ? REACHIQ_SCORING_WEIGHTS.validatedEmail : 0,
    decisionMaker: signals.decisionMaker ? REACHIQ_SCORING_WEIGHTS.decisionMaker : 0,
  };

  const rawScore = Object.values(breakdown).reduce((total, value) => total + value, 0);
  const score = Math.min(100, rawScore);

  return {
    score,
    classification: classifyReachIqScore(score),
    breakdown,
  };
}
