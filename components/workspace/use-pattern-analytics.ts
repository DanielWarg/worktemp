import { useMemo } from "react";
import { PatternData } from "./types";
import { formatDate } from "./helpers";

// ─── Types ───

export type PatternFlag = {
  type: "cross-pattern" | "repetition";
  label: string;
  detail: string;
  relatedTitles?: string[];
};

export type PatternScore = {
  score: number;
  level: "critical" | "high" | "medium" | "low";
  reasons: string[];
};

export type PatternGroup = {
  key: string;
  label: string;
  sublabel: string;
  patterns: PatternData[];
};

// ─── Hook ───

export function usePatternAnalytics(patterns: PatternData[], groupBy: "import" | "tag" | "priority") {
  // ── Flags: bug detection + cross-pattern similarity ──
  const patternFlags = useMemo(() => {
    const flags = new Map<string, PatternFlag>();

    const getLeadingWord = (title: string) => {
      const dash = title.indexOf(" — ");
      return (dash > 0 ? title.slice(0, dash) : title).toLowerCase().trim();
    };
    const getTopics = (desc: string | null): string[] => {
      if (!desc) return [];
      const m = desc.match(/Ämnen:\s*([^.]+)/);
      return m ? m[1].split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) : [];
    };

    // Signal 1: Cross-pattern — same leading keyword or high topic overlap
    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const a = patterns[i], b = patterns[j];
        const leadA = getLeadingWord(a.title);
        const leadB = getLeadingWord(b.title);
        const sameLeading = leadA.length > 2 && leadA === leadB;

        const topicsA = getTopics(a.description);
        const topicsB = getTopics(b.description);
        let overlap = 0;
        if (topicsA.length > 0 && topicsB.length > 0) {
          const setB = new Set(topicsB);
          const shared = topicsA.filter((t) => setB.has(t)).length;
          const union = new Set([...topicsA, ...topicsB]).size;
          overlap = union > 0 ? shared / union : 0;
        }

        if (sameLeading || overlap >= 0.5) {
          const system = leadA.toUpperCase();
          for (const p of [a, b]) {
            const other = p === a ? b : a;
            if (!flags.has(p.id)) {
              flags.set(p.id, {
                type: "cross-pattern",
                label: "Återkommande problem",
                detail: `Flera mönster om samma område (${system}) — kan tyda på en underliggande bugg eller felkonfiguration.`,
                relatedTitles: [other.title],
              });
            } else {
              const existing = flags.get(p.id)!;
              if (existing.relatedTitles && !existing.relatedTitles.includes(other.title)) {
                existing.relatedTitles.push(other.title);
              }
            }
          }
        }
      }
    }

    // Signal 2: Within-pattern — near-identical tickets (same text repeated)
    for (const pattern of patterns) {
      if (pattern.patternChallenges.length < 3) continue;

      const texts = pattern.patternChallenges.map((pc) =>
        (pc.challenge.contentNormalized || pc.challenge.contentRaw || "")
          .toLowerCase()
          .replace(/\d+/g, "N")
          .replace(/\s+/g, " ")
          .trim()
      );

      const prefixes = texts.map((t) => t.slice(0, 30));
      const prefixCounts = new Map<string, number>();
      for (const p of prefixes) {
        if (p.length < 10) continue;
        prefixCounts.set(p, (prefixCounts.get(p) || 0) + 1);
      }
      const maxRepeat = Math.max(...prefixCounts.values(), 0);
      const repeatRatio = texts.length > 0 ? maxRepeat / texts.length : 0;

      if (maxRepeat >= 3 && repeatRatio >= 0.5) {
        const existing = flags.get(pattern.id);
        if (existing) {
          existing.type = "repetition";
          existing.label = "Trolig bugg eller larmfel";
          existing.detail = `${maxRepeat} av ${texts.length} ärenden är nästan identiska — troligen samma larm/fel som triggas upprepat. Granska om det är en bugg i systemet eller felkonfigurerat larm.`;
        } else {
          flags.set(pattern.id, {
            type: "repetition",
            label: "Trolig bugg eller larmfel",
            detail: `${maxRepeat} av ${texts.length} ärenden är nästan identiska — troligen samma larm/fel som triggas upprepat. Granska om det är en bugg i systemet eller felkonfigurerat larm.`,
          });
        }
      }
    }

    return flags;
  }, [patterns]);

  const flaggedIds = useMemo(() => new Set(patternFlags.keys()), [patternFlags]);

  // ── Scores: priority ranking ──
  const patternScores = useMemo(() => {
    const scores = new Map<string, PatternScore>();
    for (const pattern of patterns) {
      let score = 0;
      const reasons: string[] = [];

      const flag = patternFlags.get(pattern.id);
      if (flag?.type === "repetition") { score += 40; reasons.push("Upprepade identiska ärenden"); }
      else if (flag) { score += 20; reasons.push("Relaterade mönster finns"); }

      if (pattern.patternType === "ESCALATING") { score += 30; reasons.push("Eskalerande trend"); }
      else if (pattern.patternType === "CROSS_TEAM") { score += 15; reasons.push("Påverkar flera team"); }
      else if (pattern.patternType === "CROSS_PERSON") { score += 10; reasons.push("Flera rapportörer"); }

      const count = pattern.occurrenceCount;
      if (count >= 10) { score += 20; reasons.push(`Hög volym (${count} ärenden)`); }
      else if (count >= 5) { score += 10; reasons.push(`${count} ärenden`); }
      else { score += 3; }

      if (pattern.status === "EMERGING") score += 5;

      const level: PatternScore["level"] =
        score >= 50 ? "critical" : score >= 30 ? "high" : score >= 15 ? "medium" : "low";

      scores.set(pattern.id, { score, level, reasons });
    }
    return scores;
  }, [patterns, patternFlags]);

  // ── Grouping ──
  const groups = useMemo((): PatternGroup[] => {
    if (groupBy === "priority") {
      const levels = ["critical", "high", "medium", "low"] as const;
      const labels: Record<string, string> = { critical: "Kritisk", high: "Hög prioritet", medium: "Medium", low: "Låg" };
      return levels
        .map((level) => ({
          key: level,
          label: labels[level],
          sublabel: "",
          patterns: patterns
            .filter((p) => patternScores.get(p.id)?.level === level)
            .sort((a, b) => (patternScores.get(b.id)?.score ?? 0) - (patternScores.get(a.id)?.score ?? 0)),
        }))
        .filter((g) => g.patterns.length > 0)
        .map((g) => ({ ...g, sublabel: `${g.patterns.length} mönster` }));
    }

    if (groupBy === "tag") {
      const tagGroups = new Map<string, PatternData[]>();
      for (const pattern of patterns) {
        const tagCounts = new Map<string, number>();
        for (const pc of pattern.patternChallenges) {
          for (const ct of pc.challenge.tags || []) {
            tagCounts.set(ct.tag.name, (tagCounts.get(ct.tag.name) || 0) + 1);
          }
        }
        let bestTag: string | null = null;
        let bestCount = 0;
        for (const [name, count] of tagCounts) {
          if (count > bestCount) { bestCount = count; bestTag = name; }
        }
        const key = bestTag ?? "__untagged__";
        if (!tagGroups.has(key)) tagGroups.set(key, []);
        tagGroups.get(key)!.push(pattern);
      }
      return [...tagGroups.entries()]
        .sort(([a], [b]) => {
          if (a === "__untagged__") return 1;
          if (b === "__untagged__") return -1;
          return a.localeCompare(b, "sv");
        })
        .map(([key, pats]) => ({
          key,
          label: key === "__untagged__" ? "Otaggade" : key,
          sublabel: `${pats.length} mönster`,
          patterns: pats,
        }));
    }

    // Default: group by import
    const importGroups = new Map<string, { importId: string | null; label: string; date: string | null; patterns: PatternData[] }>();
    for (const pattern of patterns) {
      const importCounts = new Map<string, { count: number; label: string; date: string }>();
      let noImportCount = 0;
      for (const pc of pattern.patternChallenges) {
        const imp = pc.challenge.import;
        if (imp) {
          const existing = importCounts.get(imp.id);
          if (existing) existing.count++;
          else importCounts.set(imp.id, { count: 1, label: imp.sourceLabel, date: imp.createdAt });
        } else {
          noImportCount++;
        }
      }
      let bestImportId: string | null = null;
      let bestLabel = "Möten & manuellt";
      let bestDate: string | null = null;
      let bestCount = noImportCount;
      for (const [id, info] of importCounts) {
        if (info.count > bestCount) { bestCount = info.count; bestImportId = id; bestLabel = info.label; bestDate = info.date; }
      }
      const key = bestImportId ?? "__no_import__";
      const group = importGroups.get(key);
      if (group) group.patterns.push(pattern);
      else importGroups.set(key, { importId: bestImportId, label: bestLabel, date: bestDate, patterns: [pattern] });
    }
    return [...importGroups.values()]
      .sort((a, b) => {
        if (!a.importId) return 1;
        if (!b.importId) return -1;
        if (a.date && b.date) return new Date(b.date).getTime() - new Date(a.date).getTime();
        return 0;
      })
      .map((g) => ({
        key: g.importId ?? "__no_import__",
        label: g.label,
        sublabel: `${g.patterns.length} mönster${g.date ? ` · importerad ${formatDate(g.date)}` : ""}`,
        patterns: g.patterns,
      }));
  }, [patterns, groupBy, patternScores]);

  return { patternFlags, flaggedIds, patternScores, groups };
}
