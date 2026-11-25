const SB_URL = "https://xjiskxsjxnlqyopnwrog.supabase.co";
const SB_KEY = "sb_publishable_7Y3gf_hjrrW1QK-vQhF6Bg_01bXgskV";
const sb = supabase.createClient(SB_URL, SB_KEY);

const $ = id => document.getElementById(id);
const money = n => "$" + Number(n).toLocaleString("es-MX");
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const show = v => ["vLogin","vNoAccess","vPanel"].forEach(x => $(x).hidden = x !== v);
const pad = n => String(n).padStart(2, "0");
const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
function cdmxNow(){
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Mexico_City",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).map(x => [x.type, x.value]));
  return new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00`);
}
const todayCDMX = () => { const d = cdmxNow(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const hourText = (hr, mi) => { hr = hr % 24; const s = hr < 12 ? "am" : "pm", h = hr % 12 || 12; return mi ? `${h}:${pad(mi)} ${s}` : `${h} ${s}`; };
const timeOf = iso => new Intl.DateTimeFormat("es-MX",{timeZone:"America/Mexico_City",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(iso)).replace(/\s?a\.\s?m\./," am").replace(/\s?p\.\s?m\./," pm");
function whenText(s){
  const d = new Date(String(s).replace(" ","T").slice(0,19)), now = cdmxNow();
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((day(d) - day(now)) / 864e5);
  return `${diff === 0 ? "hoy" : diff === 1 ? "mañana" : "el " + DIAS[d.getDay()]} a las ${hourText(d.getHours(), d.getMinutes())}`;
}
function statusText(st){
  if (st.abierto) return `Abierta, recibiendo pedidos hasta las ${hourText(+st.cierra.split(":")[0], +st.cierra.split(":")[1])}`;
  if (st.motivo === "cerrado") return st.proxima ? `Cerrada hoy. Vuelve a abrir ${whenText(st.proxima)}` : "Cerrada hasta nuevo aviso";
  if (st.motivo === "pausa") return `En pausa. Vuelve a recibir pedidos ${whenText(st.proxima)}`;
  return st.proxima ? `Cerrada por horario. Abre ${whenText(st.proxima)}` : "Cerrada";
}
let tt;
function toast(msg){ const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2600); }
function beep(){
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [0, .18].forEach(t => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination);
      g.gain.setValueAtTime(.0001, a.currentTime + t); g.gain.exponentialRampToValueAtTime(.3, a.currentTime + t + .02); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + t + .16);
      o.start(a.currentTime + t); o.stop(a.currentTime + t + .17); });
  } catch(e){}
}

/* ---------- Acceso por usuario ---------- */
// Cada usuario es internamente usuario@labarra.local; nadie usa correo real.
const toEmail = u => u.trim().toLowerCase() + "@labarra.local";
let firstTime = false;
$("toggleMode").onclick = e => {
  e.preventDefault(); firstTime = !firstTime;
  $("pass2Field").hidden = !firstTime; $("pass2").required = firstTime;
  $("loginBtn").textContent = firstTime ? "Crear contraseña y entrar" : "Entrar";
  $("toggleMode").textContent = firstTime ? "Ya tengo contraseña" : "Es mi primera vez: crear contraseña";
  $("pass").autocomplete = firstTime ? "new-password" : "current-password";
  $("loginMsg").innerHTML = "";
};
const AUTH_ERR = { "Invalid login credentials": "El usuario o la contraseña no coinciden." };
const fail = m => { $("loginMsg").innerHTML = `<div class="msg err">${esc(m)}</div>`; $("loginBtn").disabled = false; };
$("loginForm").onsubmit = async e => {
  e.preventDefault();
  const user = $("user").value, password = $("pass").value;
  $("loginBtn").disabled = true; $("loginMsg").innerHTML = "";
  if (firstTime) {
    if (password !== $("pass2").value) return fail("Las dos contraseñas no son iguales.");
    const { error } = await sb.rpc("activar_cuenta", { usuario: user, clave: password });
    if (error) return fail(error.message);
  }
  const { error } = await sb.auth.signInWithPassword({ email: toEmail(user), password });
  if (error) return fail(AUTH_ERR[error.message] || error.message);
  $("loginBtn").disabled = false;
  boot();
};
$("pwToggle").onclick = () => { $("pwCard").hidden = !$("pwCard").hidden; $("pwMsg").innerHTML = ""; if (!$("pwCard").hidden) $("newPass").focus(); };
$("savePass").onclick = async () => {
  const p = $("newPass").value;
  if (p.length < 8) { $("pwMsg").innerHTML = `<div class="msg err">Usa al menos 8 caracteres.</div>`; return; }
  const { error } = await sb.auth.updateUser({ password: p });
  $("pwMsg").innerHTML = error ? `<div class="msg err">${esc(error.message)}</div>` : `<div class="msg ok">Contraseña cambiada.</div>`;
  if (!error) $("newPass").value = "";
};
document.querySelectorAll("[data-logout]").forEach(b => b.onclick = async () => { await sb.auth.signOut(); location.reload(); });

/* ---------- Estado de la tienda ---------- */
let SETTINGS = null;
async function loadState(){
  const [{ data: st }, { data: s }] = await Promise.all([ sb.rpc("store_status"), sb.from("settings").select("*").eq("id", 1).single() ]);
  if (st) { $("state").className = "state " + (st.abierto ? "open" : "closed"); $("stateText").textContent = statusText(st); }
  if (s) {
    SETTINGS = s;
    let cur = "auto";
    if (s.modo === "cerrado" && (!s.cerrado_hasta || s.cerrado_hasta >= todayCDMX())) cur = s.cerrado_hasta ? "hoy" : "indef";
    if (s.modo === "pausa" && new Date(s.pausa_hasta) > new Date()) cur = "pausa";
    document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === cur || (cur === "pausa" && b.dataset.mode.startsWith("p"))));
    if (document.activeElement !== $("aviso")) $("aviso").value = s.mensaje || "";
  }
}
async function saveSettings(patch, okMsg){
  const { error } = await sb.from("settings").update(Object.assign({ updated_at: new Date().toISOString() }, patch)).eq("id", 1);
  if (error) { toast("No se pudo guardar: " + error.message); return; }
  toast(okMsg); loadState();
}
document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => {
  const m = b.dataset.mode;
  if (m === "auto")  saveSettings({ modo:"auto", cerrado_hasta:null, pausa_hasta:null }, "Listo: abre y cierra según el horario");
  if (m === "hoy")   saveSettings({ modo:"cerrado", cerrado_hasta:todayCDMX(), pausa_hasta:null }, "Listo: hoy no se reciben pedidos");
  if (m === "indef") saveSettings({ modo:"cerrado", cerrado_hasta:null, pausa_hasta:null }, "Listo: cerrado hasta nuevo aviso");
  if (m === "p30" || m === "p60") saveSettings({ modo:"pausa", cerrado_hasta:null, pausa_hasta:new Date(Date.now() + (m === "p30" ? 30 : 60) * 60000).toISOString() }, `Listo: en pausa ${m === "p30" ? "30 minutos" : "1 hora"}`);
});
$("saveAviso").onclick = () => saveSettings({ mensaje: $("aviso").value.trim() || null }, "Aviso guardado");
$("clearAviso").onclick = () => { $("aviso").value = ""; saveSettings({ mensaje: null }, "Aviso quitado"); };

/* ---------- Pedidos ---------- */
let ORDERS = [], filter = "activos", freshId = null;
function nextStep(o){
  if (o.estado === "nuevo") return ["preparando", "Empezar a preparar"];
  if (o.estado === "preparando") return o.entrega === "domicilio" ? ["en_camino", "Va en camino"] : ["listo", "Listo para recoger"];
  if (o.estado === "en_camino" || o.estado === "listo") return ["entregado", "Marcar entregado"];
  return null;
}
const LABEL = { nuevo:"Nuevo", preparando:"Preparando", en_camino:"En camino", listo:"Listo para recoger", entregado:"Entregado", cancelado:"Cancelado" };
const WA_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.8 14.03c-.24.68-1.42 1.3-1.95 1.35-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.92-4.66-4.1-.13-.18-1.11-1.48-1.11-2.82 0-1.34.7-2 .95-2.27.25-.27.54-.34.72-.34l.52.01c.17.01.39-.06.61.47.24.56.79 1.92.86 2.06.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.89 1.05.93 1.93 1.22 2.2 1.36.27.14.43.11.59-.07.16-.18.68-.79.86-1.06.18-.27.36-.23.61-.14.25.09 1.59.75 1.86.89.27.14.45.2.52.32.07.11.07.66-.17 1.35z"/></svg>';
const telPretty = t => t ? `${t.slice(0,2)} ${t.slice(2,6)} ${t.slice(6)}` : "";
// Mensaje listo para mandarle al cliente cuando su pedido cambia de estado
function avisoUrl(o, estado){
  const nombre = (o.nombre || "").split(" ")[0];
  const txt = estado === "listo"
    ? `Hola ${nombre}, tu pedido #${o.folio} de La Barra ya está listo. Puedes pasar por él cuando gustes 🍹`
    : `Hola ${nombre}, tu pedido #${o.folio} de La Barra ya va en camino 🛵`;
  return "https://wa.me/52" + o.telefono + "?text=" + encodeURIComponent(txt);
}
async function loadOrders(){
  const { data, error } = await sb.from("orders").select("*").gte("created_at", todayCDMX() + "T00:00:00-06:00").order("created_at", { ascending:false });
  if (error) { $("orders").innerHTML = `<p class="empty">No se pudieron cargar los pedidos.</p>`; return; }
  ORDERS = data; renderOrders();
}
function renderOrders(){
  const valid = ORDERS.filter(o => o.estado !== "cancelado"), sum = valid.reduce((a,o) => a + o.total, 0);
  $("sVentas").textContent = money(sum); $("sPedidos").textContent = valid.length; $("sTicket").textContent = money(valid.length ? Math.round(sum / valid.length) : 0);
  const list = filter === "activos" ? ORDERS.filter(o => !["entregado","cancelado"].includes(o.estado)) : ORDERS;
  if (!list.length) { $("orders").innerHTML = `<p class="empty">${filter === "activos" ? "No hay pedidos por atender. Los nuevos aparecen aquí solos." : "Todavía no hay pedidos hoy."}</p>`; return; }
  $("orders").innerHTML = list.map(o => `<article class="order ${o.id === freshId ? "fresh" : ""}">
    <div class="oh"><span class="folio num">#${o.folio}</span><span class="who">${esc(o.nombre)}</span><span class="badge ${o.estado}">${LABEL[o.estado]}</span><span class="at">${timeOf(o.created_at)}</span></div>
    <div class="meta">${o.entrega === "domicilio" ? "A domicilio: " + esc(o.direccion) : "Pasa a recoger"}. Paga con ${esc(o.pago)}.${o.telefono ? ` Tel. <a href="tel:${o.telefono}">${telPretty(o.telefono)}</a>` : ""}</div>
    <ul class="items">${(o.items || []).map(i => `<li><span>${i.cantidad} × ${esc(i.nombre)}${i.detalle ? `<small>${esc(i.detalle)}</small>` : ""}</span><span class="num">${money(i.precio * i.cantidad)}</span></li>`).join("")}</ul>
    <div class="ototal"><span>Total</span><span class="num">${money(o.total)}</span></div>
    ${o.notas ? `<div class="notes">${esc(o.notas)}</div>` : ""}
    <div class="actions">
      ${nextStep(o) ? `<button class="next" data-set="${nextStep(o)[0]}" data-id="${o.id}">${nextStep(o)[1]}</button>` : ""}
      ${(o.estado === "en_camino" || o.estado === "listo") && o.telefono ? `<a class="wa" href="${avisoUrl(o, o.estado)}" target="_blank" rel="noopener">${WA_ICON}Avisar al cliente</a>` : ""}
      ${o.estado === "cancelado" || o.estado === "entregado" ? `<button data-set="nuevo" data-id="${o.id}">Regresar a nuevo</button>` : `<button class="cancel" data-set="cancelado" data-id="${o.id}">Cancelar</button>`}
    </div>
  </article>`).join("");
}
document.addEventListener("click", async e => {
  const f = e.target.closest("[data-filter]");
  if (f) { filter = f.dataset.filter; document.querySelectorAll("[data-filter]").forEach(b => b.classList.toggle("on", b === f)); renderOrders(); return; }
  const s = e.target.closest("[data-set]");
  if (s) {
    if (s.dataset.set === "cancelado" && !confirmCancel(s)) return;
    const o0 = ORDERS.find(x => x.id === s.dataset.id);
    // Abre WhatsApp en el mismo toque (antes de esperar a la base) para que el navegador no lo bloquee
    if ((s.dataset.set === "en_camino" || s.dataset.set === "listo") && o0 && o0.telefono) window.open(avisoUrl(o0, s.dataset.set), "_blank");
    s.disabled = true;
    const { error } = await sb.from("orders").update({ estado: s.dataset.set }).eq("id", s.dataset.id);
    if (error) { toast("No se pudo actualizar el pedido"); s.disabled = false; return; }
    const o = ORDERS.find(x => x.id === s.dataset.id); if (o) o.estado = s.dataset.set;
    renderOrders();
  }
});
// Cancelar pide un segundo toque en vez de un cuadro de diálogo
function confirmCancel(btn){
  if (btn.dataset.armed) return true;
  btn.dataset.armed = "1"; btn.textContent = "Toca otra vez para cancelar";
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = "Cancelar"; } }, 3000);
  return false;
}
function listen(){
  sb.channel("pedidos").on("postgres_changes", { event:"*", schema:"public", table:"orders" }, payload => {
    if (payload.eventType === "INSERT") {
      ORDERS.unshift(payload.new); freshId = payload.new.id; renderOrders();
      beep(); toast(`Pedido nuevo #${payload.new.folio} de ${payload.new.nombre}`);
      document.title = `(${ORDERS.filter(o => o.estado === "nuevo").length}) Panel · La Barra`;
    } else if (payload.eventType === "UPDATE") {
      const i = ORDERS.findIndex(o => o.id === payload.new.id); if (i >= 0) { ORDERS[i] = payload.new; renderOrders(); }
    }
  }).subscribe();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { document.title = "Panel · La Barra"; loadState(); loadOrders(); } });

/* ---------- Inicio ---------- */
let started = false;
async function boot(){
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { show("vLogin"); return; }
  const { data: isAdmin } = await sb.rpc("is_admin");
  if (!isAdmin) {
    $("noAccessText").textContent = `El usuario ${session.user.email.split("@")[0]} no tiene acceso al panel.`;
    show("vNoAccess"); return;
  }
  show("vPanel");
  $("whoami").textContent = "Panel de " + session.user.email.split("@")[0];
  if (started) return; started = true;
  await Promise.all([loadState(), loadOrders()]);
  listen();
  setInterval(loadState, 60000);
}
boot();
