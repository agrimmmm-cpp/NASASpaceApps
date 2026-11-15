// I-05: the ONLY place extinction probability is turned into survival.
export const survivalProbability = (extinctionProbability: number): number => 1 - extinctionProbability;
