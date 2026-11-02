import { test } from "node:test";
import assert from "node:assert/strict";
import { slot } from "../src/pdf/render.ts";

test("no máximo 3 PDFs gerados ao mesmo tempo, mesmo com pedidos chegando no meio", async () => {
  let now = 0;
  let max = 0;
  const work = (ms: number) =>
    slot(async () => {
      now++;
      max = Math.max(max, now);
      await new Promise((r) => setTimeout(r, ms));
      now--;
      return ms;
    });
  const first = Array.from({ length: 6 }, (_, i) => work(5 + i));
  // Pedidos novos chegando enquanto a fila anda.
  await new Promise((r) => setTimeout(r, 6));
  const later = Array.from({ length: 6 }, () => work(3));
  const done = await Promise.all([...first, ...later]);
  assert.equal(done.length, 12);
  assert.ok(max <= 3, `chegou a ${max} ao mesmo tempo`);
});
