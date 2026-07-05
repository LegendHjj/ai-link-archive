import type { SourceType } from "./lib/bookmarkUtils";

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

export interface LinkDraft {
  type?: ItemType;
  url?: string;
  title?: string;
  category?: Category;
  tags?: string[];
  notes?: string;
}

export interface AppSettings {
  version: 1;
  categories: Category[];
  tags: string[];
  updatedAt: number;
}

export interface RemoteSyncState {
  linksUpdatedAt: number;
  settingsUpdatedAt: number;
  updatedAt: number;
}

export interface LocalCache {
  version: 3;
  userId?: string;
  profileId?: string;
  links: LinkItem[];
  settings: AppSettings;
  remoteLinksUpdatedAt: number;
  remoteSettingsUpdatedAt: number;
  savedAt: number;
}

export interface ProfilesCache {
  version: 1;
  userId: string;
  profiles: UserProfile[];
  activeProfileId: string;
  savedAt: number;
}
