export type RankingPolitician = {
  id: string;
  slug: string;
  full_name: string;
  office: string | null;
  state: string | null;
  party: string | null;
  photo_url: string | null;
  is_active: boolean;
  is_test: boolean;
  is_candidate: boolean;
  politician_type: string;
};

export type RankingQuestion = {
  id: string;
  politician_id: string;
  week_number: number;
  net_upvotes: number;
  status: string;
  politicians: RankingPolitician | null;
};

export type OfficialAnswerReference = {
  id: string;
  question_id: string;
  politician_id: string;
  answer_type: string;
  is_ai_generated: boolean;
  is_draft: boolean;
};

export type LeaderboardEntry = Omit<RankingPolitician, "is_active" | "is_test"> & {
  qualifyingQuestions: number;
  answeredQualifying: number;
  responseRate: number;
  rank: number;
};

export type LeaderboardData = {
  weekNumber: number;
  entries: LeaderboardEntry[];
  totalQualifyingQuestions: number;
  totalAnsweredQuestions: number;
  generatedAt: string;
};
