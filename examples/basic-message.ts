/**
 * Basic non-streaming message.
 *
 *   SIMSE_API_KEY=sk_... npx tsx examples/basic-message.ts
 */
import { Simse } from "@telordev/simse";

const client = new Simse({
  // apiKey defaults to SIMSE_API_KEY / ANTHROPIC_API_KEY from the environment.
});

async function main() {
  const message = await client.messages.create({
    model: "zoysia",
    max_tokens: 512,
    system: "You are a concise assistant.",
    messages: [{ role: "user", content: "Give me three uses for warm wool." }],
  });

  for (const block of message.content) {
    if (block.type === "text") console.log(block.text);
  }
  console.log("---");
  console.log("stop_reason:", message.stop_reason);
  console.log("usage:", message.usage);
  console.log("request id:", message._request_id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
