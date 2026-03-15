// CRM provider adapters — fetch ticket counts by category

const MAX_PAGES = 10; // Safety cap to prevent infinite loops

export type CrmTicketCategory = {
  category: string;
  ticketCount: number;
  avgResolutionHours?: number;
};

export type CrmSyncResult = {
  categories: CrmTicketCategory[];
  totalFetched?: number;
  error?: string;
};

function groupByCategory(
  tickets: { category: string }[],
): CrmTicketCategory[] {
  const groups = new Map<string, number>();
  for (const t of tickets) {
    groups.set(t.category, (groups.get(t.category) ?? 0) + 1);
  }
  return Array.from(groups.entries()).map(([category, ticketCount]) => ({
    category,
    ticketCount,
  }));
}

async function syncFreshdesk(
  baseUrl: string,
  apiKey: string,
): Promise<CrmSyncResult> {
  const headers = {
    Authorization: `Basic ${btoa(apiKey + ":X")}`,
    "Content-Type": "application/json",
  };

  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const allTickets: { category: string }[] = [];
    let page = 1;

    while (page <= MAX_PAGES) {
      const url = `${baseUrl}/api/v2/tickets?updated_since=${since}&per_page=100&page=${page}`;
      const res = await fetch(url, { headers });

      if (!res.ok) {
        return { categories: groupByCategory(allTickets), totalFetched: allTickets.length, error: `Freshdesk API ${res.status} on page ${page}` };
      }

      const tickets = (await res.json()) as { type: string | null }[];
      if (tickets.length === 0) break;

      for (const t of tickets) allTickets.push({ category: t.type || "Övrigt" });
      if (tickets.length < 100) break; // last page
      page++;
    }

    return { categories: groupByCategory(allTickets), totalFetched: allTickets.length };
  } catch (err) {
    return { categories: [], error: String(err) };
  }
}

async function syncZendesk(
  baseUrl: string,
  apiKey: string,
): Promise<CrmSyncResult> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const allTickets: { category: string }[] = [];
    let url: string | null = `${baseUrl}/api/v2/search.json?query=type:ticket created>${since}&per_page=100`;
    let pages = 0;

    while (url && pages < MAX_PAGES) {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        return { categories: groupByCategory(allTickets), totalFetched: allTickets.length, error: `Zendesk API ${res.status}` };
      }

      const data = (await res.json()) as {
        results: { tags: string[] }[];
        next_page: string | null;
      };

      for (const t of data.results) allTickets.push({ category: t.tags[0] || "Övrigt" });
      url = data.next_page;
      pages++;
    }

    return { categories: groupByCategory(allTickets), totalFetched: allTickets.length };
  } catch (err) {
    return { categories: [], error: String(err) };
  }
}

async function syncHubspot(
  _baseUrl: string,
  apiKey: string,
): Promise<CrmSyncResult> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  try {
    const allTickets: { category: string }[] = [];
    let after: string | undefined;
    let pages = 0;

    while (pages < MAX_PAGES) {
      const params = new URLSearchParams({
        limit: "100",
        properties: "hs_pipeline_stage,subject,createdate",
      });
      if (after) params.set("after", after);

      const res = await fetch(
        `https://api.hubapi.com/crm/v3/objects/tickets?${params}`,
        { headers },
      );

      if (!res.ok) {
        return { categories: groupByCategory(allTickets), totalFetched: allTickets.length, error: `HubSpot API ${res.status}` };
      }

      const data = (await res.json()) as {
        results: { properties: { hs_pipeline_stage: string } }[];
        paging?: { next?: { after: string } };
      };

      for (const t of data.results) {
        allTickets.push({ category: t.properties.hs_pipeline_stage || "Övrigt" });
      }

      after = data.paging?.next?.after;
      if (!after || data.results.length < 100) break;
      pages++;
    }

    return { categories: groupByCategory(allTickets), totalFetched: allTickets.length };
  } catch (err) {
    return { categories: [], error: String(err) };
  }
}

export const CRM_PROVIDERS: Record<
  string,
  (baseUrl: string, apiKey: string) => Promise<CrmSyncResult>
> = {
  FRESHDESK: syncFreshdesk,
  ZENDESK: syncZendesk,
  HUBSPOT: syncHubspot,
};
