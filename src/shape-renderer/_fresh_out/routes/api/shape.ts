import { define } from "../../utils.ts";

const SHAPE_PATH = "/Users/raphaelcastro/Documents/programming/shape-checker/assets/canonical-paths.json";

export const handler = define.handlers({
  async GET() {
    const text = await Deno.readTextFile(SHAPE_PATH);
    return new Response(text, {
      headers: { "content-type": "application/json" },
    });
  },
  async PUT(ctx) {
    const text = await ctx.req.text();
    const data = JSON.parse(text);
    const json = JSON.stringify(data, null, 2) + "\n";
    await Deno.writeTextFile(SHAPE_PATH, json);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  },
});
