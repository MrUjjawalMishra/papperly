import { guidance } from "../../contracts/src/index";

export interface GuidanceEvidence {
  sourceVersion?: number;
  fingerprint?: string;
  resources?: { id: string }[];
  results?: {
    id: string;
    classId?: string;
    subject?: string;
    scores?: { topic?: string; maximum?: number; unitCount?: number }[];
  }[];
}

export function validateGuidance(evidence: GuidanceEvidence, output: unknown) {
  const result = guidance.parse(output);
  const results = evidence.results ?? [];
  const byId = new Map(results.map((r) => [r.id, r]));
  const cited = new Set(result.resultIds);
  if (
    cited.size !== result.resultIds.length ||
    result.resultIds.some((id) => !byId.has(id)) ||
    [...result.strengths, ...result.practice].some(
      (claim) =>
        claim.evidence.length === 0 ||
        new Set(claim.evidence).size !== claim.evidence.length ||
        claim.evidence.some((id) => !cited.has(id)),
    )
  )
    throw Error("AI_UNAUTHORIZED_EVIDENCE");
  if (!cited.size && (result.strengths.length || result.practice.length))
    throw Error("AI_INSUFFICIENT_EVIDENCE");
  const comparable = (ids: string[]) => {
    const groups = new Map<string, number>();
    for (const id of ids) {
      const r = byId.get(id);
      if (!r?.classId || !r.subject) continue;
      const key = JSON.stringify([r.classId, r.subject]);
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    return [...groups.values()].some((count) => count >= 2);
  };
  if (
    (result.sufficiency === "trend" && !comparable(result.resultIds)) ||
    (result.sufficiency === "result-specific" && !cited.size)
  )
    throw Error("AI_INSUFFICIENT_EVIDENCE");
  const recurring =
    /\b(trend|recurr\w*|consisten\w*|repeated\w*|improv\w*|declin\w*|over time)\b/i;
  for (const claim of result.strengths)
    if (recurring.test(claim.text) && !comparable(claim.evidence))
      throw Error("AI_INSUFFICIENT_EVIDENCE");
  for (const claim of result.practice) {
    if (
      claim.resourceId !== null &&
      !evidence.resources?.some((resource) => resource.id === claim.resourceId)
    )
      throw Error("AI_UNAUTHORIZED_RESOURCE");
    const selected = claim.evidence.map((id) => byId.get(id)!);
    const units = selected.flatMap((r) =>
      (r.scores ?? []).filter(
        (unit) => unit.topic === claim.topic && (unit.maximum ?? 0) > 0,
      ),
    );
    if (!units.length) throw Error("AI_UNAUTHORIZED_TOPIC");
    if (
      recurring.test(claim.action) &&
      (!comparable(claim.evidence) ||
        units.reduce((sum, unit) => sum + (unit.unitCount ?? 1), 0) < 3 ||
        selected.filter((r) =>
          r.scores?.some(
            (unit) => unit.topic === claim.topic && (unit.maximum ?? 0) > 0,
          ),
        ).length < 2)
    )
      throw Error("AI_INSUFFICIENT_TOPIC_EVIDENCE");
  }
  const prose = [
    ...result.strengths.map((s) => s.text),
    ...result.practice.map((s) => s.action),
  ].join(" ");
  if (
    /\d|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|percent|percentage)\b/i.test(
      prose,
    )
  )
    throw Error("AI_UNVALIDATED_NUMBER");
  if (
    /https?:|www\.|\]\(|<[^>]*>|\b(disab\w*|diagnos\w*|unintelligent|stupid|lazy|guarantee\w*)\b/i.test(
      prose,
    )
  )
    throw Error("AI_UNSAFE_GUIDANCE");
  return result;
}
