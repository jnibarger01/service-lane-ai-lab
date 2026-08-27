import { errorJson, errorResponse, requestIdFor, requireAccess } from "@/server/access";
import { getEvidenceTimeline } from "@/server/reports";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const requestId = requestIdFor(request);
  try {
    const context = await requireAccess("experiments:read", requestId);
    const { id, runId } = await params;
    const replay = await getEvidenceTimeline(context, id, runId);
    if (!replay) return errorJson("Experiment run not found", 404, requestId, "run_not_found");
    return Response.json({ replay, requestId }, { headers: { "x-request-id": requestId } });
  } catch (error) { return errorResponse(error, requestId); }
}
