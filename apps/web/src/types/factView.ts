/** UI-facing fact shape: id, text, and optional title/url/section/review_status/is_pinned */
export type FactView = {
  id: string;
  text: string;
  title?: string;
  url?: string;
  section?: string | null;
  review_status?: "PENDING" | "APPROVED" | "FLAGGED" | "REJECTED" | "NEEDS_REVIEW";
  is_pinned?: boolean;
};
