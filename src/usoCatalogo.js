/**
 * src/usoCatalogo.js — catálogo de "tarefas" rastreáveis para o módulo de
 * Poupança & ROI (ver src/ui/poupanca.js).
 *
 * Cada entrada representa uma tarefa concreta que um módulo/ferramenta da
 * Central regista sempre que é concluída (ver `window.ModuleChrome.registarUso`
 * em assets/module-chrome.js, chamado a partir de cada módulo). Para cada
 * tarefa guardamos duas estimativas de tempo, em segundos:
 *
 *   - tempoManualSeg   — quanto tempo a mesma tarefa levaria feita à mão,
 *                         sem a Central (o "antes").
 *   - tempoCentralSeg  — quanto tempo leva feita através da Central (o
 *                         "depois").
 *
 * A diferença é o tempo poupado por cada ocorrência. Estas são estimativas
 * de referência, propositadamente conservadoras e explicáveis a uma farmácia
 * — não medições cronometradas. Podem ser ajustadas por farmácia em
 * Configurações → Poupança & ROI (guardadas em `config.usoEstimativas`,
 * como overrides parciais sobre este catálogo — ver `estimativaEfetiva`).
 *
 * A chave de uma tarefa é sempre `${modulo}.${tarefaId}` (ver `chaveTarefa`).
 * `modulo` usa sempre o mesmo id que já existe em `MODULOS_ATALHOS`
 * (src/domain.js), para que o catálogo, os atalhos e os separadores da
 * navegação estejam sempre alinhados.
 */

export const TAREFAS_CATALOGO = [
  // ---------------------------------------------------------------- PIM
  { modulo: "pim", tarefaId: "criar_utente", nome: "Criar ficha de utente", tempoManualSeg: 180, tempoCentralSeg: 40 },
  { modulo: "pim", tarefaId: "criar_rotulo", nome: "Criar Rótulo (plano semanal)", tempoManualSeg: 600, tempoCentralSeg: 120 },
  { modulo: "pim", tarefaId: "reimprimir_rotulo", nome: "Reimprimir Rótulo", tempoManualSeg: 300, tempoCentralSeg: 15 },
  { modulo: "pim", tarefaId: "registar_receita", nome: "Registar receita sem papel", tempoManualSeg: 120, tempoCentralSeg: 30 },
  { modulo: "pim", tarefaId: "criar_evento", nome: "Agendar evento no calendário", tempoManualSeg: 60, tempoCentralSeg: 20 },
  { modulo: "pim", tarefaId: "alerta_terminar", nome: "Alerta automático de Rótulo a terminar", tempoManualSeg: 300, tempoCentralSeg: 5 },

  // ------------------------------------------------------------ Gabinete
  { modulo: "gabinete", tarefaId: "atualizar_stock", nome: "Atualizar stock/validade", tempoManualSeg: 90, tempoCentralSeg: 30 },
  { modulo: "gabinete", tarefaId: "criar_relatorio", nome: "Criar relatório de atendimento", tempoManualSeg: 600, tempoCentralSeg: 180 },
  { modulo: "gabinete", tarefaId: "relatorio_pdf_email", nome: "Enviar relatório em PDF por email", tempoManualSeg: 300, tempoCentralSeg: 10 },
  { modulo: "gabinete", tarefaId: "scan_gs1", nome: "Ler código GS1 (lote/validade)", tempoManualSeg: 60, tempoCentralSeg: 5 },
  { modulo: "gabinete", tarefaId: "checklist", nome: "Concluir checklist diária", tempoManualSeg: 180, tempoCentralSeg: 60 },

  // --------------------------------------------------------- Manipulados
  { modulo: "manipulados", tarefaId: "criar_pedido", nome: "Criar pedido de manipulado", tempoManualSeg: 300, tempoCentralSeg: 90 },
  { modulo: "manipulados", tarefaId: "marcar_entregue", nome: "Marcar pedido como entregue", tempoManualSeg: 60, tempoCentralSeg: 10 },
  { modulo: "manipulados", tarefaId: "enviar_orcamento", nome: "Enviar orçamento", tempoManualSeg: 180, tempoCentralSeg: 30 },

  // ----------------------------------------------------------- Documentos
  { modulo: "documentos", tarefaId: "gerar_declaracao", nome: "Gerar declaração oficial", tempoManualSeg: 480, tempoCentralSeg: 60 },
  { modulo: "documentos", tarefaId: "gerar_etiqueta", nome: "Gerar etiquetas", tempoManualSeg: 300, tempoCentralSeg: 45 },
  { modulo: "documentos", tarefaId: "gerar_bolacha", nome: "Gerar bolacha promocional", tempoManualSeg: 240, tempoCentralSeg: 30 },
  { modulo: "documentos", tarefaId: "gerar_lista_inscricao", nome: "Gerar lista de inscrição", tempoManualSeg: 180, tempoCentralSeg: 30 },
  { modulo: "documentos", tarefaId: "gerar_lombada", nome: "Gerar lombada", tempoManualSeg: 120, tempoCentralSeg: 20 },
  { modulo: "documentos", tarefaId: "arquivar_documento", nome: "Arquivar documento", tempoManualSeg: 90, tempoCentralSeg: 15 },

  // ---------------------------------------------------------------- AUE
  { modulo: "aue", tarefaId: "criar_pedido", nome: "Criar pedido AUE", tempoManualSeg: 600, tempoCentralSeg: 150 },
  { modulo: "aue", tarefaId: "atualizar_pedido", nome: "Atualizar estado do pedido", tempoManualSeg: 60, tempoCentralSeg: 15 },

  // ------------------------------------------------------- Stocks Errados
  { modulo: "stocks", tarefaId: "criar_lista", nome: "Criar lista de stocks errados", tempoManualSeg: 60, tempoCentralSeg: 20 },
  { modulo: "stocks", tarefaId: "registar_item", nome: "Registar item com stock errado", tempoManualSeg: 90, tempoCentralSeg: 30 },
  { modulo: "stocks", tarefaId: "exportar_lista", nome: "Exportar lista (Excel/PDF)", tempoManualSeg: 600, tempoCentralSeg: 20 },

  // -------------------------------------------------------------- Reservas
  { modulo: "reservas", tarefaId: "gerar_folha", nome: "Gerar folha de reservas", tempoManualSeg: 900, tempoCentralSeg: 60 },

  // ---------------------------------------------------------------- Medela
  { modulo: "medela", tarefaId: "gerar_contrato", nome: "Gerar contrato de aluguer", tempoManualSeg: 600, tempoCentralSeg: 90 },

  // ----------------------------------------------------------- Conversor PDF
  { modulo: "conversor-pdf", tarefaId: "converter_ficheiro", nome: "Converter/fundir ficheiro", tempoManualSeg: 300, tempoCentralSeg: 30 },

  // ------------------------------------------------------- Devolução de Frio
  { modulo: "devolucao-frio", tarefaId: "gerar_declaracao", nome: "Gerar declaração de devolução de frio", tempoManualSeg: 480, tempoCentralSeg: 90 },

  // --------------------------------------------------- Mapa Cardiovascular
  { modulo: "mapa-cardiovascular", tarefaId: "gerar_mapa", nome: "Gerar mapa/consentimento MAPA 48h", tempoManualSeg: 600, tempoCentralSeg: 120 },

  // ------------------------------------------------ Devoluções Armazenistas
  { modulo: "devolucoes-armazenistas", tarefaId: "consultar_regra", nome: "Consultar regra de devolução", tempoManualSeg: 180, tempoCentralSeg: 10 },
  { modulo: "devolucoes-armazenistas", tarefaId: "verificar_lote", nome: "Verificar produto em lote (por produto)", tempoManualSeg: 30, tempoCentralSeg: 2 },

  // ------------------------------------------------------ Catálogo Produtos
  { modulo: "catalogo-produtos", tarefaId: "adicionar_produto", nome: "Adicionar produto ao catálogo", tempoManualSeg: 60, tempoCentralSeg: 20 },
  { modulo: "catalogo-produtos", tarefaId: "importar_produtos", nome: "Importar produto em lote (por produto)", tempoManualSeg: 60, tempoCentralSeg: 5 }
];

/** Nomes amigáveis dos módulos — mesmos usados em MODULOS_ATALHOS (src/domain.js)
 *  e em src/ui/main-content.js, repetidos aqui para este ficheiro não depender
 *  deles (evita import cruzado desnecessário; mantém-se sincronizado à mão
 *  sempre que um módulo novo for adicionado). */
export const MODULOS_NOMES = {
  manipulados: "Manipulados", documentos: "Documentos", gabinete: "Gestão de Gabinete", pim: "Gestão de PIM",
  aue: "Pedidos AUE", stocks: "Stocks Errados", reservas: "Reservas", medela: "Aluguer Medela",
  "conversor-pdf": "Conversor de PDF", "devolucao-frio": "Devolução de Frio",
  "mapa-cardiovascular": "Mapa Cardiovascular", "devolucoes-armazenistas": "Devoluções a Armazenistas",
  "catalogo-produtos": "Catálogo de Produtos"
};

export function chaveTarefa(modulo, tarefaId) { return modulo + "." + tarefaId; }

let indice = null;
function indiceCatalogo() {
  if (!indice) {
    indice = new Map();
    for (const t of TAREFAS_CATALOGO) indice.set(chaveTarefa(t.modulo, t.tarefaId), t);
  }
  return indice;
}

/** Estimativa efetiva de uma tarefa: o catálogo por omissão, com os overrides
 *  guardados em `config.usoEstimativas` (objeto parcial, chave `modulo.tarefaId`,
 *  cada valor `{tempoManualSeg, tempoCentralSeg}`) aplicados por cima. */
export function estimativaEfetiva(chave, overrides) {
  const base = indiceCatalogo().get(chave);
  if (!base) return null;
  const over = (overrides && overrides[chave]) || {};
  return {
    modulo: base.modulo, tarefaId: base.tarefaId, nome: base.nome,
    tempoManualSeg: typeof over.tempoManualSeg === "number" ? over.tempoManualSeg : base.tempoManualSeg,
    tempoCentralSeg: typeof over.tempoCentralSeg === "number" ? over.tempoCentralSeg : base.tempoCentralSeg
  };
}

export function todasEstimativas(overrides) {
  return TAREFAS_CATALOGO.map(t => estimativaEfetiva(chaveTarefa(t.modulo, t.tarefaId), overrides));
}
