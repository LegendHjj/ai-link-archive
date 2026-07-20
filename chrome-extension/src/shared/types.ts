export type LinkStatus = "unread" | "read" | "archived";
export type ItemType = "link" | "note";
export type Category = string;

export interface UserProfile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface LinkItem {
  id: string;
  type: ItemType;
  url: string;
  title: string;
  domain: string;
  category: Category;
  source: SourceType;
  tags: string[];
  notes: string;
  favorite: boolean;
  status: LinkStatus;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface AppSettings {
  version: 1;
  categories: Category[];
  tags: string[];
  updatedAt: number;
}

export type SourceType =
  | "Web"
  | "GitHub"
  | "YouTube"
  | "X"
  | "Paper"
  | "Docs"
  | "Notion"
  | "Note";

export interface CapturedPage {
  url: string;
  title: string;
  description: string;
  favicon: string;
  image: string;
  domain: string;
}

export interface LinkInput {
  url: string;
  title: string;
  description: string;
  category: Category;
  tags: string[];
  note: string;
}

export interface DuplicateCandidate {
  id: string;
  url: string;
  deletedAt?: number;
}
