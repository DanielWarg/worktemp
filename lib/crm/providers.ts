// CRM provider adapters — fetch ticket counts by category

export type CrmTicketCategory = {
  category: string;
  ticketCount: number;
  avgResolutionHours?: number;
};

export type CrmSyncResult = {
  categories: CrmTicketCategory[];
  error?: string;
};

async function syncFreshdesk(
  baseUrl: string,
  apiKey: string
): Promise<CrmSyncResult> {
  // Freshdesk API: GET /api/v2/tickets with filters
  const headers = {
    Authorization: `Basic ${btoa(apiKey + ":X")}`,
    "Content-Type": "application/json",
  };

  try {
    // Get tickets updated in last 30 days
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const url = `${baseUrl}/api/v2/tickets?updated_since=${since}&per_page=100`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      return { categories: [], error: `Freshdesk API ${res.status}` };
    }

    const tickets = (await res.json()) as { type: string | null; created_at: string }[];

    // Group by type
    const groups = new Map<string, number>();
    for (const ticket of tickets) {
      const cat = ticket.type || "Övrigt";
      groups.set(cat, (groups.get(cat) ?? 0) + 1);
    }

    return {
      categories: Array.from(groups.entries()).map(([category, ticketCount]) => ({
        category,
        ticketCount,
      })),
    };
  } catch (err) {
    return { categories: [], error: String(err) };
  }
}

async function syncZendesk(
  baseUrl: string,
  apiKey: string
): Promise<CrmSyncResult> {
  // Zendesk API: search tickets
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const url = `${baseUrl}/api/v2/search.json?query=type:ticket created>${since}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      return { categories: [], error: `Zendesk API ${res.status}` };
    }

    const data = (await res.json()) as {
      results: { tags: string[]; created_at: string }[];
    };

    // Group by first tag as category
    const groups = new Map<string, number>();
    for (const ticket of data.results) {
      const cat = ticket.tags[0] || "Övrigt";
      groups.set(cat, (groups.get(cat) ?? 0) + 1);
    }

    return {
      categories: Array.from(groups.entries()).map(([category, ticketCount]) => ({
        category,
        ticketCount,
      })),
    };
  } catch (err) {
    return { categories: [], error: String(err) };
  }
}

async function syncHubspot(
  _baseUrl: string,
  apiKey: string
): Promise<CrmSyncResult> {
  // HubSpot API: search tickets
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  try {
    const res = await fetch(
      "https://api.hubapi.com/crm/v3/objects/tickets?limit=100&properties=hs_pipeline_stage,subject,createdate",
      { headers }
    );

    if (!res.ok) {
      return { categories: [], error: `HubSpot API ${res.status}` };
    }

    const data = (await res.json()) as {
      results: { properties: { hs_pipeline_stage: string; subject: string } }[];
    };

    const groups = new Map<string, number>();
    for (const ticket of data.results) {
      const cat = ticket.properties.hs_pipeline_stage || "Övrigt";
      groups.set(cat, (groups.get(cat) ?? 0) + 1);
    }

    return {
      categories: Array.from(groups.entries()).map(([category, ticketCount]) => ({
        category,
        ticketCount,
      })),
    };
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
