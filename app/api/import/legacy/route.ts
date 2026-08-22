import { ValidationError } from "@/lib/foundation";
import {
  errorResponse,
  requireAccess,
  requireSafeMutationRequest,
} from "@/server/access";
import { createExperimentRecord } from "@/server/write-experiment";
import { listExperiments } from "@/server/experiments";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireSafeMutationRequest(request);
    const context = await requireAccess("experiments:create");
    const payload = (await request.json()) as { experiments?: unknown[] };
    if (!Array.isArray(payload.experiments) || payload.experiments.length > 100) {
      return Response.json(
        { error: "experiments must be an array of at most 100 records" },
        { status: 400 },
      );
    }
    let imported = 0;
    for (const experiment of payload.experiments) {
      const result = await createExperimentRecord(context, experiment, {
        importMode: true,
      });
      if (result.imported) imported += 1;
    }
    return Response.json({
      imported,
      experiments: await listExperiments(context),
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return errorResponse(error);
  }
}
