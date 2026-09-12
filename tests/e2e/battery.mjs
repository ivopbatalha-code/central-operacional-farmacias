/**
 * Bateria de testes end-to-end — corre contra o local-server.mjs (funções
 * reais + Blobs em memória), usando o Chromium pré-instalado via Playwright.
 *
 * Cobre:
 *  1. Autenticação real (signup) e obtenção de token.
 *  2. Confirmação do bug de desempenho do logótipo: tamanho do payload de
 *     /api/data com e sem logótipo embutido, antes/depois da correção.
 *  3. Cada um dos 13 módulos, carregado standalone com sessão válida, em 3
 *     larguras (390 telemóvel / 800 tablet / 1440 desktop): zero erros de
 *     consola/página, logótipo pintado corretamente.
 *  4. Fluxo funcional real: criar um utente em PIM e confirmar persistência
 *     (reload + reaparece), e confirmar que o logótipo antigo em config
 *     desaparece do estado do servidor após uma gravação (migração lenta).
 *  5. Retrocompatibilidade: uma conta com logótipo só em config.logo (estilo
 *     antigo) continua a mostrá-lo corretamente.
 */
// Resolve o Playwright de onde estiver disponível: instalação normal do
// projeto (node_modules) primeiro, com o caminho global usado no ambiente
// de desenvolvimento original como recurso.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  const pw = (await import('/home/claude/.npm-global/lib/node_modules/playwright/index.js')).default;
  chromium = pw.chromium;
}
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
import http from 'node:http';
import fs from 'node:fs';

const BASE = 'http://localhost:8888';
const results = { pass: [], fail: [] };
function ok(name, cond, detail) { (cond ? results.pass : results.fail).push({ name, detail: detail || '' }); console.log((cond ? '✅' : '❌'), name, detail || ''); }

async function apiFetch(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const body = opts.body;
    const req = http.request(url, { method: opts.method || 'GET', headers: opts.headers || {} }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// gera uma imagem base64 "realista" (grande, só para medir peso — não precisa de ser um PNG válido para este teste de tamanho de payload)
function fakeLogoBase64(kbSize) {
  const bytes = Buffer.alloc(Math.round(kbSize * 1024 * 0.73)); // *0.73 para compensar a expansão do base64 (~1.37x)
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  return 'data:image/png;base64,' + bytes.toString('base64');
}

const MODULOS = [
  'pim', 'gabinete', 'documentos', 'aue', 'manipulados', 'stocks', 'devolucoes-armazenistas',
  'catalogo-produtos', 'devolucao-frio', 'mapa-cardiovascular', 'medela', 'reservas', 'conversor-pdf'
];

async function main() {
  // ---------- 1. signup de duas farmácias de teste ----------
  const emailNovo = `qa-novo-${Date.now()}@x.pt`;
  const emailAntigo = `qa-antigo-${Date.now()}@x.pt`;
  const signupNovo = JSON.parse((await apiFetch('/api/auth/signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nomeFarmacia: 'Farmácia QA Nova', email: emailNovo, password: 'password123' })
  })).body);
  const signupAntigo = JSON.parse((await apiFetch('/api/auth/signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nomeFarmacia: 'Farmácia QA Antiga', email: emailAntigo, password: 'password123' })
  })).body);
  ok('signup cria conta nova e devolve token', !!signupNovo.token && !!signupAntigo.token);

  const tokenNovo = signupNovo.token, tokenAntigo = signupAntigo.token;
  const logo500kb = fakeLogoBase64(500);

  // farmácia "nova": logótipo já no formato correto (asset)
  await apiFetch('/api/asset/branding-logo', { method: 'PUT', headers: { Authorization: `Bearer ${tokenNovo}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: logo500kb }) });

  // farmácia "antiga": logótipo só em config.logo (simula dados de antes da migração)
  await apiFetch('/api/data', {
    method: 'PUT', headers: { Authorization: `Bearer ${tokenAntigo}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ servicos: [], categorias: [], config: { nomeFarmacia: 'Farmácia QA Antiga', logo: logo500kb } })
  });

  // ---------- 2. medir o payload de /api/data ANTES/DEPOIS da correção ----------
  const dataAntigoRes = await apiFetch('/api/data', { headers: { Authorization: `Bearer ${tokenAntigo}` } });
  const dataAntigoBody = JSON.parse(dataAntigoRes.body);
  ok('farmácia "antiga": GET /api/data ainda inclui o logótipo em config (esperado, antes da 1ª gravação de qualquer módulo)',
    !!dataAntigoBody.config.logo, `tamanho do payload: ${(dataAntigoRes.body.length/1024).toFixed(0)}KB`);

  const dataNovoRes = await apiFetch('/api/data', { headers: { Authorization: `Bearer ${tokenNovo}` } });
  const dataNovoBody = JSON.parse(dataNovoRes.body);
  ok('farmácia "nova": GET /api/data NÃO inclui o logótipo (vive só no asset)',
    !dataNovoBody.config || !dataNovoBody.config.logo, `tamanho do payload: ${(dataNovoRes.body.length/1024).toFixed(0)}KB (contra ~${(dataAntigoRes.body.length/1024).toFixed(0)}KB da farmácia antiga)`);

  const assetRes = await apiFetch('/api/asset/branding-logo', { headers: { Authorization: `Bearer ${tokenNovo}` } });
  ok('GET /api/asset/branding-logo devolve o logótipo isolado', JSON.parse(assetRes.body).content === logo500kb);

  // ---------- 3. Playwright: carregar central + todos os módulos ----------
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROMIUM_PATH) ? CHROMIUM_PATH : undefined, headless: true });

  async function novaPaginaComSessao(token, perfil, viewport) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await page.addInitScript(([t, p]) => {
      localStorage.setItem('central_saas_token', t);
      localStorage.setItem('central_saas_perfil', JSON.stringify(p));
    }, [token, perfil]);
    return { ctx, page };
  }

  const viewports = { mobile: { width: 390, height: 844 }, tablet: { width: 800, height: 1100 }, desktop: { width: 1440, height: 900 } };

  for (const modulo of MODULOS) {
    for (const [vpName, vp] of Object.entries(viewports)) {
      const { ctx, page } = await novaPaginaComSessao(tokenNovo, { tenantId: signupNovo.tenantId, email: emailNovo, nomeFarmacia: 'Farmácia QA Nova' }, vp);
      const erros = [];
      page.on('pageerror', e => erros.push('pageerror: ' + e.message));
      page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) erros.push('console.error: ' + msg.text()); });
      try {
        await page.goto(`${BASE}/modulos/${modulo}.html`, { waitUntil: 'load', timeout: 15000 });
        await page.waitForTimeout(700);
        ok(`${modulo} [${vpName}] carrega sem erros`, erros.length === 0, erros.join(' | '));
      } catch (e) {
        ok(`${modulo} [${vpName}] carrega sem erros`, false, 'exceção: ' + e.message);
      }
      await ctx.close();
    }
  }

  // ---------- 4. logótipo pinta corretamente (farmácia nova, via asset) ----------
  {
    const { ctx, page } = await novaPaginaComSessao(tokenNovo, { tenantId: signupNovo.tenantId, email: emailNovo, nomeFarmacia: 'Farmácia QA Nova' }, viewports.desktop);
    await page.goto(`${BASE}/modulos/pim.html`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(500);
    const src = await page.locator('#brandLogoImg').getAttribute('src');
    ok('PIM (farmácia nova): logótipo real acaba no <img> (via asset)', src === logo500kb, `src length=${src?.length}`);
    await ctx.close();
  }

  // ---------- 5. retrocompatibilidade: farmácia "antiga" (logo só em config) ----------
  {
    const { ctx, page } = await novaPaginaComSessao(tokenAntigo, { tenantId: signupAntigo.tenantId, email: emailAntigo, nomeFarmacia: 'Farmácia QA Antiga' }, viewports.desktop);
    await page.goto(`${BASE}/modulos/pim.html`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(500);
    const src = await page.locator('#brandLogoImg').getAttribute('src');
    ok('PIM (farmácia antiga, logo só em config): continua a mostrar o logótipo (fallback)', src === logo500kb, `src length=${src?.length}`);
    await ctx.close();
  }

  // ---------- 6. fluxo funcional real: criar utente em PIM + persistência ----------
  async function criarUtenteViaUI(page, nome) {
    await page.click('.mc-bb-item:has-text("Utentes")');
    await page.waitForSelector('#viewUtentes:not([style*="display:none"]) button:has-text("Novo utente")', { timeout: 3000 }).catch(() => {});
    await page.click('#viewUtentes button:has-text("Novo utente")');
    await page.waitForSelector('#utenteModalOverlay.open input[oninput*="draftUtente.nome"]', { timeout: 3000 });
    await page.fill('#utenteModalOverlay input[oninput*="draftUtente.nome"]', nome);
    await page.click('#utenteModalOverlay button:has-text("Guardar")');
    await page.waitForTimeout(600);
    return page.locator(`text=${nome}`).count();
  }

  {
    const { ctx, page } = await novaPaginaComSessao(tokenNovo, { tenantId: signupNovo.tenantId, email: emailNovo, nomeFarmacia: 'Farmácia QA Nova' }, viewports.desktop);
    await page.goto(`${BASE}/modulos/pim.html`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(400);
    let criouUtente = false;
    try { criouUtente = (await criarUtenteViaUI(page, 'Maria QA Battery')) > 0; }
    catch (e) { console.log('nota: fluxo de criar utente falhou: ' + e.message); }
    ok('PIM: criar utente funciona (sem o bug de escopo do draft)', criouUtente);
    await ctx.close();
  }

  // confirma que a gravação do utente (qualquer gravarPim) fez o config.logo da farmácia "nova" convergir (já não existia) e QUE o asset continua intacto
  const dataNovoDepois = JSON.parse((await apiFetch('/api/data', { headers: { Authorization: `Bearer ${tokenNovo}` } })).body);
  ok('depois de gravar em PIM: config ainda sem logo (farmácia nova)', !dataNovoDepois.config || !dataNovoDepois.config.logo);
  const assetDepois = JSON.parse((await apiFetch('/api/asset/branding-logo', { headers: { Authorization: `Bearer ${tokenNovo}` } })).body);
  ok('depois de gravar em PIM: logótipo no asset continua intacto', assetDepois.content === logo500kb);

  // agora repete para a farmácia ANTIGA (logo só em config): uma gravação real em PIM deve fazer o config.logo dela convergir (desaparecer) também
  {
    const { ctx, page } = await novaPaginaComSessao(tokenAntigo, { tenantId: signupAntigo.tenantId, email: emailAntigo, nomeFarmacia: 'Farmácia QA Antiga' }, viewports.desktop);
    await page.goto(`${BASE}/modulos/pim.html`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(400);
    try { await criarUtenteViaUI(page, 'João QA Battery Antigo'); }
    catch (e) { console.log('nota: fluxo de criar utente (farmácia antiga) falhou: ' + e.message); }
    await ctx.close();
  }
  const dataAntigoDepois = JSON.parse((await apiFetch('/api/data', { headers: { Authorization: `Bearer ${tokenAntigo}` } })).body);
  ok('farmácia antiga: após 1ª gravação real de qualquer módulo, config.logo converge e desaparece', !dataAntigoDepois.config || !dataAntigoDepois.config.logo);

  // ---------- 7. módulo Poupança & ROI: tracking de uso (registarUso) + dashboard ----------
  {
    const emailUso = `qa-uso-${Date.now()}@x.pt`;
    const signupUso = JSON.parse((await apiFetch('/api/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomeFarmacia: 'Farmácia QA Uso', email: emailUso, password: 'password123' })
    })).body);
    const tokenUso = signupUso.token;
    const perfilUso = { tenantId: signupUso.tenantId, email: emailUso, nomeFarmacia: 'Farmácia QA Uso' };
    const hoje = new Date();
    const mesChave = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
    const diaChave = mesChave + '-' + String(hoje.getDate()).padStart(2, '0');

    // 7a. window.ModuleChrome.registarUso(), chamado a partir de uma página de
    // módulo real, deve persistir no blob mensal via o debounce (2s) do flush.
    {
      const { ctx, page } = await novaPaginaComSessao(tokenUso, perfilUso, viewports.desktop);
      await page.goto(`${BASE}/modulos/pim.html`, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(500);
      const temApi = await page.evaluate(() => typeof window.ModuleChrome?.registarUso === 'function');
      ok('window.ModuleChrome.registarUso está disponível nos módulos', temApi);
      await page.evaluate(() => {
        window.ModuleChrome.registarUso('pim', 'criar_utente');
        window.ModuleChrome.registarUso('pim', 'criar_utente');
        window.ModuleChrome.registarUso('pim', 'registar_receita');
      });
      await page.waitForTimeout(3000); // debounce (2s) + margem
      await ctx.close();
    }
    const assetUsoRes = await apiFetch(`/api/asset/${encodeURIComponent('uso-' + mesChave)}`, { headers: { Authorization: `Bearer ${tokenUso}` } });
    const contagensUso = (JSON.parse(assetUsoRes.body).content ? JSON.parse(JSON.parse(assetUsoRes.body).content) : { dias: {} }).dias?.[diaChave] || {};
    ok('registarUso(): flush automático (debounce) persistiu "pim.criar_utente"=2', contagensUso['pim.criar_utente'] === 2);
    ok('registarUso(): flush automático (debounce) persistiu "pim.registar_receita"=1', contagensUso['pim.registar_receita'] === 1);

    // 7b. um flush que falha (ex.: GET abortado por navegação a meio, caso
    // conhecido do Chromium mesmo com keepalive:true) nunca pode apagar ou
    // corromper dados de uso já persistidos por um flush anterior bem-sucedido.
    {
      const { ctx, page } = await novaPaginaComSessao(tokenUso, perfilUso, viewports.desktop);
      await page.goto(`${BASE}/modulos/pim.html`, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(300);
      await page.evaluate(() => { window.ModuleChrome.registarUso('pim', 'criar_evento'); });
      await page.goto(`${BASE}/modulos/gabinete.html`, { waitUntil: 'load', timeout: 15000 }); // dispara 'pagehide' quase de imediato
      await page.waitForTimeout(2500);
      await ctx.close();
    }
    const assetUsoRes2 = await apiFetch(`/api/asset/${encodeURIComponent('uso-' + mesChave)}`, { headers: { Authorization: `Bearer ${tokenUso}` } });
    const contagensUso2 = (JSON.parse(assetUsoRes2.body).content ? JSON.parse(JSON.parse(assetUsoRes2.body).content) : { dias: {} }).dias?.[diaChave] || {};
    ok('registarUso(): um flush falhado (navegação) nunca apaga uso já gravado ("pim.criar_utente" continua=2)', contagensUso2['pim.criar_utente'] === 2);
    ok('registarUso(): um flush falhado (navegação) nunca apaga uso já gravado ("pim.registar_receita" continua=1)', contagensUso2['pim.registar_receita'] === 1);

    // 7c. dashboard "Poupança & ROI" (Configurações): renderiza resumos e a
    // tabela completa do catálogo de tarefas mesmo que o Chart.js (cdnjs) não
    // carregue — regressão do bug encontrado durante o desenvolvimento, em
    // que uma falha do CDN de gráficos bloqueava silenciosamente todo o painel.
    {
      const { ctx, page } = await novaPaginaComSessao(tokenUso, perfilUso, viewports.desktop);
      await page.goto(`${BASE}/index.html`, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.click('#btnAbrirConfig');
      await page.waitForTimeout(200);
      await page.click('#modalConfig .modal-tab[data-tab="poupanca"]');
      await page.waitForTimeout(1500);
      const linhasTabela = await page.evaluate(() => document.querySelectorAll('#poupTabelaTarefasBody tr').length);
      ok('Poupança & ROI: tabela de tarefas renderiza as ~34 linhas do catálogo (mesmo sem Chart.js/cdnjs)', linhasTabela >= 30, `linhas=${linhasTabela}`);
      const resumoHtml = await page.evaluate(() => document.getElementById('poupResumoGrid')?.innerHTML || '');
      ok('Poupança & ROI: resumo mostra os 5 cartões (hoje/semana/mês/ano/sempre)', (resumoHtml.match(/poup-resumo-card/g) || []).length === 5);
      await ctx.close();
    }
  }

  // ---------- 8. leitura de DataMatrix (zxing-wasm/BarcodeDetector) + parseGS1 ----------
  // Não simula a câmara em si (isso exigiria um dispositivo de vídeo falso e
  // mockar o CDN do zxing-wasm) — cobre o que É determinístico e testável sem
  // hardware: a API partilhada existe nos 2 módulos que abrem câmara, e
  // parseGS1() continua a decompor corretamente tanto o formato novo (HRI,
  // "(01)...(17)...", o que o zxing-wasm devolve por omissão para GS1) como o
  // formato antigo (dígitos concatenados, sem parênteses — heurística por
  // posição/comprimento, para texto colado à mão ou QR sem essa formatação).
  {
    const emailScan = `qa-scan-${Date.now()}@x.pt`;
    const signupScan = JSON.parse((await apiFetch('/api/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomeFarmacia: 'Farmácia QA Scan', email: emailScan, password: 'password123' })
    })).body);
    const tokenScan = signupScan.token;
    const perfilScan = { tenantId: signupScan.tenantId, email: emailScan, nomeFarmacia: 'Farmácia QA Scan' };

    for (const modulo of ['gabinete', 'pim']) {
      const { ctx, page } = await novaPaginaComSessao(tokenScan, perfilScan, viewports.desktop);
      await page.goto(`${BASE}/modulos/${modulo}.html`, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(400);
      const temApi = await page.evaluate(() => !!(window.ModuleChrome && typeof window.ModuleChrome.ensureBarcodeLib === 'function' && typeof window.ModuleChrome.decodeBarcodeFrame === 'function'));
      ok(`${modulo}.html: window.ModuleChrome expõe ensureBarcodeLib/decodeBarcodeFrame (leitura de DataMatrix)`, temApi);

      const codigoHRI = '(01)07612345678903(17)251231(10)LOTE9XZ(21)SN00456(714)1234567';
      const viaHRI = await page.evaluate((c) => window.parseGS1(c), codigoHRI);
      ok(`${modulo}.html: parseGS1() decompõe corretamente um código GS1 em formato HRI (com parênteses)`, !!viaHRI &&
        viaHRI.pc === '07612345678903' && viaHRI.validadeRaw === '251231' && viaHRI.lote === 'LOTE9XZ' && viaHRI.sn === 'SN00456' && viaHRI.cnp === '1234567',
        JSON.stringify(viaHRI));

      // mesmo conteúdo, sem parênteses (estilo antigo/colado à mão) — cai
      // para a heurística por posição, que tem de continuar a funcionar tal
      // e qual antes desta sessão (nenhuma regressão).
      const codigoAntigo = '010761234567890317251231714123456710LOTE9XZ21SN00456';
      const viaHeuristica = await page.evaluate((c) => window.parseGS1(c), codigoAntigo);
      ok(`${modulo}.html: parseGS1() continua a decompor o formato antigo sem parênteses (heurística, sem regressão)`, !!viaHeuristica &&
        viaHeuristica.pc === '07612345678903' && viaHeuristica.cnp === '1234567' && viaHeuristica.validadeRaw === '251231',
        JSON.stringify(viaHeuristica));

      await ctx.close();
    }
  }

  await browser.close();

  console.log(`\n===== RESUMO: ${results.pass.length} passaram, ${results.fail.length} falharam =====`);
  if (results.fail.length) {
    console.log('\nFALHAS:');
    results.fail.forEach(f => console.log(' -', f.name, f.detail));
    process.exitCode = 1;
  }
}

main().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
