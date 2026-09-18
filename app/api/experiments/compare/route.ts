import { errorJson, errorResponse, requestIdFor, requireAccess } from "@/server/access";
import { getComparisonReport } from "@/server/reports";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const params = new URL(request.url).searchParams;
    const leftExperimentId = params.get("leftExperimentId");
    const rightExperimentId = params.get("rightExperimentId");
    if (!leftExperimentId || !rightExperimentId || leftExperimentId === rightExperimentId) return errorJson("Two different experiment IDs are required", 400, requestId, "invalid_comparison");
    const context = await requireAccess("experiments:read", requestId);
    const report = await getComparisonReport(context, leftExperimentId, rightExperimentId, params.get("leftRunId") ?? undefined, params.get("rightRunId") ?? undefined);
    if (!report) return errorJson("One or both experiment runs were not found", 404, requestId, "report_not_found");
    return Response.json({ report, requestId }, { headers: { "x-request-id": requestId } });
  } catch (error) { return errorResponse(error, requestId); }
}
