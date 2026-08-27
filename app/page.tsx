"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type View =
  | "experiments"
  | "sandbox"
  | "approvals"
  | "library"
  | "roi"
  | "scenarios";

type Status = "Draft" | "Testing" | "Validated" | "Rejected" | "Published" | "Archived";

type Experiment = {
  id: string;
  organizationId?: string;
  code: string;
  title: string;
  problem: string;
  user: string;
  input: string;
  task: string;
  action: string;
  approval: string;
  metric: string;
  risk: string;
  verification: string;
  status: Status;
  sampleSize: number;
  confidence: "Low" | "Moderate" | "High";
  updated: string;
  recordVersion?: number;
  currentVersionId?: string;
  archivedAt?: string | null;
  versions: { version: number; note: string; date: string }[];
};

type Session = {
  user: { id: string; email: string; displayName: string };
  organization: { id: string; name: string; slug: string };
  role: "viewer" | "advisor" | "reviewer" | "manager" | "administrator";
  permissions: string[];
};

type FoundationResponse = {
  session: Session;
  experiments: Experiment[];
  sampleRepairOrder: { id: string; sourceHash: string } | null;
  persistence: {
    source: "D1";
    authoritative: boolean;
    optimisticConcurrency: boolean;
    softDeletion: boolean;
  };
};

type EvidenceItem = {
  claim: string;
  evidence: string;
  source: string;
  confidence: string;
  assumptions: string;
  missing: string;
  gate: string;
  reviewer: string;
  verification: string;
};

type ComparisonReport = {
  left: { code: string; title: string; metrics: Record<string, number>; evidence: { total: number; verified: number; pending: number } };
  right: { code: string; title: string; metrics: Record<string, number>; evidence: { total: number; verified: number; pending: number } };
  metricDeltas: { metric: string; left: number; right: number; delta: number; direction: string }[];
  evidenceSummary: { left: { total: number; verified: number; pending: number }; right: { total: number; verified: number; pending: number } };
};

type Replay = { run: { id: string; status: string; correlationId: string; modelName: string | null }; events: { type: string; at: string; claim?: string; source?: string; verificationStatus?: string }[]; result: { resultHash: string; workerReference: string; payload: unknown } | null };

const seedExperiments: Experiment[] = [
  {
    id: "deferred-maintenance",
    code: "EXP-024",
    title: "Deferred maintenance opportunity review",
    problem: "Advisors miss relevant deferred maintenance opportunities when prior history is fragmented.",
    user: "Service advisor",
    input: "RO history, mileage, declined services, current MPI",
    task: "Identify likely maintenance opportunities and cite the exact record behind each suggestion.",
    action: "Draft a customer recommendation for advisor review",
    approval: "Advisor approval before customer communication",
    metric: "Additional approved labor hours",
    risk: "Incorrect, duplicated, or schedule-inappropriate recommendation",
    verification: "Match against OEM maintenance schedule and current inspection evidence",
    status: "Testing",
    sampleSize: 18,
    confidence: "Moderate",
    updated: "Today, 9:42 AM",
    versions: [
      { version: 4, note: "Added source-line citations and missing-information gate", date: "Jul 29" },
      { version: 3, note: "Raised confidence threshold for safety-related items", date: "Jul 28" },
      { version: 2, note: "Added declined-service history", date: "Jul 26" },
      { version: 1, note: "Initial experiment definition", date: "Jul 24" },
    ],
  },
  {
    id: "story-rewrite",
    code: "EXP-019",
    title: "Technician story → customer explanation",
    problem: "Accurate technician findings can be hard for customers to understand.",
    user: "Service advisor",
    input: "Technician story, measurements, DTCs, estimate lines",
    task: "Rewrite technical findings in plain language without changing the facts.",
    action: "Create an editable explanation draft",
    approval: "Advisor approval before use",
    metric: "Time from diagnosis to customer contact",
    risk: "Overstating certainty or omitting a material condition",
    verification: "Every sentence must map to a technician finding or measurement",
    status: "Validated",
    sampleSize: 42,
    confidence: "High",
    updated: "Yesterday, 4:18 PM",
    versions: [
      { version: 3, note: "Validated after 42 reviewed repair orders", date: "Jul 28" },
      { version: 2, note: "Added assumption detection", date: "Jul 25" },
      { version: 1, note: "Initial experiment definition", date: "Jul 22" },
    ],
  },
  {
    id: "warranty-check",
    code: "EXP-011",
    title: "Warranty documentation completeness",
    problem: "Missing evidence creates avoidable warranty delays and rework.",
    user: "Warranty administrator",
    input: "RO, op codes, technician story, photos, measurements",
    task: "Flag missing documentation without making a coverage decision.",
    action: "Produce a read-only evidence checklist",
    approval: "Warranty administrator review",
    metric: "Documentation completeness",
    risk: "Incorrect policy interpretation",
    verification: "Reviewer confirms against current policy source",
    status: "Draft",
    sampleSize: 5,
    confidence: "Low",
    updated: "Jul 28, 11:06 AM",
    versions: [{ version: 1, note: "Initial experiment definition", date: "Jul 28" }],
  },
];

const workflowCatalog = [
  { category: "Advisor", name: "Customer concern clarification", value: "Cleaner write-ups and fewer technician callbacks", inputs: "Concern, appointment notes", output: "Clarifying questions", risk: "Low", integration: "DMS / scheduler", approval: "Advisor", maturity: "Validated", evidence: "42 reviewed ROs" },
  { category: "Advisor", name: "Deferred-service follow-up", value: "Relevant follow-up without duplicate outreach", inputs: "Declines, mileage, history", output: "Evidence-backed draft", risk: "Medium", integration: "DMS / CRM", approval: "Advisor", maturity: "Testing", evidence: "18 reviewed ROs" },
  { category: "Advisor", name: "Estimate explanation", value: "Faster, clearer customer communication", inputs: "Estimate, findings", output: "Plain-language explanation", risk: "Medium", integration: "DMS", approval: "Advisor", maturity: "Validated", evidence: "42 reviewed ROs" },
  { category: "Technician", name: "Diagnostic evidence checklist", value: "Fewer incomplete diagnostic handoffs", inputs: "Concern, DTCs, findings", output: "Missing-evidence list", risk: "Low", integration: "DMS / scan tool", approval: "Technician", maturity: "Testing", evidence: "24 reviewed cases" },
  { category: "Technician", name: "TSB research package", value: "Less time reconstructing search context", inputs: "VIN, symptoms, DTCs", output: "Cited research packet", risk: "High", integration: "OEM information", approval: "Technician", maturity: "Draft", evidence: "No completed test" },
  { category: "Technician", name: "Repair-story completeness", value: "Stronger documentation before closeout", inputs: "Story, parts, labor", output: "Completeness review", risk: "Medium", integration: "DMS", approval: "Technician", maturity: "Testing", evidence: "31 reviewed ROs" },
  { category: "Management", name: "Aging RO detection", value: "Earlier intervention on stalled work", inputs: "RO status, timestamps", output: "Prioritized exception list", risk: "Low", integration: "DMS", approval: "Manager", maturity: "Validated", evidence: "6-week pilot" },
  { category: "Management", name: "Advisor workload balancing", value: "Fairer distribution and faster response", inputs: "Open ROs, status, advisor", output: "Read-only workload view", risk: "Medium", integration: "DMS", approval: "Manager", maturity: "Draft", evidence: "Simulation only" },
  { category: "Management", name: "Comeback trend analysis", value: "Earlier quality-pattern detection", inputs: "RO history, concern, repair", output: "Review candidates", risk: "Medium", integration: "DMS / BI", approval: "Manager", maturity: "Testing", evidence: "90-day sample" },
  { category: "Warranty", name: "Missing documentation detection", value: "Fewer preventable claim delays", inputs: "RO, op codes, attachments", output: "Evidence checklist", risk: "High", integration: "DMS / OEM portal", approval: "Warranty admin", maturity: "Draft", evidence: "5 reviewed claims" },
  { category: "Warranty", name: "Policy exception escalation", value: "Consistent review of unusual cases", inputs: "Claim, policy source", output: "Escalation packet", risk: "High", integration: "OEM policy", approval: "Manager", maturity: "Draft", evidence: "No completed test" },
  { category: "Warranty", name: "Audit-ready evidence package", value: "Faster, traceable claim review", inputs: "RO, photos, findings", output: "Source-linked package", risk: "High", integration: "DMS / document store", approval: "Warranty admin", maturity: "Testing", evidence: "12 reviewed claims" },
];

const scenarios = [
  {
    title: "MPI recommendation lacks measurements",
    tag: "Evidence gap",
    severity: "High",
    context: "The MPI recommends front brakes. The technician marked the pads yellow but entered no measurements or rotor condition.",
    next: "Request the missing pad and rotor measurements before drafting a repair recommendation.",
    stop: "Do not present price, urgency, or a safety claim to the customer.",
  },
  {
    title: "Repeat repair, same customer concern",
    tag: "Comeback",
    severity: "High",
    context: "The vehicle returned four days after a steering vibration repair with the same concern at highway speed.",
    next: "Build an escalation packet with the prior story, performed repair, measurements, and current symptom.",
    stop: "Do not suggest another repair until the concern is verified and the prior work is reviewed.",
  },
  {
    title: "Customer disputes diagnostic fee",
    tag: "Customer care",
    severity: "Medium",
    context: "The customer expected a free inspection. The signed authorization includes a diagnostic charge, but no progress update was documented.",
    next: "Surface the authorization and communication timeline for manager review.",
    stop: "Do not promise an adjustment or assign fault.",
  },
  {
    title: "Vehicle waiting three hours",
    tag: "Aging RO",
    severity: "Medium",
    context: "The vehicle arrived at 8:05 AM. No technician is assigned and the customer is waiting on site.",
    next: "Draft a factual status update and flag the RO for dispatcher review.",
    stop: "Do not invent a completion time.",
  },
  {
    title: "Incomplete warranty documentation",
    tag: "Warranty",
    severity: "High",
    context: "The repair is complete, but the story lacks the required test result and the photo set is incomplete.",
    next: "Generate a missing-document checklist tied to the current policy source.",
    stop: "Do not classify coverage or submit the claim.",
  },
];

const sampleEvidence: EvidenceItem[] = [
  {
    claim: "Inspect the front brake condition before making a repair recommendation.",
    evidence: "Technician measured the front pads at 3 mm.",
    source: "Current MPI · line 8",
    confidence: "High",
    assumptions: "None accepted",
    missing: "Rotor thickness and runout measurements",
    gate: "Draft only · advisor approval required",
    reviewer: "Jace N. · Service advisor",
    verification: "Source matched · action held",
  },
  {
    claim: "The previously declined coolant service may still be relevant.",
    evidence: "Coolant service declined at 58,110 miles; current mileage is 62,447.",
    source: "RO 84721 · declined services",
    confidence: "Moderate",
    assumptions: "Assumes service was not completed elsewhere",
    missing: "Current condition and applicable OEM interval",
    gate: "Verify schedule before recommendation",
    reviewer: "Jace N. · Service advisor",
    verification: "Pending schedule review",
  },
];

const permissionSteps = ["Analyze", "Recommend", "Draft", "Submit for approval", "Execute", "Verify"];

function statusClass(status: string) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  const body = (await response.json()) as T & { error?: string | { message?: string } };
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : body.error?.message ?? `Request failed (${response.status})`);
  return body;
}

export default function Home() {
  const [view, setView] = useState<View>("experiments");
  const [experiments, setExperiments] = useState<Experiment[]>(seedExperiments);
  const [selectedId, setSelectedId] = useState(seedExperiments[0].id);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [ranSample, setRanSample] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [comparisonReport, setComparisonReport] = useState<ComparisonReport | null>(null);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [notice, setNotice] = useState("Connecting to persistent workspace…");
  const [libraryCategory, setLibraryCategory] = useState("All");
  const [librarySearch, setLibrarySearch] = useState("");
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [scenarioRun, setScenarioRun] = useState(false);
  const [baselineMinutes, setBaselineMinutes] = useState(18);
  const [assistedMinutes, setAssistedMinutes] = useState(11);
  const [monthlyVolume, setMonthlyVolume] = useState(280);
  const [sampleSize, setSampleSize] = useState(18);
  const [laborGain, setLaborGain] = useState(0.18);

  useEffect(() => {
    let cancelled = false;
    const loadFoundation = async () => {
      try {
        const foundation = await apiRequest<FoundationResponse>("/api/foundation");
        if (cancelled) return;
        setSession(foundation.session);

        const legacyRaw = window.localStorage.getItem(
          "service-lane-lab-experiments",
        );
        const canImport =
          foundation.session.permissions.includes("experiments:create");
        const needsImport = Boolean(legacyRaw) || foundation.experiments.length === 0;
        if (!canImport || !needsImport) {
          setExperiments(foundation.experiments);
          setSelectedId(foundation.experiments[0]?.id ?? "");
          setNotice(
            `${foundation.session.organization.name} · ${foundation.session.role} · D1 authoritative`,
          );
          return;
        }

        let legacy = seedExperiments;
        if (legacyRaw) {
          try {
            const parsed = JSON.parse(legacyRaw) as Experiment[];
            if (Array.isArray(parsed) && parsed.length) legacy = parsed;
          } catch {
            window.localStorage.removeItem("service-lane-lab-experiments");
          }
        }

        const imported = await apiRequest<{
          imported: number;
          experiments: Experiment[];
        }>("/api/import/legacy", {
          method: "POST",
          body: JSON.stringify({ experiments: legacy }),
        });
        if (cancelled) return;
        setExperiments(imported.experiments);
        setSelectedId((current) =>
          imported.experiments.some((item) => item.id === current)
            ? current
            : (imported.experiments[0]?.id ?? ""),
        );
        window.localStorage.removeItem("service-lane-lab-experiments");
        setNotice(
          imported.imported
            ? `${imported.imported} prototype record${imported.imported === 1 ? "" : "s"} migrated · D1 authoritative`
            : `${foundation.session.organization.name} · ${foundation.session.role} · D1 authoritative`,
        );
      } catch (error) {
        if (cancelled) return;
        setNotice(
          error instanceof Error ? error.message : "Persistent workspace unavailable",
        );
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void loadFoundation();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = experiments.find((item) => item.id === selectedId) ?? experiments[0];
  const can = (permission: string) =>
    session?.permissions.includes(permission) ?? false;

  const replaceExperiments = (next: Experiment[], preferredId?: string) => {
    const targetId = preferredId ?? selectedId;
    setExperiments(next);
    setSelectedId(
      next.some((item) => item.id === targetId)
        ? targetId
        : (next[0]?.id ?? ""),
    );
  };

  const updateExperiment = async (
    patch: Partial<Experiment>,
    note: string,
  ) => {
    if (!selected?.recordVersion) {
      setNotice("Wait for the persistent record to finish loading");
      return;
    }
    setBusy(true);
    try {
      const response = await apiRequest<{ experiments: Experiment[] }>(
        `/api/experiments/${selected.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: selected.recordVersion,
            experiment: { ...selected, ...patch, changeNote: note },
          }),
        },
      );
      replaceExperiments(response.experiments, selected.id);
      setNotice(`${selected.code} saved · server version ${selected.recordVersion + 1}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const duplicateExperiment = async () => {
    const highestCode = experiments.reduce((highest, item) => {
      const number = Number.parseInt(item.code.replace(/\D/g, ""), 10);
      return Number.isFinite(number) ? Math.max(highest, number) : highest;
    }, 0);
    const copy = {
      ...selected,
      code: `EXP-${String(highestCode + 1).padStart(3, "0")}`,
      title: `${selected.title} (copy)`,
      status: "Draft",
      sampleSize: 0,
      confidence: "Low",
      changeNote: `Duplicated from ${selected.code}`,
    };
    setBusy(true);
    try {
      const response = await apiRequest<{ experiments: Experiment[] }>(
        "/api/experiments",
        { method: "POST", body: JSON.stringify(copy) },
      );
      const created = response.experiments.find((item) => item.code === copy.code);
      replaceExperiments(response.experiments, created?.id);
      setNotice(`${copy.code} created in ${session?.organization.name}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Duplicate failed");
    } finally {
      setBusy(false);
    }
  };

  const createExperiment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") || "Untitled experiment");
    const problem = String(data.get("problem") || "Problem statement pending");
    const highestCode = experiments.reduce((highest, item) => {
      const number = Number.parseInt(item.code.replace(/\D/g, ""), 10);
      return Number.isFinite(number) ? Math.max(highest, number) : highest;
    }, 0);
    const item = {
      code: `EXP-${String(highestCode + 1).padStart(3, "0")}`,
      title,
      problem,
      user: String(data.get("user") || "Service advisor"),
      input: String(data.get("input") || "Inputs pending"),
      task: String(data.get("task") || "AI task pending"),
      action: String(data.get("action") || "Proposed action pending"),
      approval: String(data.get("approval") || "Human approval required"),
      metric: String(data.get("metric") || "Success metric pending"),
      risk: String(data.get("risk") || "Risk review pending"),
      verification: String(data.get("verification") || "Verification method pending"),
      status: "Draft",
      sampleSize: 0,
      confidence: "Low",
      changeNote: "Initial experiment definition",
    };
    setBusy(true);
    try {
      const response = await apiRequest<{ experiments: Experiment[] }>(
        "/api/experiments",
        { method: "POST", body: JSON.stringify(item) },
      );
      const created = response.experiments.find((record) => record.code === item.code);
      replaceExperiments(response.experiments, created?.id);
      setShowCreate(false);
      setNotice(`${item.code} persisted · organization scoped`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const runSample = async () => {
    if (!selected?.recordVersion) return;
    setBusy(true);
    try {
      const response = await apiRequest<{
        experiments: Experiment[];
        run: { id: string; correlationId: string; verificationStatus: string };
      }>(`/api/experiments/${selected.id}/runs`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: selected.recordVersion }),
      });
      replaceExperiments(response.experiments, selected.id);
      setRanSample(true);
      setSelectedRunId(response.run.id);
      setReplay(null);
      setCompareMode(true);
      setNotice("Persistent simulated run complete · verification pending human review");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sample run failed");
    } finally {
      setBusy(false);
    }
  };

  const loadComparison = async () => {
    const other = experiments.find((item) => item.id !== selected?.id && item.status !== "Archived");
    if (!selected || !other) return setNotice("At least two active experiments are required");
    try {
      const response = await apiRequest<{ report: ComparisonReport }>(`/api/experiments/compare?leftExperimentId=${encodeURIComponent(other.id)}&rightExperimentId=${encodeURIComponent(selected.id)}`);
      setComparisonReport(response.report);
      setCompareMode(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Comparison unavailable"); }
  };

  const loadReplay = async () => {
    if (!selected || !selectedRunId) return setNotice("Run a sample first to open its evidence replay");
    try {
      const response = await apiRequest<{ replay: Replay }>(`/api/experiments/${selected.id}/runs/${selectedRunId}/replay`);
      setReplay(response.replay);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Evidence replay unavailable"); }
  };

  const filteredWorkflows = useMemo(
    () =>
      workflowCatalog.filter(
        (workflow) =>
          (libraryCategory === "All" || workflow.category === libraryCategory) &&
          `${workflow.name} ${workflow.value} ${workflow.inputs}`
            .toLowerCase()
            .includes(librarySearch.toLowerCase()),
      ),
    [libraryCategory, librarySearch],
  );

  const roi = useMemo(() => {
    const minutesSaved = Math.max(0, baselineMinutes - assistedMinutes);
    const monthlyHours = (minutesSaved * monthlyVolume) / 60;
    const annualHours = monthlyHours * 12;
    const annualLabor = laborGain * monthlyVolume * 12;
    const confidence = sampleSize < 10 ? "Directional only" : sampleSize < 30 ? "Early signal" : "Operational evidence";
    return { minutesSaved, monthlyHours, annualHours, annualLabor, confidence };
  }, [baselineMinutes, assistedMinutes, monthlyVolume, sampleSize, laborGain]);

  const activeScenario = scenarios[scenarioIndex];

  const navItems: { id: View; label: string; count?: number }[] = [
    { id: "experiments", label: "Experiments", count: experiments.filter((e) => e.status !== "Archived").length },
    { id: "sandbox", label: "Advisor sandbox" },
    { id: "approvals", label: "Approval center", count: 1 },
    { id: "library", label: "Workflow library", count: workflowCatalog.length },
    { id: "roi", label: "ROI calculator" },
    { id: "scenarios", label: "Scenario simulator", count: scenarios.length },
  ];

  return (
    <main className="appShell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("experiments")} aria-label="Service Lane AI Lab home">
          <span className="brandMark">SL</span>
          <span>SERVICE LANE <b>AI LAB</b></span>
        </button>
        <div className="systemStatus"><i /> PERSISTENT PILOT FOUNDATION</div>
        <div className="topActions">
          <span className="sampleFlag">D1 · TENANT SCOPED</span>
          <button className="iconButton" aria-label="Notifications">01</button>
          <span className="avatar">
            {(session?.user.displayName ?? "SL")
              .split(/\s+/)
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
        </div>
      </header>

      <aside className="sidebar">
        <div>
          <p className="railLabel">LAB WORKSPACE</p>
          <nav aria-label="Lab sections">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                onClick={() => setView(item.id)}
              >
                <span className="navGlyph">{item.id.slice(0, 2).toUpperCase()}</span>
                {item.label}
                {item.count !== undefined && <b>{item.count}</b>}
              </button>
            ))}
          </nav>
        </div>
        <div className="governanceCard">
          <div><i /> SERVER POLICY ACTIVE</div>
          <p>{session ? `${session.organization.name} · ${session.role}` : "Authenticating organization membership…"}</p>
          <button onClick={() => setView("approvals")}>VIEW POLICY →</button>
        </div>
      </aside>

      <section className="workspace">
        <div className="utilityBar">
          <div className="breadcrumbs">SERVICE LANE AI LAB <span>/</span> {view.replace("-", " ").toUpperCase()}</div>
          <div className="localNotice"><i /> {notice}</div>
        </div>

        {view === "experiments" && selected && (
          <div className="view experimentsView">
            <div className="viewHeader">
              <div>
                <p className="kicker">EXPERIMENT SYSTEM / 01</p>
                <h1>Prove the workflow<br />before it reaches the lane.</h1>
                <p className="lede">Turn service-lane ideas into bounded, measurable tests with evidence, human decisions, and a full change record.</p>
              </div>
              <button className="primaryAction" disabled={busy || !can("experiments:create")} onClick={() => setShowCreate(true)}>＋ NEW EXPERIMENT</button>
            </div>

            <div className="experimentLayout">
              <div className="experimentList">
                <div className="listHead"><span>{experiments.length} EXPERIMENTS</span><button>FILTER: ACTIVE</button></div>
                {experiments.map((experiment) => (
                  <button
                    key={experiment.id}
                    onClick={() => { setSelectedId(experiment.id); setRanSample(false); setCompareMode(false); }}
                    className={`experimentRow ${selected.id === experiment.id ? "selected" : ""}`}
                  >
                    <span className="experimentCode">{experiment.code}</span>
                    <span className="experimentSummary">
                      <strong>{experiment.title}</strong>
                      <small>{experiment.user} · {experiment.updated}</small>
                    </span>
                    <span className={`statusPill ${statusClass(experiment.status)}`}>{experiment.status}</span>
                    <span className="rowArrow">↗</span>
                  </button>
                ))}
              </div>

              <article className="experimentDetail">
                <div className="detailTop">
                  <div>
                    <span className="experimentCode">{selected.code} · VERSION {selected.versions[0].version}</span>
                    <h2>{selected.title}</h2>
                  </div>
                  <span className={`statusPill ${statusClass(selected.status)}`}>{selected.status}</span>
                </div>

                <div className="definitionGrid">
                  {[
                    ["Problem", selected.problem],
                    ["User", selected.user],
                    ["Input", selected.input],
                    ["AI task", selected.task],
                    ["Proposed action", selected.action],
                    ["Approval required", selected.approval],
                    ["Success metric", selected.metric],
                    ["Risk", selected.risk],
                    ["Verification", selected.verification],
                  ].map(([label, value]) => (
                    <div key={label} className={label === "Problem" || label === "AI task" || label === "Verification" ? "wideDef" : ""}>
                      <span>{label}</span><p>{value}</p>
                    </div>
                  ))}
                </div>

                <div className="experimentMetrics">
                  <div><span>SAMPLE SIZE</span><b>{selected.sampleSize} ROs</b></div>
                  <div><span>CONFIDENCE</span><b>{selected.confidence}</b></div>
                  <div><span>REVIEW GATE</span><b>Human required</b></div>
                </div>

                <div className="actionStrip">
                  <button className="runButton" disabled={busy || !can("experiments:update")} onClick={() => void runSample()}>▶ RUN SAMPLE DATA</button>
                  <button onClick={() => void loadComparison()}>◫ COMPARE RUNS</button>
                  <button onClick={() => void loadReplay()} disabled={!selectedRunId}>◷ EVIDENCE REPLAY</button>
                  <button disabled={busy || !can("experiments:create")} onClick={() => void duplicateExperiment()}>⧉ DUPLICATE</button>
                  <button disabled={busy || !can("experiments:update")} onClick={() => void updateExperiment({ status: "Archived" }, "Experiment archived")}>ARCHIVE</button>
                </div>

                {comparisonReport && (
                  <div className="comparisonPanel" aria-label="Experiment comparison report">
                    <div className="panelTitle"><span>AUTHENTICATED COMPARISON REPORT</span><b>{comparisonReport.left.code} → {comparisonReport.right.code}</b></div>
                    <div className="comparisonColumns">
                      <section><span>METRIC DELTAS</span>{comparisonReport.metricDeltas.map((item) => <p key={item.metric}><strong>{item.metric}</strong> · {item.left} → {item.right} <b>{item.delta > 0 ? "+" : ""}{item.delta}</b></p>)}</section>
                      <section className="aiColumn"><span>EVIDENCE SUMMARY</span><p>{comparisonReport.left.code}: {comparisonReport.evidenceSummary.left.verified}/{comparisonReport.evidenceSummary.left.total} verified</p><p>{comparisonReport.right.code}: {comparisonReport.evidenceSummary.right.verified}/{comparisonReport.evidenceSummary.right.total} verified</p><p>Pending gates: {comparisonReport.evidenceSummary.right.pending}</p></section>
                    </div>
                  </div>
                )}

                {replay && (
                  <div className="evidenceSection" aria-label="Evidence timeline replay">
                    <div className="panelTitle"><span>EVIDENCE TIMELINE / REPLAY</span><b>{replay.run.status.toUpperCase()}</b></div>
                    <p className="inputNote">Correlation {replay.run.correlationId} · {replay.run.modelName ?? "recorded run"}</p>
                    {replay.events.map((event, index) => <div className="historyRow" key={`${event.type}-${event.at}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p><strong>{event.type}</strong>{event.claim ? ` · ${event.claim}` : ""}{event.source ? ` · ${event.source}` : ""}</p><time>{event.at}</time></div>)}
                    {replay.result && <p className="inputNote">Immutable result {replay.result.resultHash} · {replay.result.workerReference}</p>}
                  </div>
                )}

                {compareMode && (
                  <div className="comparisonPanel">
                    <div className="panelTitle"><span>WORKFLOW COMPARISON</span><b>{ranSample ? "RUN COMPLETE" : "PREVIEW"}</b></div>
                    <div className="comparisonColumns">
                      <section>
                        <span>01 / BASELINE</span>
                        <h3>Original advisor workflow</h3>
                        <p>Advisor scans prior ROs, opens the MPI, checks declined lines, and manually reconstructs what may still be relevant.</p>
                        <dl><div><dt>Review time</dt><dd>18 min</dd></div><div><dt>Source citations</dt><dd>0</dd></div><div><dt>Unresolved gaps</dt><dd>Not tracked</dd></div></dl>
                      </section>
                      <section className="aiColumn">
                        <span>02 / AI PROPOSAL</span>
                        <h3>Evidence-linked review</h3>
                        <p>Two possible opportunities found. Each is linked to the original record and stopped at a verification gate.</p>
                        <dl><div><dt>Review time</dt><dd>11 min</dd></div><div><dt>Source citations</dt><dd>4</dd></div><div><dt>Unresolved gaps</dt><dd>2 surfaced</dd></div></dl>
                      </section>
                      <section>
                        <span>03 / ADVISOR EDIT</span>
                        <h3>Judgment applied</h3>
                        <p>Advisor removes one duplicated line, requests rotor measurements, and holds the coolant item for schedule verification.</p>
                        <dl><div><dt>Claims changed</dt><dd>2</dd></div><div><dt>Unsupported claims</dt><dd>0</dd></div><div><dt>Decision</dt><dd>Revise</dd></div></dl>
                      </section>
                      <section className="approvedColumn">
                        <span>04 / FINAL</span>
                        <h3>Approved draft</h3>
                        <p>No customer-facing message is released. The verified brake inspection note is ready for advisor approval after measurements arrive.</p>
                        <button disabled={busy || !can("experiments:validate")} onClick={() => void updateExperiment({ status: "Validated", confidence: selected.sampleSize > 29 ? "High" : "Moderate" }, "Reviewer validated sample output")}>✓ VALIDATE RESULT</button>
                      </section>
                    </div>
                  </div>
                )}

                {ranSample && (
                  <div className="evidenceSection">
                    <div className="panelTitle"><span>OUTPUT EVIDENCE</span><b>2 CLAIMS · 2 GATES</b></div>
                    {sampleEvidence.map((item, index) => (
                      <article className="evidenceCard" key={item.claim}>
                        <div className="evidenceIndex">0{index + 1}</div>
                        <div className="evidenceClaim"><span>RECOMMENDATION</span><h3>{item.claim}</h3><p>{item.evidence}</p></div>
                        <dl>
                          <div><dt>Source used</dt><dd>{item.source}</dd></div>
                          <div><dt>Confidence</dt><dd>{item.confidence}</dd></div>
                          <div><dt>Unsupported assumptions</dt><dd>{item.assumptions}</dd></div>
                          <div><dt>Still needed</dt><dd>{item.missing}</dd></div>
                          <div><dt>Reviewer</dt><dd>{session?.user.displayName ?? item.reviewer}</dd></div>
                          <div><dt>Verification</dt><dd>{item.verification}</dd></div>
                          <div><dt>Action boundary</dt><dd>{item.gate}</dd></div>
                        </dl>
                      </article>
                    ))}
                  </div>
                )}

                <div className="historySection">
                  <div className="panelTitle"><span>VERSION HISTORY</span><b>IMMUTABLE TEST RECORD</b></div>
                  {selected.versions.map((version) => (
                    <div className="historyRow" key={version.version}>
                      <span>V{version.version}</span><p>{version.note}</p><time>{version.date}</time>
                    </div>
                  ))}
                  <div className="publishRow">
                    <p><strong>Publish gate</strong> Only validated workflows can enter the shared library. Publishing does not grant execution permission.</p>
                    <button
                      disabled={busy || selected.status !== "Validated" || !can("experiments:publish")}
                      onClick={() => void updateExperiment({ status: "Published" }, "Validated workflow published to library")}
                    >
                      PUBLISH VALIDATED WORKFLOW →
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </div>
        )}
        {view === "experiments" && !selected && !busy && (
          <div className="view">
            <div className="viewHeader compactHeader">
              <div>
                <p className="kicker">EXPERIMENT SYSTEM / 01</p>
                <h1>No published experiments<br />are available.</h1>
                <p className="lede">
                  Your organization membership is valid, but your current role
                  can only read experiments that have passed the publish gate.
                </p>
              </div>
            </div>
          </div>
        )}

        {view === "sandbox" && (
          <div className="view">
            <div className="viewHeader compactHeader">
              <div><p className="kicker">SERVICE ADVISOR COPILOT / 02</p><h1>One repair order.<br />Four stages of judgment.</h1><p className="lede">Inspect a realistic case, ask for a bounded AI task, then compare the source, draft, edit, and final approval.</p></div>
              <span className="recordChip">RO #SL-20481 · OPEN</span>
            </div>

            <div className="sandboxGrid">
              <aside className="roContext">
                <div className="panelTitle"><span>REPAIR ORDER CONTEXT</span><b>11 SOURCES</b></div>
                {[
                  ["Customer concern", "Vibration in steering wheel when braking from highway speed."],
                  ["Vehicle", "JTMB1RFV5MD••4721 · 2021 RAV4 XLE"],
                  ["Mileage", "62,447 miles"],
                  ["Appointment note", "Customer waiting; needs vehicle by 2:00 PM if possible."],
                  ["Technician findings", "Front pads measured 3 mm. Road test duplicated concern."],
                  ["MPI", "Front brakes yellow; rear brakes green. No rotor measurement entered."],
                  ["Prior history", "Front brake inspection at 51,202 miles; no repair performed."],
                  ["Declined services", "Coolant service declined at 58,110 miles."],
                  ["Warranty status", "Basic warranty expired; coverage not evaluated for this concern."],
                  ["Transportation", "Customer waiting on site."],
                  ["Communication", "Text preferred; phone for authorization."],
                ].map(([label, value], index) => <div className="contextRow" key={label}><span>{String(index + 1).padStart(2, "0")} · {label}</span><p>{value}</p></div>)}
              </aside>

              <div className="copilotWork">
                <div className="taskSelector">
                  <label htmlFor="ai-task">BOUNDED AI TASK</label>
                  <select id="ai-task">
                    <option>Rewrite technician story for the customer</option>
                    <option>Identify missing diagnostic information</option>
                    <option>Produce recommended-service talking points</option>
                    <option>Draft an estimate explanation</option>
                    <option>Identify warranty or policy concerns</option>
                    <option>Prepare a follow-up message</option>
                    <option>Summarize the RO for management</option>
                    <option>Identify advisor / technician handoff gaps</option>
                  </select>
                  <button disabled={busy || !can("experiments:update")} onClick={() => void runSample()}>CREATE PERSISTENT DRY-RUN →</button>
                </div>

                <div className="stageTabs">
                  {["Original workflow", "AI proposal", "Advisor edit", "Final approved"].map((stage, index) => <div className={index === (ranSample ? 1 : 0) ? "active" : ""} key={stage}><span>0{index + 1}</span>{stage}</div>)}
                </div>

                <article className="draftPanel">
                  <div className="draftHeader"><div><span>AI PROPOSAL · DRAFT ONLY</span><h2>Customer-facing explanation</h2></div><span className="confidenceHigh">HIGH SOURCE COVERAGE</span></div>
                  {ranSample ? (
                    <>
                      <p className="draftCopy">We confirmed the vibration you feel while braking. The technician measured the front brake pads at 3 mm, which means the front brakes need a closer inspection. Before recommending a repair, we still need the rotor measurements that identify the specific cause and correct next step.</p>
                      <div className="inlineCitation"><b>1</b><p><span>SUPPORTED BY</span> Technician finding: “Front pads 3 mm.” · Current MPI line 8</p></div>
                      <div className="inlineCitation warning"><b>2</b><p><span>INFORMATION NEEDED</span> Rotor thickness and runout were not documented. Do not name a repair yet.</p></div>
                    </>
                  ) : (
                    <div className="emptyDraft"><span>↳</span><p>Select a bounded task and generate a review draft.</p></div>
                  )}
                </article>

                <div className="reviewBar">
                  <div><span>REVIEWER</span><b>{session?.user.displayName ?? "Authenticated reviewer"} · {session?.role ?? "pending"}</b></div>
                  <div><span>VERIFICATION</span><b>{ranSample ? "2 of 2 claims sourced" : "Not started"}</b></div>
                  <div className="reviewActions"><button>REQUEST REVISION</button><button disabled={!ranSample}>APPROVE DRAFT</button></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === "approvals" && (
          <div className="view">
            <div className="viewHeader compactHeader">
              <div><p className="kicker">APPROVAL CENTER / 03</p><h1>Permission is a ladder,<br />not a toggle.</h1><p className="lede">See the exact request, policy result, affected record, and post-approval boundary before making a decision.</p></div>
              <span className="recordChip">ACS READ INTEGRATION PENDING</span>
            </div>

            <div className="permissionLadder">
              {permissionSteps.map((step, index) => (
                <div className={index < 3 ? "allowed" : index === 3 ? "current" : "locked"} key={step}>
                  <span>0{index + 1}</span><b>{step}</b><small>{index < 3 ? "Allowed" : index === 3 ? "Requested now" : "Not granted"}</small>
                </div>
              ))}
            </div>

            <div className="approvalLayout">
              <aside className="requestList">
                <div className="panelTitle"><span>APPROVAL QUEUE</span><b>0 AUTHORITATIVE</b></div>
                <button className="requestRow selected">
                  <span className="riskBadge">CONTRACT PREVIEW</span>
                  <strong>Draft customer follow-up</strong>
                  <small>Not issued · no ACS work item</small>
                </button>
                <button className="requestRow muted"><span>QUEUE CLEAR</span><p>No other requests require a decision.</p></button>
              </aside>

              <article className="approvalRequest">
                <div className="approvalTitle">
                  <div><span>READ-ONLY EXAMPLE · NOT AN APPROVAL</span><h2>Draft customer follow-up</h2></div>
                  <span className="decisionState revision">integration pending</span>
                </div>
                <div className="requestFacts">
                  {[
                    ["Requested action", "Create an editable text-message draft"],
                    ["Requested by", "Example contract · no authoritative request"],
                    ["Customer / RO", "Sample customer · RO #SL-20481"],
                    ["Data involved", "MPI, technician findings, prior declines"],
                    ["Risk level", "Medium · customer communication"],
                    ["Reason", "Explain verified brake inspection status"],
                    ["Expires", "Not issued"],
                    ["Policy decision", "NOT EVALUATED · ACS DISCONNECTED"],
                  ].map(([label, value]) => <div key={label}><span>{label}</span><p>{value}</p></div>)}
                </div>
                <div className="payload">
                  <div className="panelTitle"><span>PROPOSED PAYLOAD SHAPE</span><b>HASHING RESERVED FOR ACS</b></div>
                  <pre>{`{
  "action": "create_draft",
  "channel": "sms",
  "repair_order": "SL-20481",
  "recipient": "sample_customer",
  "external_send": false,
  "system_mutation": false
}`}</pre>
                </div>
                <div className="afterApproval">
                  <span>WHAT HAPPENS AFTER APPROVAL</span>
                  <p>A draft is created inside this workspace for advisor editing. Nothing is sent to the customer and no repair-order field is changed.</p>
                </div>
                <div className="decisionButtons">
                  <button disabled>REJECT</button>
                  <button disabled>REQUEST REVISION</button>
                  <button disabled>APPROVE DRAFT CREATION ONLY →</button>
                </div>
                <p className="decisionFootnote">No decision can be recorded here until ACS supplies the authoritative request, exact action hash, identity, expiration, and consumption state.</p>
              </article>
            </div>
          </div>
        )}

        {view === "library" && (
          <div className="view">
            <div className="viewHeader compactHeader">
              <div><p className="kicker">WORKFLOW LIBRARY / 04</p><h1>Patterns for the lane.<br />Maturity included.</h1><p className="lede">Browse governed workflow definitions by role, integration need, evidence, and human decision boundary.</p></div>
              <button className="primaryAction" disabled={busy || !can("experiments:create")} onClick={() => { setView("experiments"); setShowCreate(true); }}>＋ PROPOSE WORKFLOW</button>
            </div>
            <div className="libraryTools">
              <div className="categoryFilters">
                {["All", "Advisor", "Technician", "Management", "Warranty"].map((category) => <button className={libraryCategory === category ? "active" : ""} onClick={() => setLibraryCategory(category)} key={category}>{category}</button>)}
              </div>
              <label className="searchBox">⌕<input aria-label="Search workflows" placeholder="Search workflow, value, or input…" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} /></label>
            </div>
            <div className="workflowTable">
              <div className="workflowTableHead"><span>WORKFLOW / BUSINESS VALUE</span><span>INPUT → OUTPUT</span><span>CONTROL</span><span>MATURITY / EVIDENCE</span></div>
              {filteredWorkflows.map((workflow, index) => (
                <article className="workflowRow" key={workflow.name}>
                  <div className="workflowName"><span>{String(index + 1).padStart(2, "0")} · {workflow.category}</span><h2>{workflow.name}</h2><p>{workflow.value}</p></div>
                  <div className="ioFlow"><span>{workflow.inputs}</span><b>↓</b><span>{workflow.output}</span></div>
                  <div className="controlFacts"><p><span>RISK</span><b>{workflow.risk}</b></p><p><span>INTEGRATION</span><b>{workflow.integration}</b></p><p><span>APPROVAL</span><b>{workflow.approval}</b></p></div>
                  <div className="maturity"><span className={`statusPill ${statusClass(workflow.maturity)}`}>{workflow.maturity}</span><p>{workflow.evidence}</p><button>OPEN DEFINITION ↗</button></div>
                </article>
              ))}
              {!filteredWorkflows.length && <div className="noResults">No workflows match those filters.</div>}
            </div>
          </div>
        )}

        {view === "roi" && (
          <div className="view">
            <div className="viewHeader compactHeader">
              <div><p className="kicker">MEASURABLE VALUE / 05</p><h1>Show the delta.<br />Respect the sample.</h1><p className="lede">Track operating impact without turning a tiny test into a confident annual promise.</p></div>
              <span className="recordChip">{roi.confidence.toUpperCase()}</span>
            </div>
            <div className="roiLayout">
              <aside className="roiInputs">
                <div className="panelTitle"><span>EXPERIMENT INPUTS</span><b>EXP-024</b></div>
                {[
                  ["Baseline review time", baselineMinutes, setBaselineMinutes, "minutes"],
                  ["AI-assisted review time", assistedMinutes, setAssistedMinutes, "minutes"],
                  ["Monthly eligible ROs", monthlyVolume, setMonthlyVolume, "ROs"],
                  ["Observed sample size", sampleSize, setSampleSize, "ROs"],
                ].map(([label, value, setter, unit]) => (
                  <label className="numberInput" key={String(label)}>
                    <span>{String(label)}</span>
                    <div><input type="number" min="0" value={Number(value)} onChange={(event) => (setter as (n: number) => void)(Number(event.target.value))} /><b>{String(unit)}</b></div>
                  </label>
                ))}
                <label className="numberInput">
                  <span>Additional approved labor per RO</span>
                  <div><input type="number" min="0" step="0.01" value={laborGain} onChange={(event) => setLaborGain(Number(event.target.value))} /><b>hours</b></div>
                </label>
                <p className="inputNote">All annual figures are modeled estimates, not booked results.</p>
              </aside>

              <div className="roiResults">
                <div className="roiHero">
                  <div><span>TIME SAVED / ELIGIBLE RO</span><b>{roi.minutesSaved.toFixed(1)}<small> min</small></b><p>{baselineMinutes} min baseline → {assistedMinutes} min assisted</p></div>
                  <div><span>ESTIMATED ANNUAL CAPACITY</span><b>{Math.round(roi.annualHours)}<small> hrs</small></b><p>Based on {monthlyVolume.toLocaleString()} eligible ROs / month</p></div>
                  <div><span>MODELED ADDITIONAL LABOR</span><b>{Math.round(roi.annualLabor)}<small> hrs</small></b><p>Requires actual approval-rate validation</p></div>
                </div>
                <div className="confidencePanel">
                  <div className="confidenceTitle"><span>CONFIDENCE DISCIPLINE</span><b>{roi.confidence}</b></div>
                  <div className="confidenceTrack"><i style={{ width: `${Math.min(100, (sampleSize / 50) * 100)}%` }} /></div>
                  <div className="confidenceScale"><span>5 · anecdotal</span><span>30 · early evidence</span><span>50+ · operational</span></div>
                  <p>{sampleSize < 10 ? "This sample is too small for annualization. Use the results to improve the experiment, not to claim ROI." : sampleSize < 30 ? "The observed direction is useful, but the annual impact remains a scenario. Expand the test across advisors and traffic patterns." : "The sample supports an operational estimate. Continue monitoring accuracy, adoption, and selection bias before treating the result as durable."}</p>
                </div>
                <div className="metricFamilies">
                  <article><span>TIME</span><h3>7.0 minutes saved</h3><p>Advisor minutes · technician interruptions · manager review · write-up to estimate · diagnosis to contact</p></article>
                  <article><span>FINANCIAL</span><h3>Value not yet booked</h3><p>Approved labor · parts gross · deferred revenue · loaner expense · policy adjustments · comeback cost</p></article>
                  <article><span>QUALITY</span><h3>2 of 2 claims sourced</h3><p>Documentation · response time · approval rate · accuracy · escalation quality · CSI · warranty rejection</p></article>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === "scenarios" && (
          <div className="view">
            <div className="viewHeader compactHeader">
              <div><p className="kicker">SCENARIO SIMULATOR / 06</p><h1>Practice the stop points,<br />not just the prompts.</h1><p className="lede">Use realistic lane conditions to test what the system should surface, propose, and refuse to do.</p></div>
              <span className="recordChip">{scenarios.length} SIMULATIONS</span>
            </div>
            <div className="scenarioLayout">
              <aside className="scenarioList">
                {scenarios.map((scenario, index) => <button className={scenarioIndex === index ? "selected" : ""} onClick={() => { setScenarioIndex(index); setScenarioRun(false); }} key={scenario.title}><span>0{index + 1}</span><div><strong>{scenario.title}</strong><small>{scenario.tag} · {scenario.severity} risk</small></div></button>)}
              </aside>
              <article className="scenarioStage">
                <div className="scenarioMeta"><span>{activeScenario.tag.toUpperCase()}</span><b>{activeScenario.severity.toUpperCase()} RISK</b></div>
                <h2>{activeScenario.title}</h2>
                <div className="scenarioContext"><span>SIMULATED LANE CONDITION</span><p>{activeScenario.context}</p></div>
                <div className="scenarioQuestion"><span>YOUR TEST</span><h3>What should the AI do, and where must it stop?</h3><textarea aria-label="Scenario response" placeholder="Record the expected action, evidence requirement, approval gate, and prohibited action…" /></div>
                <button className="runScenario" onClick={() => setScenarioRun(true)}>RUN GOVERNED RESPONSE →</button>
                {scenarioRun && (
                  <div className="scenarioResponse">
                    <div><span>PROPOSED NEXT STEP</span><p>{activeScenario.next}</p></div>
                    <div className="stopPoint"><span>REQUIRED STOP POINT</span><p>{activeScenario.stop}</p></div>
                    <div><span>APPROVAL PATH</span><p>Analyze → recommend → draft → human review. Execute remains locked.</p></div>
                    <button onClick={() => { setView("experiments"); setShowCreate(true); }}>TURN INTO AN EXPERIMENT ↗</button>
                  </div>
                )}
              </article>
            </div>
          </div>
        )}
      </section>

      {showCreate && (
        <div className="modalBackdrop" role="presentation" onMouseDown={() => setShowCreate(false)}>
          <form className="createModal" onSubmit={createExperiment} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modalTop"><div><span>NEW LAB RECORD</span><h2>Create experiment</h2></div><button type="button" onClick={() => setShowCreate(false)} aria-label="Close">×</button></div>
            <label>EXPERIMENT TITLE<input name="title" required placeholder="e.g. Estimate explanation review" autoFocus /></label>
            <label>PROBLEM TO TEST<textarea name="problem" required placeholder="Describe the observable service-lane problem…" /></label>
            <div className="modalGrid"><label>PRIMARY USER<select name="user"><option>Service advisor</option><option>Technician</option><option>Manager</option><option>Warranty administrator</option></select></label><label>INITIAL STATUS<select name="status" disabled><option>Draft</option></select></label></div>
            <div className="modalGrid"><label>INPUTS<input name="input" required placeholder="RO history, mileage, findings…" /></label><label>AI TASK<input name="task" required placeholder="Identify, summarize, compare…" /></label></div>
            <div className="modalGrid"><label>PROPOSED ACTION<input name="action" required placeholder="Create an editable draft…" /></label><label>APPROVAL REQUIRED<input name="approval" required placeholder="Advisor approval…" /></label></div>
            <div className="modalGrid"><label>SUCCESS METRIC<input name="metric" required placeholder="Minutes saved, approval rate…" /></label><label>PRIMARY RISK<input name="risk" required placeholder="Incorrect recommendation…" /></label></div>
            <label>VERIFICATION METHOD<input name="verification" required placeholder="How will a reviewer confirm the result?" /></label>
            <div className="modalBoundary"><span>DEFAULT SAFETY BOUNDARY</span><p>Analyze and draft only. Human approval required. No customer contact or system mutation.</p></div>
            <div className="modalActions"><button type="button" onClick={() => setShowCreate(false)}>CANCEL</button><button type="submit" disabled={busy}>CREATE DRAFT EXPERIMENT →</button></div>
          </form>
        </div>
      )}
    </main>
  );
}
