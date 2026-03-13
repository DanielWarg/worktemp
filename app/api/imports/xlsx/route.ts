import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionAccountId } from "@/lib/auth";
import * as XLSX from "xlsx";

// Known column name mappings (Swedish Dynamics 365 export)
const COL_MAP: Record<string, string[]> = {
  caseNumber: ["Ärendenummer", "Case Number", "CaseNumber", "ticketnumber"],
  title: ["Ärenderubrik", "Title", "Subject"],
  account: ["Kontonamn", "Account", "Customer", "Company"],
  contact: ["Kontakt", "Contact"],
  description: ["Beskrivning", "Description"],
  caseType: ["Ärendetyp", "Case Type"],
  supportType: ["Supporttyp", "Support Type"],
  status: ["Statusorsak", "Status", "Status Reason"],
  priority: ["Prioritet", "Priority"],
  owner: ["Ägare", "Owner", "Assigned To"],
  createdAt: ["Skapad den", "Created On", "Created"],
  lastActivity: ["Senaste aktivitet", "Last Activity"],
  product: ["SAB/Pren", "Product", "Category"],
};

function findColumn(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headers.findIndex(
      (h) => h?.trim().toLowerCase() === alias.toLowerCase()
    );
    if (idx >= 0) return idx;
  }
  return -1;
}

type ParsedRow = {
  caseNumber: string;
  title: string;
  account: string;
  contact: string;
  description: string;
  caseType: string;
  supportType: string;
  status: string;
  priority: string;
  owner: string;
  createdAt: string | null;
  product: string;
};

function parseRows(sheet: XLSX.WorkSheet): {
  rows: ParsedRow[];
  headers: string[];
} {
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
  if (raw.length < 2) return { rows: [], headers: [] };

  const headers = (raw[0] as string[]).map((h) =>
    typeof h === "string" ? h.replace(/^\(Ändra inte\)\s*/i, "").trim() : ""
  );

  const colIdx: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(COL_MAP)) {
    colIdx[key] = findColumn(headers, aliases);
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i] as string[];
    if (!r || r.length === 0) continue;

    const get = (key: string) => {
      const idx = colIdx[key];
      if (idx < 0 || idx >= r.length) return "";
      const val = r[idx];
      if (val == null) return "";
      if (typeof val === "object" && "toISOString" in (val as object)) return (val as Date).toISOString();
      return String(val).trim();
    };

    const title = get("title");
    if (!title) continue;

    rows.push({
      caseNumber: get("caseNumber"),
      title,
      account: get("account"),
      contact: get("contact"),
      description: get("description"),
      caseType: get("caseType"),
      supportType: get("supportType"),
      status: get("status"),
      priority: get("priority"),
      owner: get("owner"),
      createdAt: get("createdAt") || null,
      product: get("product"),
    });
  }

  return { rows, headers };
}

// POST /api/imports/xlsx — upload and parse xlsx, preview or commit
export async function POST(request: Request) {
  const accountId = getSessionAccountId();
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const workspaceId = formData.get("workspaceId") as string | null;
  const mode = (formData.get("mode") as string) ?? "preview";
  const teamId = formData.get("teamId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames.find(
    (n) => !n.toLowerCase().includes("hidden")
  );
  if (!sheetName) {
    return NextResponse.json({ error: "No valid sheet found" }, { status: 400 });
  }

  const { rows, headers } = parseRows(workbook.Sheets[sheetName]);

  if (mode === "preview") {
    // Return parsed summary without saving
    const owners = [...new Set(rows.map((r) => r.owner).filter(Boolean))];
    const accounts = [...new Set(rows.map((r) => r.account).filter(Boolean))];
    const statuses = [...new Set(rows.map((r) => r.status).filter(Boolean))];
    const types = [
      ...new Set(
        rows.map((r) => r.supportType || r.caseType).filter(Boolean)
      ),
    ];

    return NextResponse.json({
      sheetName,
      headers,
      totalRows: rows.length,
      owners,
      accounts,
      statuses,
      types,
      sampleRows: rows.slice(0, 5).map((r) => ({
        caseNumber: r.caseNumber,
        title: r.title,
        owner: r.owner,
        account: r.account,
        status: r.status,
        priority: r.priority,
      })),
    });
  }

  // Commit mode — save to database
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId required for commit" },
      { status: 400 }
    );
  }

  // Find or create a team for the import
  let targetTeamId = teamId;
  if (!targetTeamId) {
    const team = await prisma.team.create({
      data: {
        workspaceId,
        name: "Support",
        color: "#78b9d9",
      },
    });
    targetTeamId = team.id;
  }

  // Collect unique owner names
  const ownerNames = [...new Set(rows.map((r) => r.owner || "Ej tilldelad"))];

  // Find existing persons in one query
  const existingPersons = await prisma.person.findMany({
    where: { workspaceId, name: { in: ownerNames } },
  });
  const personMap = new Map(existingPersons.map((p) => [p.name, p]));

  // Create missing persons
  let personCount = 0;
  for (const name of ownerNames) {
    if (!personMap.has(name)) {
      const person = await prisma.person.create({
        data: { workspaceId, name, createdById: accountId, roleTitle: "Support" },
      });
      personMap.set(name, person);
      personCount++;
      await prisma.teamMembership.create({
        data: { teamId: targetTeamId, personId: person.id, sortOrder: personCount },
      });
    }
  }

  // Create import record early so we can link challenges
  const importRecord = await prisma.historicalImport.create({
    data: {
      workspaceId,
      importedById: accountId,
      sourceLabel: file.name,
      rawContent: `Imported ${rows.length} rows from ${file.name}`,
      parsedCount: rows.length,
      status: "COMPLETED",
    },
  });

  // Pre-create all unique tags in one pass
  const tagNames = new Set<string>();
  for (const row of rows) {
    if (row.supportType) tagNames.add(row.supportType);
    if (row.priority) tagNames.add(row.priority);
    if (row.account) tagNames.add(row.account);
    if (row.product) tagNames.add(row.product);
  }
  const tagCache = new Map<string, string>();
  for (const tagName of tagNames) {
    const tag = await prisma.tag.upsert({
      where: { workspaceId_name: { workspaceId, name: tagName } },
      create: { workspaceId, name: tagName, source: "IMPORT" },
      update: {},
    });
    tagCache.set(tagName, tag.id);
  }

  // Batch-create all challenges
  const challengeData = rows.map((row) => {
    const person = personMap.get(row.owner || "Ej tilldelad")!;
    return {
      personId: person.id,
      workspaceId,
      importId: importRecord.id,
      contentRaw: row.title + (row.description ? `\n${row.description.slice(0, 500)}` : ""),
      sourceType: "HISTORICAL" as const,
      status: "OPEN" as const,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    };
  });
  await prisma.challenge.createMany({ data: challengeData });
  const challengeCount = challengeData.length;

  // Fetch created challenges to link tags
  const createdChallenges = await prisma.challenge.findMany({
    where: { workspaceId, sourceType: "HISTORICAL" },
    orderBy: { createdAt: "asc" },
    select: { id: true, personId: true, contentRaw: true },
  });

  // Build a lookup for tag linking
  const challengeLookup = new Map<string, string>();
  for (const c of createdChallenges) {
    challengeLookup.set(`${c.personId}:${c.contentRaw.slice(0, 100)}`, c.id);
  }

  // Batch-create challenge-tag links
  const tagLinks: { challengeId: string; tagId: string }[] = [];
  for (const row of rows) {
    const person = personMap.get(row.owner || "Ej tilldelad")!;
    const content = row.title + (row.description ? `\n${row.description.slice(0, 500)}` : "");
    const challengeId = challengeLookup.get(`${person.id}:${content.slice(0, 100)}`);
    if (!challengeId) continue;

    const tags: string[] = [];
    if (row.supportType) tags.push(row.supportType);
    if (row.priority) tags.push(row.priority);
    if (row.account) tags.push(row.account);
    if (row.product) tags.push(row.product);

    for (const t of tags) {
      const tagId = tagCache.get(t);
      if (tagId) tagLinks.push({ challengeId, tagId });
    }
  }
  if (tagLinks.length > 0) {
    await prisma.challengeTag.createMany({ data: tagLinks, skipDuplicates: true });
  }

  // Update lastActiveAt for all persons
  await prisma.person.updateMany({
    where: { id: { in: [...personMap.values()].map((p) => p.id) } },
    data: { lastActiveAt: new Date() },
  });

  return NextResponse.json(
    {
      importId: importRecord.id,
      challengeCount,
      personCount,
      teamId: targetTeamId,
    },
    { status: 201 }
  );
}
