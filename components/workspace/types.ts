export type NoteData = {
  id: string;
  contentRaw: string;
  createdAt: string;
};

export type AttachmentComment = {
  id: string;
  contentRaw: string;
  createdAt: string;
};

export type AttachmentData = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  comments: AttachmentComment[];
};

export type TagData = {
  id: string;
  name: string;
  color: string | null;
  source: string;
};

export type ImportData = {
  id: string;
  sourceLabel: string;
  createdAt: string;
};

export type ChallengeData = {
  id: string;
  contentRaw: string;
  contentNormalized?: string | null;
  customerName?: string | null;
  sourceType: string;
  status: string;
  createdAt: string;
  sessionId: string | null;
  importId?: string | null;
  import?: ImportData | null;
  tags?: { tag: TagData }[];
};

export type PersonData = {
  id: string;
  name: string;
  roleTitle: string | null;
  summaryText: string | null;
  lastActiveAt: string | null;
  notes: NoteData[];
  attachments: AttachmentData[];
  challenges?: ChallengeData[];
  _count?: { challenges: number };
};

export type MembershipData = {
  id: string;
  personId: string;
  person: PersonData;
  sortOrder: number;
};

export type TeamData = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  memberships: MembershipData[];
};

export type WorkspaceData = {
  id: string;
  name: string;
  systemContext?: string | null;
  teams: TeamData[];
};

export type MeetingSessionData = {
  id: string;
  workspaceId: string;
  teamId: string | null;
  title: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  challenges: ChallengeData[];
  participants: { id: string; personId: string; joinedAt: string }[];
};

export type PatternData = {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  patternType: string;
  source: string;
  status: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  patternChallenges: {
    challenge: ChallengeData & { person: { id: string; name: string } };
  }[];
  suggestions: SuggestionData[];
  crmEvidence?: CrmEvidenceData[];
};

export type SuggestionData = {
  id: string;
  content: string;
  source: string;
  status: string;
  createdAt: string;
};

export type CrmEvidenceData = {
  id: string;
  narrative: string;
  snapshot: {
    id: string;
    snapshotDate: string;
    category: string;
    ticketCount: number;
    avgResolutionHours: number | null;
  };
};

export type CrmConnectionData = {
  id: string;
  provider: string;
  displayName: string;
  baseUrl: string | null;
  lastSyncAt: string | null;
  syncStatus: string;
  isActive: boolean;
};
