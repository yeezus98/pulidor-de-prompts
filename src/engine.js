// ===== Motor de reglas del Pulidor de Prompts (sin IA) =====
// Entrada: texto del usuario + respuestas a preguntas + tipo forzado (opcional).
// Salida: tipo detectado, datos detectados, preguntas pendientes, prompt armado, checklist y cambios aplicados.
const Engine = (() => {
  // --- Texto plegado (sin tildes, minúsculas) con la MISMA longitud que el original ---
  function fold(s) {
    let out = "";
    for (const ch of s) {
      if (ch.length !== 1) { out += ch; continue; }
      const b = ch.normalize("NFD")[0].toLowerCase();
      out += b.length === 1 ? b : ch;
    }
    return out;
  }
  const T = (o) => ({ o, s: fold(o) });
  function grab(t, re, g = 1) {
    // Busca en el texto plegado y devuelve el mismo tramo del texto original (con tildes y mayúsculas).
    const m = re.exec(t.s);
    if (!m || m[g] == null) return null;
    const full = m[0], part = m[g];
    const rel = full.endsWith(part) ? full.length - part.length : full.indexOf(part);
    const a = m.index + rel;
    return t.o.slice(a, a + part.length).trim();
  }
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const low = (s) => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const endDot = (s) => /[.!?:…)]$/.test(s) ? s : s + ".";
  const has = (hay, needle) => fold(hay).includes(fold(needle));
  const clean = (s) => s.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();

  // --- Verbos: infinitivo, subjuntivo (tú), imperativo. Marca 1 = verbo genérico (se reemplaza por el del tipo) ---
  const VERB_LIST = [
    ["hacer","hagas","Haz",1],["dar","des","Da",1],["ayudar","ayudes","Ayuda",1],
    ["escribir","escribas","Escribe"],["redactar","redactes","Redacta"],["crear","crees","Crea"],["armar","armes","Arma"],
    ["generar","generes","Genera"],["resumir","resumas","Resume"],["analizar","analices","Analiza"],["traducir","traduzcas","Traduce"],
    ["corregir","corrijas","Corrige"],["revisar","revises","Revisa"],["disenar","disenes","Diseña"],["preparar","prepares","Prepara"],
    ["explicar","expliques","Explica"],["decir","digas","Di"],["mejorar","mejores","Mejora"],["proponer","propongas","Propón"],
    ["sugerir","sugieras","Sugiere"],["buscar","busques","Busca"],["comparar","compares","Compara"],["organizar","organices","Organiza"],
    ["planificar","planifiques","Planifica"],["elaborar","elabores","Elabora"],["convertir","conviertas","Convierte"],["calcular","calcules","Calcula"],
    ["recomendar","recomiendes","Recomienda"],["evaluar","evalues","Evalúa"],["listar","listes","Lista"],["desarrollar","desarrolles","Desarrolla"],
    ["programar","programes","Programa"],["optimizar","optimices","Optimiza"],["reescribir","reescribas","Reescribe"],["investigar","investigues","Investiga"],
    ["plantear","plantees","Plantea"],["inventar","inventes","Inventa"],["describir","describas","Describe"],["ensenar","ensenes","Enseña"],
    ["responder","respondas","Responde"],["contestar","contestes","Contesta"],["estructurar","estructures","Estructura"],["sintetizar","sintetices","Sintetiza"],
    ["parafrasear","parafrasees","Parafrasea"],["editar","edites","Edita"],["pasar","pases","Pasa",1],["mandar","mandes","Escribe",1],["enviar","envies","Escribe",1]
  ];
  const VERBS = new Map();
  for (const [inf, subj, imp, gen] of VERB_LIST) {
    const rec = { imp, gen: !!gen };
    [inf, subj, fold(imp).toLowerCase()].forEach(k => { if (!VERBS.has(k)) VERBS.set(k, rec); });
  }
  function lookupVerb(word) {
    if (VERBS.has(word)) return VERBS.get(word);
    for (const suf of ["melo", "mela", "selo", "sela", "noslo", "nos", "los", "las", "les", "me", "lo", "la", "le", "te"]) {
      if (word.length > suf.length + 1 && word.endsWith(suf)) {
        const base = word.slice(0, -suf.length);
        if (VERBS.has(base)) return VERBS.get(base);
      }
    }
    return null;
  }

  // --- Tipos de pedido ---
  const TYPES = {
    captions: { label: "Captions o posts", verb: "Escribe", kw: [/caption/, /\bposts?\b/, /publicacion/, /\bcopys?\b/, /\breels?\b/, /hashtag/, /\bhooks?\b/], slots: ["red", "tono", "publico", "cantidad", "extension", "extras"] },
    correo:   { label: "Correo o mensaje", verb: "Escribe", kw: [/correo/, /\bmail\b/, /email/, /\bmensaje/, /\bcarta\b/, /responder(le)? a/, /contestar(le)? a/], slots: ["destinatario", "objetivo", "tono", "extension"] },
    resumen:  { label: "Resumen", verb: "Resume", kw: [/resum/, /sintetiz/, /puntos clave/, /\btl;?dr\b/], slots: ["material", "paraQue", "formato", "extension"] },
    plan:     { label: "Plan o calendario", verb: "Arma", kw: [/\bplan\b/, /calendario/, /estrategia/, /cronograma/, /roadmap/, /planific/, /parrilla/], slots: ["red", "periodo", "objetivo", "formato"] },
    ideas:    { label: "Lluvia de ideas", verb: "Dame", kw: [/\bideas?\b/, /nombres? para/, /brainstorm/, /lluvia de ideas/, /propuestas/, /slogans?|eslogans?/], slots: ["cantidad", "publico", "criterio", "formato"] },
    codigo:   { label: "Código", verb: "Escribe", kw: [/codigo/, /\bscript\b/, /\bfuncion\b/, /programa\b/, /\b(python|javascript|typescript|html|css|sql|swift|react|node)\b/, /\bbug\b/, /error en (mi|el) /, /\bapi\b/], slots: ["lenguaje", "entorno", "entregaCodigo"] },
    analisis: { label: "Análisis o comparación", verb: "Analiza", kw: [/analiz/, /compar/, /evalua/, /pros y contras/, /ventajas/, /diferencias?/, /\bfoda\b/], slots: ["criterio", "paraQue", "formato"] },
    texto:    { label: "Texto o artículo", verb: "Escribe", kw: [/articulo/, /\bblog\b/, /ensayo/, /descripcion/, /\bbio\b/, /guion/, /\blanding\b/, /\bdiscurso\b/, /\bbrindis\b/], slots: ["publico", "tono", "extension", "formato"] },
    editar:   { label: "Corregir o mejorar un texto", verb: "Corrige", kw: [/corrig/, /mejora (este|mi|el|la|esta)\b/, /revisa (este|mi|el|la|esta)\b/, /reescrib/, /parafrase/, /\bedita (este|mi|el|la|esta)\b/], slots: ["material", "cambios", "tono"] },
    explicar: { label: "Explicación", verb: "Explica", kw: [/explica/, /^que es\b/, /\bque es (un|una|el|la)\b/, /como funciona/, /ensename/, /entender/, /por que /], slots: ["nivel", "formato", "extension"] },
    traducir: { label: "Traducción", verb: "Traduce", kw: [/traduc/], slots: ["material", "idiomaDestino", "tono"] },
    otro:     { label: "Otro", verb: "Haz", kw: [], slots: ["paraQue", "formato", "extension", "tono"] }
  };
  const TYPE_ORDER = ["traducir", "editar", "resumen", "codigo", "correo", "captions", "plan", "ideas", "analisis", "explicar", "texto"];

  // --- Datos que el motor busca (slots) ---
  const NAMES = { ig: "Instagram", instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", facebook: "Facebook", fb: "Facebook", twitter: "X", whatsapp: "WhatsApp", youtube: "YouTube", pinterest: "Pinterest", threads: "Threads",
    javascript: "JavaScript", typescript: "TypeScript", python: "Python", html: "HTML", css: "CSS", sql: "SQL", swift: "Swift", swiftui: "SwiftUI", react: "React", node: "Node.js", java: "Java", kotlin: "Kotlin", php: "PHP", excel: "Excel", "google sheets": "Google Sheets", "apps script": "Apps Script",
    ingles: "inglés", espanol: "español", portugues: "portugués", frances: "francés", italiano: "italiano", aleman: "alemán", japones: "japonés", chino: "chino", coreano: "coreano" };
  const NUMW = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12, quince: 15, veinte: 20, treinta: 30 };
  const COUNTABLE = "captions?|posts?|publicaciones|ideas|opciones|nombres|titulos|frases|versiones|ejemplos|preguntas|tweets|hooks|copys?|propuestas|slogans|eslogans|correos|mensajes|reels|historias|stories|temas|puntos";

  const SLOTS = {
    red: { sec: "task", q: "¿Para qué red o canal?", opts: ["Instagram", "TikTok", "LinkedIn", "Facebook", "X", "WhatsApp"], hole: "para [red social]",
      detect: (t) => { const v = grab(t, /\b(instagram|ig|tiktok|linkedin|facebook|fb|twitter|whatsapp|youtube|pinterest|threads)\b/); return v ? NAMES[fold(v)] || v : null; },
      render: (v) => "para " + v },
    cantidad: { sec: "task", q: "¿Cuántos quieres?", opts: ["3", "5", "10"], hole: null,
      detect: (t) => {
        const d = grab(t, new RegExp("\\b(\\d{1,3})\\s+(?:" + COUNTABLE + ")\\b", "")); if (d) return d;
        const w = grab(t, new RegExp("\\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce|quince|veinte|treinta)\\s+(?:" + COUNTABLE + ")\\b", ""));
        return w ? String(NUMW[fold(w)]) : null; } },
    tono: { sec: "out", q: "¿Qué tono?", opts: ["Casual", "Profesional", "Divertido", "Cercano", "Formal", "Callejero"], hole: "Tono: [tono]",
      detect: (t) => {
        const A = "casual|formal|profesional|divertido|divertida|callejero|callejera|cercano|cercana|serio|seria|amable|firme|juvenil|elegante|tecnico|inspirador|inspiradora|motivador|ironico|sarcastico|empatico|relajado|chill|amigable|calido|directo|directa|educado";
        return grab(t, new RegExp("\\btono\\s+(?:muy\\s+|mas\\s+)?((?:" + A + "|[a-z]+)(?:\\s+(?:pero|y|e)\\s+(?:" + A + "))?)", ""))
          || grab(t, new RegExp("\\b((?:" + A + ")(?:\\s+(?:pero|y|e)\\s+(?:" + A + "))?)\\b", ""));
      },
      render: (v) => "Tono " + low(v) },
    publico: { sec: "ctx", q: "¿Para qué público?", opts: ["Jóvenes de 18 a 25", "Profesionales", "Clientes actuales", "Público general"], hole: "Mi público: [público objetivo]",
      detect: (t) => grab(t, /\bpublico(?:\s+objetivo)?(?:\s+es|\s+son|\s+de|:)?\s+([^.,;\n]{3,60})/)
        || grab(t, /\bdirigid[oa]s?\s+a\s+([^.,;\n]{3,60})/)
        || grab(t, /\b(?:para|a)\s+((?:jovenes|chicos|chicas|ninos|adultos|mamas|papas|emprendedores|estudiantes|profesionales|mujeres|hombres|gamers|adolescentes|universitarios|seguidores)[^.,;\n]{0,40})/)
        || (grab(t, /\b(\d{1,2}\s*(?:a|-)\s*\d{1,2}\s*anos)\b/) ? "personas de " + grab(t, /\b(\d{1,2}\s*(?:a|-)\s*\d{1,2}\s*anos)\b/) : null),
      render: (v) => "Mi público: " + low(v) },
    destinatario: { sec: "ctx", q: "¿A quién va dirigido?", opts: ["Un cliente", "Mi jefe", "Un proveedor", "Un colega", "Mi equipo"], hole: "Va dirigido a [destinatario]",
      detect: (t) => {
        const v = grab(t, /\b(?:para|a)\s+((?:un|una|mi|mis|el|la|los|las|nuestro|nuestra)\s+(?:cliente|clientes|jefe|jefa|proveedor|proveedora|colega|equipo|profesor|profesora|amigo|amiga|socio|socia|reclutador|reclutadora|usuario|usuarios|inversionista|inversionistas|vecino|vecina|arrendador|casero|casera)\b[^.,;?!\n]{0,45})/);
        return v ? v.replace(/\s+(?:que\s+(?:sea|sean|suene|tenga)|con\s+tono|y\s+que)\b.*$/i, "").trim() : null;
      },
      render: (v) => "Va dirigido a " + low(v) },
    objetivo: { sec: "ctx", q: "¿Qué quieres lograr?", opts: ["Pedir algo", "Cobrar un pago", "Disculparme", "Dar una noticia", "Hacer seguimiento", "Vender"], hole: "Objetivo: [qué quieres lograr]",
      detect: (t) => grab(t, /\bpara\s+((?:que\s+|pedir|cobrar|avisar|informar|agradecer|disculparme|recordar|vender|conseguir|aumentar|crecer|ganar|atraer|lanzar|promocionar|reclamar|negociar|renunciar)[^.;\n]{0,60})/)
        || grab(t, /\b(?:objetivo|meta)(?:\s+es)?:?\s+([^.;\n]{3,60})/),
      render: (v) => "Objetivo: " + low(v) },
    paraQue: { sec: "ctx", q: "¿Para qué lo vas a usar?", opts: ["Presentarlo a alguien", "Tomar una decisión", "Estudiar", "Publicarlo"], hole: "Lo usaré para [para qué]",
      detect: (t) => grab(t, /\b(?:lo|la|los|las)\s+(?:voy a usar|usare|necesito)\s+(?:para\s+)?([^.;\n]{3,60})/)
        || grab(t, /\bpara\s+((?:presentar|una reunion|estudiar|decidir|mi jefe|mi clase|mi equipo|mi tesis|mi curso|un examen|publicar|tomar una decision)[^.;\n]{0,50})/),
      render: (v) => "Lo usaré para " + low(v) },
    extension: { sec: "out", q: "¿Qué extensión?", opts: ["Muy corto", "Máximo 2 líneas", "Un párrafo", "Detallado"], hole: "Extensión: [extensión]",
      detect: (t) => (/\bno\s+(?:muy\s+|tan\s+|demasiado\s+)?(?:largo|larga|largos|largas|extens[oa]s?)\b/.test(t.s) ? "breve" : null)
        || grab(t, /((?:maximo|max\.?|hasta|menos de|no mas de|minimo|alrededor de)\s+\d+\s*(?:palabras|lineas|parrafos|caracteres|oraciones|frases|paginas|minutos|slides|diapositivas))/)
        || grab(t, /\b(\d+\s*(?:palabras|lineas|parrafos|caracteres|oraciones|paginas))\b/)
        || grab(t, /\b(muy cort[oa]s?|cort[oa]s?|breves?|larg[oa]s?|detallad[oa]s?|extens[oa]s?|un parrafo)\b/),
      render: (v) => "Extensión: " + low(v) },
    formato: { sec: "out", q: "¿En qué formato?", opts: ["Lista", "Tabla", "Párrafos", "Pasos numerados"], hole: "Formato: [formato]",
      detect: (t) => grab(t, /\b(?:en|como|formato(?: de)?)\s+(?:una\s+|un\s+)?(tabla|lista(?: numerada)?|vinetas|bullets|parrafos|pasos(?: numerados)?|json|markdown|texto plano|esquema|hilo|guion|calendario)\b/)
        || grab(t, /\b(tabla|lista numerada|vinetas|bullets|json|esquema)\b/),
      render: (v) => "Formato: " + low(v) },
    extras: { sec: "out", q: "¿Hashtags y emojis?", opts: ["Con hashtags y emojis", "Solo emojis", "Solo hashtags", "Sin hashtags ni emojis"], hole: null,
      detect: (t) => grab(t, /\b((?:sin|con)\s+(?:hashtags|emojis|emoticones)(?:\s+(?:ni|y|ni con|ni tampoco)\s+(?:hashtags|emojis|emoticones))?)/),
      render: (v) => cap(v) },
    periodo: { sec: "task", q: "¿Para qué periodo?", opts: ["1 semana", "2 semanas", "1 mes", "3 meses"], hole: "para [periodo]",
      detect: (t) => grab(t, /\b((?:\d+|una|un|dos|tres|cuatro|seis)\s+(?:dias|semanas?|mes(?:es)?|trimestres?))\b/),
      render: (v) => "para " + v },
    criterio: { sec: "out", q: "¿Qué debe priorizar?", opts: ["Originalidad", "Que sea fácil de ejecutar", "Costo bajo", "Impacto"], hole: null,
      detect: (t) => grab(t, /\bprioriza(?:ndo|r)?\s+([^.;\n]{3,50})/) || grab(t, /\b(?:segun|en base a|considerando)\s+([^.;\n]{3,50})/),
      render: (v) => "Prioriza: " + low(v) },
    lenguaje: { sec: "task", q: "¿En qué lenguaje o herramienta?", opts: ["JavaScript", "Python", "HTML y CSS", "Swift"], hole: "en [lenguaje]",
      detect: (t) => { const v = grab(t, /\b(javascript|typescript|python|html|css|sql|swiftui|swift|react|node|java|kotlin|php|excel|google sheets|apps script)\b/); return v ? NAMES[fold(v)] || v : null; },
      render: (v) => "en " + v },
    entorno: { sec: "ctx", q: "¿Dónde va a funcionar?", opts: ["Web", "Mac", "iPhone", "Servidor", "Figma"], hole: null,
      detect: (t) => grab(t, /\b(?:en|para)\s+(?:la\s+|mi\s+|un\s+)?(web|navegador|mac|macos|iphone|ios|android|windows|servidor|linux|figma|wordpress|shopify)\b/),
      render: (v) => "Va a funcionar en " + v },
    entregaCodigo: { sec: "out", q: "¿Cómo lo quieres?", opts: ["Solo el código", "Código con explicación breve", "Paso a paso para no programadores"], hole: null,
      detect: (t) => grab(t, /\b(solo el codigo|paso a paso para (?:no programadores|principiantes)|con explicacion[^.;\n]{0,30})/),
      render: (v) => "Entrega: " + low(v) },
    material: { sec: "mat", q: "¿Dónde está el texto?", opts: ["Lo pego en mi siguiente mensaje"], hole: "[pega aquí el texto]", special: true },
    cambios: { sec: "out", q: "¿Qué quieres mejorar?", opts: ["Ortografía", "Claridad", "Hacerlo más corto", "Cambiar el tono"], hole: null,
      detect: (t) => grab(t, /\b(ortografia|gramatica|claridad|mas cort[oa]|acortar(?:lo|la)?|fluidez|redaccion|coherencia)\b/),
      render: (v) => "Enfócate en: " + low(v) },
    nivel: { sec: "ctx", q: "¿Cuánto sabes del tema?", opts: ["Nada, desde cero", "Lo básico", "Intermedio", "Avanzado"], hole: null,
      detect: (t) => grab(t, /\b(soy principiante|desde cero|no se nada|nivel (?:basico|intermedio|avanzado)|soy experto|soy experta)\b/),
      render: (v) => "Mi nivel: " + low(v) },
    idiomaDestino: { sec: "task", q: "¿A qué idioma?", opts: ["Inglés", "Español", "Portugués", "Francés"], hole: "al [idioma]",
      detect: (t) => { const v = grab(t, /\b(?:al|a|en)\s+(ingles|espanol|portugues|frances|italiano|aleman|japones|chino|coreano)\b/); return v ? NAMES[fold(v)] || v : null; },
      render: (v) => "al " + low(v) }
  };
  const OUT_SLOTS = Object.keys(SLOTS).filter(k => SLOTS[k].sec === "out");
  const CTX_SLOTS = Object.keys(SLOTS).filter(k => SLOTS[k].sec === "ctx");

  // --- Negocio o marca del usuario ---
  function detectNegocio(t) {
    const m = /\b(?:mi|nuestra|nuestro|una|un|tengo una|tengo un)\s+(marca|tienda|empresa|negocio|emprendimiento|startup|agencia|restaurante|cafeteria|app|canal|cuenta|podcast|web|pagina|consultora|estudio)\s+(?:de|que vende|sobre)\s+([^.,;\n]{2,40}?)(?=\s+(?:para|con|que|en|y|pero)\b|[.,;\n?!]|$)/.exec(t.s);
    if (!m) return null;
    const kRel = m[0].indexOf(m[1]), wRel = m[0].indexOf(m[2], kRel + m[1].length);
    const kind = t.o.substr(m.index + kRel, m[1].length), what = t.o.substr(m.index + wRel, m[2].length).trim();
    const una = /^(marca|tienda|empresa|startup|agencia|cafeteria|app|cuenta|web|pagina|consultora)$/.test(fold(kind));
    return "Tengo " + (una ? "una " : "un ") + low(kind) + " de " + what;
  }

  // --- Limpieza de malos hábitos ---
  const ACRONYMS = /^(JSON|HTML|CSS|PDF|SEO|CSV|API|URL|SQL|UX|UI|IA|AI|CTA|KPI|ROI|FAQ|PHP|SMS|USA|ONG|RUC|DNI|IGV|PYME|B2B|B2C|MVP|CRM|ERP|TOFU|MOFU|BOFU|LATAM)$/;
  function tidy(text, changes) {
    let s = text;
    const before = s;
    s = s.replace(/\b(MUY IMPORTANTE|IMPORTANTE|CR[IÍ]TICO|URGENTE|OJO|ATENCI[OÓ]N)\s*[:!]+\s*/g, "");
    let capsFixed = false;
    s = s.replace(/\b[A-ZÁÉÍÓÚÑ]{4,}\b/g, (w) => { if (ACRONYMS.test(w)) return w; capsFixed = true; return w.toLowerCase(); });
    if (capsFixed || s !== before) changes.add("Bajé las mayúsculas y la urgencia: Claude sobrerreacciona a \"CRÍTICO\" o \"DEBES\".");
    return s;
  }
  const FILLER = /^(hola|holi|oye|buenas|buenos dias|buenas tardes|buenas noches|gracias|muchas gracias|porfa|porfavor|por favor|pls|plis|ok|okey|dale)[\s,.!]*$/;
  const OVERTHINK = /(paso a paso|piensa (bien|con cuidado|detenidamente)|tomate tu tiempo|verifica|revisa (bien|dos veces)|double[- ]?check|asegurate de (revisar|verificar))/;

  const NEG_RULES = [
    [/no uses? (listas|vinetas|bullets|puntos)/, "Escribe en párrafos"],
    [/no uses? (emojis|emoticones)/, "Usa solo texto, sin emojis"],
    [/no uses? hashtags/, "Deja los hashtags fuera"],
    [/no (sea|seas|sean) (muy |tan |demasiado )?(largo|larga|largos|largas|extens)/, "Sé breve"],
    [/no (uses|utilices) (palabras|lenguaje|terminos) tecnic/, "Usa lenguaje simple, sin tecnicismos"],
    [/no inventes/, "Usa solo la información que te doy; si falta algo, pregúntame"],
    [/no repitas/, "Varía las ideas entre opciones"],
    [/no (sea|seas|suene|suenes|sean|suenen) (muy |tan |demasiado )?formal/, "Usa un tono casual"],
    [/no (sea|seas|suene|suenes|sean|suenen) (muy |tan |demasiado )?informal/, "Usa un tono formal"],
    [/no uses? markdown/, "Responde en texto plano"],
    [/no (expliques|des explicaciones|agregues explicaciones)/, "Entrega solo el resultado, sin explicaciones"],
    [/no (me )?(preguntes|hagas preguntas)/, "Si falta un dato, asume lo más razonable y dime qué asumiste"],
    [/no (suene|suenes|sea|seas) (a |como )?(ia|robot|chatgpt|generico)/, "Escribe con voz humana y concreta"],
    [/no (uses|pongas) (rayas|guiones largos)/, "Usa comas o puntos en lugar de rayas"]
  ];
  const RULE_START = /^(no |nunca|evita|usa |utiliza|incluye|que sea|que sean|que tenga|que tengan|que no|sin |con |siempre|manten|respeta|debe|deben|tiene que|tienen que|recuerda|asegurate|procura|menciona|agrega|anade|pon |ponle|ponlo)/;

  // --- Separar material largo ---
  function extractMaterial(text, changes) {
    const tag = /<material>([\s\S]*?)<\/material>/i.exec(text);
    if (tag) return { material: tag[1].trim(), rest: (text.slice(0, tag.index) + "\n" + text.slice(tag.index + tag[0].length)).trim() };
    const fence = /```[a-z]*\n?([\s\S]*?)```/i.exec(text);
    if (fence && fence[1].trim().length > 40) { changes.add("Moví el texto pegado arriba, dentro de <material>: así Claude lo distingue de tus instrucciones."); return { material: fence[1].trim(), rest: (text.slice(0, fence.index) + "\n" + text.slice(fence.index + fence[0].length)).trim() }; }
    // "traduce esto al inglés: <texto>" → el texto después de los dos puntos es material
    const colon = /^([^:\n]{4,160}?):\s*([\s\S]{15,})$/.exec(text);
    if (colon && /\b(traduc|corrig|resum|revis|mejora|analiz|reescrib|parafrase|edita|sintetiz|responde|contesta)/.test(fold(colon[1]))) {
      changes.add("Separé el texto que pegaste y lo puse arriba, dentro de <material>: así Claude lo distingue de tus instrucciones.");
      return { material: colon[2].trim(), rest: colon[1].trim() };
    }
    const paras = text.split(/\n\s*\n/);
    const big = paras.filter(p => p.trim().length >= 350);
    if (big.length && paras.length > 1) {
      changes.add("Moví el texto largo arriba, dentro de <material>: así Claude lo distingue de tus instrucciones.");
      return { material: big.join("\n\n").trim(), rest: paras.filter(p => !big.includes(p)).join("\n").trim() };
    }
    if (paras.length === 1 && text.length >= 700) {
      // un solo bloque largo: la primera oración con verbo es la instrucción, el resto es material
      const firstStop = text.search(/[.:?!\n]/);
      if (firstStop > 0 && firstStop < 240) {
        changes.add("Moví el texto largo arriba, dentro de <material>: así Claude lo distingue de tus instrucciones.");
        return { material: text.slice(firstStop + 1).trim(), rest: text.slice(0, firstStop + 1).trim() };
      }
    }
    return { material: null, rest: text };
  }

  // --- Convertir la frase principal en un pedido directo ---
  const POLITE = /^(?:(?:hola|oye|buenas|hey|holi)[,!.\s]+)?(?:(?:me\s+)?(?:podrias|puedes|podria|pueden|podrian)\s+(?:por favor\s+|porfa\s+)?|(?:quisiera|quiero|necesito|me gustaria|seria posible|busco)\s+(?:que\s+)?|(?:ayudame|me ayudas|ayudarme)\s+(?:a|con)\s+)?(?:me\s+|nos\s+)?/;
  function normTask(clause, type, changes) {
    let t = T(clause.trim().replace(/^[¿¡\s]+/, "").replace(/[?!\s]+$/, ""));
    const pm = POLITE.exec(t.s);
    const politeLen = pm ? pm[0].length : 0;
    if (politeLen && /(podrias|puedes|podria|pueden|podrian|quisiera|me gustaria|seria posible)/.test(pm[0])) changes.add("Pasé el \"¿podrías…?\" a un pedido directo: Claude lo toma más literal y actúa.");
    t = T(t.o.slice(politeLen));
    const wm = /^([a-z]+)\b/.exec(t.s);
    let verb = null, rest = t.o;
    if (wm) {
      const v = lookupVerb(wm[1]);
      if (v) { verb = v; rest = t.o.slice(wm[0].length).trim(); }
    }
    const tv = TYPES[type].verb;
    let imp;
    if (verb) imp = (verb.gen && type !== "otro") ? tv : verb.imp;
    else if (/^(que es|como funciona|por que|cual es|cuales son|como se)\b/.test(t.s)) { imp = "Explica"; rest = low(t.o); }
    else imp = tv;
    rest = rest.replace(/^(me|nos|le|les)\s+/i, "");
    return { imp, rest, found: !!verb || type !== "otro" };
  }

  // --- Clasificar tipo ---
  function classify(fs) {
    let best = "otro", score = 0;
    for (const k of TYPE_ORDER) {
      const sc = TYPES[k].kw.reduce((n, re) => n + (re.test(fs) ? 1 : 0), 0);
      if (sc > score) { best = k; score = sc; }
    }
    return best;
  }

  // --- Motor principal ---
  // opts.noHoles: arma el prompt solo con lo que se sabe, sin [huecos]; lo que falta va en `missing`.
  function run(input, answers = {}, forcedType = null, opts = {}) {
    const noHoles = !!opts.noHoles;
    const changes = new Set();
    const raw = (input || "").trim();
    const ex = extractMaterial(raw, changes);
    let material = ex.material;
    const rest = ex.rest;
    if (!material && answers.material && answers.material !== "__skip") material = String(answers.material).trim();
    const tidied = tidy(rest, changes);
    const full = T(tidied);
    const autoType = classify(full.s);
    const type = forcedType && TYPES[forcedType] ? forcedType : autoType;
    const def = TYPES[type];

    // Frases: separar por punto, salto de línea o punto y coma
    let clauses = tidied.replace(/([.!?;])\s+/g, "$1\n").split(/\n+/).map(s => s.trim()).filter(Boolean);
    // quitar saludos, "por favor" y pedidos de verificación
    const kept = [];
    let removedThink = false, removedFiller = false;
    for (const c of clauses) {
      const fc = fold(c).replace(/[¿¡]/g, "");
      if (FILLER.test(fc)) { removedFiller = true; continue; }
      if (OVERTHINK.test(fc) && fc.length < 120) { removedThink = true; continue; }
      kept.push(c.replace(/,?\s*\b(porfa(?:vor)?|por favor|pls|plis)\b[,!]?/gi, "").replace(/^\s*(hola|oye|buenas)[,!\s]+/i, "").trim());
    }
    if (removedThink) changes.add("Quité \"piensa paso a paso\" o \"verifica\": los modelos actuales ya lo hacen solos y pedirlo solo los hace más lentos.");
    if (removedFiller) changes.add("Quité saludos y frases de cortesía: no cambian el resultado.");
    clauses = kept.filter(Boolean);

    // Encontrar la frase de tarea
    const verbAt = (c) => {
      const f = fold(c).replace(/^[¿¡\s]+/, "");
      const pm = POLITE.exec(f); const after = f.slice(pm ? pm[0].length : 0);
      const w = /^([a-z]+)\b/.exec(after);
      return (w && lookupVerb(w[1])) || /^(que es|como funciona|por que|cual es|cuales son)\b/.test(after) || (pm && pm[0].length > 0 && /(quiero|necesito|busco|quisiera)/.test(pm[0]));
    };
    let ti = clauses.findIndex(verbAt);
    if (ti === -1) ti = clauses.findIndex(c => def.kw.some(re => re.test(fold(c))));
    let taskClause = ti >= 0 ? clauses[ti] : null;
    let extra = [];
    if (taskClause) {
      // cortar la frase de tarea en la primera coma o "que sean…": lo que sigue se procesa aparte
      const cut = /,|;|\s+y\s+que\s+|\s+que\s+(?:sea|sean|tenga|tengan|suene|suenen)\s+|\s+con\s+(?:un\s+)?tono\s+/i.exec(taskClause);
      if (cut && cut.index > 8) {
        extra = [taskClause.slice(cut.index).replace(/^[,;\s]+|^\s*y\s+/i, "").trim()];
        taskClause = taskClause.slice(0, cut.index).trim();
      }
      clauses = [...clauses.slice(0, ti), ...extra, ...clauses.slice(ti + 1)];
    }

    // Detectar datos (en todo el texto) y aplicar respuestas
    const detected = {}, values = {};
    for (const k of Object.keys(SLOTS)) {
      if (SLOTS[k].special) continue;
      const v = SLOTS[k].detect(full);
      if (v) detected[k] = v;
    }
    if (material) detected.material = material;
    const negocio = detectNegocio(full);
    for (const k of def.slots) {
      const a = answers[k];
      if (a === "__skip") values[k] = { state: "skip" };
      else if (a) values[k] = { state: "answer", v: a };
      else if (detected[k]) values[k] = { state: "detected", v: detected[k] };
      else values[k] = { state: "pending" };
    }
    // datos detectados fuera de los slots del tipo también se usan (si el usuario los dijo)
    for (const k of Object.keys(detected)) if (!values[k] && k !== "material" && k !== "cantidad") values[k] = { state: "detected", v: detected[k], extra: true };
    if (!values.cantidad && detected.cantidad) values.cantidad = { state: "detected", v: detected.cantidad, extra: true };

    // Clasificar el resto de frases: reglas o contexto
    const ctxPieces = [], rules = [];
    let negConverted = 0;
    for (const c of clauses) {
      if (c === taskClause) continue;
      const ct = T(c), f = ct.s.replace(/^[¿¡\s]+/, "");
      const isRule = RULE_START.test(f) || /\bno\s+(uses|pongas|hagas|incluyas|escribas|menciones|agregues|anadas|repitas|inventes|seas|sea|sean)\b/.test(f);
      const hitsOut = OUT_SLOTS.some(k => SLOTS[k].detect(ct));
      const hitsCtx = CTX_SLOTS.some(k => SLOTS[k].detect(ct));
      if (hitsOut && f.length < 45 && !isRule) continue; // frase corta tipo "tono divertido" o "en una tabla": ya está en Entrega
      if (isRule) {
        const neg = NEG_RULES.find(([re]) => re.test(f));
        if (hitsOut && (!neg || f.length < 60)) continue; // ya está en Entrega
        if (neg) { rules.push(neg[1]); negConverted++; continue; }
        rules.push(endDot(cap(c.replace(/^\s*(y|e)\s+/i, ""))));
      } else {
        if (hitsCtx && /^(para|dirigid|a\s|el publico|mi publico|publico)/.test(f) && f.length < 70) continue; // ya está en Contexto
        if (taskClause === null && verbAt(c)) continue;
        ctxPieces.push(endDot(cap(c)));
      }
    }
    if (negConverted) changes.add(negConverted === 1 ? "Pasé una instrucción negativa a positiva: Claude rinde mejor cuando le dices qué hacer." : "Pasé " + negConverted + " instrucciones negativas a positivas: Claude rinde mejor cuando le dices qué hacer.");

    // --- Armar secciones ---
    const ctx = [];
    if (negocio && !ctxPieces.some(p => has(p, negocio.replace(/^Tengo (una|un) /, "")))) ctx.push({ text: endDot(negocio), real: true });
    ctxPieces.forEach(p => ctx.push({ text: p, real: true }));
    const out = [], holes = [];
    const allSlotKeys = [...def.slots, ...Object.keys(values).filter(k => !def.slots.includes(k))];
    for (const k of allSlotKeys) {
      const s = SLOTS[k], val = values[k];
      if (!s || s.special || !val || k === "cantidad") continue;
      if (s.sec === "ctx") {
        if (val.v) { if (!ctx.some(p => has(p.text, val.v))) ctx.push({ text: endDot(s.render(val.v)), real: true }); }
        else if (val.state === "pending" && s.hole) { holes.push(k); if (!noHoles) ctx.push({ text: endDot(s.hole), real: false }); }
      } else if (s.sec === "out") {
        if (val.v) out.push({ text: s.render(val.v), real: true });
        else if (val.state === "pending" && s.hole) { holes.push(k); if (!noHoles) out.push({ text: s.hole, real: false }); }
      }
    }

    // Tarea
    let taskText, taskFound = false;
    if (taskClause) {
      const n = normTask(taskClause, type, changes);
      taskFound = n.found;
      let r = n.rest;
      const qty = values.cantidad && values.cantidad.v;
      if (qty) {
        if (/^(unos|unas|algunos|algunas|un par de|varios|varias)\s+/i.test(r)) r = r.replace(/^(unos|unas|algunos|algunas|un par de|varios|varias)\s+/i, qty + " ");
        else if (!/\d/.test(r) && !/^(un|una|el|la)\s/i.test(r)) r = qty + " " + r;
      } else r = r.replace(/^(unos|unas|algunos|algunas|varios|varias)\s+/i, "");
      // "traduce esto" / "resume este documento" → apuntar al material
      if (material || def.slots.includes("material")) {
        const target = material || !noHoles ? "el texto de <material>" : "el texto que te paso a continuación";
        if (/^\s*$/.test(r)) r = target;
        else r = r.replace(/^(esto|este texto|lo siguiente|el siguiente texto|este documento|este correo|este mensaje|este parrafo|este párrafo)\b/i, target);
      }
      taskText = clean(n.imp + " " + r);
    } else {
      taskText = noHoles ? "Ayúdame con lo que describo en el contexto" : def.verb + " [qué necesitas exactamente]";
    }
    for (const k of def.slots) {
      const s = SLOTS[k], val = values[k];
      if (!s || s.sec !== "task" || k === "cantidad") continue;
      if (val.v) { if (!has(taskText, val.v)) taskText += " " + s.render(val.v); }
      else if (val.state === "pending" && s.hole) { holes.push(k); if (!noHoles) taskText += " " + s.hole; }
    }
    for (const k of Object.keys(values)) {
      if (def.slots.includes(k)) continue;
      const s = SLOTS[k], val = values[k];
      if (s && s.sec === "task" && val.v && k !== "cantidad" && !has(taskText, val.v)) taskText += " " + s.render(val.v);
    }
    if (values.cantidad && values.cantidad.state === "answer" && !taskClause) taskText = taskText.replace("[qué necesitas exactamente]", values.cantidad.v + " [qué necesitas exactamente]");
    // nombres propios bien escritos (instagram → Instagram, python → Python)
    for (const k of ["red", "lenguaje"]) {
      const val = values[k];
      if (val && val.v) taskText = taskText.replace(new RegExp("\\b" + fold(val.v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"), val.v);
    }
    taskText = endDot(cap(clean(taskText)));

    // Material
    const needsMat = def.slots.includes("material");
    let matText = null;
    if (material) matText = material;
    else if (needsMat) { holes.push("material"); if (!noHoles) matText = SLOTS.material.hole; }

    // --- Prompt final ---
    const lines = [];
    if (matText) lines.push("<material>\n" + matText + "\n</material>", "");
    if (ctx.length) lines.push("Contexto: " + ctx.map(p => p.text).join(" "));
    else if (!noHoles) lines.push("Contexto: [quién eres, para quién es y para qué]");
    lines.push("Tarea: " + taskText);
    if (out.length) lines.push("Entrega: " + out.map(p => endDot(p.text)).join(" "));
    else if (!noHoles) lines.push("Entrega: [formato, extensión y tono]");
    if (rules.length) lines.push("Reglas:\n" + [...new Set(rules)].map(r => "- " + endDot(r)).join("\n"));
    const prompt = lines.join("\n");

    // --- Preguntas pendientes ---
    const questions = def.slots.filter(k => values[k] && (values[k].state === "pending" || values[k].state === "answer" || values[k].state === "skip") && !(values[k].state === "detected"))
      .map(k => ({ key: k, q: SLOTS[k].q, opts: SLOTS[k].opts, state: values[k].state, value: values[k].v || null, special: !!SLOTS[k].special }));
    // si hay material detectado, no preguntar por él
    const qs = questions.filter(q => !(q.key === "material" && material));

    // --- Datos entendidos (para mostrar) ---
    const understood = [];
    if (negocio) understood.push(negocio.replace(/^Tengo /, ""));
    for (const k of Object.keys(values)) if (values[k].state === "detected" && k !== "material") understood.push((k === "cantidad" ? values[k].v + " en total" : values[k].v));
    if (material) understood.push("Texto pegado (" + material.length + " caracteres)");
    // quitar repetidos (si uno ya está contenido en otro)
    const uniq = understood.filter((u, i) => !understood.some((o, j) => j !== i && o.length > u.length && has(o, u)));
    understood.length = 0; uniq.forEach(u => understood.push(u));

    // --- Checklist ---
    const realCtx = ctx.filter(p => p.real).length, realOut = out.filter(p => p.real).length;
    const checks = {
      tarea: taskClause ? { estado: "ok", nota: "Pedido directo con verbo de acción." } : raw ? { estado: "parcial", nota: "No encontré qué quieres exactamente." } : { estado: "falta", nota: "Di qué quieres con un verbo de acción." },
      contexto: realCtx >= 2 ? { estado: "ok", nota: "Claude sabe para quién y para qué." } : realCtx === 1 ? { estado: "parcial", nota: "Suma para quién es o para qué lo usarás." } : { estado: "falta", nota: "Cuenta quién eres, para quién es y para qué." },
      entrega: realOut >= 2 ? { estado: "ok", nota: "Claude sabe cómo entregarlo." } : realOut === 1 ? { estado: "parcial", nota: "Suma extensión, formato o tono." } : { estado: "falta", nota: "Define formato, extensión y tono." },
      material: material ? { estado: "ok", nota: "Va arriba, dentro de <material>." } : needsMat ? { estado: "falta", nota: "Pega el texto que Claude debe usar." } : { estado: "na", nota: "Solo si pegas documentos o datos." },
      reglas: rules.length ? { estado: "ok", nota: rules.length + (rules.length === 1 ? " regla, en positivo." : " reglas, en positivo.") } : { estado: "opcional", nota: "Solo si Claude repite un error." },
      ejemplos: /\bejemplos?\b|<ejemplo/.test(full.s) ? { estado: "ok", nota: "Incluyes ejemplos de referencia." } : { estado: "opcional", nota: "Si importa un tono o formato exacto." }
    };

    // --- Lo que falta, en orden de importancia (para preguntar en el chat) ---
    const missing = [];
    if (needsMat && !material && answers.material !== "__skip") missing.push("material");
    for (const k of def.slots) if (k !== "material" && values[k] && values[k].state === "pending") missing.push(k);

    return { type, autoType, typeLabel: def.label, prompt, questions: qs, missing: missing.map(k => ({ key: k, ask: (ASK[k] || [SLOTS[k].q])[0], ex: (ASK[k] || [])[1] || "" })),
      understood, checks, changes: [...changes], holes: [...new Set(holes)], hasTask: !!taskClause };
  }

  // --- Preguntas del chat: [pregunta, ejemplo para el campo de texto] ---
  const ASK = {
    material: ["Pega el texto que Claude debe usar.", "Pega aquí el texto"],
    red: ["¿Para qué red social es?", "Ej.: Instagram, TikTok, LinkedIn"],
    cantidad: ["¿Cuántas opciones quieres?", "Ej.: 3, 5, 10"],
    tono: ["¿Qué tono buscas?", "Ej.: casual, profesional, divertido"],
    publico: ["¿A quién va dirigido? Cuéntame de tu público.", "Ej.: jóvenes de 18 a 25, clientes actuales"],
    destinatario: ["¿A quién va dirigido?", "Ej.: un cliente, mi jefe, un proveedor"],
    objetivo: ["¿Qué quieres lograr con esto?", "Ej.: cobrar un pago, pedir una reunión"],
    paraQue: ["¿Para qué lo vas a usar?", "Ej.: presentarlo a mi jefe, estudiar"],
    extension: ["¿Qué tan largo debe ser?", "Ej.: máximo 2 líneas, un párrafo"],
    formato: ["¿En qué formato lo quieres?", "Ej.: lista, tabla, párrafos"],
    extras: ["¿Con hashtags o emojis?", "Ej.: con emojis, sin hashtags"],
    periodo: ["¿Para qué periodo?", "Ej.: 1 semana, 1 mes"],
    criterio: ["¿Qué debe priorizar?", "Ej.: originalidad, que sea fácil de hacer"],
    lenguaje: ["¿En qué lenguaje o herramienta?", "Ej.: Python, JavaScript, Excel"],
    entorno: ["¿Dónde va a funcionar?", "Ej.: web, Mac, iPhone"],
    entregaCodigo: ["¿Cómo quieres la respuesta?", "Ej.: solo el código, paso a paso"],
    cambios: ["¿Qué quieres mejorar del texto?", "Ej.: ortografía, claridad, hacerlo más corto"],
    nivel: ["¿Cuánto sabes del tema?", "Ej.: nada, lo básico, avanzado"],
    idiomaDestino: ["¿A qué idioma lo traduzco?", "Ej.: inglés, portugués"]
  };

  // --- Convertir una respuesta escrita en el valor de un dato ---
  const SKIP_RE = /^(no se|nose|ni idea|omitir|omite|paso|siguiente|da igual|me da igual|cualquiera|no importa|ninguno|ninguna|no|nada|-)$/;
  function normalizeAnswer(key, text) {
    const original = String(text || "").trim();
    const raw = original.replace(/[.\s]+$/, "");
    const f = fold(raw).toLowerCase().replace(/[¡!¿?.,]/g, "").trim();
    if (!raw || SKIP_RE.test(f)) return "__skip";
    if (key === "material") return original;
    if (key === "cantidad") {
      const d = f.match(/\d{1,3}/); if (d) return d[0];
      const w = f.match(/\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce|quince|veinte|treinta)\b/);
      return w ? String(NUMW[w[1]]) : "__skip";
    }
    // nombres propios bien escritos (instagram → Instagram)
    return raw.replace(/[A-Za-zÁÉÍÓÚÑáéíóúñü]+/g, (w) => { const k = fold(w).toLowerCase(); return NAMES[k] && !/\s/.test(k) ? NAMES[k] : w; });
  }

  // --- Datos que aparecen en un texto suelto (por ejemplo, en una respuesta) ---
  function detectSlots(text) {
    const t = T(String(text || "")), outV = {};
    for (const k of Object.keys(SLOTS)) {
      if (SLOTS[k].special) continue;
      const v = SLOTS[k].detect(t);
      if (v) outV[k] = v;
    }
    return outV;
  }

  function types() { return Object.entries(TYPES).map(([k, v]) => ({ key: k, label: v.label })); }
  return { run, types, fold, normalizeAnswer, detectSlots };
})();
if (typeof module !== "undefined") module.exports = Engine;
