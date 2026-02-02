export type HostStore = {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
};

export type HostAdapter = {
  store: HostStore;
  fs: {
    listDir(path: string): Promise<string[]>;
    readTextFile(path: string): Promise<string>;
    exists(path: string): Promise<boolean>;
  };
};
