declare module '../../server/middleware/security.mjs' {
  export function sanitizeString(val: string): string;
  export function detectSqlInjection(val: string): boolean;
  export function sanitizeDeep<T>(data: T): { clean: T; hasSqli: boolean };
  export function inputSanitizer(req: any, res: any, next: any): void;
}
