import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  carregarOverlay,
  carregarCatalogoEfetivo,
  adicionarProdutos,
  editarProduto,
  removerProduto,
  restaurarProduto
} from "../src/produtosCatalogo.js";

/** Catálogo base fixo usado em todos os testes — imita /assets/catalogo-base.json. */
const BASE_FIXTURE = {
  famNames: ["Medicamento", "Homeopatia", "OTC", "Veterinária", "Não especificado", "DM"],
  products: [
    ["PARACETAMOL 500MG 20 COMP", "1000001", 0],
    ["IBUPROFENO 400MG 20 COMP", "1000002", 0],
    ["SORO FISIOLÓGICO 500ML", "1000003", 2]
  ]
};

function instalarFetchFalso() {
  global.fetch = async (url) => {
    if (String(url).includes("catalogo-base.json")) {
      return { ok: true, json: async () => BASE_FIXTURE };
    }
    throw new Error("URL inesperado no fetch de teste: " + url);
  };
}

/** dataStore falso: guarda o overlay só em memória (equivalente ao asset store por tenant). */
function fakeDataStore() {
  let conteudo = null;
  return {
    async getAsset(key) { assert.equal(key, "catalogoProdutos"); return conteudo; },
    async setAsset(key, content) { assert.equal(key, "catalogoProdutos"); conteudo = content; }
  };
}

describe("produtosCatalogo — catálogo base + overlay por farmácia", () => {
  beforeEach(() => { instalarFetchFalso(); });

  test("sem overlay, o catálogo efetivo é exatamente o catálogo base", async () => {
    const ds = fakeDataStore();
    const cat = await carregarCatalogoEfetivo(ds);
    assert.equal(cat.products.length, 3);
    assert.deepEqual(cat.famNames, BASE_FIXTURE.famNames);
  });

  test("adicionarProdutos acrescenta ao catálogo efetivo sem tocar no catálogo base", async () => {
    const ds = fakeDataStore();
    const catalogoAntes = await carregarCatalogoEfetivo(ds);
    const { adicionados, ignorados } = await adicionarProdutos(ds, [["XAROPE PRÓPRIO DA FARMÁCIA", "custom-1", 2]], catalogoAntes);
    assert.equal(adicionados.length, 1);
    assert.equal(ignorados.length, 0);

    const catalogoDepois = await carregarCatalogoEfetivo(ds);
    assert.equal(catalogoDepois.products.length, 4);
    assert.ok(catalogoDepois.products.some(p => p[1] === "custom-1"));
    // o catálogo base em si (a fixture) nunca é alterado
    assert.equal(BASE_FIXTURE.products.length, 3);
  });

  test("adicionarProdutos ignora um código já existente no catálogo efetivo", async () => {
    const ds = fakeDataStore();
    const catalogoAntes = await carregarCatalogoEfetivo(ds);
    const { adicionados, ignorados } = await adicionarProdutos(ds, [["PARACETAMOL DUPLICADO", "1000001", 0]], catalogoAntes);
    assert.equal(adicionados.length, 0);
    assert.equal(ignorados.length, 1);
  });

  test("editarProduto substitui um produto do catálogo base sem afetar as outras farmácias (o base fica intacto)", async () => {
    const ds = fakeDataStore();
    await editarProduto(ds, "1000002", ["IBUPROFENO 400MG 20 COMP (editado)", "1000002", 0]);
    const cat = await carregarCatalogoEfetivo(ds);
    const editado = cat.products.find(p => p[1] === "1000002");
    assert.equal(editado[0], "IBUPROFENO 400MG 20 COMP (editado)");
    assert.equal(BASE_FIXTURE.products[1][0], "IBUPROFENO 400MG 20 COMP"); // base nunca muda
  });

  test("removerProduto de um produto do catálogo base marca-o como removido só para esta farmácia", async () => {
    const ds = fakeDataStore();
    await removerProduto(ds, "1000003");
    const cat = await carregarCatalogoEfetivo(ds);
    assert.equal(cat.products.length, 2);
    assert.ok(!cat.products.some(p => p[1] === "1000003"));
    assert.equal(BASE_FIXTURE.products.length, 3); // base nunca muda

    const overlay = await carregarOverlay(ds);
    assert.ok(overlay.removidosCodigos.includes("1000003"));
  });

  test("removerProduto de um produto adicionado por esta farmácia apaga-o do overlay (não fica em removidosCodigos)", async () => {
    const ds = fakeDataStore();
    const catalogoAntes = await carregarCatalogoEfetivo(ds);
    await adicionarProdutos(ds, [["PRODUTO PRÓPRIO", "custom-9", 4]], catalogoAntes);
    await removerProduto(ds, "custom-9");
    const cat = await carregarCatalogoEfetivo(ds);
    assert.ok(!cat.products.some(p => p[1] === "custom-9"));
    const overlay = await carregarOverlay(ds);
    assert.ok(!overlay.removidosCodigos.includes("custom-9"));
  });

  test("restaurarProduto repõe um produto do catálogo base que tinha sido removido", async () => {
    const ds = fakeDataStore();
    await removerProduto(ds, "1000001");
    let cat = await carregarCatalogoEfetivo(ds);
    assert.ok(!cat.products.some(p => p[1] === "1000001"));

    await restaurarProduto(ds, "1000001");
    cat = await carregarCatalogoEfetivo(ds);
    assert.ok(cat.products.some(p => p[1] === "1000001"));
  });

  test("uma leitura de overlay corrompida/inválida nunca bloqueia o catálogo — cai para overlay vazio", async () => {
    const ds = { async getAsset() { return "{ isto não é json válido"; }, async setAsset() {} };
    const overlay = await carregarOverlay(ds);
    assert.deepEqual(overlay, { adicionados: [], removidosCodigos: [], editados: {} });
  });
});
