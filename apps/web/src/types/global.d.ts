declare global {
  interface Window {
    __e2e?: {
      state?: {
        jobs?: Array<{ status: string }>;
        phase?: string;
        [k: string]: unknown;
      };
      rqFetchingCount?: number;
      rqMutatingCount?: number;
      [k: string]: unknown;
    };
  }
}
export {};
