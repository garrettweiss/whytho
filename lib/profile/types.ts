import type { Enums, Tables } from "@/types/database";

export type ProfilePeriod = "week" | "month" | "year" | "all";

export type PublicProfilePolitician = Pick<Tables<"politicians">,
  "id" | "slug" | "full_name" | "office" | "state" | "party" | "district" |
  "bio" | "photo_url" | "website_url" | "social_handles" | "verification_tier" |
  "is_active" | "is_test" | "politician_type" | "is_candidate" | "candidate_office" |
  "candidate_election_year" | "incumbent_challenge" | "candidate_status" | "election_date"
>;

export type ProfileAnswerMedia = {
  id: string;
  media_type: "image" | "video" | "audio";
  public_url: string;
  file_name: string | null;
};

export type ProfileSource = { url?: string; title?: string; date?: string };

export type ProfileAnswer = {
  id: string;
  answer_type: Enums<"answer_type">;
  body: string;
  is_ai_generated: boolean;
  ai_confidence: Enums<"ai_confidence"> | null;
  sources: ProfileSource[];
  is_disputed: boolean;
  created_at: string;
  answer_media: ProfileAnswerMedia[];
};

export type ProfileQuestion = {
  id: string;
  body: string;
  net_upvotes: number;
  is_seeded: boolean;
  source: string | null;
  status: Enums<"question_status">;
  created_at: string;
  week_number: number;
  x_posts: { author_handle: string; author_name: string | null; tweet_url: string } | null;
  answers: ProfileAnswer[];
};

export type PublicProfileData = {
  politician: PublicProfilePolitician;
  currentWeekNumber: number;
  isHistoricalView: boolean;
  viewingWeekNumber: number;
  period: ProfilePeriod;
  questions: ProfileQuestion[];
  totalQuestions: number;
  qualifyingQuestions: number;
  answeredQualifying: number;
  officialAnsweredQuestions: number;
  responseRate: number | null;
  archiveWeeks: number[];
  questionLimit: number;
};

export type ProfileView = Pick<PublicProfileData,
  "currentWeekNumber" | "isHistoricalView" | "viewingWeekNumber" | "period"
>;

export type ProfileMetadata = Pick<PublicProfilePolitician,
  "full_name" | "office" | "state" | "party" | "photo_url" | "bio" | "is_test"
>;
