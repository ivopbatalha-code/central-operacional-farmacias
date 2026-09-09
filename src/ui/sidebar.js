import { escapeHtml } from "../utils.js";
import { icon } from "../icons.js";
import { buildCategoryTree, contarServicosNaCategoria, getStats, CATEGORIA_INDEFINIDA_ID } from "../domain.js";

const expandedIds = new Set();

function nodeIsActive(scope, catId) {
  return (scope.tipo === "categoria" || scope.tipo === "categoria-direta") && scope.categoriaId === catId;
}

function renderNode(node, state, depth = 0) {
  const temFilhos = node.filhos && node.filhos.length > 0;
  const expandido = expandedIds.has(node.id);
  const count = contarServicosNaCategoria(state.servicos, state.categorias, node.id, true);
  const active = nodeIsActive(state.scope, node.id);
  return `
    <div class="cat-node" data-catnode="${node.id}">
      <div class="cat-node-row ${active ? "active" : ""}">
        ${temFilhos
          ? `<button class="cat-toggle ${expandido ? "expanded" : ""}" data-toggle="${node.id}">${icon("chevronRight")}</button>`
          : `<span class="cat-toggle spacer">${icon("chevronRight")}</span>`}
        <button class="cat-node-btn" data-select-cat="${node.id}">
          <span class="cat-dot" style="background:${node.cor || "#8a9a90"};"></span>
          <span class="cat-name">${escapeHtml(node.nome)}</span>
          <span class="cat-count">${count}</span>
        </button>
      </div>
      ${temFilhos ? `<div class="cat-children" style="display:${expandido ? "flex" : "none"};">
          ${node.filhos.map(f => renderNode(f, state, depth + 1)).join("")}
        </div>` : ""}
    </div>`;
}

export function renderSidebar(container, state, handlers) {
  const stats = getStats(state);
  const tree = buildCategoryTree(state.categorias);
  const indefCount = state.servicos.filter(s => (s.categoriaId || CATEGORIA_INDEFINIDA_ID) === CATEGORIA_INDEFINIDA_ID).length;

  container.innerHTML = `
    <div class="brand">
      ${state.logoBase64
        ? `<img class="brand-logo" src="${state.logoBase64}" alt="Logótipo">`
        : `<div class="brand-logo-placeholder">${icon("capsule")}</div>`}
      <div class="brand-text">
        <h1>Central Operacional</h1>
        <p>${escapeHtml(state.nomeFarmacia)}</p>
      </div>
    </div>

    <div>
      <div class="nav-label" style="margin-bottom:8px;">Visão geral</div>
      <div class="stat-grid">
        <div class="stat-tile"><div class="stat-value">${stats.total}</div><div class="stat-label">Serviços totais</div></div>
        <div class="stat-tile"><div class="stat-value">${stats.favoritos}</div><div class="stat-label">Favoritos</div></div>
        <div class="stat-tile"><div class="stat-value">${stats.ativos}</div><div class="stat-label">Serviços ativos</div></div>
        <div class="stat-tile"><div class="stat-value">${stats.categoriasEmUso}</div><div class="stat-label">Categorias em uso</div></div>
      </div>
    </div>

    <div class="nav-flat">
      <button class="nav-item ${state.scope.tipo === "home" ? "active" : ""}" data-nav="home">${icon("home")} Início</button>
      <button class="nav-item ${state.scope.tipo === "favoritos" ? "active" : ""}" data-nav="favoritos">${icon("star")} Favoritos <span class="nav-count">${stats.favoritos}</span></button>
      <button class="nav-item ${state.scope.tipo === "tudo" ? "active" : ""}" data-nav="tudo">${icon("layers")} Ver tudo <span class="nav-count">${stats.total}</span></button>
    </div>

    <div class="nav-flat">
      <div class="nav-label" style="margin-bottom:4px;">Módulos</div>
      <button class="nav-item ${state.scope.tipo === "modulo" && state.scope.modulo === "manipulados" ? "active" : ""}" data-modulo="manipulados">${icon("capsule")} Manipulados</button>
      <button class="nav-item ${state.scope.tipo === "modulo" && state.scope.modulo === "documentos" ? "active" : ""}" data-modulo="documentos">${icon("folder")} Documentos</button>
      <button class="nav-item ${state.scope.tipo === "modulo" && state.scope.modulo === "gabinete" ? "active" : ""}" data-modulo="gabinete">${icon("boxes")} Gestão de Gabinete</button>
      <button class="nav-item ${state.scope.tipo === "modulo" && state.scope.modulo === "pim" ? "active" : ""}" data-modulo="pim">${icon("checkCircle")} Gestão de PIM</button>
      <button class="nav-item ${state.scope.tipo === "modulo" && state.scope.modulo === "aue" ? "active" : ""}" data-modulo="aue">${icon("tag")} Pedidos AUE</button>
      <button class="nav-item ${state.scope.tipo === "modulo" && state.scope.modulo === "stocks" ? "active" : ""}" data-modulo="stocks">${icon("chart")} Stocks Errados</button>
    </div>

    <div class="nav-flat">
      <div class="nav-label" style="margin-bottom:4px;">Ferramentas</div>
      <button class="nav-item ${state.scope.tipo === "modulo" && state.scope.modulo === "reservas" ? "active" : ""}" data-modulo="reservas">${icon("list")} Reservas</button>
      <button class="nav-item ${state.scope.tipo === "modulo" && state.scope.modulo === "medela" ? "active" : ""}" data-modulo="medela">${icon("edit")} Aluguer Medela</button>
      <button class="nav-item ${state.scope.tipo === "modulo" && state.scope.modulo === "conversor-pdf" ? "active" : ""}" data-modulo="conversor-pdf">${icon("refresh")} Conversor de PDF</button>
      <button class="nav-item ${state.scope.tipo === "modulo" && state.scope.modulo === "devolucao-frio" ? "active" : ""}" data-modulo="devolucao-frio">${icon("alertTriangle")} Devolução de Frio</button>
      <button class="nav-item ${state.scope.tipo === "modulo" && state.scope.modulo === "mapa-cardiovascular" ? "active" : ""}" data-modulo="mapa-cardiovascular">${icon("bolt")} Mapa Cardiovascular</button>
      <button class="nav-item ${state.scope.tipo === "modulo" && state.scope.modulo === "devolucoes-armazenistas" ? "active" : ""}" data-modulo="devolucoes-armazenistas">${icon("download")} Devoluções a Armazenistas</button>
      <button class="nav-item ${state.scope.tipo === "modulo" && state.scope.modulo === "catalogo-produtos" ? "active" : ""}" data-modulo="catalogo-produtos">${icon("grid")} Catálogo de Produtos</button>
    </div>

    <div class="sidebar-section-categorias">
      <div class="nav-label">
        <span>Categorias</span>
        <button data-add-cat title="Nova categoria" style="background:none;border:none;color:#cdeada;">${icon("plus")}</button>
      </div>
      <div class="category-tree" id="categoryTree">
        ${tree.map(n => renderNode(n, state)).join("") || `<p style="font-size:.72rem;color:#a9cdb8;padding:6px 4px;">Sem categorias ainda.</p>`}
        ${indefCount > 0 ? `
          <div class="cat-node">
            <div class="cat-node-row ${state.scope.categoriaId === "cat_indefinida" ? "active" : ""}">
              <span class="cat-toggle spacer">${icon("chevronRight")}</span>
              <button class="cat-node-btn" data-select-cat="cat_indefinida">
                <span class="cat-dot" style="background:#8a9a90;"></span>
                <span class="cat-name">Categoria Indefinida</span>
                <span class="cat-count">${indefCount}</span>
              </button>
            </div>
          </div>` : ""}
      </div>
      <button class="ghost-btn" data-add-cat>${icon("plus")} Nova categoria</button>
    </div>

    <div class="sidebar-foot">
      <div class="sidebar-sync ${state.syncStatus}">
        <span class="dot"></span>
        <span>${state.syncStatus === "synced" ? "Sincronizado" : state.syncStatus === "syncing" ? "A sincronizar..." : "Erro ao sincronizar"}</span>
      </div>
      <a class="dev-badge" href="tel:+351963257770" title="Contacto: +351 963 257 770">
        <img src="assets/dev-logo.png" alt="Ivo Batalha Software Development">
        <div class="dev-text">
          <small>Desenvolvido por</small>
          <span>Ivo Batalha</span>
          <span class="dev-sub">Software Development</span>
          <span class="dev-contacto">+351 963 257 770</span>
        </div>
      </a>
    </div>
  `;

  container.querySelectorAll("[data-nav]").forEach(btn => btn.addEventListener("click", () => handlers.onNav(btn.dataset.nav)));
  container.querySelectorAll("[data-modulo]").forEach(btn => btn.addEventListener("click", () => handlers.onAbrirModulo(btn.dataset.modulo)));
  container.querySelectorAll("[data-select-cat]").forEach(btn => btn.addEventListener("click", () => handlers.onSelectCategory(btn.dataset.selectCat)));
  container.querySelectorAll("[data-toggle]").forEach(btn => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = btn.dataset.toggle;
    if (expandedIds.has(id)) expandedIds.delete(id); else expandedIds.add(id);
    renderSidebar(container, state, handlers);
  }));
  container.querySelectorAll("[data-add-cat]").forEach(btn => btn.addEventListener("click", () => handlers.onAddCategory()));
}

export function expandPathTo(categorias, categoriaId) {
  let atual = categorias.find(c => c.id === categoriaId);
  while (atual && atual.parentId) {
    expandedIds.add(atual.parentId);
    atual = categorias.find(c => c.id === atual.parentId);
  }
}
