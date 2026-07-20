interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_API_KEY_PART_1?: string;
  readonly VITE_FIREBASE_API_KEY_PART_2?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ChromeTab {
  id?: number;
  url?: string;
  title?: string;
  favIconUrl?: string;
}

interface ChromeIdentityTokenResult {
  token?: string;
}

interface ChromeRuntime {
  id: string;
  getURL(path: string): string;
}

interface ChromeApi {
  runtime: ChromeRuntime;
  tabs: {
    query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<ChromeTab[]>;
  };
  scripting: {
    executeScript<T>(details: {
      target: { tabId: number };
      func: () => T;
    }): Promise<Array<{ result?: T }>>;
  };
  identity: {
    getAuthToken(details: { interactive: boolean }): Promise<string | ChromeIdentityTokenResult>;
    clearAllCachedAuthTokens?: () => Promise<void>;
  };
  storage: {
    local: {
      get<T extends Record<string, unknown>>(keys?: string[] | Record<string, unknown>): Promise<T>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
}

declare const chrome: ChromeApi;
