import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';

export class StageError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly stage?: string,
    /**
     * Set when the failure was the provider shedding load (429, 5xx) rather
     * than anything wrong with the request — the caller may sensibly try again.
     */
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'StageError';
  }
}

/** 429 and 5xx are "come back later"; 4xx means the request itself is wrong. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function ok<T>(data: T): NextResponse {
  return NextResponse.json(data as object, { status: 200 });
}

export function fail(error: unknown, stage: string): NextResponse {
  const status = error instanceof StageError ? error.status : 500;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[zing:${stage}]`, message);
  // The app treats any non-200 as "go to the bundled fallback batch" (ARCH §5).
  return NextResponse.json({ error: message, stage }, { status });
}

/** Parses a JSON request body against a schema, turning failures into 400s. */
export async function readBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new StageError('request body must be JSON', 400);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new StageError(`invalid request body: ${formatIssues(parsed.error)}`, 400);
  }
  return parsed.data;
}

export function formatIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new StageError(`missing environment variable ${name}`, 500);
  return value;
}
