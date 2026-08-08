import Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import { extractJson } from './json';
import { StageError, formatIssues, requireEnv } from './http';
import { isMock, mockAgentResponse } from './mock';

/**
 * Every agent in the swarm is one Claude call. ARCH §0 pins the model to
 * Claude Sonnet 4.6 (vision + web_search); change it here and the whole
 * pipeline moves together.
 */
export const MODEL = 'claude-sonnet-4-6';

/**
 * Effort is set explicitly on every call. Sonnet 4.6 defaults to `high`, which
 * blows the ARCH §2 latency budget (batch playing in <45s) — the swarm is many
 * small, tightly-specified calls, so low/medium is the right trade.
 */
export type Effort = 'low' | 'medium' | 'high';

/**
 * How many times a `pause_turn` may be resumed. Each resume is a whole extra
 * round-trip that re-sends the transcript so far, so this is the single
 * biggest lever on the Researcher swarm's wall clock (ARCH §2 gives S2 15s).
 */
const MAX_RESUMES = 1;

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  }
  return client;
}

export type UserContent = string | Anthropic.ContentBlockParam[];

export interface AskOptions<T> {
  system: string;
  user: UserContent;
  schema: ZodType<T>;
  /** Names the agent in logs and error messages, e.g. "extractor". */
  agent: string;
  maxTokens?: number;
  effort?: Effort;
  /** Turns on the server-side web_search tool (Researcher swarm only). */
  webSearch?: boolean;
  maxSearches?: number;
}

/**
 * One agent call: prompt for bare JSON, pull the JSON out of the reply, and
 * validate it against the stage's schema. Callers decide whether a failure is
 * fatal (Planner) or just drops one group (Writers).
 */
export async function askJson<T>(options: AskOptions<T>): Promise<T> {
  const {
    system,
    user,
    schema,
    agent,
    maxTokens = 4096,
    effort = 'low',
    webSearch = false,
    maxSearches = 3,
  } = options;

  // Mock mode swaps out only the network call — the extract-then-validate path
  // below is the same one production runs.
  const text = isMock()
    ? mockAgentResponse(agent, flattenUser(user))
    : await callClaude({ system, user, agent, maxTokens, effort, webSearch, maxSearches });

  const parsed = schema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new StageError(`${agent} output failed validation — ${formatIssues(parsed.error)}`, 502, agent);
  }
  return parsed.data;
}

async function callClaude(options: Omit<AskOptions<unknown>, 'schema'>): Promise<string> {
  const { system, user, agent, maxTokens = 4096, effort = 'low', webSearch, maxSearches } = options;

  const tools: Anthropic.ToolUnion[] = webSearch
    ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches }]
    : [];

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: user }];
  const started = Date.now();

  let response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort },
    system,
    ...(tools.length ? { tools } : {}),
    messages,
  });

  // A server-side tool loop can hand back `pause_turn`; re-send to resume it.
  // One resume only: the ARCH §2 budget has no room for a search loop that
  // needs several rounds, and the researcher prompt is written so a paused
  // turn still has enough to answer from.
  let resumes = 0;
  for (; response.stop_reason === 'pause_turn' && resumes < MAX_RESUMES; resumes++) {
    messages.push({ role: 'assistant', content: response.content });
    response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      output_config: { effort },
      system,
      ...(tools.length ? { tools } : {}),
      messages,
    });
  }

  logCall(agent, started, response, resumes);

  if (response.stop_reason === 'refusal') {
    throw new StageError(`${agent} declined the request`, 502, agent);
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) {
    throw new StageError(`${agent} returned no text (stop_reason=${response.stop_reason})`, 502, agent);
  }
  return text;
}

/**
 * One line per agent call. The whole latency story of a run is in these lines:
 * which agent, how long, whether the server-side search loop had to be resumed,
 * and how many searches it actually spent (ARCH §2 latency budget).
 */
function logCall(agent: string, started: number, response: Anthropic.Message, resumes: number): void {
  const searches = response.usage?.server_tool_use?.web_search_requests ?? 0;
  const parts = [
    `${Date.now() - started}ms`,
    `stop=${response.stop_reason}`,
    `out=${response.usage.output_tokens}t`,
  ];
  if (searches) parts.push(`searches=${searches}`);
  if (resumes) parts.push(`resumes=${resumes}`);
  console.log(`[zing:timing] ${agent} ${parts.join(' ')}`);
}

/** The mock reads the prompt for its assignment, same as a real writer does. */
function flattenUser(user: UserContent): string {
  if (typeof user === 'string') return user;
  return user
    .map((block) => (block.type === 'text' ? block.text : `[${block.type}]`))
    .join('\n');
}

/** Wraps `askJson` so one failing writer yields `null` instead of killing the fan-out. */
export async function askJsonOrNull<T>(options: AskOptions<T>): Promise<T | null> {
  try {
    return await askJson(options);
  } catch (error) {
    console.error(`[zing:${options.agent}]`, error instanceof Error ? error.message : error);
    return null;
  }
}

export function imageBlock(mediaType: string, base64Data: string): Anthropic.ContentBlockParam {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
      data: base64Data,
    },
  };
}

/** Native PDF understanding — no OCR pass, ≤100pp / 32MB (ARCH §2.S1). */
export function pdfBlock(base64Data: string): Anthropic.ContentBlockParam {
  return {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: base64Data },
  };
}

export function textBlock(text: string): Anthropic.ContentBlockParam {
  return { type: 'text', text };
}
