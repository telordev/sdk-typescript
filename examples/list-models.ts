/**
 * List models and retrieve one.
 *
 *   SIMSE_API_KEY=sk_... npx tsx examples/list-models.ts
 */
import { Simse } from "@telordev/simse";

const client = new Simse();

async function main() {
  const { data } = await client.models.list();
  for (const model of data) {
    console.log(
      `${model.id.padEnd(8)} ${model.display_name} (max_input=${model.max_input_tokens}, max_output=${model.max_tokens})`,
    );
  }

  const zoysia = await client.models.retrieve("zoysia");
  console.log("\nDefault model:", zoysia.id, "-", zoysia.display_name);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
