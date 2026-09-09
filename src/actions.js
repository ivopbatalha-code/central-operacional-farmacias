/**
 * actions.js — única camada autorizada a misturar "store puro" com efeitos
 * assíncronos (chamadas à API partilhada, notificações). Os componentes de
 * UI nunca tocam em `dataStore` diretamente: chamam sempre uma função daqui.
 *
 * Estratégia de sincronização (cache inteligente):
 *  - toda a escrita atualiza primeiro o estado em memória (otimista);
 *  - a persistência real (para o servidor/Netlify Blobs, partilhado por
 *    todos os computadores) é "debounced" (350ms) para agrupar escritas
 *    rápidas consecutivas num só pedido à API;
 *  - o estado de sincronização (`syncStatus`) fica visível na sidebar;
 *  - `flushSync()` é forçado em `visibilitychange`/`beforeunload` para
 *    nunca perder a última alteração ao fechar ou trocar de separador;
 *  - `recarregarDoServidor()` vai buscar as alterações feitas por OUTROS
 *    computadores (chamado no arranque, ao voltar à aba, periodicamente,
 *    e no botão "Atualizar").
 */
import { bus } from "./events.js";
import { nowTs, uid } from "./utils.js";
import { CATEGORIA_INDEFINIDA_ID, CATEGORIAS_PADRAO } from "./domain.js";
import { getPerfil } from "./authClient.js";

function stripTransient(s) {
  // `htmlContent`/`arquivoBase64` NUNCA vão no payload do estado geral: vivem
  // no seu próprio blob (ver `chaveConteudoServico` via dataStore.setAsset/
  // getAsset), para que o pedido de gravação do estado se mantenha sempre
  // leve, por muitos ou grandes que sejam os documentos já carregados. Ver
  // `abrirEmNovaAba` para o fallback que vai buscar o conteúdo quando não
  // está em memória.
  const { blobUrl, htmlContent, arquivoBase64, ...rest } = s;
  return rest;
}
function chaveConteudoServico(id) { return `servico-conteudo:${id}`; }

/** data:mime;base64,XXXX -> Blob binário, para abrir PDFs/imagens/documentos corretamente. */
function dataUrlParaBlob(dataUrl) {
  const virgula = dataUrl.indexOf(",");
  const cabecalho = dataUrl.slice(0, virgula);
  const base64 = dataUrl.slice(virgula + 1);
  const mimeMatch = cabecalho.match(/data:(.*?)(;base64)?$/);
  const mime = (mimeMatch && mimeMatch[1]) || "application/octet-stream";
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function createActions(store, dataStore) {
  let syncTimer = null;

  async function flushSync(reason) {
    clearTimeout(syncTimer);
    try {
      const st = store.getState();
      await dataStore.putAll("servicos", st.servicos.map(stripTransient));
      await dataStore.putAll("categorias", st.categorias);
      store.dispatch({ type: "SET_SYNC_STATUS", status: "synced" });
      bus.emit("sync:done", { reason });
    } catch (err) {
      console.error("Erro ao sincronizar dados:", err);
      store.dispatch({ type: "SET_SYNC_STATUS", status: "error" });
      bus.emit("toast:show", { type: "err", msg: "Falha ao guardar no servidor. As alterações ficam só neste separador até a ligação voltar." });
    }
  }
  function scheduleSync(reason) {
    store.dispatch({ type: "SET_SYNC_STATUS", status: "syncing" });
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => flushSync(reason), 350);
  }

  const actions = {
    async iniciar() {
      const [servicos, categorias, logoBase64, nomeFarmaciaConfig, morada, emailContacto, telefoneContacto] = await Promise.all([
        dataStore.getAll("servicos"),
        dataStore.getAll("categorias"),
        dataStore.getConfig("logo"),
        dataStore.getConfig("nomeFarmacia"),
        dataStore.getConfig("morada"),
        dataStore.getConfig("emailContacto"),
        dataStore.getConfig("telefoneContacto")
      ]);
      // Fonte única de verdade do nome da farmácia: `config.nomeFarmacia`
      // (editável em Configurações, é o que TODOS os módulos/ferramentas
      // devem mostrar). Antes desse campo alguma vez ser gravado (ex.: uma
      // farmácia recém-registada que ainda não abriu Configurações), cai
      // para o nome dado no registo (getPerfil()) em vez de um nome de
      // farmácia genérico de exemplo — e grava-o já em config.nomeFarmacia
      // (best-effort, silencioso) para que a partir daqui todos os locais
      // que leem o estado partilhado (incluindo os módulos) vejam o mesmo
      // valor sem terem de conhecer este fallback.
      const nomeFarmacia = nomeFarmaciaConfig || getPerfil()?.nomeFarmacia || "Farmácia";
      if (!nomeFarmaciaConfig && nomeFarmacia !== "Farmácia") {
        dataStore.setConfig("nomeFarmacia", nomeFarmacia).catch(() => {});
      }
      store.dispatch({
        type: "INIT_STATE",
        payload: {
          servicos: servicos.map(s => ({ ...s, blobUrl: null })),
          categorias: categorias.length ? categorias : CATEGORIAS_PADRAO.slice(),
          logoBase64: logoBase64 || null,
          nomeFarmacia,
          morada: morada || "",
          emailContacto: emailContacto || "",
          telefoneContacto: telefoneContacto || ""
        }
      });
    },

    /**
     * Vai buscar o estado mais recente ao servidor e substitui o estado local
     * — usado para trazer alterações feitas noutros computadores. Só é
     * chamado quando é seguro (sem escrita pendente e fora do modal de
     * configurações), para nunca pisar uma edição a meio.
     */
    async recarregarDoServidor() {
      try {
        await dataStore.refresh();
        await actions.iniciar();
        bus.emit("sync:remote-refresh", {});
      } catch (err) {
        console.error("Erro ao atualizar a partir do servidor:", err);
        bus.emit("toast:show", { type: "err", msg: "Não foi possível contactar o servidor para atualizar." });
      }
    },

    setSearch(query) { store.dispatch({ type: "SET_SEARCH", query }); },
    setScope(scope) { store.dispatch({ type: "SET_SCOPE", scope }); },
    setSort(sortBy) { store.dispatch({ type: "SET_SORT", sortBy }); },
    setViewMode(viewMode) { store.dispatch({ type: "SET_VIEWMODE", viewMode }); },

    async setLogo(base64) {
      store.dispatch({ type: "SET_LOGO", logoBase64: base64 });
      await dataStore.setConfig("logo", base64);
      bus.emit("toast:show", { type: "ok", msg: "Logótipo atualizado." });
    },
    async setNomeFarmacia(nome) {
      store.dispatch({ type: "SET_NOME_FARMACIA", nome });
      await dataStore.setConfig("nomeFarmacia", nome);
    },
    async setMorada(valor) {
      store.dispatch({ type: "SET_MORADA", valor });
      await dataStore.setConfig("morada", valor);
    },
    async setEmailContacto(valor) {
      store.dispatch({ type: "SET_EMAIL_CONTACTO", valor });
      await dataStore.setConfig("emailContacto", valor);
    },
    async setTelefoneContacto(valor) {
      store.dispatch({ type: "SET_TELEFONE_CONTACTO", valor });
      await dataStore.setConfig("telefoneContacto", valor);
    },

    async criarServico(dados, onProgress) {
      const st = store.getState();
      const maxOrdem = st.servicos.reduce((m, s) => Math.max(m, s.ordem || 0), -1);
      const conteudoParaGuardar = dados.tipo === "html" ? dados.htmlContent : dados.tipo === "arquivo" ? dados.arquivoBase64 : null;
      const novo = {
        id: uid("srv"),
        nome: dados.nome, descricao: dados.descricao || "",
        tipo: dados.tipo, url: dados.tipo === "url" ? dados.url : null,
        htmlContent: dados.tipo === "html" ? dados.htmlContent : null,
        arquivoBase64: dados.tipo === "arquivo" ? dados.arquivoBase64 : null,
        arquivoNome: dados.tipo === "arquivo" ? (dados.arquivoNome || null) : null,
        imagemBase64: dados.imagemBase64 || null, imagemUrl: dados.imagemUrl || null,
        categoriaId: dados.categoriaId || CATEGORIA_INDEFINIDA_ID,
        tags: dados.tags || [], favorito: !!dados.favorito, status: dados.status || "ativo",
        ordem: maxOrdem + 1, criadoEm: nowTs(), atualizadoEm: nowTs(), ultimoAcesso: null, contadorAcessos: 0
      };
      store.dispatch({ type: "ADD_SERVICO", servico: novo });
      scheduleSync("criar-servico");
      if (conteudoParaGuardar) {
        try {
          await dataStore.setAsset(chaveConteudoServico(novo.id), conteudoParaGuardar, onProgress);
        } catch (err) {
          console.error("Erro ao guardar o conteúdo do serviço:", err);
          bus.emit("toast:show", { type: "err", msg: `Serviço "${novo.nome}" criado, mas o ficheiro não foi guardado no servidor: ${err.message}` });
          return novo;
        }
      }
      bus.emit("toast:show", { type: "ok", msg: `Serviço "${novo.nome}" adicionado.` });
      return novo;
    },

    async atualizarServico(id, dados, onProgress) {
      store.dispatch({ type: "UPDATE_SERVICO", id, dados: { ...dados, atualizadoEm: nowTs() } });
      scheduleSync("atualizar-servico");
      const atualizado = store.getState().servicos.find(s => s.id === id);
      // `dados.htmlContent`/`dados.arquivoBase64` só vêm preenchidos quando o
      // utilizador carregou um NOVO ficheiro nesta edição — se não vieram, o
      // conteúdo existente no servidor mantém-se intocado (nada a gravar aqui).
      const conteudoParaGuardar = dados.tipo === "html" && typeof dados.htmlContent === "string" && dados.htmlContent
        ? dados.htmlContent
        : dados.tipo === "arquivo" && typeof dados.arquivoBase64 === "string" && dados.arquivoBase64
        ? dados.arquivoBase64
        : null;
      if (conteudoParaGuardar) {
        try {
          await dataStore.setAsset(chaveConteudoServico(id), conteudoParaGuardar, onProgress);
        } catch (err) {
          console.error("Erro ao guardar o conteúdo do serviço:", err);
          bus.emit("toast:show", { type: "err", msg: `Serviço "${atualizado?.nome || ""}" atualizado, mas o novo ficheiro não foi guardado no servidor: ${err.message}` });
          return atualizado;
        }
      }
      if (atualizado) bus.emit("toast:show", { type: "ok", msg: `Serviço "${atualizado.nome}" atualizado.` });
      return atualizado;
    },

    async removerServico(id) {
      const alvo = store.getState().servicos.find(s => s.id === id);
      store.dispatch({ type: "REMOVE_SERVICO", id });
      scheduleSync("remover-servico");
      if (alvo?.tipo === "html" || alvo?.tipo === "arquivo") dataStore.deleteAsset(chaveConteudoServico(id));
      if (alvo) bus.emit("toast:show", { type: "warn", msg: `Serviço "${alvo.nome}" removido.` });
    },

    async alternarFavorito(id) {
      store.dispatch({ type: "TOGGLE_FAVORITO", id });
      scheduleSync("favorito");
    },

    async reordenarServicos(fromId, toId) {
      store.dispatch({ type: "REORDER_SERVICOS", fromId, toId });
      scheduleSync("reordenar");
    },

    async registarAcesso(id) {
      store.dispatch({ type: "REGISTER_ACESSO", id });
      scheduleSync("acesso");
    },

    /**
     * Abre o serviço numa nova aba. Para serviços HTML/ficheiro cujo
     * conteúdo já está em memória (criados/editados nesta mesma sessão),
     * abre de imediato. Caso contrário (carregado noutra sessão/computador,
     * onde o estado geral nunca inclui o conteúdo completo), vai buscar o
     * conteúdo ao seu blob próprio primeiro. Abre a aba em branco de
     * imediato (dentro do mesmo gesto do utilizador) e só depois navega
     * para o conteúdo, para não ser bloqueado como pop-up pelo browser.
     */
    abrirEmNovaAba(id) {
      const st = store.getState();
      const serv = st.servicos.find(s => s.id === id);
      if (!serv) return;

      if (serv.tipo === "url" && serv.url) {
        const url = /^https?:\/\//i.test(serv.url) ? serv.url : "https://" + serv.url;
        window.open(url, "_blank");
        actions.registarAcesso(id);
        return;
      }

      if (serv.tipo === "html" && serv.htmlContent) {
        const blob = new Blob([serv.htmlContent], { type: "text/html" });
        window.open(URL.createObjectURL(blob), "_blank");
        actions.registarAcesso(id);
        return;
      }

      if (serv.tipo === "arquivo" && serv.arquivoBase64) {
        const blob = dataUrlParaBlob(serv.arquivoBase64);
        window.open(URL.createObjectURL(blob), "_blank");
        actions.registarAcesso(id);
        return;
      }

      if (serv.tipo === "html" || serv.tipo === "arquivo") {
        const janela = window.open("", "_blank");
        dataStore.getAsset(chaveConteudoServico(id)).then(content => {
          if (!content) {
            bus.emit("toast:show", { type: "err", msg: "Não foi possível encontrar o conteúdo deste serviço no servidor." });
            if (janela) janela.close();
            return;
          }
          const blob = serv.tipo === "html" ? new Blob([content], { type: "text/html" }) : dataUrlParaBlob(content);
          if (janela) janela.location.href = URL.createObjectURL(blob);
          actions.registarAcesso(id);
        }).catch(err => {
          console.error("Erro ao carregar conteúdo do serviço:", err);
          bus.emit("toast:show", { type: "err", msg: "Erro ao carregar o conteúdo deste serviço: " + err.message });
          if (janela) janela.close();
        });
        return;
      }

      bus.emit("toast:show", { type: "err", msg: "Serviço sem conteúdo válido. Edite nas configurações." });
    },

    async criarCategoria(nome, cor, parentId = null, imagem = null) {
      const st = store.getState();
      const irmas = st.categorias.filter(c => c.parentId === parentId);
      const nova = { id: uid("cat"), nome, cor: cor || "#2b7a4b", imagem, parentId, ordem: irmas.length };
      store.dispatch({ type: "ADD_CATEGORIA", categoria: nova });
      scheduleSync("categoria-criada");
      bus.emit("toast:show", { type: "ok", msg: `Categoria "${nome}" criada.` });
      return nova;
    },
    async atualizarCategoria(id, dados) {
      store.dispatch({ type: "UPDATE_CATEGORIA", id, dados });
      scheduleSync("categoria-atualizada");
    },
    async removerCategoria(id) {
      store.dispatch({ type: "REMOVE_CATEGORIA", id });
      scheduleSync("categoria-removida");
      bus.emit("toast:show", { type: "warn", msg: "Categoria removida. Os serviços ficaram com 'Categoria Indefinida'." });
    },
    async reordenarCategorias(fromId, toId) {
      store.dispatch({ type: "REORDER_CATEGORIAS", fromId, toId });
      scheduleSync("categoria-reordenada");
    },

    async exportarDados() {
      const st = store.getState();
      bus.emit("toast:show", { type: "ok", msg: "A preparar a cópia de segurança..." });
      let servicosCompletos;
      try {
        servicosCompletos = await Promise.all(st.servicos.map(async (s) => {
          const limpo = stripTransient(s);
          if (s.tipo === "html" || s.tipo === "arquivo") {
            let conteudo = s.tipo === "html" ? s.htmlContent : s.arquivoBase64;
            if (!conteudo) {
              try { conteudo = await dataStore.getAsset(chaveConteudoServico(s.id)); }
              catch (err) { console.error(`Erro ao obter o conteúdo de "${s.nome}" para a exportação:`, err); }
            }
            if (s.tipo === "html") limpo.htmlContent = conteudo || null;
            else limpo.arquivoBase64 = conteudo || null;
          }
          return limpo;
        }));
      } catch (err) {
        console.error("Erro ao preparar a exportação:", err);
        bus.emit("toast:show", { type: "err", msg: "Erro ao preparar a cópia de segurança: " + err.message });
        return;
      }
      const payload = {
        versao: 4, exportadoEm: new Date().toISOString(),
        nomeFarmacia: st.nomeFarmacia, logoBase64: st.logoBase64,
        morada: st.morada, emailContacto: st.emailContacto, telefoneContacto: st.telefoneContacto,
        categorias: st.categorias, servicos: servicosCompletos
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `central-farmacia-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      bus.emit("toast:show", { type: "ok", msg: "Cópia de segurança exportada." });
    },

    async importarDados(file) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || !Array.isArray(data.servicos)) throw new Error("Ficheiro inválido.");

        // O conteúdo pesado de cada serviço (HTML ou ficheiro) vai para o seu
        // próprio blob antes de gravar o estado geral — senão importar um
        // backup com documentos grandes voltaria a ultrapassar o limite de
        // tamanho do pedido.
        const servicosLeves = [];
        for (const s of data.servicos) {
          const { htmlContent, arquivoBase64, ...leve } = s;
          servicosLeves.push(leve);
          const conteudo = s.tipo === "html" ? htmlContent : s.tipo === "arquivo" ? arquivoBase64 : null;
          if (conteudo) {
            try { await dataStore.setAsset(chaveConteudoServico(s.id), conteudo); }
            catch (err) { console.error(`Erro ao importar o conteúdo de "${s.nome}":`, err); }
          }
        }

        const payload = {
          servicos: servicosLeves,
          categorias: Array.isArray(data.categorias) && data.categorias.length ? data.categorias : store.getState().categorias,
          logoBase64: data.logoBase64 || store.getState().logoBase64,
          nomeFarmacia: data.nomeFarmacia || store.getState().nomeFarmacia,
          morada: data.morada ?? store.getState().morada,
          emailContacto: data.emailContacto ?? store.getState().emailContacto,
          telefoneContacto: data.telefoneContacto ?? store.getState().telefoneContacto
        };
        // No estado em memória (esta sessão) mantemos o conteúdo completo,
        // para "abrir" funcionar de imediato sem precisar de ir já buscá-lo.
        store.dispatch({ type: "IMPORT_DADOS", payload: { ...payload, servicos: data.servicos } });
        await Promise.all([
          dataStore.putAll("servicos", servicosLeves),
          dataStore.putAll("categorias", payload.categorias),
          dataStore.setConfig("logo", payload.logoBase64),
          dataStore.setConfig("nomeFarmacia", payload.nomeFarmacia),
          dataStore.setConfig("morada", payload.morada),
          dataStore.setConfig("emailContacto", payload.emailContacto),
          dataStore.setConfig("telefoneContacto", payload.telefoneContacto)
        ]);
        bus.emit("toast:show", { type: "ok", msg: "Dados importados com sucesso (visível em todos os computadores)." });
      } catch (err) {
        console.error("Erro ao importar:", err);
        bus.emit("toast:show", { type: "err", msg: "Erro ao importar ficheiro: " + err.message });
      }
    },

    async resetTudo() {
      await dataStore.clearAll();
      await dataStore.putAll("categorias", CATEGORIAS_PADRAO);
      store.dispatch({ type: "RESET_TUDO", categoriasPadrao: CATEGORIAS_PADRAO.slice() });
      bus.emit("toast:show", { type: "warn", msg: "Todos os dados foram repostos (em todos os computadores)." });
    },

    flushSync
  };

  if (typeof window !== "undefined") {
    window.addEventListener("visibilitychange", () => { if (document.hidden && store.getState().syncStatus === "syncing") flushSync("visibilitychange"); });
    window.addEventListener("beforeunload", () => { if (store.getState().syncStatus === "syncing") flushSync("beforeunload"); });
  }

  return actions;
}
