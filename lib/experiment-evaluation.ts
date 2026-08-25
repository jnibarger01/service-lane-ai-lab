export const DETERMINISTIC_SIMULATOR_REFERENCE = "deterministic-simulator-v1";

export type EvaluationFixture = {
  mpi: string;
  declinedServices: string;
  mileage: number;
};

export type SimulatedEvaluation = {
  mode: "simulated";
  actionBoundary: "draft_only";
  recommendations: Array<{
    claim: string;
    source: string;
    informationNeeded: string;
  }>;
};

/** Keep evaluation content pure; run IDs and timestamps belong to workflow metadata. */
export function buildDeterministicEvaluation(
  fixture: EvaluationFixture,
): SimulatedEvaluation {
  return {
    mode: "simulated",
    actionBoundary: "draft_only",
    recommendations: [
      {
        claim: "Inspect the front brake condition before making a repair recommendation.",
        source: `Current MPI: ${fixture.mpi}`,
        informationNeeded: "Rotor thickness and runout measurements",
      },
      {
        claim: "The previously declined coolant service may still be relevant.",
        source: `Declined services: ${fixture.declinedServices}`,
        informationNeeded: `Confirm current condition at ${fixture.mileage.toLocaleString("en-US")} miles and applicable OEM interval`,
      },
    ],
  };
}
