process.env.AUTH_JWT_SECRET = "segredo-de-teste-bem-comprido-0123456789";

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../netlify/functions/asset.js";
import { signToken } from "../netlify/functions/_lib/auth.js";
import { fakeStoreFactory } from "./_fakeStore.js";

const tokenA = signToken({ tenantId: "tenant-A", email: "a@x.pt", nomeFarmacia: "Farmácia A" });
const tokenB = signToken({ tenantId: "tenant-B", email: "b@x.pt", nomeFarmacia: "Farmácia B" });

function req(method, key, token, body) {
  return new Request(`https://site.netlify.app/api/asset/${key}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
}
const ctx = (key) => ({ params: { key } });

describe("/api/asset/:key — autenticação e isolamento", () => {
  test("sem token devolve 401", async () => {
    const { getStoreImpl } = fakeStoreFactory();
    const res = await handleRequest(req("GET", "doc1", null), ctx("doc1"), getStoreImpl);
    assert.equal(res.status, 401);
  });

  test("uma farmácia não consegue ler o conteúdo gravado por outra com a mesma chave lógica", async () => {
    const { getStoreImpl, blobs } = fakeStoreFactory();
    await handleRequest(req("PUT", "servico-html:srv1", tokenA, { content: "<p>Conteúdo da farmácia A</p>" }), ctx("servico-html:srv1"), getStoreImpl);

    const resB = await handleRequest(req("GET", "servico-html:srv1", tokenB), ctx("servico-html:srv1"), getStoreImpl);
    assert.equal(resB.status, 404); // tenant B nunca gravou nada com esta chave — nem vê o da A

    const resA = await handleRequest(req("GET", "servico-html:srv1", tokenA), ctx("servico-html:srv1"), getStoreImpl);
    assert.equal(resA.status, 200);
    assert.equal((await resA.json()).content, "<p>Conteúdo da farmácia A</p>");

    assert.ok(blobs.has("asset:tenant-A:servico-html:srv1"));
    assert.ok(!blobs.has("asset:tenant-B:servico-html:srv1"));
  });

  test("DELETE remove só o conteúdo do próprio tenant", async () => {
    const { getStoreImpl } = fakeStoreFactory();
    await handleRequest(req("PUT", "x", tokenA, { content: "conteudo" }), ctx("x"), getStoreImpl);
    await handleRequest(req("DELETE", "x", tokenA), ctx("x"), getStoreImpl);
    const res = await handleRequest(req("GET", "x", tokenA), ctx("x"), getStoreImpl);
    assert.equal(res.status, 404);
  });
});
