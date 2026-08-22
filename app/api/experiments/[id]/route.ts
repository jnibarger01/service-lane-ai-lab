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
  try {
    requireSafeMutationRequest(request);
    const payload = (await request.json()) as {
      expectedVersion?: number;
      experiment?: unknown;
    };
    if (!Number.isInteger(payload.expectedVersion)) {
      return Response.json({ error: "expectedVersion is required" }, { status: 400 });
    }
    const context = await requireAccess("experiments:read");
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
    return Response.json({ experiments: await listExperiments(context) });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof MissingExperimentError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ConcurrencyError) {
      return Response.json(
        { error: error.message, currentVersion: error.currentVersion },
        { status: 409 },
      );
    }
    return errorResponse(error);
  }
}
