export type DirectoryFilters = {
  q: string;
  state: string;
  office: string;
  scope?: "national" | "state" | "executive";
};

export type DirectoryPerson = {
  id: string;
  slug: string;
  full_name: string;
  politician_type: string;
  is_candidate: boolean;
  incumbent_challenge: string | null;
  office: string | null;
  state: string | null;
  party: string | null;
  photo_url: string | null;
  questionCount: number;
  // Published response records for this question cohort, not distinct questions.
  replyCount: number;
};

export type DirectoryPage = {
  people: DirectoryPerson[];
  nextCursor: string | null;
  weekNumber: number;
};

export class DirectoryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectoryInputError";
  }
}

export const DIRECTORY_PAGE_SIZE = 24;
