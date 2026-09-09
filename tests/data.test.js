process.env.AUTH_JWT_SECRET = "segredo-de-teste-bem-comprido-0123456789";

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../netlify/functions/data.js";
import { signToken } from "../netlify/functions/_lib/auth.js";
import { fakeStoreFactory } from "./_fakeStore.js";

const tokenA = signToken({ tenantId: "tenant-A", email: "a@x.pt", nomeFarmacia: "Farmácia A" });
const tokenB = signToken({ tenantId: "tenant-B", email: "b@x.pt", nomeFarmacia: "Farmácia B" });

function reqGet(token) {
  return new Request("https://site.netlify.app/api/data", {
    method: "GET", headers: token ? { authorization: `Bearer ${token}` } : {}
  });
}
function reqPut(token, body) {
  return new Request("https://site.netlify.app/api/data", {
    method: "PUT", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
}

describe("/api/data — autenticação", () => {
  test("sem token devolve 401", async () => {
    const { getStoreImpl } = fakeStoreFactory();
    const res = await handleRequest(reqGet(null), getStoreImpl);
    assert.equal(res.status, 401);
  });
});

describe("/api/data — isolamento entre farmácias", () => {
  test("cada tenant só vê e grava o seu próprio estado", async () => {
    const { getStoreImpl, blobs } = fakeStoreFactory();

    const payloadA = { servicos: [{ id: "1", nome: "Serviço A" }], categorias: [], config: {} };
    const resPutA = await handleRequest(reqPut(tokenA, payloadA), getStoreImpl);
    assert.equal(resPutA.status, 200);

    const payloadB = { servicos: [{ id: "2", nome: "Serviço B" }], categorias: [], config: {} };
    await handleRequest(reqPut(tokenB, payloadB), getStoreImpl);

    const resGetA = await handleRequest(reqGet(tokenA), getStoreImpl);
    assert.deepEqual(await resGetA.json(), payloadA);

    const resGetB = await handleRequest(reqGet(tokenB), getStoreImpl);
    assert.deepEqual(await resGetB.json(), payloadB);

    // as chaves no armazenamento subjacente estão mesmo separadas por tenant
    assert.ok(blobs.has("estado:tenant-A"));
    assert.ok(blobs.has("estado:tenant-B"));
  });

  test("estado vazio por omissão para um tenant novo", async () => {
    const { getStoreImpl } = fakeStoreFactory();
    const res = await handleRequest(reqGet(tokenA), getStoreImpl);
    assert.deepEqual(await res.json(), { servicos: [], categorias: [], config: {} });
  });
});

describe("/api/data — merge de estado entre módulos", () => {
  test("um PUT que não conhece um campo de outro módulo não o apaga", async () => {
    const { getStoreImpl, blobs } = fakeStoreFactory();

    // Um módulo (ex. Manipulados) grava a sua fatia própria por cima do estado atual.
    await handleRequest(reqPut(tokenA, { servicos: [], categorias: [], config: {}, manipulados: [{ id: "m1" }] }), getStoreImpl);

    // O painel principal, que não sabe nada de "manipulados", grava só o que conhece.
    await handleRequest(reqPut(tokenA, { servicos: [{ id: "s1" }], categorias: [{ id: "c1" }], config: { tema: "escuro" } }), getStoreImpl);

    const res = await handleRequest(reqGet(tokenA), getStoreImpl);
    const estado = await res.json();
    assert.deepEqual(estado.servicos, [{ id: "s1" }]);
    assert.deepEqual(estado.categorias, [{ id: "c1" }]);
    assert.deepEqual(estado.config, { tema: "escuro" });
    assert.deepEqual(estado.manipulados, [{ id: "m1" }]); // preservado, não foi apagado
  });
});

describe("/api/data — validação e métodos", () => {
  test("rejeita corpo inválido (400)", async () => {
    const { getStoreImpl } = fakeStoreFactory();
    const res = await handleRequest(reqPut(tokenA, { foo: "bar" }), getStoreImpl);
    assert.equal(res.status, 400);
  });

  test("método não suportado devolve 405", async () => {
    const { getStoreImpl } = fakeStoreFactory();
    const req = new Request("https://site.netlify.app/api/data", { method: "DELETE", headers: { authorization: `Bearer ${tokenA}` } });
    const res = await handleRequest(req, getStoreImpl);
    assert.equal(res.status, 405);
  });
});
