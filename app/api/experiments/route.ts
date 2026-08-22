import { ValidationError } from "@/lib/foundation";
import {
  errorResponse,
  requireAccess,
  requireSafeMutationRequest,
} from "@/server/access";
import {
  createExperimentRecord,
  DuplicateExperimentError,
} from "@/server/write-experiment";
import { listExperiments } from "@/server/experiments";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await requireAccess("experiments:read");
    return Response.json({ experiments: await listExperiments(context) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSafeMutationRequest(request);
    const context = await requireAccess("experiments:create");
    const payload = await request.json();
    await createExperimentRecord(context, payload);
    const experiments = await listExperiments(context);
    return Response.json({ experiments }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof DuplicateExperimentError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return errorResponse(error);
  }
}
