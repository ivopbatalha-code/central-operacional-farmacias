import { createStore, reducer, initialState } from "./store.js";
import { initRemote, makeDataStore, migrarDadosLocaisSeNecessario } from "./db.js";
import { createActions } from "./actions.js";
import { bus } from "./events.js";
import { debounce } from "./utils.js";
import { CATEGORIAS_PADRAO } from "./domain.js";
import { ICONS, icon } from "./icons.js";
import { renderSidebar, expandPathTo } from "./ui/sidebar.js";
import { renderMainContent, renderCrumb } from "./ui/main-content.js";
import { initToasts } from "./ui/toast.js";
import { initPalette } from "./ui/palette.js";
import { initModals } from "./ui/modals.js";
import { isAutenticado, getPerfil, login, signup, logout } from "./authClient.js";
import { aoExpirarSessao } from "./db.js";

/* ---------- preencher os placeholders de ícone estáticos do index.html ---------- */
const ICON_ELEMENT_MAP = {
  sidebarToggleIcon: "chevronRight", topbarSearchIcon: "search", viewGridIcon: "grid", viewListIcon: "list",
  refreshIcon: "refresh", plusIcon: "plus", slidersIcon: "sliders", closeIcon1: "close", slidersIcon2: "sliders",
  imgIcon1: "image", capsuleIcon: "capsule", uploadIcon1: "upload", tagIcon1: "tag",
  searchIcon2: "search", plusIcon2: "plus", htmlIcon: "upload", arquivoIcon: "upload",
  imgIcon2: "image", tagIcon2: "tag", imgIcon3: "image", chartIcon: "chart", boxesIcon: "boxes",
  downloadIcon: "download", downloadIcon2: "download", uploadIcon3: "upload", uploadIcon4: "upload",
  alertIcon: "alertTriangle", trashIcon2: "trash", boltIcon: "bolt", logoutIcon: "logout"
};
function preencherIconesEstaticos() {
  Object.entries(ICON_ELEMENT_MAP).forEach(([id, name]) => {
    const elx = document.getElementById(id);
    if (elx) elx.innerHTML = ICONS[name] || "";
  });
}
preencherIconesEstaticos();

/* ---------- store + persistência ---------- */
const store = createStore(reducer, initialState);
const dataStore = makeDataStore();
const actions = createActions(store, dataStore);

/* ---------- elementos DOM ---------- */
const appRoot = document.getElementById("appRoot");
const sidebarContainer = document.getElementById("sidebarContainer");
const sidebarToggle = document.getElementById("sidebarToggle");
const crumbContainer = document.getElementById("crumbContainer");
const searchInput = document.getElementById("searchInput");
const selectSort = document.getElementById("selectSort");
const viewToggle = document.getElementById("viewToggle");
const btnRefresh = document.getElementById("btnRefresh");
const btnNovoServico = document.getElementById("btnNovoServico");
const btnAbrirConfig = document.getElementById("btnAbrirConfig");
const contentRoot = document.getElementById("contentRoot");
const toastStack = document.getElementById("toastStack");

const modalEls = {
  modalConfig: document.getElementById("modalConfig"),
  btnFecharConfig: document.getElementById("btnFecharConfig"),
  btnFecharConfigX: document.getElementById("btnFecharConfigX"),
  nomeFarmaciaInput: document.getElementById("nomeFarmaciaInput"),
  moradaInput: document.getElementById("moradaInput"),
  emailContactoInput: document.getElementById("emailContactoInput"),
  telefoneContactoInput: document.getElementById("telefoneContactoInput"),
  modalLogoUpload: document.getElementById("modalLogoUpload"),
  modalLogoImg: document.getElementById("modalLogoImg"),
  modalLogoPlaceholder: document.getElementById("modalLogoPlaceholder"),
  servicosListaGestao: document.getElementById("servicosListaGestao"),
  gestaoSearchInput: document.getElementById("gestaoSearchInput"),
  servicoCategoria: document.getElementById("servicoCategoria"),
  btnMostrarFormAdd: document.getElementById("btnMostrarFormAdd"),
  formAddServico: document.getElementById("formAddServico"),
  formTitulo: document.getElementById("formTitulo"),
  servicoNome: document.getElementById("servicoNome"),
  servicoDescricao: document.getElementById("servicoDescricao"),
  servicoUrl: document.getElementById("servicoUrl"),
  htmlFileInput: document.getElementById("htmlFileInput"),
  arquivoFileInput: document.getElementById("arquivoFileInput"),
  imgFileInput: document.getElementById("imgFileInput"),
  imgUrlInput: document.getElementById("imgUrlInput"),
  htmlFileName: document.getElementById("htmlFileName"),
  arquivoFileName: document.getElementById("arquivoFileName"),
  imgFileName: document.getElementById("imgFileName"),
  servicoStatus: document.getElementById("servicoStatus"),
  servicoFavorito: document.getElementById("servicoFavorito"),
  tagsInput: document.getElementById("tagsInput"),
  tagsShell: document.getElementById("tagsShell"),
  formFeedback: document.getElementById("formFeedback"),
  btnCancelarForm: document.getElementById("btnCancelarForm"),
  btnSalvarServico: document.getElementById("btnSalvarServico"),
  categoriasLista: document.getElementById("categoriasLista"),
  novaCategoriaNome: document.getElementById("novaCategoriaNome"),
  novaCategoriaParent: document.getElementById("novaCategoriaParent"),
  novaCategoriaCor: document.getElementById("novaCategoriaCor"),
  novaCategoriaImg: document.getElementById("novaCategoriaImg"),
  novaCategoriaImgNome: document.getElementById("novaCategoriaImgNome"),
  btnAddCategoria: document.getElementById("btnAddCategoria"),
  usageStatsList: document.getElementById("usageStatsList"),
  btnExportar: document.getElementById("btnExportar"),
  inputImportar: document.getElementById("inputImportar"),
  btnResetTudo: document.getElementById("btnResetTudo")
};
const modals = initModals(modalEls, store, actions);
initToasts(toastStack, bus);

/* ---------- paleta de comandos ---------- */
const palette = initPalette(
  { overlay: document.getElementById("paletteOverlay"), input: document.getElementById("paletteInput"), results: document.getElementById("paletteResults") },
  store, actions,
  (q) => {
    const acoes = [
      { tipo: "acao", nome: "Adicionar novo serviço", icon: "plus", run: () => { modals.abrirConfig("servicos"); modals.mostrarFormAdd(); } },
      { tipo: "acao", nome: "Abrir configurações", icon: "sliders", run: () => modals.abrirConfig("geral") },
      { tipo: "acao", nome: "Exportar cópia de segurança", icon: "download", run: () => actions.exportarDados() },
      { tipo: "acao", nome: "Alternar vista (grelha/lista)", icon: "grid", run: () => actions.setViewMode(store.getState().viewMode === "grid" ? "list" : "grid") },
      { tipo: "acao", nome: "Ir para o início", icon: "home", run: () => actions.setScope({ tipo: "home" }) }
    ];
    return q ? acoes.filter(a => a.nome.toLowerCase().includes(q)) : acoes;
  }
);

/* ---------- handlers partilhados entre a sidebar, a barra de navegação (crumb) e a grelha principal ---------- */
let dragSrcId = null;
let catDragSrcId = null;
const handlers = {
  onSearch: debounce((v) => actions.setSearch(v), 120),
  onNav: (tipo) => actions.setScope({ tipo }),
  onAbrirModulo: (modulo) => {
    actions.setSearch("");
    searchInput.value = "";
    actions.setScope({ tipo: "modulo", modulo });
  },
  onSelectCategory: (categoriaId) => {
    expandPathTo(store.getState().categorias, categoriaId);
    actions.setSearch("");
    searchInput.value = "";
    actions.setScope({ tipo: "categoria-direta", categoriaId });
  },
  onAddCategory: () => modals.abrirConfig("categorias"),
  onAbrir: (id) => actions.abrirEmNovaAba(id),
  onFavorito: (id) => actions.alternarFavorito(id),
  onDragStart: (e, id) => { dragSrcId = id; e.currentTarget.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; },
  onDrop: (id) => { if (dragSrcId !== null && dragSrcId !== id) { actions.reordenarServicos(dragSrcId, id); if (store.getState().sortBy !== "ordem") actions.setSort("ordem"); } },
  onDragEnd: () => { document.querySelectorAll(".card-servico.dragging").forEach(c => c.classList.remove("dragging")); dragSrcId = null; },
  onCategoriaDragStart: (e, id) => { catDragSrcId = id; e.currentTarget.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; },
  onCategoriaDrop: (id) => { if (catDragSrcId !== null && catDragSrcId !== id) actions.reordenarCategorias(catDragSrcId, id); },
  onCategoriaDragEnd: () => { document.querySelectorAll(".cat-card.dragging").forEach(c => c.classList.remove("dragging")); catDragSrcId = null; },
  onEmptyAction: () => {
    if (store.getState().servicos.length === 0) { modals.abrirConfig("servicos"); modals.mostrarFormAdd(); }
    else { searchInput.value = ""; actions.setSearch(""); actions.setScope({ tipo: "home" }); }
  }
};

/* ---------- ligação da topbar ---------- */
searchInput.addEventListener("input", debounce((e) => actions.setSearch(e.target.value), 120));
selectSort.addEventListener("change", () => actions.setSort(selectSort.value));
viewToggle.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn) return;
  viewToggle.querySelectorAll("button").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  actions.setViewMode(btn.dataset.view);
});
btnRefresh.addEventListener("click", async () => {
  btnRefresh.classList.add("spin-once");
  await actions.recarregarDoServidor();
  setTimeout(() => btnRefresh.classList.remove("spin-once"), 500);
  bus.emit("toast:show", { type: "ok", msg: "Dados atualizados a partir do servidor." });
});
btnNovoServico.addEventListener("click", () => { modals.abrirConfig("servicos"); modals.mostrarFormAdd(); });
btnAbrirConfig.addEventListener("click", () => modals.abrirConfig("geral"));

sidebarToggle.addEventListener("click", () => appRoot.classList.toggle("collapsed"));
const mobileMq = window.matchMedia("(max-width: 960px)");
function aplicarEstadoResponsivo(e) { appRoot.classList.toggle("collapsed", e.matches); }
if (mobileMq.matches) appRoot.classList.add("collapsed");
mobileMq.addEventListener("change", aplicarEstadoResponsivo);

/* ---------- atalhos de teclado ---------- */
document.addEventListener("keydown", (e) => {
  const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); palette.open(); return; }
  if (e.key === "/" && !isTyping) { e.preventDefault(); searchInput.focus(); return; }
  if (e.key === "Escape") {
    if (palette.isOpen()) palette.close();
    else if (modalEls.modalConfig.classList.contains("active")) modals.fecharConfig();
  }
});

/* ---------- render orquestrado a partir do estado ---------- */
function renderAll(state) {
  if (!state.pronto) return;
  renderSidebar(sidebarContainer, state, handlers);
  renderCrumb(crumbContainer, state, handlers);
  renderMainContent(contentRoot, state, handlers);
  searchInput.value = state.searchQuery;
  selectSort.value = state.sortBy;
  viewToggle.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.view === state.viewMode));
  modals.refreshOnStateChange();
}
store.subscribe(renderAll);

/* ---------- entrada (login / criar conta por farmácia) ---------- */
const loginGate = document.getElementById("loginGate");
const loginTabs = document.getElementById("loginTabs");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const loginStatusText = document.getElementById("loginStatusText");
const farmaciaLabel = document.getElementById("farmaciaLabel");
const btnLogout = document.getElementById("btnLogout");

function mostrarErroLogin(msg) {
  loginStatusText.textContent = msg;
  loginStatusText.classList.remove("ok");
}

loginTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".login-tab");
  if (!btn) return;
  loginTabs.querySelectorAll(".login-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const isSignup = btn.dataset.tab === "signup";
  loginForm.hidden = isSignup;
  signupForm.hidden = !isSignup;
  loginStatusText.textContent = "";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("loginSubmit");
  btn.disabled = true;
  try {
    const perfil = await login({ email: document.getElementById("loginEmail").value, password: document.getElementById("loginPassword").value });
    await entrarNaApp(perfil);
  } catch (err) {
    mostrarErroLogin(err.message || "Não foi possível iniciar sessão.");
  } finally { btn.disabled = false; }
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("signupSubmit");
  btn.disabled = true;
  try {
    const perfil = await signup({
      nomeFarmacia: document.getElementById("signupNomeFarmacia").value,
      email: document.getElementById("signupEmail").value,
      password: document.getElementById("signupPassword").value
    });
    await entrarNaApp(perfil);
  } catch (err) {
    mostrarErroLogin(err.message || "Não foi possível criar a conta.");
  } finally { btn.disabled = false; }
});

btnLogout.addEventListener("click", () => {
  logout();
  location.reload();
});

// se o servidor recusar o token (expirado/inválido) a meio da sessão, volta ao ecrã de entrada
aoExpirarSessao(() => {
  bus.emit("toast:show", { type: "err", msg: "A sessão expirou. Inicie sessão novamente." });
  setTimeout(() => location.reload(), 600);
});

async function entrarNaApp(perfil) {
  loginStatusText.textContent = "";
  loginGate.hidden = true;
  appRoot.hidden = false;
  farmaciaLabel.textContent = perfil?.nomeFarmacia || getPerfil()?.nomeFarmacia || "";
  await arrancarCentral();
}

async function arrancarCentral() {
  try {
    await initRemote();
    await migrarDadosLocaisSeNecessario(dataStore, CATEGORIAS_PADRAO);
    await actions.iniciar();
  } catch (err) {
    console.error("Falha ao iniciar a Central:", err);
    bus.emit("toast:show", { type: "err", msg: "Não foi possível contactar o servidor. Verifique a ligação e tente novamente (botão Atualizar)." });
  }
}

/* ---------- arranque ---------- */
if (isAutenticado()) {
  loginGate.hidden = true;
  appRoot.hidden = false;
  farmaciaLabel.textContent = getPerfil()?.nomeFarmacia || "";
  arrancarCentral();
} else {
  loginGate.hidden = false;
  appRoot.hidden = true;
}

/* ---------- sincronização entre computadores -----------
   A app grava sempre no servidor partilhado (Netlify Blobs), mas outros
   computadores só veem as alterações quando voltam a pedir os dados. Para
   isso acontecer sem esforço manual: */
// 1) ao voltar a esta aba depois de estar em segundo plano
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && store.getState().pronto && store.getState().syncStatus === "synced" && !modalEls.modalConfig.classList.contains("active")) {
    actions.recarregarDoServidor();
  }
});
// 2) periodicamente, em fundo, sem incomodar quem está a editar
setInterval(() => {
  if (!document.hidden && store.getState().pronto && store.getState().syncStatus === "synced" && !modalEls.modalConfig.classList.contains("active") && !palette.isOpen()) {
    actions.recarregarDoServidor();
  }
}, 25000);

/* ---------- service worker (carregamentos instantâneos em visitas repetidas) ---------- */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("Service worker não registado:", err));
  });
}
