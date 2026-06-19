/**
 * Read the rich usage dashboard and the subagent run history.
 *
 *   SIMSE_API_KEY=sk_... npx tsx examples/usage-and-agents.ts
 */
import { Simse } from "@telordev/simse";

const client = new Simse();

async function main() {
  // The rich UsagePanel view (per-model split + billing block + compute window).
  const dash = await client.usage.dashboard();
  console.log(`Plan: ${dash.plan} (period start ${dash.periodStart})`);
  for (const m of dash.models) {
    const included = m.includedInputTokens + m.includedOutputTokens;
    const extra = m.extraInputTokens + m.extraOutputTokens;
    console.log(
      `  ${m.model.padEnd(8)} included=${included} extra=${extra} ` +
        `requests=${m.requestCount} x${m.multiplier}`,
    );
  }
  console.log(
    `Credits: ${dash.billing.creditsBalanceCents}¢ · extra spend ` +
      `${dash.billing.extraSpendThisPeriodCents}¢ this period`,
  );
  const session = dash.compute?.session?.current;
  if (session) {
    console.log(
      `Compute session: ${session.state} (${session.usedMs}/${session.limitMs} ms)`,
    );
  }

  // The subagent run history (newest first).
  const { agents } = await client.agents.list();
  console.log(`\n${agents.length} subagent runs:`);
  for (const a of agents) {
    console.log(
      `  ${a.id.padEnd(10)} ${a.status.padEnd(10)} ${a.description}` +
        (a.error ? ` — error: ${a.error}` : ""),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
