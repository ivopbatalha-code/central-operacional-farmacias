/* =====================================================================
   MODULE CHROME (JS) — ver assets/module-chrome.css para o contexto.
   Sem dependências, sem módulos ES — carregado com <script defer> em
   cada modulos/*.html, antes do script próprio do módulo.
   ===================================================================== */
(function () {
  "use strict";

  function embedded() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  // O link antigo "← Voltar à Central" (.module-back) só faz sentido quando
  // o módulo é aberto sozinho (fora da Central) — dentro do <iframe> da
  // Central, o "Início" já está sempre visível por cima, por isso o link
  // ficava redundante e, em alguns módulos, sobreposto a outros elementos.
  function initStandaloneBar() {
    var legacyBack = document.querySelector(".module-back");
    if (legacyBack) legacyBack.style.display = "none";
    if (!embedded()) {
      var bar = document.getElementById("mcStandaloneBar");
      if (bar) bar.classList.add("mc-show");
    }
  }

  // Monta (uma vez) a barra inferior fixa com a navegação interna do
  // módulo. `items`: [{id, icon, label, onSelect}]. `opts.onBack`, se
  // definido, mostra também um botão "‹ Voltar" à esquerda (para navegação
  // dentro do próprio módulo, ex.: sair do detalhe de um utente).
  function mountBottomBar(items, opts) {
    opts = opts || {};
    var bar = document.getElementById("mcBottomBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "mc-bottom-bar";
      bar.id = "mcBottomBar";
      document.body.appendChild(bar);
    }
    document.body.classList.add("mc-has-bottom-bar");

    function render(activeId) {
      bar.innerHTML = "";
      if (opts.onBack) {
        var back = document.createElement("button");
        back.type = "button";
        back.className = "mc-bb-back";
        back.textContent = "‹ Voltar";
        back.addEventListener("click", opts.onBack);
        bar.appendChild(back);
      }
      items.forEach(function (it) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mc-bb-item" + (it.id === activeId ? " active" : "");
        btn.innerHTML = '<span class="mc-bb-icon">' + (it.icon || "•") + "</span><span>" + it.label + "</span>";
        btn.addEventListener("click", function () { if (it.onSelect) it.onSelect(); });
        bar.appendChild(btn);
      });
    }
    render(opts.activeId);
    return { setActive: function (id) { render(id); } };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initStandaloneBar);
  else initStandaloneBar();

  /* =====================================================================
     BRANDING (nome + logótipo da farmácia) — cache local + carregamento
     desacoplado do estado geral.

     Antes, cada módulo lia `config.logo` (base64, até ~930KB) de dentro do
     MESMO JSON devolvido por GET /api/data — o mesmo pedido que traz
     serviços, categorias e os dados do próprio módulo. Isso significava
     transferir quase 1MB extra em TODAS as páginas/módulos só para mostrar
     o logótipo, e outra vez em cada gravação (o "gravarX" de cada módulo
     reenvia o `config` completo para não apagar outros campos).

     Agora o logótipo vive no seu próprio blob (/api/asset/branding-logo,
     já suportado pelo servidor, isolado da junção de `config`) e o cliente
     guarda uma cópia em localStorage: a primeira pintura do cabeçalho é
     instantânea (0ms, sem rede) e só depois é confirmada/atualizada a
     partir do servidor. */
  var BRANDING_CACHE_KEY = "central_saas_branding_cache_v1";

  /** Lê a cache sem tocar no DOM — para módulos cujo aplicarBrandingFarmacia()
   *  próprio já sabe tratar de tudo (ex.: atualizar FARMACIA_LOGO_SRC,
   *  mostrar/esconder um emblema, avisar a exportação Excel/PDF). */
  function getCachedBranding() {
    try {
      var raw = localStorage.getItem(BRANDING_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function paintCachedBranding(logoImgId, nameElId) {
    try {
      var raw = localStorage.getItem(BRANDING_CACHE_KEY);
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (logoImgId && cached.logo) {
        var img = document.getElementById(logoImgId);
        if (img) img.src = cached.logo;
      }
      if (nameElId && cached.nomeFarmacia) {
        var el = document.getElementById(nameElId);
        if (el) el.textContent = cached.nomeFarmacia;
      }
      return cached;
    } catch (e) { return null; }
  }

  function cacheBranding(nomeFarmacia, logo) {
    try {
      localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify({ nomeFarmacia: nomeFarmacia || null, logo: logo || null, ts: Date.now() }));
    } catch (e) { /* localStorage indisponível (modo privado, quota) — ignora, não é crítico */ }
  }

  /** Vai buscar só o logótipo (blob próprio, nunca o resto do estado). Devolve null em caso de erro/404. */
  async function fetchLogoAsset(token) {
    try {
      var res = await fetch("/api/asset/branding-logo", { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
      if (!res.ok) return null;
      var data = await res.json();
      return data.content || null;
    } catch (e) { return null; }
  }

  window.ModuleChrome = {
    mountBottomBar: mountBottomBar,
    embedded: embedded,
    paintCachedBranding: paintCachedBranding,
    getCachedBranding: getCachedBranding,
    cacheBranding: cacheBranding,
    fetchLogoAsset: fetchLogoAsset
  };
})();
