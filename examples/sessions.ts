/**
 * The agentic session loop: create a session, stream a prompt, inspect usage.
 *
 *   SIMSE_API_KEY=sk_... npx tsx examples/sessions.ts
 */
import { Simse } from "@telordev/simse";

const client = new Simse();

async function main() {
  const session = await client.sessions.create({ title: "SDK demo" });
  console.log("session:", session.id);

  const stream = client.sessions.stream(session.id, {
    content: "List the files in the current directory, then summarize them.",
  });

  stream.on("text", (delta) => process.stdout.write(delta));
  stream.on("toolCall", (e) => console.log("\n[tool call]", e));
  stream.on("toolResult", (e) => console.log("[tool result]", e));

  const result = await stream.finalResult();
  console.log("\n---");
  console.log("status:", result.status);
  console.log("usage:", result.usage);

  // Clean up.
  await client.sessions.delete(session.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
