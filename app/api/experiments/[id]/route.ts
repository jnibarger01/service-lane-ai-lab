import {
  requiredPermissionForExperimentTransition,
  roleCan,
  ValidationError,
} from "@/lib/foundation";
import {
  errorResponse,
  HttpError,
  requireAccess,
  requireSafeMutationRequest,
  requestIdFor,
  errorJson,
} from "@/server/access";
import {
  ConcurrencyError,
  MissingExperimentError,
  updateExperimentRecord,
} from "@/server/write-experiment";
import { listExperiments } from "@/server/experiments";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = requestIdFor(request);
  try {
    requireSafeMutationRequest(request);
    const payload = (await request.json()) as {
      expectedVersion?: number;
      experiment?: unknown;
    };
    if (!Number.isInteger(payload.expectedVersion)) {
      return errorJson("expectedVersion is required", 400, requestId);
    }
    const context = await requireAccess("experiments:read", requestId);
    const { id } = await params;
    const candidate = payload.experiment as { status?: string } | undefined;
    const current = await context.db
      .prepare(
        `SELECT status
         FROM experiments
         WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
      )
      .bind(id, context.organization.id)
      .first<{ status: string }>();
    if (!current) throw new MissingExperimentError();
    const requestedPermission = requiredPermissionForExperimentTransition(
      current.status,
      candidate?.status ?? "",
    );
    if (!roleCan(context.role, requestedPermission)) {
      throw new HttpError(403, "Role is not authorized for this transition");
    }
    await updateExperimentRecord(
      context,
      id,
      payload.experiment,
      payload.expectedVersion as number,
    );
    return Response.json({ experiments: await listExperiments(context), requestId }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorJson(error.message, 400, requestId);
    }
    if (error instanceof MissingExperimentError) {
      return errorJson(error.message, 404, requestId, "experiment_not_found");
    }
    if (error instanceof ConcurrencyError) {
      return errorJson(error.message, 409, requestId, "concurrency_conflict", { currentVersion: error.currentVersion });
    }
    return errorResponse(error, requestId);
  }
}
