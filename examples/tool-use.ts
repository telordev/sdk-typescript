/**
 * Tool use: define a tool, let the model call it, return the result, get the
 * final answer.
 *
 *   SIMSE_API_KEY=sk_... npx tsx examples/tool-use.ts
 */
import { Simse } from "@telordev/simse";
import type { MessageParam, Tool } from "@telordev/simse";

const client = new Simse();

const tools: Tool[] = [
  {
    name: "get_weather",
    description: "Get the current weather for a city.",
    input_schema: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
];

function getWeather(city: string): string {
  // Pretend to call a real weather API.
  return `It is 18°C and sunny in ${city}.`;
}

async function main() {
  const messages: MessageParam[] = [
    { role: "user", content: "What's the weather in San Francisco?" },
  ];

  const first = await client.messages.create({
    model: "zoysia",
    max_tokens: 512,
    tools,
    messages,
  });

  const toolUse = first.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    console.log("Model answered directly:", first.content);
    return;
  }

  console.log("Model requested tool:", toolUse.name, toolUse.input);
  const result = getWeather((toolUse.input as { city: string }).city);

  // Echo the assistant turn + return the tool result.
  messages.push({ role: "assistant", content: first.content });
  messages.push({
    role: "user",
    content: [
      { type: "tool_result", tool_use_id: toolUse.id, content: result },
    ],
  });

  const second = await client.messages.create({
    model: "zoysia",
    max_tokens: 512,
    tools,
    messages,
  });

  for (const block of second.content) {
    if (block.type === "text") console.log("Final:", block.text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
