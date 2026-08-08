import { z } from 'zod';
import { askJsonOrNull } from '@/lib/claude';
import { RESEARCHER_SYSTEM, researcherUser } from '@/lib/prompts';
import { fail, ok, readBody } from '@/lib/http';
import { Difficulty, Extraction, TopicResearch, type Research } from '@/lib/schema';

export const runtime = 'nodejs';
export const maxDuration = 120;

const RequestBody = z.object({
  extraction: Extraction,
  difficulty: Difficulty,
});

/**
 * Soft deadline for the whole researcher fan-out.
 *
 * ARCH §2 budgets this stage at ~15s inside a total of <45s (PRD §10), and the
 * stage costs whatever the *slowest* of three parallel researchers costs —
 * measured at 15.0–19.2s across real runs, which pushed totals to 44–47s with
 * no margin left. Deadlining at 14s is not really about the ~5s it saves: it
 * caps the variance, so the stage costs at most 14s every time instead of
 * usually-15-sometimes-19.
 *
 * A researcher still in flight when this passes is abandoned and its topic goes
 * to the Planner with whatever the Extractor already knows — which is the
 * degrade ARCH §6's cut order allows ("live research" is cut above `order`).
 * Raise it only with the 45s total in hand; every millisecond here is a
 * millisecond S3 and S4 do not have.
 */
const RESEARCH_DEADLINE_MS = 14_000;

/** Marks a race the deadline won, so it can be told apart from a real failure. */
const DEADLINE_REACHED = Symbol('research-deadline');

/**
 * S2 — Researcher swarm. One Claude call per topic with `web_search` on, at
 * most 3 in parallel (ARCH §2.S2), all racing one shared deadline.
 *
 * Research is degradable: ARCH §6 lists live research above `order` in the cut
 * order, so a researcher that fails or misses the deadline drops out of the
 * result and the Planner simply works from the worksheet alone for that topic.
 * A topic with no research is *omitted* rather than sent on as an empty shell —
 * /api/compose looks its research up by topic (`researchByTopic.get`) and both
 * writer prompts already take `TopicResearch | undefined`, so an absent entry is
 * the case the downstream code is written for, while an empty shell would put a
 * bare, contentless bullet under "Research:" in the Planner prompt.
 *
 * All three missing is a valid, if duller, outcome: the stage returns
 * `{ topics: [] }` and the batch is built from the worksheet.
 */
export async function POST(request: Request) {
  try {
    const { extraction, difficulty } = await readBody(request, RequestBody);

    const topics = extraction.topics.slice(0, 3);
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    // One deadline shared by the whole fan-out, started with it: the budget is
    // the stage's, not each researcher's, so a slow one cannot spend a fresh 14s
    // of it. Fast researchers still return their full result.
    const deadline = new Promise<typeof DEADLINE_REACHED>((resolve) => {
      deadlineTimer = setTimeout(() => resolve(DEADLINE_REACHED), RESEARCH_DEADLINE_MS);
    });

    let results: (TopicResearch | null)[];
    try {
      results = await Promise.all(
        topics.map(async (topic) => {
          const outcome = await Promise.race([
            askJsonOrNull({
              agent: `researcher:${topic.topic}`,
              system: RESEARCHER_SYSTEM,
              user: researcherUser(
                topic.topic,
                topic.subject,
                topic.problems,
                extraction.gradeBand,
                difficulty,
              ),
              schema: TopicResearch,
              webSearch: true,
              // One search each. Every extra search is another model turn inside
              // the server-side tool loop, and three of them cost ~25s of the ~15s
              // ARCH §2 gives this whole stage — the swarm survives, the budget
              // does not (measured: 3 searches ≈ 40s, 1 search ≈ 10s).
              maxSearches: 1,
              effort: 'low',
              maxTokens: 1024,
            }),
            deadline,
          ]);

          // Loudly, both ways: a silently thinner batch is a quality regression
          // nobody notices. The abandoned call is left to finish into the void —
          // `askJsonOrNull` never rejects, so nothing is left unhandled.
          if (outcome === DEADLINE_REACHED) {
            console.warn(
              `[zing:research] dropped ${topic.topic} at deadline (${RESEARCH_DEADLINE_MS}ms) — planning it from the worksheet alone`,
            );
            return null;
          }
          if (!outcome) {
            console.warn(`[zing:research] dropped ${topic.topic} — researcher returned nothing`);
            return null;
          }
          return outcome;
        }),
      );
    } finally {
      clearTimeout(deadlineTimer);
    }

    const researched = results.filter((entry): entry is TopicResearch => entry !== null);
    if (researched.length < topics.length) {
      console.warn(`[zing:research] ${researched.length}/${topics.length} topics researched`);
    }

    const research: Research = { topics: researched };
    return ok({ research });
  } catch (error) {
    return fail(error, 'research');
  }
}
