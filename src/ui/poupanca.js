/**
 * src/ui/poupanca.js — painel "Poupança & ROI" (Configurações → aba
 * "Poupança & ROI"), construído sobre o mesmo registo de uso que alimenta
 * "Dados & Estatísticas" (ver src/usoCatalogo.js e src/usoLeitura.js).
 *
 * Mostra, com base no que cada módulo regista através de
 * `window.ModuleChrome.registarUso(modulo, tarefaId, qtd)`:
 *   - tempo e € poupados hoje / esta semana / este mês / este ano / desde
 *     sempre, e para um período personalizado;
 *   - gráficos de tendência, por módulo e por tarefa (Chart.js, cdnjs);
 *   - uma tabela com todas as tarefas rastreadas, o nº de vezes no período
 *     escolhido, e as estimativas de tempo (editáveis, gravadas em
 *     `config.usoEstimativas`);
 *   - exportação do relatório completo para PDF (html2canvas + jsPDF, mesmo
 *     padrão já usado em modulos/gabinete.html).
 *
 * Todo o cálculo (tempo/€ poupados) é uma ESTIMATIVA de referência — nunca
 * uma medição cronometrada — e é sempre apresentado como tal na própria UI.
 */
import {
  carregarUsoPeriodo, calcularPoupanca, serieDiaria, agregarPorModulo, agregarPorTarefa,
  fmtDuracao, fmtEuros, isoDia, limparCacheUso
} from "../usoLeitura.js";
import { MODULOS_NOMES } from "../usoCatalogo.js";
import { escapeHtml } from "../utils.js";
import { bus } from "../events.js";

function ensureScript(src, globalCheck) {
  return new Promise((resolve, reject) => {
    if (globalCheck()) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Não foi possível carregar " + src));
    document.head.appendChild(s);
  });
}
function ensureChartJs() { return ensureScript("https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js", () => !!window.Chart); }
function ensureHtml2Canvas() { return ensureScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", () => !!window.html2canvas); }
function ensureJsPDF() { return ensureScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", () => !!(window.jspdf && window.jspdf.jsPDF)); }

const CORES = ["#2b7a4b", "#4f9c72", "#1f543e", "#8fc7a4", "#a8d8bd", "#6fb98d", "#c8e6d3", "#3d6b52"];

function addDiasIso(iso, delta) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return isoDia(d);
}

export function initPoupanca(el, dataStore) {
  let overrides = {};
  let valorHora = 0;
  let usoInicioEm = null;
  let carregado = false;
  let graficos = { tendencia: null, modulos: null, tarefas: null };

  async function garantirConfigCarregada() {
    if (carregado) return;
    const [ov, vh, inicio] = await Promise.all([
      dataStore.getConfig("usoEstimativas"),
      dataStore.getConfig("valorHoraPoupanca"),
      dataStore.getConfig("usoInicioEm")
    ]);
    overrides = (ov && typeof ov === "object") ? ov : {};
    valorHora = typeof vh === "number" ? vh : 0;
    usoInicioEm = inicio || null;
    el.poupValorHoraInput.value = valorHora || "";
    carregado = true;
  }

  async function garantirInicioConhecido() {
    if (usoInicioEm) return usoInicioEm;
    // Ainda não sabemos quando esta farmácia começou a usar a Central — varre
    // até 24 meses para trás à procura do primeiro dia com algum registo, e
    // guarda o resultado (best-effort) para não repetir esta varredura.
    const hoje = isoDia(new Date());
    const desde = addDiasIso(hoje, -730);
    const dias = await carregarUsoPeriodo(dataStore, desde, hoje);
    const chaves = Object.keys(dias).sort();
    usoInicioEm = chaves.length ? chaves[0] : hoje;
    dataStore.setConfig("usoInicioEm", usoInicioEm).catch(() => {});
    return usoInicioEm;
  }

  function cartaoResumo(label, calc, sub) {
    return `<div class="poup-resumo-card">
      <div class="prc-label">${escapeHtml(label)}</div>
      <div class="prc-tempo">${fmtDuracao(calc.segundosPoupados)}</div>
      <div class="prc-euros">${fmtEuros((calc.segundosPoupados / 3600) * valorHora)}</div>
      <div class="prc-sub">${sub || (calc.totalOcorrencias + " tarefa" + (calc.totalOcorrencias === 1 ? "" : "s") + " realizadas")}</div>
    </div>`;
  }

  async function renderResumos() {
    const hoje = isoDia(new Date());
    const inicioSemana = addDiasIso(hoje, -6);
    const inicioMesCalendario = hoje.slice(0, 8) + "01";
    const inicioAnoCalendario = hoje.slice(0, 4) + "-01-01";
    const inicioTudo = await garantirInicioConhecido();

    const [diasHoje, diasSemana, diasMes, diasAno, diasTudo] = await Promise.all([
      carregarUsoPeriodo(dataStore, hoje, hoje),
      carregarUsoPeriodo(dataStore, inicioSemana, hoje),
      carregarUsoPeriodo(dataStore, inicioMesCalendario, hoje),
      carregarUsoPeriodo(dataStore, inicioAnoCalendario, hoje),
      carregarUsoPeriodo(dataStore, inicioTudo, hoje)
    ]);

    el.poupResumoGrid.innerHTML = [
      cartaoResumo("Hoje", calcularPoupanca(diasHoje, overrides)),
      cartaoResumo("Últimos 7 dias", calcularPoupanca(diasSemana, overrides)),
      cartaoResumo("Este mês", calcularPoupanca(diasMes, overrides)),
      cartaoResumo("Este ano", calcularPoupanca(diasAno, overrides)),
      cartaoResumo("Desde que usa a Central", calcularPoupanca(diasTudo, overrides), "a usar desde " + inicioTudo.split("-").reverse().join("/"))
    ].join("");

    return diasTudo;
  }

  async function renderPeriodoPersonalizado() {
    const ini = el.poupPeriodoInicio.value, fim = el.poupPeriodoFim.value;
    if (!ini || !fim || ini > fim) { el.poupCustomResumo.style.display = "none"; return; }
    const dias = await carregarUsoPeriodo(dataStore, ini, fim);
    const calc = calcularPoupanca(dias, overrides);
    el.poupCustomResumo.style.display = "flex";
    el.poupCustomResumo.innerHTML = `
      <div class="pcc-item"><div class="prc-label">Período personalizado</div><div style="font-size:.78rem;color:var(--text-soft);">${ini.split("-").reverse().join("/")} a ${fim.split("-").reverse().join("/")}</div></div>
      <div class="pcc-item"><div class="prc-label">Tempo poupado</div><div class="prc-tempo">${fmtDuracao(calc.segundosPoupados)}</div></div>
      <div class="pcc-item"><div class="prc-label">Valor poupado</div><div class="prc-euros">${fmtEuros((calc.segundosPoupados / 3600) * valorHora)}</div></div>
      <div class="pcc-item"><div class="prc-label">Tarefas realizadas</div><div class="prc-tempo">${calc.totalOcorrencias}</div></div>`;
  }

  async function renderGraficos(diasTudo) {
    // A ausência de rede/CDN (ex.: firewall da farmácia a bloquear
    // cdnjs.cloudflare.com) nunca deve impedir o resto do painel — os
    // resumos e a tabela de tarefas continuam úteis mesmo sem gráficos.
    try {
      await ensureChartJs();
    } catch (err) {
      if (!avisoChartJsMostrado) {
        avisoChartJsMostrado = true;
        bus.emit("toast:show", { type: "err", msg: "Não foi possível carregar os gráficos (sem ligação ao CDN). Os resumos e a tabela continuam corretos." });
      }
      return;
    }
    const Chart = window.Chart;
    const hoje = isoDia(new Date());
    const inicioTendencia = addDiasIso(hoje, -29);
    const diasRecentes = {};
    Object.keys(diasTudo).forEach(d => { if (d >= inicioTendencia) diasRecentes[d] = diasTudo[d]; });
    const serie = serieDiaria(diasRecentes, overrides);
    // preenche os dias sem qualquer registo (para o gráfico não "saltar" datas)
    const porDia = new Map(serie.map(s => [s.dia, s]));
    const labels = [], horasPoupadas = [];
    for (let i = 0; i <= 29; i++) {
      const dia = addDiasIso(inicioTendencia, i);
      const s = porDia.get(dia);
      labels.push(dia.slice(5).split("-").reverse().join("/"));
      horasPoupadas.push(s ? +(s.segundosPoupados / 3600).toFixed(2) : 0);
    }

    if (graficos.tendencia) graficos.tendencia.destroy();
    graficos.tendencia = new Chart(el.poupChartTendencia.getContext("2d"), {
      type: "line",
      data: { labels, datasets: [{ label: "Horas poupadas / dia", data: horasPoupadas, borderColor: CORES[0], backgroundColor: "rgba(43,122,75,.12)", fill: true, tension: .25, pointRadius: 2 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => v + "h" } } } }
    });

    const porModulo = agregarPorModulo(diasTudo, overrides);
    const modulosOrdenados = Object.entries(porModulo).sort((a, b) => b[1].segundosPoupados - a[1].segundosPoupados);
    if (graficos.modulos) graficos.modulos.destroy();
    graficos.modulos = new Chart(el.poupChartModulos.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: modulosOrdenados.map(([m]) => MODULOS_NOMES[m] || m),
        datasets: [{ data: modulosOrdenados.map(([, v]) => +(v.segundosPoupados / 3600).toFixed(2)), backgroundColor: CORES }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: (ctx) => ctx.label + ": " + ctx.parsed + "h poupadas" } } } }
    });

    const porTarefa = agregarPorTarefa(diasTudo, overrides).filter(t => t.totalOcorrencias > 0)
      .sort((a, b) => b.totalOcorrencias - a.totalOcorrencias).slice(0, 8);
    if (graficos.tarefas) graficos.tarefas.destroy();
    graficos.tarefas = new Chart(el.poupChartTarefas.getContext("2d"), {
      type: "bar",
      data: { labels: porTarefa.map(t => t.nome), datasets: [{ label: "Nº de vezes", data: porTarefa.map(t => t.totalOcorrencias), backgroundColor: CORES[0] }] },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }

  async function renderTabela(diasTudo) {
    const linhas = agregarPorTarefa(diasTudo, overrides);
    el.poupTabelaTarefasBody.innerHTML = linhas.map(t => `
      <tr data-chave="${escapeHtml(t.chave)}">
        <td>${escapeHtml(MODULOS_NOMES[t.modulo] || t.modulo)}</td>
        <td>${escapeHtml(t.nome)}</td>
        <td class="pt-num">${t.totalOcorrencias}</td>
        <td><input type="number" class="pt-est" data-campo="tempoManualSeg" min="0" value="${t.tempoManualSeg}"></td>
        <td><input type="number" class="pt-est" data-campo="tempoCentralSeg" min="0" value="${t.tempoCentralSeg}"></td>
        <td class="pt-poupado">${fmtDuracao(t.segundosPoupados)}</td>
      </tr>`).join("");
  }

  let avisoChartJsMostrado = false;
  let refreshEmCurso = null;
  async function refrescarTudo() {
    if (refreshEmCurso) return refreshEmCurso;
    refreshEmCurso = (async () => {
      await garantirConfigCarregada();
      const diasTudo = await renderResumos();
      await renderPeriodoPersonalizado();
      await renderGraficos(diasTudo);
      await renderTabela(diasTudo);
    })();
    try { await refreshEmCurso; } finally { refreshEmCurso = null; }
  }

  // -------- interação --------
  el.poupValorHoraInput.addEventListener("change", async () => {
    const v = parseFloat(el.poupValorHoraInput.value.replace(",", ".")) || 0;
    valorHora = v;
    await dataStore.setConfig("valorHoraPoupanca", v);
    await renderResumos();
    await renderPeriodoPersonalizado();
  });
  el.poupPeriodoInicio.addEventListener("change", renderPeriodoPersonalizado);
  el.poupPeriodoFim.addEventListener("change", renderPeriodoPersonalizado);
  el.btnPoupAtualizar.addEventListener("click", () => { limparCacheUso(); refrescarTudo(); });

  el.poupTabelaTarefasBody.addEventListener("change", async (e) => {
    const input = e.target.closest("input.pt-est");
    if (!input) return;
    const tr = input.closest("tr");
    const chave = tr.dataset.chave;
    const campo = input.dataset.campo;
    const valor = Math.max(0, parseInt(input.value, 10) || 0);
    overrides = { ...overrides, [chave]: { ...(overrides[chave] || {}), [campo]: valor } };
    await dataStore.setConfig("usoEstimativas", overrides);
    bus.emit("toast:show", { type: "ok", msg: "Estimativa atualizada." });
    // recalcula tudo com a nova estimativa, sem tornar a ir ao servidor
    const hoje = isoDia(new Date());
    const inicioTudo = await garantirInicioConhecido();
    const diasTudo = await carregarUsoPeriodo(dataStore, inicioTudo, hoje);
    await renderResumos();
    await renderPeriodoPersonalizado();
    await renderGraficos(diasTudo);
    await renderTabela(diasTudo);
  });

  el.btnPoupExportarPdf.addEventListener("click", async () => {
    el.btnPoupExportarPdf.disabled = true;
    const textoOriginal = el.btnPoupExportarPdf.innerHTML;
    el.btnPoupExportarPdf.innerHTML = "A gerar PDF...";
    try {
      await ensureHtml2Canvas();
      await ensureJsPDF();
      const painel = document.getElementById("tab-poupanca");
      const canvas = await window.html2canvas(painel, { scale: 2, backgroundColor: "#ffffff", useCORS: true, allowTaint: true });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgData = canvas.toDataURL("image/png");
      const imgW = pageWidth;
      const imgH = canvas.height * (imgW / canvas.width);
      let heightLeft = imgH, y = 0;
      pdf.addImage(imgData, "PNG", 0, y, imgW, imgH);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        y = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, y, imgW, imgH);
        heightLeft -= pageHeight;
      }
      pdf.save(`poupanca-central-${isoDia(new Date())}.pdf`);
      bus.emit("toast:show", { type: "ok", msg: "PDF exportado." });
    } catch (err) {
      bus.emit("toast:show", { type: "err", msg: "Não foi possível gerar o PDF: " + err.message });
    } finally {
      el.btnPoupExportarPdf.disabled = false;
      el.btnPoupExportarPdf.innerHTML = textoOriginal;
    }
  });

  return { refrescarTudo };
}
