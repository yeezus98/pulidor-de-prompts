// Pulidor de Prompts — interfaz de chat.
// Funciona igual como app de Mac (Tauri) y como artefacto de Claude; cada entorno guarda el historial a su manera.
(() => {
  const $ = (id) => document.getElementById(id);
  const TAURI = window.__TAURI__ || null;
  const IS_APP = !!(TAURI && TAURI.core);
  if (IS_APP) document.documentElement.classList.add("is-app");

  const app = $("app"), hero = $("hero"), foot = $("foot"), thread = $("thread");
  const draftEl = $("draft"), sendBtn = $("btn-send"), detailEl = $("detail"), checksEl = $("checks"), hintEl = $("hint");
  if (IS_APP) foot.textContent = "Funciona sin internet y sin IA, con reglas basadas en las buenas prácticas de Anthropic.";

  const MAX_Q = 3; // preguntas por ronda: rápido antes que exhaustivo
  const ITEMS = {
    contexto: { name: "Contexto", core: true, desc: "Quién eres, para quién es y para qué." },
    tarea:    { name: "Tarea", core: true, desc: "Qué quieres, con un verbo de acción." },
    entrega:  { name: "Entrega", core: true, desc: "Formato, extensión, tono y qué es terminado." },
    material: { name: "Material", core: false, desc: "Texto largo o pegado: arriba, en <material>." },
    reglas:   { name: "Reglas en positivo", core: false, desc: "Solo si Claude repite un error." },
    ejemplos: { name: "Ejemplos", core: false, desc: "Si importa un formato o tono exacto." }
  };
  const CORE = ["contexto", "tarea", "entrega"];

  function warnings(raw) {
    const w = [];
    if (!raw || !raw.trim()) return w;
    const caps = (raw.match(/\b[A-ZÁÉÍÓÚÑ]{4,}\b/g) || []).filter(x => !/^(JSON|HTML|PDF|SEO|CSV|API|URL|PYME|LATAM)$/.test(x));
    if (caps.length >= 2 || /\b(CRÍTICO|CRITICO|IMPORTANTE|SIEMPRE|NUNCA|DEBES)\b/.test(raw))
      w.push(["Sin mayúsculas ni urgencia.", " Igual lo limpio, pero pídelo normal."]);
    const negs = (raw.match(/\bno\s+(uses|pongas|hagas|incluyas|escribas|menciones|agregues|añadas|des|seas)\b|\bevita\b|\bnunca\b/gi) || []).length;
    if (negs >= 2) w.push(["Di qué hacer, no qué evitar.", " En vez de \"no uses listas\", pide \"en párrafos\"."]);
    if (/paso a paso|piensa (bien|con cuidado|detenidamente)|verifica|revisa dos veces|double[- ]?check/i.test(raw))
      w.push(["No pidas que piense o verifique.", " Ya lo hace solo; pedirlo lo hace más lento."]);
    return w;
  }

  // ---------- Estado del chat ----------
  // chat v3 = { v:3, id, title, createdAt, updatedAt, request, answers:{}, type, mode:"idle"|"offer"|"qa", queue:[], qDone, messages:[] }
  // mensajes: {role:"user", text, choice?} · {role:"bot", kind:"offer"|"question"|"prompt", ...}
  let chat = null, detailOpen = false, sampleFn = undefined;

  const evaluate = () => Engine.run(chat.request, chat.answers, chat.type, { noHoles: true });
  const hasPrompt = () => chat.messages.some(m => m.kind === "prompt");
  const currentQuestion = () => chat && chat.mode === "qa" ? [...chat.messages].reverse().find(m => m.kind === "question") : null;

  // ---------- Checklist de la caja ----------
  function render() {
    const draft = draftEl.value;
    const qa = !!(chat && chat.mode === "qa");
    const text = [chat ? chat.request : "", qa ? "" : draft].filter(s => s && s.trim()).join("\n\n");
    const r = text ? Engine.run(text, chat ? chat.answers : {}, chat ? chat.type : null) : null;
    const c = r ? r.checks : null;

    checksEl.replaceChildren(...CORE.map(k => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chk " + (c ? c[k].estado : "falta");
      b.setAttribute("aria-expanded", String(detailOpen));
      b.setAttribute("aria-controls", "detail");
      b.title = c ? c[k].nota : ITEMS[k].desc;
      const d = document.createElement("span"); d.className = "d";
      const l = document.createElement("span"); l.textContent = ITEMS[k].name;
      b.append(d, l);
      b.onclick = () => setDetail(!detailOpen);
      return b;
    }));

    if (detailOpen) {
      const nodes = [];
      const h = (txt) => { const e = document.createElement("h3"); e.textContent = txt; return e; };
      const head = document.createElement("div"); head.className = "detail-head";
      const close = document.createElement("button"); close.type = "button"; close.className = "icon-btn detail-close"; close.setAttribute("aria-label", "Cerrar");
      close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      close.onclick = () => setDetail(false);
      head.append(h("Esenciales"), close); nodes.push(head);
      const row = (k) => {
        const s = c ? c[k] : { estado: ITEMS[k].core ? "falta" : "opcional", nota: ITEMS[k].desc };
        const el = document.createElement("div"); el.className = "row " + s.estado;
        const d = document.createElement("span"); d.className = "d";
        const t = document.createElement("div");
        const b = document.createElement("b"); b.textContent = ITEMS[k].name;
        const n = document.createElement("span"); n.textContent = s.nota || ITEMS[k].desc;
        t.append(b, n); el.append(d, t); return el;
      };
      CORE.forEach(k => nodes.push(row(k)));
      nodes.push(h("Opcionales"));
      ["material", "reglas", "ejemplos"].forEach(k => nodes.push(row(k)));
      const ws = warnings(text);
      if (ws.length) {
        nodes.push(h("Para mejorar"));
        const ul = document.createElement("ul"); ul.className = "tips";
        ws.forEach(([b, rest]) => { const li = document.createElement("li"); const s = document.createElement("b"); s.textContent = b; li.append(s, rest); ul.append(li); });
        nodes.push(ul);
      }
      detailEl.replaceChildren(...nodes);
    }
    detailEl.hidden = !detailOpen;

    const q = currentQuestion();
    const ws = warnings(draft);
    hintEl.replaceChildren();
    if (q) hintEl.textContent = q.key === "material" ? "Pega el texto y presiona Enter." : "Responde con tus palabras y presiona Enter.";
    else if (ws.length) { const b = document.createElement("b"); b.textContent = ws[0][0]; hintEl.append(b, ws[0][1]); }
    else if (!text) hintEl.textContent = "Contexto, Tarea y Entrega se marcan mientras escribes.";
    else if (CORE.every(k => c[k].estado === "ok")) hintEl.textContent = "Tiene lo esencial.";
    else { const miss = CORE.find(k => c[k].estado !== "ok"); hintEl.textContent = c[miss].nota; }

    draftEl.placeholder = q ? (q.ex || "Escribe tu respuesta") : chat ? "Agrega más detalles…" : "¿Qué le quieres pedir a Claude?";
    sendBtn.disabled = !draft.trim();
    sendBtn.setAttribute("aria-label", q ? "Responder" : "Enviar");
  }
  function setDetail(open) { detailOpen = open; render(); }

  function autosize() { draftEl.style.height = "auto"; draftEl.style.height = Math.min(draftEl.scrollHeight, window.innerHeight * 0.38) + "px"; }

  // ---------- Pintar el chat ----------
  function setChatting(on) {
    app.classList.toggle("chatting", on);
    hero.hidden = on; foot.hidden = on; thread.hidden = !on;
    $("btn-reset").hidden = !on;
  }
  function scrollDown() { requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })); }

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, onClick, id) { const b = el("button", cls, text); b.type = "button"; if (id) b.id = id; b.onclick = onClick; return b; }

  const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  async function copyText(text) {
    if (IS_APP && TAURI.clipboardManager) return TAURI.clipboardManager.writeText(text);
    return navigator.clipboard.writeText(text);
  }
  function copyButton(text, pre) {
    const b = el("button", "pill-btn"); b.type = "button";
    const set = (txt) => { b.innerHTML = COPY_ICON; b.append(txt); };
    set("Copiar");
    b.onclick = async () => {
      try { await copyText(text); set("Copiado"); }
      catch { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); set("Selecciona y copia con ⌘C"); }
      setTimeout(() => set("Copiar"), 1800);
    };
    return b;
  }
  function resultCard(title, text, extraBtn, cls) {
    const wrap = el("div", "result" + (cls ? " " + cls : ""));
    const head = el("div", "result-head");
    const pre = el("pre");
    text.split(/(\[[^\]\n]{1,120}\])/).forEach(part => {
      if (/^\[.*\]$/.test(part)) pre.append(el("span", "hole", part)); else pre.append(document.createTextNode(part));
    });
    const actions = el("div", "result-actions");
    if (extraBtn) actions.append(extraBtn);
    actions.append(copyButton(text, pre));
    head.append(el("span", "label", title), actions); wrap.append(head, pre);
    return wrap;
  }

  function renderMsg(m, isLast) {
    if (m.role === "user") {
      const d = el("div", "u" + (m.choice ? " choice" : ""), m.text);
      if (m.text.length > 600 || m.text.split("\n").length > 10) d.classList.add("long");
      return d;
    }
    const d = el("div", "a");
    const mark = el("span", "mark"); mark.setAttribute("aria-hidden", "true");
    const body = el("div");
    body.append(el("p", "text", m.text));
    const live = isLast && chat;

    if (m.kind === "offer" && live && chat.mode === "offer") {
      const acts = el("div", "actions");
      acts.append(btn("pill-btn", "Responder preguntas", startQA, "act-qa"), btn("line-btn", "Generar prompt de todos modos", generateAnyway, "act-anyway"));
      body.append(acts);
    }
    if (m.kind === "question") {
      body.append(el("p", "q-meta", "Pregunta " + m.n + " de " + m.total));
      if (live && chat.mode === "qa") {
        const acts = el("div", "actions");
        acts.append(btn("link-btn", "Omitir esta", skipQuestion, "act-skip"), btn("link-btn", "Generar ya", generateNow, "act-now"));
        body.append(acts);
      }
    }
    if (m.kind === "prompt") {
      let cmp = null;
      if (live && sampleFn) {
        cmp = btn("line-btn", m.claude ? "Comparar de nuevo" : "Comparar con Claude", () => compareWithClaude(m, cmp), "cmp-btn");
      }
      body.append(resultCard("Prompt", m.prompt || "", cmp));
      if (m.claude) body.append(resultCard("Versión de Claude", m.claude, null, "claude"));
      if (m.missing && m.missing.length) {
        const box = el("div", "missing");
        box.append(el("p", null, "Puede quedar mejor si me cuentas:"));
        const ul = el("ul"); m.missing.forEach(q => ul.append(el("li", null, q)));
        box.append(ul);
        if (live && chat.mode === "idle") { const acts = el("div", "actions"); acts.append(btn("pill-btn", "Responder preguntas", startQA, "act-qa")); box.append(acts); }
        body.append(box);
      }
      if (m.changes && m.changes.length) {
        const det = el("details", "changes");
        det.append(el("summary", null, "Qué ajusté (" + m.changes.length + ")"));
        const ul = el("ul"); m.changes.forEach(c => ul.append(el("li", null, c)));
        det.append(ul); body.append(det);
      }
    }
    d.append(mark, body);
    return d;
  }

  function renderThread() {
    thread.replaceChildren();
    if (!chat) return;
    chat.messages.forEach((m, i) => thread.append(renderMsg(m, i === chat.messages.length - 1)));
  }
  function push(msg) { chat.messages.push(msg); renderThread(); render(); scrollDown(); schedulePersist(); }

  // ---------- Flujo de conversación ----------
  function newChatObj(text) {
    const now = Date.now();
    return { v: 3, id: "c" + now.toString(36) + Math.random().toString(36).slice(2, 7), title: text.replace(/\s+/g, " ").slice(0, 70),
      createdAt: now, updatedAt: now, request: "", answers: {}, type: null, mode: "idle", queue: [], qDone: 0, messages: [] };
  }

  function send() {
    const text = draftEl.value.trim();
    if (!text) return;
    draftEl.value = ""; autosize(); detailOpen = false;
    if (!chat) { chat = newChatObj(text); setChatting(true); }
    if (chat.mode === "qa" && chat.queue.length) { answerQuestion(text); return; }

    // Pedido nuevo o más detalles
    chat.request = chat.request ? chat.request + "\n\n" + text : text;
    chat.messages.push({ role: "user", text });
    const r = evaluate();
    const n = Math.min(r.missing.length, MAX_Q);
    if (hasPrompt() || !n) { finish(hasPrompt() ? "update" : "complete"); return; }
    chat.mode = "offer";
    push({ role: "bot", kind: "offer", text: "Tengo tu prompt optimizado, pero puedo mejorarlo si me respondes " + (n === 1 ? "una pregunta rápida." : n + " preguntas rápidas.") });
  }

  function startQA() {
    const r = evaluate();
    chat.queue = r.missing.slice(0, MAX_Q).map(m => m.key);
    chat.qDone = 0;
    chat.mode = "qa";
    chat.messages.push({ role: "user", text: "Responder preguntas", choice: true });
    askNext();
    draftEl.focus();
  }

  function askNext() {
    const missingNow = evaluate().missing;
    const pending = new Set(missingNow.map(m => m.key));
    chat.queue = chat.queue.filter(k => pending.has(k)); // quitar lo que ya se respondió de paso
    if (!chat.queue.length) { finish("qa"); return; }
    const info = missingNow.find(m => m.key === chat.queue[0]);
    push({ role: "bot", kind: "question", key: info.key, text: info.ask, ex: info.ex, n: chat.qDone + 1, total: chat.qDone + chat.queue.length });
  }

  function answerQuestion(text) {
    const key = chat.queue.shift();
    let value = Engine.normalizeAnswer(key, text);
    if (key !== "material") {
      const extra = Engine.detectSlots(text); // si de paso respondió otra cosa, la aprovechamos
      // si la respuesta trae más de un dato, quedarse con la parte que corresponde a esta pregunta
      if (value !== "__skip" && extra[key] && !["red", "lenguaje", "idiomaDestino", "cantidad"].includes(key) && Object.keys(extra).length > 1) value = extra[key];
      for (const k of Object.keys(extra)) if (k !== key && !chat.answers[k]) chat.answers[k] = extra[k];
    }
    chat.answers[key] = value;
    chat.qDone++;
    chat.messages.push({ role: "user", text });
    askNext();
  }

  function skipQuestion() {
    const key = chat.queue.shift();
    if (key) chat.answers[key] = "__skip";
    chat.qDone++;
    chat.messages.push({ role: "user", text: "Omitir", choice: true });
    askNext();
  }
  function generateNow() {
    chat.queue = [];
    chat.messages.push({ role: "user", text: "Generar ya", choice: true });
    finish("qa");
  }
  function generateAnyway() {
    chat.messages.push({ role: "user", text: "Generar prompt de todos modos", choice: true });
    finish("anyway");
  }

  function finish(reason) {
    const r = evaluate();
    chat.mode = "idle"; chat.queue = [];
    const missing = r.missing.slice(0, MAX_Q).map(m => m.ask);
    const text = reason === "update" ? "Actualicé tu prompt con lo nuevo."
      : missing.length ? "Aquí está tu prompt optimizado."
      : "Listo, aquí está tu prompt optimizado.";
    push({ role: "bot", kind: "prompt", text, prompt: r.prompt, missing, changes: r.changes });
  }

  // ---------- Comparar con Claude (solo en el artefacto) ----------
  const CMP_ERRORS = {
    not_granted: "Claude no tiene permiso en esta página. Tu prompt no cambia.",
    sampling_disabled: "Claude no está disponible para tu cuenta. Tu prompt no cambia.",
    rate_limited: "Llegaste a tu límite de uso de Claude. Vuelve a intentarlo más tarde.",
    session_expired: "Tu sesión de Claude expiró. Inicia sesión de nuevo y vuelve a intentarlo.",
    prompt_too_large: "El texto es demasiado largo para comparar. Acorta el material.",
    refused: "Claude no procesó este pedido. Tu prompt no cambia.",
    empty_completion: "Claude no devolvió texto. Vuelve a intentarlo.",
    upstream_error: "Se perdió la conexión con Claude. Vuelve a intentarlo."
  };
  async function compareWithClaude(m, b) {
    if (!sampleFn || !b) return;
    b.disabled = true; b.textContent = "Comparando…"; b.classList.add("shimmer");
    const instr = `Eres editor de prompts para Claude. Mejora la redacción de este prompt según estas prácticas: contexto (quién es, para quién y para qué), tarea con verbo de acción, entrega (formato, extensión, tono, qué es terminado), material largo arriba dentro de <material>, reglas en positivo y con su porqué, sin mayúsculas ni urgencia, sin "piensa paso a paso". No inventes datos. Mantén la estructura Contexto / Tarea / Entrega (y Reglas si existen). Responde solo con el prompt mejorado, sin comentarios.

Pedido original del usuario:
"""
${chat.request.slice(0, 20000)}
"""

Prompt armado por reglas:
"""
${(m.prompt || "").slice(0, 20000)}
"""`;
    try {
      const res = await sampleFn(instr, { cache: false });
      m.claude = res.text.trim().replace(/^```[a-z]*\n?|```$/g, "").trim();
      renderThread(); persistNow();
    } catch (e) {
      const code = e && e.code;
      b.disabled = false; b.classList.remove("shimmer"); b.textContent = "Comparar con Claude";
      if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(code)) { sampleFn = null; b.remove(); }
      hintEl.textContent = CMP_ERRORS[code] || CMP_ERRORS.upstream_error;
    }
  }
  if (!IS_APP && window.claude && window.claude.use) {
    window.claude.use("sample").then(s => { sampleFn = s || null; if (chat) renderThread(); }).catch(() => { sampleFn = null; });
  } else sampleFn = null;

  // ---------- Historial: formato y migración ----------
  function migrate(c) {
    if (!c || c.v === 3) return c;
    let v2 = c;
    if (c.v !== 2) {
      const msgs = c.messages || [], turns = [];
      for (const m of msgs) {
        if (m.role === "user") turns.push({ text: m.content });
        else if (turns.length && m.prompt) turns[turns.length - 1].prompt = m.prompt;
      }
      v2 = { id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, request: msgs.filter(m => m.role === "user").map(m => m.content).join("\n\n"), answers: {}, turns };
    }
    const messages = [];
    (v2.turns || []).forEach(t => {
      messages.push({ role: "user", text: t.text || "" });
      if (t.prompt) messages.push({ role: "bot", kind: "prompt", text: "Así quedó tu prompt.", prompt: t.prompt, missing: [], changes: [], claude: t.claude });
    });
    return { v: 3, id: v2.id, title: v2.title, createdAt: v2.createdAt, updatedAt: v2.updatedAt, request: v2.request || "", answers: v2.answers || {}, type: v2.type || null, mode: "idle", queue: [], qDone: 0, messages };
  }

  // ---------- Historial: almacenamiento ----------
  const LS_KEY = "pulidor-chats";
  let chats = [];
  const cache = new Map();
  let store = null, storeReady = Promise.resolve();

  const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } };
  const lsWrite = (arr) => { try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); return true; } catch { return false; } };
  const localStore = {
    kind: "local",
    async save(c) { const arr = lsRead().filter(x => x.id !== c.id); arr.unshift(c); if (!lsWrite(arr.slice(0, 200))) throw { code: "local_full" }; refreshLocalList(); },
    async saveMany(list) { const ids = new Set(list.map(c => c.id)); if (!lsWrite([...list, ...lsRead().filter(x => !ids.has(x.id))].slice(0, 200))) throw { code: "local_full" }; refreshLocalList(); },
    async remove(id) { lsWrite(lsRead().filter(x => x.id !== id)); refreshLocalList(); },
    async load(id) { return lsRead().find(x => x.id === id) || null; },
    async list() { return lsRead(); }
  };
  function refreshLocalList() {
    const arr = lsRead();
    arr.forEach(c => cache.set(c.id, c));
    chats = arr.map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt);
    renderChats();
  }

  async function initStore() {
    if (IS_APP) {
      // App de Mac: un archivo dentro de la carpeta de datos de la app (ver src-tauri/src/lib.rs)
      let data = { chats: [] };
      try { const p = JSON.parse(await TAURI.core.invoke("load_history")); if (p && Array.isArray(p.chats)) data = p; }
      catch { showBanner("No pude leer el historial guardado. Tus prompts nuevos se guardarán igual."); }
      const all = new Map(data.chats.map(migrate).filter(c => c && c.id).map(c => [c.id, c]));
      const writeAll = () => TAURI.core.invoke("save_history", { data: JSON.stringify({ v: 3, savedAt: Date.now(), chats: [...all.values()] }) });
      const refresh = () => {
        all.forEach(c => cache.set(c.id, c));
        chats = [...all.values()].map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt);
        renderChats();
      };
      store = {
        kind: "mac",
        async save(c) { all.set(c.id, c); await writeAll(); refresh(); },
        async saveMany(list) { list.forEach(c => all.set(c.id, c)); await writeAll(); refresh(); },
        async remove(id) { all.delete(id); await writeAll(); refresh(); },
        async load(id) { return all.get(id) || null; },
        async list() { return [...all.values()]; }
      };
      refresh(); renderStoreNote();
      return;
    }
    const use = window.claude && window.claude.use;
    let db = null, uid = null;
    if (use) {
      try { const [d, u] = await Promise.all([use("db"), use("user")]); db = d; uid = u ? await u.id() : null; }
      catch { db = null; }
    }
    if (db && uid) {
      try {
        const col = db.doc("data/users/" + uid + "/pulidor").collection("chats");
        store = {
          kind: "cuenta",
          async save(c) { await col.doc(c.id).set(c); },
          async saveMany(list) { for (const c of list) await col.doc(c.id).set(c); },
          async remove(id) { await col.doc(id).delete(); },
          async load(id) { const s = await col.doc(id).get(); return s.exists ? s.data() : null; },
          async list() { const snap = await col.get(); return snap.docs.map(s => s.data()); }
        };
        col.orderBy("updatedAt", "desc").limit(200).onSnapshot((snap) => {
          chats = snap.docs.map(s => { const d = s.data(); cache.set(s.id, d); return { id: s.id, title: d.title, updatedAt: d.updatedAt }; });
          renderChats();
        }, () => { store = localStore; refreshLocalList(); renderStoreNote(); });
        renderStoreNote();
        return;
      } catch { /* cae al navegador */ }
    }
    store = localStore;
    refreshLocalList();
    renderStoreNote();
  }
  function renderStoreNote() {
    $("store-note").textContent = !store ? "Cargando historial…"
      : store.kind === "mac" ? "Se guarda en tu Mac. Las actualizaciones no lo borran."
      : store.kind === "cuenta" ? "Se guarda en tu cuenta de Claude, privado para ti."
      : "Se guarda en este navegador. Si borras sus datos, se pierde.";
  }

  let persistTimer = null;
  function schedulePersist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistNow, 500); }
  async function persistNow(c = chat) {
    clearTimeout(persistTimer);
    if (!c) return;
    c.updatedAt = Date.now();
    if (c.messages.length > 120) c.messages = c.messages.slice(-120);
    const copy = JSON.parse(JSON.stringify(c));
    cache.set(c.id, copy);
    await storeReady;
    if (!store) return;
    try { await store.save(copy); }
    catch (e) {
      hintEl.textContent = e && e.code === "quota_exceeded"
        ? "El historial está lleno. Elimina algunos prompts antiguos para seguir guardando."
        : "No se pudo guardar en el historial. Se reintentará con tu próximo mensaje.";
    }
  }

  // ---------- Historial: panel ----------
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (ts) => new Date(ts).toLocaleDateString("es-PE", { day: "numeric", month: "short" });
  function groupOf(ts) {
    const d = new Date(ts), now = new Date();
    const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((start(now) - start(d)) / 864e5);
    return diff === 0 ? "Hoy" : diff === 1 ? "Ayer" : diff < 7 ? "Esta semana" : "Anteriores";
  }
  function renderChats() {
    const ul = $("chats");
    if (!chats.length) { ul.replaceChildren(el("li", "empty", "Aún no hay prompts guardados. Los que armes aparecerán aquí.")); return; }
    const nodes = []; let last = "";
    for (const c of chats) {
      const g = groupOf(c.updatedAt);
      if (g !== last) { nodes.push(el("li", "group", g)); last = g; }
      const li = el("li", "chat" + (chat && chat.id === c.id ? " active" : ""));
      const open = el("button", "open-chat"); open.type = "button";
      open.append(el("span", "t", c.title || "Sin título"), el("span", "when", g === "Hoy" || g === "Ayer" ? fmtTime(c.updatedAt) : fmtDate(c.updatedAt)));
      open.onclick = () => openChat(c.id);
      const del = btn("del", "Eliminar", null);
      del.setAttribute("aria-label", "Eliminar " + (c.title || "prompt"));
      del.onclick = async () => {
        if (!del.classList.contains("confirm")) {
          del.classList.add("confirm"); del.textContent = "¿Eliminar?";
          setTimeout(() => { if (del.isConnected) { del.classList.remove("confirm"); del.textContent = "Eliminar"; } }, 3000);
          return;
        }
        try { await store.remove(c.id); cache.delete(c.id); if (chat && chat.id === c.id) newChat(); }
        catch { hintEl.textContent = "No se pudo eliminar. Vuelve a intentarlo."; }
      };
      li.append(open, del); nodes.push(li);
    }
    ul.replaceChildren(...nodes);
  }

  const drawer = $("drawer"), scrim = $("scrim"), histBtn = $("btn-history");
  const drawerOpen = () => drawer.classList.contains("open");
  function setDrawer(open) {
    drawer.classList.toggle("open", open); scrim.classList.toggle("open", open);
    histBtn.setAttribute("aria-expanded", String(open));
    if (open) { renderChats(); $("btn-new").focus(); } else histBtn.focus();
  }
  histBtn.onclick = () => setDrawer(true);
  $("btn-close").onclick = () => setDrawer(false);
  scrim.onclick = () => setDrawer(false);
  $("btn-new").onclick = () => { newChat(); setDrawer(false); };

  async function openChat(id) {
    let c = cache.get(id);
    if (!c && store) { try { c = await store.load(id); } catch { c = null; } }
    if (!c) { hintEl.textContent = "No se encontró ese prompt."; return; }
    if (chat) await persistNow();
    chat = migrate(JSON.parse(JSON.stringify(c)));
    detailOpen = false; draftEl.value = ""; autosize();
    setChatting(true); renderThread(); render(); setDrawer(false); scrollDown();
  }
  async function newChat() {
    if (chat) await persistNow();
    chat = null; detailOpen = false; thread.replaceChildren(); draftEl.value = ""; autosize();
    setChatting(false); render(); renderChats(); draftEl.focus();
  }

  // ---------- Exportar / importar ----------
  let downloadsApi = null;
  async function setupExport() {
    if (IS_APP) { $("btn-export").hidden = false; return; }
    try { downloadsApi = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch { downloadsApi = null; }
    $("btn-export").hidden = !downloadsApi;
  }
  $("btn-export").onclick = async () => {
    await storeReady;
    if (chat) await persistNow();
    let list = [];
    try { list = store && store.list ? await store.list() : []; } catch { list = []; }
    if (!list.length) { showBanner("Aún no hay prompts para exportar."); return; }
    const data = JSON.stringify({ v: 3, app: "pulidor-de-prompts", exportedAt: Date.now(), chats: list.map(migrate) }, null, 2);
    const n = list.length + (list.length === 1 ? " prompt" : " prompts");
    try {
      if (IS_APP) {
        const path = await TAURI.dialog.save({ defaultPath: "pulidor-historial.json", filters: [{ name: "Historial", extensions: ["json"] }] });
        if (!path) return;
        await TAURI.core.invoke("write_json_file", { path, data });
        showBanner("Exporté " + n + ".");
      } else if (downloadsApi) {
        await downloadsApi.save({ filename: "pulidor-historial.json", data });
        showBanner("Listo. Importa ese archivo en la app de Mac para llevar tu historial.");
      }
    } catch { showBanner("No se pudo exportar el historial. Vuelve a intentarlo."); }
  };
  $("btn-import").onclick = async () => {
    if (!IS_APP) { $("import-file").click(); return; }
    try {
      const path = await TAURI.dialog.open({ multiple: false, directory: false, filters: [{ name: "Historial", extensions: ["json"] }] });
      if (!path) return;
      importText(await TAURI.core.invoke("read_json_file", { path }));
    } catch { showBanner("No se pudo abrir ese archivo. Usa el que exportaste desde el Pulidor."); }
  };
  $("import-file").onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (file) importText(await file.text());
  };
  async function importText(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { showBanner("Ese archivo no es un historial válido. Usa el que exportaste desde el Pulidor."); return; }
    const list = (Array.isArray(parsed) ? parsed : (parsed && parsed.chats) || []).map(migrate).filter(c => c && c.id && Array.isArray(c.messages));
    if (!list.length) { showBanner("No encontré prompts en ese archivo."); return; }
    await storeReady;
    try { await store.saveMany(list); list.forEach(c => cache.set(c.id, c)); renderChats(); showBanner("Importé " + list.length + (list.length === 1 ? " prompt." : " prompts.")); }
    catch { showBanner("No se pudo importar. Vuelve a intentarlo."); }
  }

  // ---------- Avisos ----------
  let bannerTimer = null;
  function showBanner(text, actions = []) {
    clearTimeout(bannerTimer);
    $("banner-text").textContent = text;
    $("banner-actions").replaceChildren(...actions);
    $("banner").hidden = false;
    if (!actions.length) bannerTimer = setTimeout(() => { $("banner").hidden = true; }, 5000);
  }
  const hideBanner = () => { $("banner").hidden = true; };

  // ---------- Actualizaciones (solo app de Mac) ----------
  let appVersion = "";
  async function setupUpdates() {
    if (!IS_APP) return;
    try { appVersion = await TAURI.app.getVersion(); } catch { appVersion = ""; }
    $("app-version").textContent = appVersion ? "Versión " + appVersion : "";
    $("app-meta").hidden = false;
    $("btn-update").onclick = () => checkUpdate(true);
    setTimeout(() => checkUpdate(false), 4000);
  }
  async function checkUpdate(manual) {
    if (!TAURI.updater) { if (manual) showBanner("Las actualizaciones no están disponibles en esta versión."); return; }
    const b = $("btn-update");
    if (manual) { b.disabled = true; b.textContent = "Buscando…"; }
    try {
      const upd = await TAURI.updater.check();
      if (!upd) { if (manual) showBanner("Tienes la última versión."); return; }
      showBanner("Hay una versión nueva: " + upd.version + ".", [btn("line-btn", "Después", hideBanner), btn("pill-btn", "Actualizar", () => installUpdate(upd))]);
    } catch {
      if (manual) showBanner("No se pudo buscar actualizaciones. Revisa tu conexión a internet.");
    } finally {
      if (manual) { b.disabled = false; b.textContent = "Buscar actualización"; }
    }
  }
  async function installUpdate(upd) {
    try {
      if (chat) await persistNow();
      await TAURI.core.invoke("backup_history", { label: appVersion || "anterior" });
      let total = 0, got = 0;
      showBanner("Descargando la versión " + upd.version + "…", []);
      await upd.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength || 0;
        if (ev.event === "Progress") { got += ev.data.chunkLength; if (total) $("banner-text").textContent = "Descargando la versión " + upd.version + "… " + Math.round(got / total * 100) + "%"; }
        if (ev.event === "Finished") $("banner-text").textContent = "Instalando…";
      });
      showBanner("Listo. Reiniciando la app…", []);
      await TAURI.process.relaunch();
    } catch {
      showBanner("No se pudo instalar la actualización. Tu historial está intacto; vuelve a intentarlo más tarde.");
    }
  }

  // ---------- Teclado, clics y detalles nativos ----------
  $("composer").addEventListener("submit", (e) => { e.preventDefault(); send(); });
  draftEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  draftEl.addEventListener("input", () => { autosize(); render(); });
  $("btn-reset").addEventListener("click", newChat);

  // Cerrar el panel de Contexto/Tarea/Entrega al hacer clic fuera
  document.addEventListener("mousedown", (e) => {
    if (detailOpen && !e.target.closest("#composer")) setDetail(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (drawerOpen()) setDrawer(false);
      else if (detailOpen) setDetail(false);
      else if (!$("banner").hidden) hideBanner();
      return;
    }
    if (!IS_APP) return;
    if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === "n") { e.preventDefault(); newChat(); return; }
    // Escribir en cualquier parte lleva el foco a la caja (y evita el "bip" de macOS)
    const editable = e.target.closest && e.target.closest("textarea, input, select, [contenteditable]");
    if (!editable && !drawerOpen() && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) draftEl.focus();
  });
  if (IS_APP) {
    // Menú contextual solo donde tiene sentido (texto y campos), como en una app nativa
    document.addEventListener("contextmenu", (e) => {
      if (e.target.closest("textarea, input, pre, .u, .a .text, .missing") || String(getSelection())) return;
      e.preventDefault();
    });
  }

  // ---------- Tema claro / oscuro ----------
  const root = document.documentElement, themeBtn = $("btn-theme");
  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  function paintThemeBtn() {
    const dark = isDark();
    themeBtn.innerHTML = dark ? SUN : MOON;
    themeBtn.setAttribute("aria-label", dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
    themeBtn.title = dark ? "Modo claro" : "Modo oscuro";
  }
  try { const saved = localStorage.getItem("pulidor-theme"); if (saved === "dark" || saved === "light") root.dataset.theme = saved; } catch {}
  themeBtn.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("pulidor-theme", next); } catch {}
    paintThemeBtn();
  });
  const mq = matchMedia("(prefers-color-scheme: dark)");
  if (mq.addEventListener) mq.addEventListener("change", paintThemeBtn);
  paintThemeBtn();

  // ---------- Arranque ----------
  setChatting(false);
  render();
  renderChats();
  storeReady = initStore().catch(() => { store = localStore; refreshLocalList(); renderStoreNote(); });
  setupExport();
  setupUpdates();
  draftEl.focus();
})();
