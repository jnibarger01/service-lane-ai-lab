import { ValidationError } from "@/lib/foundation";
import {
  errorResponse,
  errorJson,
  requestIdFor,
  requireAccess,
  requireSafeMutationRequest,
} from "@/server/access";
import { createExperimentRecord } from "@/server/write-experiment";
import { listExperiments } from "@/server/experiments";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    requireSafeMutationRequest(request);
    const context = await requireAccess("experiments:create", requestId);
    const payload = (await request.json()) as { experiments?: unknown[] };
    if (!Array.isArray(payload.experiments) || payload.experiments.length > 100) {
      return errorJson("experiments must be an array of at most 100 records", 400, requestId);
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
      requestId,
    }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorJson(error.message, 400, requestId);
    }
    return errorResponse(error, requestId);
  }
}
