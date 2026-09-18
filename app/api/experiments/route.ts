import { ValidationError } from "@/lib/foundation";
import {
  errorResponse,
  requireAccess,
  requireSafeMutationRequest,
  requestIdFor,
  errorJson,
} from "@/server/access";
import {
  createExperimentRecord,
  DuplicateExperimentError,
} from "@/server/write-experiment";
import { listExperiments } from "@/server/experiments";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const context = await requireAccess("experiments:read", requestId);
    return Response.json({ experiments: await listExperiments(context), requestId }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    requireSafeMutationRequest(request);
    const context = await requireAccess("experiments:create", requestId);
    const payload = await request.json();
    await createExperimentRecord(context, payload);
    const experiments = await listExperiments(context);
    return Response.json({ experiments }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorJson(error.message, 400, requestId);
    }
    if (error instanceof DuplicateExperimentError) {
      return errorJson(error.message, 409, requestId, "duplicate_experiment");
    }
    return errorResponse(error, requestId);
  }
}
