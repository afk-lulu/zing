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
 * S2 — Researcher swarm. One Claude call per topic with `web_search` on, at
 * most 3 in parallel (ARCH §2.S2).
 *
 * Research is degradable: ARCH §6 lists live research above `order` in the cut
 * order, so a researcher that fails or times out yields an empty result for
 * that topic and the Planner simply works from the worksheet alone.
 */
export async function POST(request: Request) {
  try {
    const { extraction, difficulty } = await readBody(request, RequestBody);

    const results = await Promise.all(
      extraction.topics.slice(0, 3).map(async (topic) => {
        const research = await askJsonOrNull({
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
          maxSearches: 3,
          effort: 'low',
          maxTokens: 2048,
        });

        return (
          research ?? { topic: topic.topic, concepts: [], misconceptions: [], funFacts: [] }
        );
      }),
    );

    const research: Research = { topics: results };
    return ok({ research });
  } catch (error) {
    return fail(error, 'research');
  }
}
