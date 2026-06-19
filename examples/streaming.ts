/**
 * Streaming a message with the accumulating helper.
 *
 *   SIMSE_API_KEY=sk_... npx tsx examples/streaming.ts
 */
import { Simse } from "@telordev/simse";

const client = new Simse();

async function main() {
  const stream = client.messages.stream({
    model: "zoysia",
    max_tokens: 512,
    messages: [{ role: "user", content: "Write a haiku about gateways." }],
  });

  // 1) Event-style: print text as it arrives.
  stream.on("text", (delta) => process.stdout.write(delta));

  // 2) Await the fully-accumulated Message.
  const final = await stream.finalMessage();
  console.log("\n---");
  console.log("final usage:", final.usage);
  console.log("stop_reason:", final.stop_reason);

  // Alternatively, iterate the text-only stream:
  //   for await (const chunk of stream.textStream) process.stdout.write(chunk);
  // or the typed event stream:
  //   for await (const event of stream) console.log(event.type);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
