// POST /functions/v1/analyze-interaction  { interactionId, timeZone }
//
// Reads the interaction (as the signed-in user), asks Claude for a structured analysis,
// decides whether the quote's status should change, and saves everything in one transaction.

import { buildAnalyzeRequest, formatWrittenOn, statusToApply } from '../_shared/analyze.ts';
import { callClaude } from '../_shared/claude.ts';
import { z } from '../_shared/deps.ts';
import { aiEndpoint, BadRequestError, productionDeps, unwrap } from '../_shared/http.ts';

const Body = z.object({
  interactionId: z.uuid(),
  timeZone: z.string().max(64).default('UTC'),
});

type InteractionRow = {
  id: string;
  kind: string;
  body: string;
  occurred_at: string;
  client: { name: string };
  quote: { description: string; amount: number; status: string } | null;
};

export default {
  fetch: aiEndpoint(Body, async ({ interactionId, timeZone }, supabase) => {
    const interaction = unwrap(
      await supabase
        .from('interactions')
        .select('id, kind, body, occurred_at, client:clients(name), quote:quotes(description, amount, status)')
        .eq('id', interactionId)
        .maybeSingle()
        // Without generated DB types, supabase-js assumes joined rows are arrays; an
        // interaction has one client and at most one quote, so we state the real shape.
        .overrideTypes<InteractionRow | null, { merge: false }>(),
    );
    if (!interaction) throw new BadRequestError('Interaction not found.');

    const { result: analysis, cacheHit } = await callClaude(
      buildAnalyzeRequest({
        kind: interaction.kind,
        body: interaction.body,
        writtenOn: formatWrittenOn(interaction.occurred_at, timeZone),
        clientName: interaction.client.name,
        quote: interaction.quote,
      }),
      productionDeps(supabase),
    );

    const appliedStatus = unwrap<string | null>(
      await supabase.rpc('apply_interaction_analysis', {
        p_interaction_id: interaction.id,
        p_analysis: analysis,
        p_new_status: statusToApply(analysis, interaction.quote),
      }),
    );

    return { analysis, appliedStatus, cacheHit };
  }),
};
