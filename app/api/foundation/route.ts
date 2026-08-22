import { listExperiments } from "@/server/experiments";
import { ensureSampleRepairOrder } from "@/server/sample-repair-order";
import { errorResponse, requireAccess } from "@/server/access";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await requireAccess("experiments:read");
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
    });
  } catch (error) {
    return errorResponse(error);
  }
}
