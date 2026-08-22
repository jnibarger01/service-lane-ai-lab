import type { AccessContext } from "@/server/access";

const samplePayload = {
  sourceReference: "SL-20481",
  customerConcern: "Vibration in steering wheel when braking from highway speed.",
  vinMasked: "JTMB1RFV5MD••4721",
  vehicleYear: 2021,
  vehicleModel: "RAV4 XLE",
  mileage: 62447,
  appointmentNote: "Customer waiting; needs vehicle by 2:00 PM if possible.",
  technicianFindings: "Front pads measured 3 mm. Road test duplicated concern.",
  mpi: "Front brakes yellow; rear brakes green. No rotor measurement entered.",
  priorHistory: "Front brake inspection at 51,202 miles; no repair performed.",
  declinedServices: "Coolant service declined at 58,110 miles.",
  warrantyStatus: "Basic warranty expired; coverage not evaluated for this concern.",
  transportation: "Customer waiting on site.",
  communicationPreference: "Text preferred; phone for authorization.",
};

export async function ensureSampleRepairOrder(context: AccessContext) {
  const source = JSON.stringify(samplePayload);
  const sourceHash = await sha256(source);
  const sampleRepairOrderId = crypto.randomUUID();
  await context.db
    .prepare(
      `INSERT INTO repair_orders
        (id, organization_id, source_reference, source_hash, lineage_json,
         vin_masked, customer_reference_masked, vehicle_year, vehicle_model,
         mileage, normalized_payload_json, status, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, 'sample-customer', ?, ?, ?, ?, 'validated', ?)
       ON CONFLICT(organization_id, source_hash) DO UPDATE SET
         status = 'validated',
         normalized_payload_json = excluded.normalized_payload_json,
         archived_at = NULL,
         deleted_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      sampleRepairOrderId,
      context.organization.id,
      samplePayload.sourceReference,
      sourceHash,
      JSON.stringify({ source: "built-in-anonymized-fixture", transformationVersion: "1.0" }),
      samplePayload.vinMasked,
      samplePayload.vehicleYear,
      samplePayload.vehicleModel,
      samplePayload.mileage,
      source,
      context.user.id,
    )
    .run();
  const row = await context.db
    .prepare(
      `SELECT id
       FROM repair_orders
       WHERE organization_id = ? AND source_hash = ? AND deleted_at IS NULL`,
    )
    .bind(context.organization.id, sourceHash)
    .first<{ id: string }>();
  if (!row) throw new Error("Unable to provision the anonymized sample repair order");
  return { ...samplePayload, id: row.id, sourceHash };
}

export async function getSampleRepairOrder(context: AccessContext) {
  const sourceHash = await sha256(JSON.stringify(samplePayload));
  const row = await context.db
    .prepare(
      `SELECT id, source_hash, normalized_payload_json
       FROM repair_orders
       WHERE organization_id = ? AND source_hash = ? AND deleted_at IS NULL`,
    )
    .bind(context.organization.id, sourceHash)
    .first<{
      id: string;
      source_hash: string;
      normalized_payload_json: string;
    }>();
  if (!row) return null;
  return {
    ...(JSON.parse(row.normalized_payload_json) as typeof samplePayload),
    id: row.id,
    sourceHash: row.source_hash,
  };
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
