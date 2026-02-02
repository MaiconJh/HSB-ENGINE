export type HostStore = {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
};

export type HostAdapter = {
  store: HostStore;
  // listModules(): Promise<string[]>; // NOT IMPLEMENTED
  // readFile(path: string): Promise<string>; // NOT IMPLEMENTED
  // writeFile(path: string, contents: string): Promise<void>; // NOT IMPLEMENTED
};
