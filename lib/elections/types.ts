export type ElectionOffice = "all" | "governor" | "senate" | "house" | "state-senate" | "state-house" | "mayor" | "president";
export type ElectionPeriod = "upcoming" | "past" | "all";
export type ElectionFilters = { office: ElectionOffice; state: string; period: ElectionPeriod; page: number };
export type ElectionSearchParams = { filter?: string | string[]; state?: string | string[]; period?: string | string[]; page?: string | string[] };

export type ElectionRace = {
  id: string;
  slug: string;
  name: string;
  office: string;
  state: string;
  district: string | null;
  election_date: string;
  election_type: string;
  party: string | null;
  status: string;
  incumbent_id: string | null;
};

export type ElectionCandidate = {
  id: string;
  slug: string;
  full_name: string;
  photo_url: string | null;
  office: string | null;
  state: string | null;
  party: string | null;
  candidate_status: string | null;
  is_active: boolean;
  race_id: string | null;
};

export type ElectionDirectory = {
  races: (ElectionRace & { candidateCount: number })[];
  total: number;
};
export type ElectionDetail = {
  race: ElectionRace;
  candidates: ElectionCandidate[];
  totalCandidates: number;
  recordedOfficeholder: ElectionCandidate | null;
};
