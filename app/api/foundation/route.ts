import { listExperiments } from "@/server/experiments";
import { ensureSampleRepairOrder } from "@/server/sample-repair-order";
import { errorResponse, requestIdFor, requireAccess } from "@/server/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const context = await requireAccess("experiments:read", requestId);
    const experiments = await listExperiments(context);
    const sampleRepairOrder =
      context.role === "viewer" ? null : await ensureSampleRepairOrder(context);

    return Response.json({
      session: {
        user: context.user,
        organization: context.organization,
        role: context.role,
        permissions: context.permissions,
      },
      experiments,
      sampleRepairOrder,
      persistence: {
        source: "D1",
        authoritative: true,
        optimisticConcurrency: true,
        softDeletion: true,
      },
      requestId,
    }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
