// ══════════ GT Asistencia — módulo para la app Nómina semanal (PROTOTIPO) ══════════
// Se conecta con la app a través de window.__NOMINA (sesión, usuarios), window.__NOMINA_OBRAS
// y window.__NOMINA_EMPS (catálogo de trabajadores). Por ahora guarda SUS datos solo en este
// navegador (localStorage); no escribe nada en Firebase. Semanas de jueves a miércoles, igual que Nómina.
// Entradas:
//   · Pantalla de inicio de sesión → botón "Checar asistencia" (trabajadores, sin cuenta de Nómina)
//   · Menú de inicio → tarjeta "Asistencia" (residentes y Jack, con su sesión de Nómina)
//   · Modo checador: dispositivo de obra; al activarlo se cierra la sesión de Nómina del residente
(function(){
'use strict';
if(window.GTAsistencia)return;

/* ───────── Utilidades ───────── */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const DIA=864e5,Y0=new Date(2026,0,1).getTime();
const DIAS_SEM=['Jue','Vie','Sáb','Dom','Lun','Mar','Mié'];
const hhmm=t=>new Date(t).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',hour12:false});
const fCorta=t=>new Date(t).toLocaleDateString('es-MX',{day:'numeric',month:'short'});
const fLarga=t=>new Date(t).toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const iso=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const deIso=s=>{const[a,m,d]=s.split('-').map(Number);return new Date(a,m-1,d).getTime();};
const dinero=n=>(+n||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const fmtH=h=>{const m=Math.round(h*60);return Math.floor(m/60)+':'+String(m%60).padStart(2,'0');};
const semanaDe=t=>{const d=new Date(t);d.setHours(0,0,0,0);return Math.floor((d.getTime()-Y0)/DIA/7+1e-9)+1;};
const inicioSemana=n=>{const d=new Date(Y0);d.setDate(d.getDate()+(n-1)*7);return d.getTime();};
const diaDeSemana=t=>{const d=new Date(t);d.setHours(0,0,0,0);return Math.round((d.getTime()-inicioSemana(semanaDe(t)))/DIA);};
async function sha(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
const hashCodigo=(num,cod)=>sha('gt-asistencia:'+num+':'+cod);

/* ───────── Conexión con Nómina ───────── */
const NOM=()=>window.__NOMINA||null;
const yoNomina=()=>{const n=NOM();return n&&n.state?n.state.resId:null;};
const sesionNomina=()=>{const n=NOM();return !!(n&&n.state&&n.state.uid&&n.state.resId&&!['login','pin','setpin','loading'].includes(n.state.step));};
const pantallaNomina=()=>{const n=NOM();return n&&n.state?n.state.step:null;};
const nombreUsuario=id=>{if(id==='jack')return'Jack';const n=NOM(),u=((n&&n.state.users)||[]).find(x=>x.id===id);return u?u.name:id;};
const catObras=()=>{try{return(window.__NOMINA_OBRAS&&window.__NOMINA_OBRAS())||[];}catch(e){return[];}};
const catEmps=()=>{try{return(window.__NOMINA_EMPS&&window.__NOMINA_EMPS())||[];}catch(e){return[];}};

/* ───────── Datos del módulo (localStorage) ───────── */
const LS='gt-asistencia-nomina-v1',LS_DISP='gt-asistencia-nomina-disp';
let D=null,DISP=null;
function vacio(){return{config:{salarioMinimo:315.04,maxSemana:46,umbral:0.5,redondeoMin:60,comidaMin:0,empresa:'Grupo Trego'},obras:[],empleados:[],checadas:[],correcciones:[],solicitudes:[],abonos:[],bitacora:[]};}
function cargar(){
  try{const x=JSON.parse(localStorage.getItem(LS));if(x&&x.config){D=Object.assign(vacio(),x);D.config=Object.assign(vacio().config,x.config);}}catch(e){}
  if(!D)D=vacio();
  try{DISP=JSON.parse(localStorage.getItem(LS_DISP));}catch(e){}
  if(!DISP)DISP={id:uid(),obra:null,kiosco:null,ultObra:{}};
}
function guardar(){try{localStorage.setItem(LS,JSON.stringify(D));return true;}catch(e){toast('No hay espacio en este navegador para más datos de asistencia.',true);return false;}}
function guardarDisp(){try{localStorage.setItem(LS_DISP,JSON.stringify(DISP));}catch(e){}}
// Copia local del catálogo de obras (para poder checar aunque no haya sesión de Nómina)
function sincronizarObras(){const c=catObras();if(c.length){D.obras=c.map(o=>({code:o.code,name:o.name}));guardar();}}
const obraNom=c=>{if(!c)return'Sin obra';const o=D.obras.find(x=>x.code===c);return o?(o.code===o.name?o.code:o.code+' · '+o.name):c;};
const emp=id=>D.empleados.find(e=>e.id===id);
function bitacora(txt){D.bitacora.push({ts:Date.now(),quien:YO?YO.nombre:(STAFF?nombreUsuario(STAFF):'sistema'),txt});}

/* ───────── Reglas de ley ───────── */
// Art. 76 LFT: 12 días el primer año, +2 por año hasta 20; después +2 por cada 5 años
function diasVacaciones(a){if(a<1)return 0;return a<=5?10+2*a:20+2*Math.ceil((a-5)/5);}
function antiguedad(e,ref=Date.now()){
  const ing=deIso(e.ingreso);let a=0;
  for(;;){const d=new Date(ing);d.setFullYear(d.getFullYear()+a+1);if(d.getTime()<=ref)a++;else break;}
  const aniv=new Date(ing);aniv.setFullYear(aniv.getFullYear()+a);
  const sig=new Date(ing);sig.setFullYear(sig.getFullYear()+a+1);
  const lim=new Date(aniv);lim.setMonth(lim.getMonth()+6); // art. 81
  return{anios:a,aniv:aniv.getTime(),siguiente:sig.getTime(),limite:lim.getTime()};
}
function saldoVacaciones(e){
  const A=antiguedad(e),derecho=diasVacaciones(A.anios);
  const del=D.solicitudes.filter(s=>s.tipo==='vacaciones'&&s.empId===e.id&&s.datos.periodo===A.anios);
  const usados=del.filter(s=>s.estado==='autorizada').reduce((a,s)=>a+s.datos.dias,0);
  const pend=del.filter(s=>s.estado==='pendiente').reduce((a,s)=>a+s.datos.dias,0);
  return{...A,derecho,usados,pend,disp:derecho-usados-pend};
}
function contarDias(desde,hasta){let n=0;for(let t=deIso(desde);t<=deIso(hasta);t+=DIA)if(new Date(t).getDay()!==0)n++;return n;}
// Arts. 110 fr. I y 111: deuda máx. un mes de salario; descuento máx. 30% del excedente del salario mínimo; sin intereses.
// El trabajador solo pide un monto; Jack decide monto, plazo y descuento al autorizar, y la app le avisa si pasa de esos límites.
function saldoPrestamo(s){return Math.max(0,s.datos.monto-D.abonos.filter(a=>a.solId===s.id).reduce((x,a)=>x+a.monto,0));}
function limitesPrestamo(e){
  const mias=D.solicitudes.filter(s=>s.tipo==='prestamo'&&s.empId===e.id);
  const debe=mias.filter(s=>s.estado==='autorizada').reduce((a,s)=>a+saldoPrestamo(s),0);
  const maxMonto=Math.max(0,e.salarioDiario*30-debe);
  const maxDesc=Math.max(0,0.30*(e.salarioDiario-D.config.salarioMinimo)*7);
  const comprometido=mias.filter(s=>s.estado==='autorizada'&&saldoPrestamo(s)>0).reduce((a,s)=>a+s.datos.descuento,0);
  return{debe,maxMonto,maxDesc,descDisp:Math.max(0,maxDesc-comprometido)};
}

/* ───────── Checadas, correcciones y horas ───────── */
function efectivas(){
  const anuladas=new Set(D.correcciones.filter(c=>c.tipo==='anular').map(c=>c.checadaId));
  return D.checadas.filter(c=>!anuladas.has(c.id)).concat(D.correcciones.filter(c=>c.tipo==='agregar').map(c=>({id:c.id,empId:c.empId,tipo:c.tipoChecada,ts:c.ts,obra:c.obra,metodo:'corrección',corr:c}))).sort((a,b)=>a.ts-b.ts);
}
function jornadas(empId,lista){
  const out=[];let ab=null;
  for(const c of lista){if(c.empId!==empId)continue;
    if(c.tipo==='entrada'){if(ab)out.push({ent:ab,sal:null});ab=c;}
    else{if(ab){out.push({ent:ab,sal:c});ab=null;}else out.push({ent:null,sal:c});}}
  if(ab)out.push({ent:ab,sal:null});
  return out;
}
function horasJ(j){if(!j.ent||!j.sal)return 0;let h=(j.sal.ts-j.ent.ts)/3600e3;if(h>5)h-=D.config.comidaMin/60;return Math.max(0,h);}
const redondeo=h=>{const r=D.config.redondeoMin/60;return Math.round(h/r)*r;};
function ultimaChecada(empId){const l=efectivas().filter(c=>c.empId===empId);return l[l.length-1];}
function resumenSemana(n,obraFiltro){
  const ini=inicioSemana(n),fin=ini+7*DIA,lista=efectivas(),filas=[];
  for(const e of D.empleados){
    const js=jornadas(e.id,lista).filter(j=>{const c=j.ent||j.sal;return c.ts>=ini&&c.ts<fin&&(!obraFiltro||c.obra===obraFiltro);});
    if(!js.length)continue;
    const r={emp:e,dias:Array.from({length:7},()=>({h:0,js:[],flags:new Set()})),total:0,flags:new Set()};
    for(const j of js){
      const d=r.dias[diaDeSemana((j.ent||j.sal).ts)];d.js.push(j);d.h+=horasJ(j);
      if(!j.sal)d.flags.add('sin salida');if(!j.ent)d.flags.add('sin entrada');
      for(const c of[j.ent,j.sal])if(c){if(c.metodo==='código')d.flags.add('con código');if(c.metodo==='corrección')d.flags.add('corregida');}
    }
    r.dias.forEach(d=>{r.total+=d.h;d.flags.forEach(f=>r.flags.add(f));});
    if(r.total>D.config.maxSemana)r.flags.add('excede '+D.config.maxSemana+' h');
    filas.push(r);
  }
  return{ini,filas:filas.sort((a,b)=>a.emp.nombre.localeCompare(b.emp.nombre))};
}

/* ───────── Cámara y reconocimiento (face-api se carga solo cuando se usa) ───────── */
const FACE_LIB='https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.js';
const FACE_MODELS='https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model';
let stream=null,_modelos=null,detOpts=null;
function cargarScript(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(new Error('No se pudo descargar '+src));document.head.appendChild(s);});}
function cargarModelos(){
  if(_modelos)return _modelos;
  _modelos=(async()=>{
    if(typeof faceapi==='undefined')await cargarScript(FACE_LIB);
    try{if(!await faceapi.tf.setBackend('webgl'))throw 0;}catch(e){await faceapi.tf.setBackend('cpu');}
    await faceapi.tf.ready();
    await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS);
    await faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODELS);
    await faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS);
    detOpts=new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:0.5});
  })();
  _modelos.catch(()=>{_modelos=null;});
  return _modelos;
}
async function prenderCamara(v){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('Este navegador no permite usar la cámara.');
  if(!stream||!stream.active)stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
  v.srcObject=stream;await new Promise(r=>v.readyState>=2?r():v.onloadeddata=r);
}
function apagarCamara(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}}
const detectar=v=>faceapi.detectSingleFace(v,detOpts).withFaceLandmarks().withFaceDescriptor();
function giro(lm){const c=p=>p.reduce((a,q)=>({x:a.x+q.x/p.length,y:a.y+q.y/p.length}),{x:0,y:0});const l=c(lm.getLeftEye()),r=c(lm.getRightEye()),n=lm.getNose()[3],d=Math.hypot(r.x-l.x,r.y-l.y)||1;return(n.x-(l.x+r.x)/2)/d;}
function foto(v,box){
  const c=document.createElement('canvas'),S=112;c.width=c.height=S;const x=c.getContext('2d');let s,sx,sy;
  if(box){s=Math.max(box.width,box.height)*1.6;sx=box.x+box.width/2-s/2;sy=box.y+box.height/2-s/2;}
  else{s=Math.min(v.videoWidth,v.videoHeight);sx=(v.videoWidth-s)/2;sy=(v.videoHeight-s)/2;}
  x.translate(S,0);x.scale(-1,1);x.drawImage(v,sx,sy,s,s,0,0,S,S);return c.toDataURL('image/jpeg',0.7);
}
// Comparación: en modo checador de obra contra los trabajadores con rostro (en producción, solo los de esa obra)
function mejor(desc,candidatos){
  let best=null,dist=9;
  for(const e of candidatos)for(const d of e.descriptores||[]){const x=faceapi.euclideanDistance(desc,d);if(x<dist){dist=x;best=e;}}
  return{emp:best,dist};
}

/* ───────── UI base ───────── */
const CSS=`
#as-root{--g:#C2AB74;--gd:#A8924F;--gs:#EFE5CB;--n:#0F0F0F;--bg:#F7F3EA;--sup:#fff;--sup2:#FAF6EE;--l:#E8E4DC;--t:#1A1A1A;--t2:#5F5A50;--ok:#2E7D32;--okb:#E8F5E9;--mal:#C62828;--malb:#FFEBEE;--av:#B26A00;--avb:#FFF4E0;font-family:Inter,'Segoe UI',system-ui,sans-serif;color:var(--t);font-size:15px}
#as-root *{box-sizing:border-box}
#as-root [hidden]{display:none!important}
.as-ov{position:fixed;inset:0;z-index:40;overflow:auto;background:var(--bg)}
.as-bar{position:sticky;top:0;z-index:2;background:var(--n);color:#F2EEE4;padding:calc(10px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) 10px max(16px,env(safe-area-inset-left,0px))}
.as-bari{max-width:1100px;margin:0 auto;display:flex;align-items:center;gap:12px}
.as-badge{background:var(--g);color:var(--n);font-weight:800;font-size:12px;letter-spacing:.08em;padding:4px 8px;border-radius:6px}
.as-ttl{flex:1;min-width:0;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.as-ttl small{display:block;font-weight:500;font-size:12px;color:#B6AE9E}
#as-root .as-bar button{background:transparent;border:1px solid #3A3530;color:#F2EEE4;border-radius:10px;padding:8px 12px;font:inherit;font-size:13px;cursor:pointer}
.as-proto{background:var(--avb);color:var(--av);font-size:12px;text-align:center;padding:6px 16px}
.as-main{max-width:1100px;margin:0 auto;padding:20px max(16px,env(safe-area-inset-right,0px)) calc(40px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));display:flex;flex-direction:column;gap:16px}
#as-root h2{margin:0;font-size:22px;text-wrap:balance}
#as-root h3{margin:0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--gd)}
#as-root button{font:inherit;color:inherit;cursor:pointer;border:1px solid var(--l);border-radius:10px;padding:11px 16px;background:var(--sup)}
#as-root button:hover{border-color:var(--g)}
#as-root button.pri{background:var(--gd);border-color:var(--gd);color:#fff;font-weight:700}
#as-root button.peligro{color:var(--mal);border-color:var(--mal)}
#as-root button.link{border:0;background:none;color:var(--gd);padding:6px 0;text-decoration:underline}
#as-root button:disabled{opacity:.45;cursor:default}
#as-root :focus-visible{outline:3px solid var(--g);outline-offset:2px}
#as-root input,#as-root select{font:inherit;color:var(--t);background:var(--sup);border:1px solid var(--l);border-radius:10px;padding:11px 12px;width:100%}
#as-root label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--t2)}
.as-cab{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.as-cab h2{flex:1;min-width:200px}
.as-card{background:var(--sup);border:1px solid var(--l);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:14px;min-width:0}
.as-nota{font-size:13px;color:var(--t2);line-height:1.5;margin:0}
.as-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.as-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end}
.as-fila{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.as-acceso{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:16px;align-items:start}
.as-cam{position:relative;aspect-ratio:4/3;background:#000;border-radius:14px;overflow:hidden;max-width:100%}
.as-cam video,.as-cam canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
.as-cam .as-msg{position:absolute;left:12px;right:12px;bottom:12px;background:rgba(15,15,15,.82);color:#F2EEE4;padding:11px 14px;border-radius:12px;text-align:center;font-weight:600}
.as-cam .as-msg.mal{background:rgba(90,20,20,.9)}
.as-saludo{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.as-av{width:64px;height:64px;border-radius:14px;object-fit:cover;background:var(--sup2);flex:none;display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--gd);font-size:22px}
.as-saludo>div:not(.as-av){flex:1;min-width:180px}
.as-saludo b{font-size:20px;display:block}
.as-punto{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--t2);margin-right:6px}.as-punto.on{background:var(--ok)}
#as-root .as-checar{font-size:20px;padding:22px;border-radius:16px;width:100%}
.as-checar small{display:block;font-size:13px;font-weight:500;opacity:.85;margin-top:4px}
#as-root .as-acc{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;padding:16px;border-radius:14px;min-height:86px;position:relative}
.as-acc b{font-size:16px}.as-acc span{font-size:13px;color:var(--t2)}
.as-acc .as-num{position:absolute;top:12px;right:12px;background:var(--mal);color:#fff;border-radius:99px;font-size:12px;font-weight:700;padding:2px 8px}
.as-chip{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.05em;padding:3px 8px;border-radius:99px;background:var(--sup2);color:var(--t2);white-space:nowrap}
.as-chip.ok{background:var(--okb);color:var(--ok)}.as-chip.mal{background:var(--malb);color:var(--mal)}.as-chip.av{background:var(--avb);color:var(--av)}
.as-tabla{overflow-x:auto;border:1px solid var(--l);border-radius:12px}
#as-root table{border-collapse:collapse;width:100%;font-size:14px}
#as-root th,#as-root td{padding:9px 10px;text-align:left;border-bottom:1px solid var(--l);white-space:nowrap;vertical-align:middle}
#as-root th{background:var(--sup2);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--t2)}
#as-root td.n,#as-root th.n{text-align:right;font-variant-numeric:tabular-nums}
#as-root tr:last-child td{border-bottom:0}
#as-root tr.exceso td{background:var(--malb)}
.as-mini{width:38px;height:38px;border-radius:8px;object-fit:cover;display:block}
.as-dia{text-align:center!important}
#as-root .as-dia button{border:0;background:none;padding:4px 6px;font-variant-numeric:tabular-nums}
.as-vacio{color:var(--t2);padding:18px;text-align:center;border:1px dashed var(--l);border-radius:12px}
.as-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.as-kpi{background:var(--sup2);border-radius:12px;padding:12px 14px}.as-kpi small{display:block;font-size:12px;color:var(--t2)}.as-kpi b{font-size:24px;font-variant-numeric:tabular-nums}
.as-sol{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;background:var(--sup2);border-radius:12px;padding:12px 14px}
.as-sol b{display:block}.as-sol small{color:var(--t2)}
.as-firma{border:2px dashed var(--l);border-radius:12px;background:#fff;touch-action:none;width:100%;height:170px;display:block}
.as-firmaimg{background:#fff;border-radius:8px;max-width:260px;width:100%;border:1px solid var(--l)}
.as-legal{font-size:13px;line-height:1.55;background:var(--sup2);border-radius:12px;padding:12px 14px;max-height:220px;overflow:auto}
.as-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;z-index:45}
.as-caja{background:var(--sup);border-radius:18px;padding:22px;width:100%;max-width:520px;max-height:100%;overflow:auto;display:flex;flex-direction:column;gap:14px}
.as-caja h3{font-size:19px!important;letter-spacing:0!important;text-transform:none!important;color:var(--t)!important}
.as-res{text-align:center;align-items:center;border-top:8px solid var(--ok);border-radius:12px;padding-top:14px;display:flex;flex-direction:column;gap:10px}
.as-res.sal{border-top-color:var(--g)}
.as-res .t{font-weight:800;letter-spacing:.14em;color:var(--ok)}.as-res.sal .t{color:var(--gd)}
.as-res .h{font-size:48px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.as-toast{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top,0px));transform:translateX(-50%);background:var(--t);color:#fff;padding:12px 18px;border-radius:12px;z-index:60;font-weight:600;max-width:calc(100% - 32px);box-shadow:0 8px 30px rgba(0,0,0,.3)}
.as-toast.err{background:var(--mal)}
.as-comp{background:#fff;color:#111;border:1px solid var(--l);border-radius:12px;padding:16px;font-size:14px;line-height:1.5}
.as-comp h4{margin:0 0 8px;font-size:16px}
#as-root #as-entrar{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:30;display:flex;align-items:center;gap:10px;border:0;border-radius:99px;padding:14px 22px;font:700 16px/1 Inter,system-ui,sans-serif;color:#fff;background:linear-gradient(135deg,#C2AB74,#A8924F);box-shadow:0 8px 22px rgba(168,146,79,.45);cursor:pointer}
@media (max-width:720px){.as-acceso{grid-template-columns:1fr}#as-root h2{font-size:19px}}
@media print{body>*:not(#as-root){display:none!important}.as-bar,.as-proto,.as-noprint{display:none!important}.as-modal{position:static;background:none}}
`;
let root,ov,modal;
function montar(){
  if(root)return;
  const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  root=document.createElement('div');root.id='as-root';
  root.innerHTML='<div class="as-ov" id="as-ov" hidden></div><div class="as-modal" id="as-modal" hidden><div class="as-caja" id="as-caja"></div></div><button id="as-entrar" hidden>Checar asistencia</button>';
  document.body.appendChild(root);
  ov=root.querySelector('#as-ov');modal=root.querySelector('#as-modal');
  root.querySelector('#as-entrar').onclick=()=>abrir('trabajador');
  ov.addEventListener('click',e=>{const b=e.target.closest('[data-ir]');if(b){ir(b.dataset.ir,b.dataset.p);return;}const v=e.target.closest('[data-ver]');if(v)verSolicitud(v.dataset.ver);});
  root.addEventListener('click',e=>{const b=e.target.closest('[data-limpiar]');if(b&&FIRMAS[b.dataset.limpiar])FIRMAS[b.dataset.limpiar].limpiar();});
  ['pointerdown','keydown'].forEach(ev=>root.addEventListener(ev,tocar,{passive:true}));
}
let _tt;
function toast(t,err){const el=document.createElement('div');el.className='as-toast'+(err?' err':'');el.textContent=t;root.appendChild(el);setTimeout(()=>el.remove(),err?6000:3000);}
function abrirModal(html){const c=root.querySelector('#as-caja');c.innerHTML=html;c.onclick=null;modal.hidden=false;return c;}
function cerrarModal(){modal.hidden=true;root.querySelector('#as-caja').innerHTML='';}
function confirmar(tit,txt,si='Sí, continuar'){return new Promise(res=>{const c=abrirModal(`<h3>${esc(tit)}</h3><p class="as-nota">${esc(txt)}</p><div class="as-fila"><button data-r="0">Cancelar</button><button class="pri" data-r="1">${esc(si)}</button></div>`);c.onclick=e=>{const b=e.target.closest('[data-r]');if(!b)return;cerrarModal();res(b.dataset.r==='1');};});}
const FIRMAS={};
function panelFirma(canvas){
  const g=canvas.getContext('2d');let trazo=false,hay=false,ult=null;
  const ajusta=()=>{const r=canvas.getBoundingClientRect(),k=window.devicePixelRatio||1;canvas.width=r.width*k;canvas.height=r.height*k;g.setTransform(k,0,0,k,0,0);g.lineWidth=2.4;g.lineCap='round';g.lineJoin='round';g.strokeStyle='#111';hay=false;};
  ajusta();const pos=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
  canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);trazo=true;ult=pos(e);g.beginPath();g.arc(ult.x,ult.y,1.1,0,7);g.fillStyle='#111';g.fill();hay=true;};
  canvas.onpointermove=e=>{if(!trazo)return;const p=pos(e);g.beginPath();g.moveTo(ult.x,ult.y);g.lineTo(p.x,p.y);g.stroke();ult=p;};
  canvas.onpointerup=canvas.onpointercancel=()=>{trazo=false;};
  return{vacio:()=>!hay,limpiar:ajusta,png:()=>{const c=document.createElement('canvas'),w=420,h=Math.round(w*canvas.height/canvas.width);c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(canvas,0,0,w,h);return c.toDataURL('image/png');}};
}
const htmlFirma=id=>`<canvas class="as-firma" id="${id}" aria-label="Área para firmar"></canvas><div class="as-fila"><span class="as-nota" style="flex:1">Firma con el dedo o el mouse.</span><button class="link" data-limpiar="${id}">Borrar firma</button></div>`;
const $a=s=>root.querySelector(s);

/* ───────── Sesión del módulo ─────────
   MODO: 'trabajador' (sin cuenta de Nómina; solo ve lo suyo), 'kiosco' (dispositivo de obra),
         'staff' (residente o Jack con su sesión de Nómina) */
let MODO=null,YO=null,ACCESO=null,FOTO=null,STAFF=null,VISTA=null,PARAM=null,_idle,ACC=null;
const esJack=()=>STAFF==='jack';
function abrir(modo){
  cargar();montar();
  if(modo==='staff'){if(!sesionNomina())return;STAFF=yoNomina();sincronizarObras();}
  else STAFF=null;
  MODO=modo;YO=null;ov.hidden=false;
  ir(modo==='staff'?'staff':'acceso');
}
function cerrar(){
  detenerAcceso();apagarCamara();cerrarModal();ov.hidden=true;MODO=null;YO=null;STAFF=null;clearTimeout(_idle);
  const n=NOM();if(n&&n.state&&sesionNomina()){try{window.__repoAbrir&&window.__repoAbrir();}catch(e){}}
}
function entrarTrabajador(e,metodo,f){YO=e;ACCESO=metodo;FOTO=f||null;detenerAcceso();apagarCamara();tocar();ir('inicio');}
function salirTrabajador(){YO=null;ACCESO=null;FOTO=null;clearTimeout(_idle);cerrarModal();
  if(MODO==='kiosco')ir('acceso');else cerrar();}
function tocar(){clearTimeout(_idle);if(!YO)return;_idle=setTimeout(()=>{toast('Sesión cerrada por inactividad');salirTrabajador();},2*60e3);}
function ir(v,p){VISTA=v;PARAM=p;if(v!=='acceso')detenerAcceso();ov.scrollTop=0;pintar();}
function pintar(){
  if(ov.hidden)return;
  const titulo=MODO==='staff'?'Asistencia · '+nombreUsuario(STAFF):MODO==='kiosco'?'Checador de obra':'Checar asistencia';
  const obra=MODO==='kiosco'?DISP.kiosco&&DISP.kiosco.obra:YO?obraTrabajo():DISP.obra;
  let der='';
  if(MODO==='staff')der='<button data-x="cerrar">Volver al menú</button>';
  else if(YO)der='<button data-x="salirT">Salir</button>';
  else if(MODO==='kiosco')der='<button data-x="salirK" title="Salir del modo checador">Salir</button>';
  else der='<button data-x="cerrar">Volver</button>';
  ov.innerHTML=`<div class="as-bar"><div class="as-bari"><span class="as-badge">TREGO</span><div class="as-ttl">${esc(titulo)}<small>Obra: ${esc(obra?obraNom(obra):'sin asignar')}</small></div>${der}</div></div>
    <div class="as-proto">Prototipo: la asistencia se guarda solo en este navegador. No modifica la nómina ni las reposiciones.</div><main class="as-main" id="as-main"></main>`;
  ov.querySelectorAll('[data-x]').forEach(b=>b.onclick=async()=>{const x=b.dataset.x;
    if(x==='cerrar')cerrar();else if(x==='salirT')salirTrabajador();
    else if(x==='salirK'){if(await confirmar('Salir del modo checador','Se mostrará la pantalla de inicio de sesión de Nómina. Este dispositivo sigue en modo checador hasta que un residente lo desactive desde Asistencia.','Salir'))pausarKiosco();}});
  VISTAS[VISTA]($a('#as-main'),PARAM);
}
const volver=(v='inicio',t='Inicio')=>`<button data-ir="${v}">← ${t}</button>`;
// Obra a la que se cargan las checadas de un trabajador: la del modo checador, o la que eligió en su celular
function obraTrabajo(){if(MODO==='kiosco')return DISP.kiosco&&DISP.kiosco.obra;return(YO&&DISP.ultObra[YO.id])||DISP.obra||null;}
const VISTAS={};

/* ═════════ ACCESO DE TRABAJADORES: rostro primero, número + código de respaldo ═════════ */
function detenerAcceso(){if(ACC){ACC.vivo=false;ACC=null;}}
VISTAS.acceso=(m)=>{
  const hayRostros=D.empleados.some(e=>e.activo&&e.descriptores&&e.descriptores.length);
  m.innerHTML=`<div class="as-acceso">
    <div class="as-card"><h3>Entrar con tu rostro</h3>
      <div class="as-cam"><video id="as-v" playsinline muted autoplay></video><canvas id="as-c"></canvas><div class="as-msg" id="as-m">${hayRostros?'Encendiendo cámara…':'Aún no hay rostros registrados. Entra con tu número de empleado.'}</div></div>
      <p class="as-nota">Mira a la cámara y gira un poco la cabeza cuando te lo pida.</p></div>
    <div class="as-card"><h3>Entrar con número de empleado</h3>
      <form id="as-fcod" class="as-form" style="grid-template-columns:1fr">
        <label>Número de empleado<input id="as-num" inputmode="numeric" autocomplete="off" required></label>
        <label>Código<input id="as-cod" type="password" inputmode="numeric" maxlength="6" autocomplete="off" required></label>
        <button class="pri" type="submit">Entrar</button></form>
      <p class="as-nota">Úsalo si la cámara no te reconoce. Las checadas con código las revisa tu residente.</p>
      <p class="as-nota">Esta entrada es solo para checar asistencia, vacaciones y préstamos. No da acceso a Nómina ni a Reposiciones.</p></div></div>`;
  $a('#as-fcod').onsubmit=async ev=>{ev.preventDefault();
    const num=$a('#as-num').value.trim(),cod=$a('#as-cod').value.trim(),e=D.empleados.find(x=>x.num===num&&x.activo);
    if(!e||!e.codigo||e.codigo!==await hashCodigo(num,cod)){toast('Número o código incorrecto',true);$a('#as-cod').value='';return;}
    let f=null;const v=$a('#as-v');try{if(v&&v.readyState>=2)f=foto(v);}catch(x){}
    entrarTrabajador(e,'código',f);};
  if(hayRostros)accesoFacial();
};
async function accesoFacial(){
  const yo=ACC={vivo:true,est:null,sin:0,desc:0},v=$a('#as-v'),cv=$a('#as-c'),m=$a('#as-m');
  const msg=(t,mal)=>{if(!yo.vivo)return;m.textContent=t;m.classList.toggle('mal',!!mal);};
  // En modo checador solo se compara contra los trabajadores de esa obra (si se les asignó); si no, contra todos
  const cand=()=>{const act=D.empleados.filter(e=>e.activo&&e.descriptores&&e.descriptores.length);
    if(MODO!=='kiosco')return act;const o=DISP.kiosco&&DISP.kiosco.obra,de=act.filter(e=>(e.obras||[]).includes(o));return de.length?de:act;};
  try{await prenderCamara(v);if(!yo.vivo)return;cv.width=v.videoWidth;cv.height=v.videoHeight;msg('Cargando reconocimiento…');await cargarModelos();if(!yo.vivo)return;msg('Mira a la cámara');}
  catch(e){msg(e&&e.name==='NotAllowedError'?'Permite el uso de la cámara, o entra con tu número.':(e&&e.message)||'No se pudo usar la cámara',true);return;}
  const g=cv.getContext('2d'),caja=(b,c)=>{g.clearRect(0,0,cv.width,cv.height);if(b){g.strokeStyle=c;g.lineWidth=4;g.strokeRect(b.x,b.y,b.width,b.height);}};
  while(yo.vivo){
    let r=null;try{r=await detectar(v);}catch(e){}if(!yo.vivo)break;
    const chica=r&&r.detection.box.width<v.videoWidth*0.18;
    if(!r||chica){caja(null);if(++yo.sin>6){yo.est=null;msg(chica?'Acércate un poco más':'Mira a la cámara');}}
    else{yo.sin=0;const b=r.detection.box,mm=mejor(r.descriptor,cand()),y=giro(r.landmarks);
      if(!mm.emp||mm.dist>D.config.umbral){yo.est=null;caja(b,'#EF5350');msg(++yo.desc>8?'No te reconozco. Entra con tu número de empleado.':'Identificando…',yo.desc>8);}
      else{yo.desc=0;
        if(!yo.est||yo.est.emp.id!==mm.emp.id){yo.est={emp:mm.emp,base:y,t0:Date.now(),hits:1,f:foto(v,b)};caja(b,'#C2AB74');msg('Hola '+mm.emp.nombre.split(' ').slice(-1)[0]+', gira un poco la cabeza');}
        else{yo.est.hits++;caja(b,'#C2AB74');
          if(yo.est.hits>=3&&Math.abs(y-yo.est.base)>0.13){caja(b,'#4CAF50');entrarTrabajador(yo.est.emp,'rostro',yo.est.f);return;}
          if(Date.now()-yo.est.t0>8000){msg('Gira la cabeza un poco a un lado',true);yo.est.t0=Date.now();yo.est.base=y;}}}}
    await new Promise(s=>setTimeout(s,120));
  }
}

/* ═════════ INICIO DEL TRABAJADOR ═════════ */
VISTAS.inicio=(m)=>{
  const ult=ultimaChecada(YO.id),dentro=ult&&ult.tipo==='entrada'&&Date.now()-ult.ts<16*3600e3,obra=obraTrabajo();
  const acc=(v,t,s)=>`<button class="as-acc" data-ir="${v}"><b>${t}</b><span>${s}</span></button>`;
  m.innerHTML=`<div class="as-card"><div class="as-saludo">${YO.foto?`<img class="as-av" src="${YO.foto}" alt="">`:`<div class="as-av">${esc(YO.nombre[0]||'?')}</div>`}
    <div><b>Hola, ${esc(YO.nombre)}</b><span class="as-nota"><span class="as-punto ${dentro?'on':''}"></span>${dentro?'Dentro desde las '+hhmm(ult.ts)+' · '+esc(obraNom(ult.obra)):'Fuera de jornada'}</span>
    <div class="as-nota">No. ${esc(YO.num)} · entraste con ${ACCESO==='rostro'?'tu rostro':'tu código'}</div></div></div>
    ${obra?`<button class="pri as-checar" id="as-chk">Registrar ${dentro?'SALIDA':'ENTRADA'}<small>${esc(obraNom(dentro?ult.obra:obra))} · ${hhmm(Date.now())}</small></button>`:''}
    ${MODO!=='kiosco'&&!dentro?`<label>Obra donde estás trabajando hoy<select id="as-obra"><option value="">— Elige la obra —</option>${D.obras.map(o=>`<option value="${esc(o.code)}" ${o.code===obra?'selected':''}>${esc(obraNom(o.code))}</option>`).join('')}</select></label>`:''}
  </div>
  <div class="as-grid">${acc('registros','Mis registros','Entradas, salidas y horas de la semana')}${acc('vacaciones','Vacaciones','Consulta tus días y solicítalos')}${acc('prestamos','Préstamos','Solicita un anticipo de salario')}</div>`;
  const s=$a('#as-obra');if(s)s.onchange=()=>{DISP.ultObra[YO.id]=s.value||null;guardarDisp();pintar();};
  const b=$a('#as-chk');if(b)b.onclick=registrar;
};
function registrar(){
  const ahora=Date.now(),ult=ultimaChecada(YO.id);
  if(ult&&ahora-ult.ts<60e3){toast('Ya registraste tu '+ult.tipo+' hace menos de un minuto',true);return;}
  const tipo=ult&&ult.tipo==='entrada'&&ahora-ult.ts<16*3600e3?'salida':'entrada';
  const c={id:uid(),empId:YO.id,tipo,ts:ahora,obra:tipo==='salida'?ult.obra:obraTrabajo(),metodo:ACCESO,foto:FOTO,dispositivo:DISP.id,modo:MODO};
  D.checadas.push(c);if(!guardar()){D.checadas.pop();return;}
  let sub=obraNom(c.obra)+(ACCESO==='código'?' · con código':'');
  if(tipo==='salida')sub+=' · '+fmtH(horasJ({ent:ult,sal:c}))+' h trabajadas';
  const caja=abrirModal(`<div class="as-res ${tipo==='salida'?'sal':''}">${c.foto?`<img src="${c.foto}" alt="" style="width:110px;height:110px;border-radius:14px;object-fit:cover">`:''}
    <div class="t">${tipo.toUpperCase()} REGISTRADA</div><b style="font-size:20px">${esc(YO.nombre)}</b><div class="h">${hhmm(ahora)}</div><div class="as-nota">${esc(sub)}</div>
    <div class="as-fila" style="justify-content:center"><button data-r="seguir">Seguir en mi cuenta</button><button class="pri" data-r="ok">Listo, cerrar sesión</button></div><p class="as-nota" id="as-cta">La sesión se cierra sola en 6 s</p></div>`);
  let n=6;const t=setInterval(()=>{n--;const el=$a('#as-cta');if(el)el.textContent='La sesión se cierra sola en '+n+' s';if(n<=0){clearInterval(t);salirTrabajador();}},1000);
  caja.onclick=e=>{const b=e.target.closest('[data-r]');if(!b)return;clearInterval(t);cerrarModal();if(b.dataset.r==='ok')salirTrabajador();else pintar();};
}
VISTAS.registros=(m,p)=>{
  const n=+p||semanaDe(Date.now()),ini=inicioSemana(n),js=jornadas(YO.id,efectivas().filter(c=>c.empId===YO.id&&c.ts>=ini&&c.ts<ini+7*DIA)),tot=js.reduce((a,j)=>a+horasJ(j),0);
  m.innerHTML=`<div class="as-cab"><h2>Mis registros · Semana ${n}</h2>${volver()}</div>
  <div class="as-fila"><button data-ir="registros" data-p="${n-1}">← Semana ${n-1}</button><span class="as-nota">${fCorta(ini)} al ${fCorta(ini+6*DIA)}</span>${n<semanaDe(Date.now())?`<button data-ir="registros" data-p="${n+1}">Semana ${n+1} →</button>`:''}</div>
  <div class="as-kpis"><div class="as-kpi"><small>Horas de la semana</small><b>${fmtH(tot)}</b></div><div class="as-kpi"><small>Jornada máxima legal</small><b>${D.config.maxSemana} h</b></div></div>
  <div class="as-tabla"><table><thead><tr><th>Día</th><th class="n">Entrada</th><th class="n">Salida</th><th class="n">Horas</th><th>Obra</th><th></th></tr></thead><tbody>
  ${js.length?js.map(j=>`<tr><td>${esc(new Date((j.ent||j.sal).ts).toLocaleDateString('es-MX',{weekday:'short',day:'numeric',month:'short'}))}</td><td class="n">${j.ent?hhmm(j.ent.ts):'—'}</td><td class="n">${j.sal?hhmm(j.sal.ts):'—'}</td><td class="n">${j.ent&&j.sal?fmtH(horasJ(j)):'—'}</td><td>${esc(obraNom((j.ent||j.sal).obra))}</td><td>${!j.sal?'<span class="as-chip av">SIN SALIDA</span>':''}</td></tr>`).join(''):'<tr><td colspan="6" class="as-vacio">Sin registros esta semana.</td></tr>'}
  </tbody></table></div>`;
};

/* ═════════ VACACIONES Y PRÉSTAMOS (trabajador) ═════════ */
function datosCompletos(m){if(YO.salarioDiario>0&&YO.ingreso)return true;
  m.innerHTML=`<div class="as-cab"><h2>Datos incompletos</h2>${volver()}</div><div class="as-vacio">Faltan tu fecha de ingreso o tu salario en el sistema. Pídele a Jack que los capture.</div>`;return false;}
VISTAS.vacaciones=(m)=>{
  if(!datosCompletos(m))return;
  const S=saldoVacaciones(YO),mias=D.solicitudes.filter(s=>s.tipo==='vacaciones'&&s.empId===YO.id).sort((a,b)=>b.creado-a.creado);
  m.innerHTML=`<div class="as-cab"><h2>Vacaciones</h2>${volver()}</div>
  <div class="as-kpis"><div class="as-kpi"><small>Antigüedad</small><b>${S.anios} ${S.anios===1?'año':'años'}</b></div><div class="as-kpi"><small>Te corresponden</small><b>${S.derecho}</b></div><div class="as-kpi"><small>Usados / en trámite</small><b>${S.usados} / ${S.pend}</b></div><div class="as-kpi"><small>Disponibles</small><b>${S.disp}</b></div></div>
  <p class="as-nota">${S.anios<1?'Las vacaciones se generan al cumplir tu primer año, el '+fLarga(S.siguiente)+'.':'Periodo de tu año '+S.anios+' de servicio. La ley pide disfrutarlas a más tardar el '+fLarga(S.limite)+'. Prima vacacional: 25% sobre el salario de esos días.'}</p>
  ${S.disp>0?`<div class="as-card"><h3>Nueva solicitud</h3><div class="as-form"><label>Desde<input type="date" id="as-vd" min="${iso(Date.now())}"></label><label>Hasta<input type="date" id="as-vh" min="${iso(Date.now())}"></label></div>
    <p class="as-nota" id="as-vc">Elige las fechas. No se cuentan los domingos.</p>
    <div class="as-legal">Solicito disfrutar mis vacaciones en las fechas indicadas, a cuenta del periodo de mi año ${S.anios} de servicio, conforme a los artículos 76 a 81 de la Ley Federal del Trabajo. La solicitud queda sujeta a autorización de la empresa.</div>
    ${htmlFirma('as-fv')}<button class="pri" id="as-venv">Firmar y enviar solicitud</button></div>`:''}
  <div class="as-card"><h3>Mis solicitudes</h3>${listaSolicitudes(mias)}</div>`;
  if(S.disp<=0)return;
  FIRMAS['as-fv']=panelFirma($a('#as-fv'));
  const calc=()=>{const a=$a('#as-vd').value,b=$a('#as-vh').value;if(!a||!b||b<a){$a('#as-vc').textContent='Elige las fechas. No se cuentan los domingos.';return 0;}
    const n=contarDias(a,b);$a('#as-vc').innerHTML=`<b>${n} ${n===1?'día':'días'}</b>${n>S.disp?` <span class="as-chip mal">SOLO TIENES ${S.disp}</span>`:''} · prima vacacional estimada ${dinero(n*YO.salarioDiario*0.25)}`;return n;};
  $a('#as-vd').onchange=$a('#as-vh').onchange=calc;
  $a('#as-venv').onclick=()=>{const n=calc();if(!n){toast('Elige fechas válidas',true);return;}if(n>S.disp){toast('No tienes suficientes días',true);return;}if(FIRMAS['as-fv'].vacio()){toast('Falta tu firma',true);return;}
    crearSolicitud('vacaciones',{desde:$a('#as-vd').value,hasta:$a('#as-vh').value,dias:n,periodo:S.anios,prima:+(n*YO.salarioDiario*0.25).toFixed(2)},FIRMAS['as-fv'].png());ir('vacaciones');};
};
VISTAS.prestamos=(m)=>{
  if(!datosCompletos(m))return;
  const L=limitesPrestamo(YO),mios=D.solicitudes.filter(s=>s.tipo==='prestamo'&&s.empId===YO.id).sort((a,b)=>b.creado-a.creado);
  m.innerHTML=`<div class="as-cab"><h2>Préstamos</h2>${volver()}</div>
  <div class="as-kpis"><div class="as-kpi"><small>Adeudo actual</small><b>${dinero(L.debe)}</b></div></div>
  <div class="as-card"><h3>Nueva solicitud</h3><div class="as-form"><label>¿Cuánto necesitas?<input type="number" id="as-pm" min="1" step="50"></label><label>Motivo (opcional)<input id="as-pmo" maxlength="140"></label></div>
    <p class="as-nota">Jack decide cuánto se autoriza y en cuántas semanas se descuenta. Te avisaremos cuando lo revise.</p>
    <div class="as-legal">Solicito un anticipo de salario por el monto indicado. Autorizo que el monto que la empresa apruebe se descuente de mi salario en los pagos semanales que se me indiquen, sin intereses, dentro de los límites de los artículos 110, fracción I, y 111 de la Ley Federal del Trabajo. La solicitud queda sujeta a autorización de la empresa.</div>
    ${htmlFirma('as-fp')}<button class="pri" id="as-penv">Firmar y enviar solicitud</button></div>
  <div class="as-card"><h3>Mis préstamos</h3>${listaSolicitudes(mios)}</div>`;
  FIRMAS['as-fp']=panelFirma($a('#as-fp'));
  $a('#as-penv').onclick=()=>{const mo=+$a('#as-pm').value;if(!(mo>0)){toast('Escribe cuánto necesitas',true);return;}if(FIRMAS['as-fp'].vacio()){toast('Falta tu firma',true);return;}
    crearSolicitud('prestamo',{solicitado:mo,motivo:$a('#as-pmo').value.trim()},FIRMAS['as-fp'].png());ir('prestamos');};
};
function crearSolicitud(tipo,datos,firma){
  const s={id:uid(),tipo,empId:YO.id,creado:Date.now(),estado:'pendiente',firma,foto:FOTO,acceso:ACCESO,dispositivo:DISP.id,datos};
  D.solicitudes.push(s);bitacora('Solicitud de '+tipo+' '+s.id);if(guardar())toast('Solicitud enviada. Jack la revisará.');
}
function listaSolicitudes(l,admin){
  if(!l.length)return'<div class="as-vacio">Sin solicitudes.</div>';
  return'<div style="display:flex;flex-direction:column;gap:8px">'+l.map(s=>{const e=emp(s.empId)||{nombre:'?'};
    const est={pendiente:'<span class="as-chip av">PENDIENTE</span>',autorizada:'<span class="as-chip ok">AUTORIZADA</span>',rechazada:'<span class="as-chip mal">RECHAZADA</span>'}[s.estado];
    const det=s.tipo==='vacaciones'?`${s.datos.dias} días · ${fCorta(deIso(s.datos.desde))} al ${fCorta(deIso(s.datos.hasta))}`:(s.estado==='autorizada'?`Autorizado ${dinero(s.datos.monto)} en ${s.datos.semanas} semanas (${dinero(s.datos.descuento)}/sem) · saldo ${dinero(saldoPrestamo(s))}`:`Solicitó ${dinero(s.datos.solicitado)}`);
    return`<div class="as-sol"><div><b>${s.tipo==='vacaciones'?'Vacaciones':'Préstamo'}${admin?' · '+esc(e.nombre):''} ${est}</b><small>${det} · ${fCorta(s.creado)} ${hhmm(s.creado)}</small></div><button data-ver="${s.id}">${admin&&s.estado==='pendiente'&&esJack()?'Revisar':'Ver comprobante'}</button></div>`;}).join('')+'</div>';
}
function verSolicitud(id){
  const s=D.solicitudes.find(x=>x.id===id);if(!s)return;
  const e=emp(s.empId)||{nombre:'?',num:'?'},vac=s.tipo==='vacaciones',puede=MODO==='staff'&&esJack()&&s.estado==='pendiente',abonos=D.abonos.filter(a=>a.solId===s.id);
  const c=abrirModal(`<div class="as-comp"><h4>${vac?'Solicitud de vacaciones':'Solicitud de anticipo de salario'} · ${esc(D.config.empresa)}</h4>
    <div><b>${esc(e.nombre)}</b> · No. ${esc(e.num)}</div><div>Folio ${esc(s.id.toUpperCase())} · ${fLarga(s.creado)} ${hhmm(s.creado)} · acceso con ${esc(s.acceso)}</div><hr>
    ${vac?`<div>Del <b>${fLarga(deIso(s.datos.desde))}</b> al <b>${fLarga(deIso(s.datos.hasta))}</b>: <b>${s.datos.dias} días</b> (año ${s.datos.periodo}). Prima vacacional estimada: ${dinero(s.datos.prima)}.</div>`
    :`<div>Monto solicitado: <b>${dinero(s.datos.solicitado)}</b>${s.datos.motivo?' · Motivo: '+esc(s.datos.motivo):''}</div>${s.estado==='autorizada'?`<div>Monto autorizado <b>${dinero(s.datos.monto)}</b>, sin intereses. Descuento de <b>${dinero(s.datos.descuento)}</b> por semana durante <b>${s.datos.semanas}</b> semanas.</div>`:''}`}
    <div class="as-fila" style="margin-top:10px;align-items:flex-end"><div><small>Firma del trabajador</small><br><img class="as-firmaimg" src="${s.firma}" alt="Firma"></div>${s.foto?`<div><small>Foto al firmar</small><br><img src="${s.foto}" alt="" style="width:80px;height:80px;border-radius:8px;object-fit:cover"></div>`:''}</div>
    ${s.resolucion?`<hr><div><b>${s.estado==='autorizada'?'Autorizada':'Rechazada'}</b> por ${esc(s.resolucion.por)} el ${fLarga(s.resolucion.ts)} ${hhmm(s.resolucion.ts)}${s.resolucion.nota?' · '+esc(s.resolucion.nota):''}</div>${s.resolucion.firma?`<small>Firma de autorización</small><br><img class="as-firmaimg" src="${s.resolucion.firma}" alt="Firma">`:''}`:''}
    ${!vac&&s.estado==='autorizada'?`<hr><div><b>Descuentos:</b> ${abonos.length?abonos.map(a=>'Sem. '+a.semana+': '+dinero(a.monto)).join(' · '):'ninguno todavía'} · <b>Saldo ${dinero(saldoPrestamo(s))}</b></div>`:''}</div>
    ${puede&&!vac?`<div class="as-form"><label>Monto que autorizas<input type="number" id="as-am" min="1" step="50" value="${s.datos.solicitado}"></label><label>Descontar en (semanas)<input type="number" id="as-as" min="1" max="104" value="${Math.max(1,Math.ceil(s.datos.solicitado/Math.max(1,limitesPrestamo(e).descDisp||s.datos.solicitado)))}"></label></div><p class="as-nota" id="as-ac"></p>`:''}
    ${puede?`<label>Nota (opcional)<input id="as-anota"></label>${htmlFirma('as-fa')}<div class="as-fila as-noprint"><button data-a="cerrar">Cerrar</button><button class="peligro" data-a="rechazar">Rechazar</button><button class="pri" data-a="autorizar">Firmar y autorizar</button></div>`
    :`<div class="as-fila as-noprint">${MODO==='staff'&&esJack()&&!vac&&s.estado==='autorizada'&&saldoPrestamo(s)>0?'<button data-a="abono">Registrar descuento de esta semana</button>':''}<button data-a="imprimir">Imprimir</button><button class="pri" data-a="cerrar">Cerrar</button></div>`}`);
  if(puede)FIRMAS['as-fa']=panelFirma($a('#as-fa'));
  // Al autorizar un préstamo: calcula el descuento semanal y avisa si pasa de los límites de ley (no lo impide)
  const terminos=()=>{const mo=+$a('#as-am').value,se=Math.round(+$a('#as-as').value);if(!(mo>0)||!(se>0)){$a('#as-ac').textContent='Escribe el monto y las semanas.';return null;}
    const d=Math.ceil(mo/se*100)/100,L=e.salarioDiario?limitesPrestamo(e):null,av=[];
    if(L){if(mo>L.maxMonto)av.push('el adeudo pasaría de un mes de salario ('+dinero(L.maxMonto)+' disponibles)');if(d>L.descDisp)av.push('el descuento pasa del 30% del excedente del salario mínimo ('+dinero(L.descDisp)+' por semana)');}
    $a('#as-ac').innerHTML=`Descuento de <b>${dinero(d)}</b> por semana durante <b>${se}</b> semanas.`+(av.length?` <span class="as-chip av">AVISO</span> Por ley ${esc(av.join(' y '))}.`:'')+(L?'':' Faltan el salario o la fecha de ingreso del trabajador para revisar los límites de ley.');
    return{monto:mo,semanas:se,descuento:d};};
  if(puede&&!vac){$a('#as-am').oninput=$a('#as-as').oninput=terminos;terminos();}
  c.onclick=ev=>{const b=ev.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;
    if(a==='cerrar'){cerrarModal();pintar();}
    else if(a==='imprimir')window.print();
    else if(a==='abono'){const sem=semanaDe(Date.now());if(abonos.some(x=>x.semana===sem)){toast('Ya se registró el descuento de la semana '+sem,true);return;}
      D.abonos.push({id:uid(),solId:s.id,monto:+Math.min(s.datos.descuento,saldoPrestamo(s)).toFixed(2),semana:sem,ts:Date.now()});bitacora('Descuento préstamo '+s.id+' semana '+sem);guardar();verSolicitud(s.id);}
    else if(a==='autorizar'||a==='rechazar'){
      if(!(MODO==='staff'&&esJack()))return;
      if(a==='autorizar'&&FIRMAS['as-fa'].vacio()){toast('Falta tu firma para autorizar',true);return;}
      if(a==='autorizar'&&!vac){const t=terminos();if(!t){toast('Escribe el monto y las semanas',true);return;}Object.assign(s.datos,t);}
      s.estado=a==='autorizar'?'autorizada':'rechazada';
      s.resolucion={por:'Jack',ts:Date.now(),nota:$a('#as-anota').value.trim(),firma:FIRMAS['as-fa'].vacio()?null:FIRMAS['as-fa'].png()};
      bitacora(s.estado+' '+s.tipo+' '+s.id);guardar();toast('Solicitud '+s.estado);verSolicitud(s.id);}};
}

/* ═════════ STAFF: residentes y Jack (con su sesión de Nómina) ═════════ */
VISTAS.staff=(m)=>{
  const j=esJack(),pend=D.solicitudes.filter(s=>s.estado==='pendiente').length;
  const rev=DISP.obra||j?resumenSemana(semanaDe(Date.now()),j?null:DISP.obra).filas.filter(f=>f.flags.size).length:0;
  const acc=(v,t,s,n)=>`<button class="as-acc" data-ir="${v}"><b>${t}</b><span>${s}</span>${n?`<span class="as-num">${n}</span>`:''}</button>`;
  m.innerHTML=`<div class="as-cab"><h2>Asistencia</h2></div>
  <div class="as-card"><div class="as-fila"><div style="flex:1;min-width:200px"><h3>Obra de este dispositivo</h3><div style="font-size:18px;font-weight:700;margin-top:4px">${esc(DISP.obra?obraNom(DISP.obra):'Sin asignar')}</div></div><button data-ir="obra">Cambiar obra</button></div>
  ${DISP.kiosco?`<p class="as-nota">Este dispositivo está en <b>modo checador</b> para ${esc(obraNom(DISP.kiosco.obra))}. <button class="link" id="as-desk">Desactivar modo checador</button></p>`:''}</div>
  <div class="as-grid">
    ${acc('kiosco','Activar modo checador','Este dispositivo queda solo para checar en la obra')}
    ${acc('revision','Revisión de asistencia',j?'Todas las obras':'Faltas, salidas faltantes y checadas con código',rev)}
    ${j?acc('autorizaciones','Autorizaciones','Vacaciones y préstamos por autorizar',pend):''}
    ${j?acc('empleados','Trabajadores','Número, código, salario, ingreso y rostro'):''}
    ${j?acc('reporte','Reporte semanal','Horas por trabajador, Excel y bitácora'):''}
    ${j?acc('ajustes','Ajustes','Salario mínimo, jornada y redondeo'):''}
  </div>`;
  const d=$a('#as-desk');if(d)d.onclick=()=>{bitacora('Desactiva modo checador '+DISP.id);DISP.kiosco=null;guardarDisp();guardar();toast('Modo checador desactivado');pintar();};
};
VISTAS.obra=(m)=>{
  sincronizarObras();
  m.innerHTML=`<div class="as-cab"><h2>Obra de este dispositivo</h2>${volver('staff','Asistencia')}</div>
  <div class="as-card"><p class="as-nota">Las checadas que se hagan en este dispositivo se cargan a la obra que elijas. El cambio queda en la bitácora con tu nombre.</p>
  <div style="display:flex;flex-direction:column;gap:8px">${D.obras.map(o=>`<button class="${o.code===DISP.obra?'pri':''}" data-obra="${esc(o.code)}" style="text-align:left;padding:16px">${esc(obraNom(o.code))}${o.code===DISP.obra?' (actual)':''}</button>`).join('')||'<div class="as-vacio">No se encontraron obras en el catálogo de Nómina.</div>'}</div></div>`;
  m.querySelectorAll('[data-obra]').forEach(b=>b.onclick=()=>{const ant=DISP.obra;DISP.obra=b.dataset.obra;if(DISP.kiosco)DISP.kiosco.obra=DISP.obra;guardarDisp();
    bitacora('Cambio de obra del dispositivo '+DISP.id+': '+(ant?obraNom(ant):'ninguna')+' → '+obraNom(DISP.obra));guardar();toast('Obra: '+obraNom(DISP.obra));ir('staff');});
};
VISTAS.kiosco=(m)=>{
  m.innerHTML=`<div class="as-cab"><h2>Activar modo checador</h2>${volver('staff','Asistencia')}</div>
  <div class="as-card"><p class="as-nota">Úsalo en el celular, tablet o computadora que se queda en la obra. Al activarlo:</p>
  <ul class="as-nota" style="padding-left:18px;margin:0"><li>se <b>cierra tu sesión de Nómina</b> en este dispositivo, para que nadie pueda entrar a la nómina ni a las reposiciones;</li><li>la pantalla queda en el checador de la obra elegida;</li><li>para volver a usar Nómina aquí tendrás que entrar con tu usuario y contraseña.</li></ul>
  <label>Obra<select id="as-ko">${D.obras.map(o=>`<option value="${esc(o.code)}" ${o.code===DISP.obra?'selected':''}>${esc(obraNom(o.code))}</option>`).join('')}</select></label>
  <button class="pri" id="as-kgo">Activar y cerrar mi sesión de Nómina</button></div>`;
  $a('#as-kgo').onclick=async()=>{const o=$a('#as-ko').value;if(!o){toast('Elige la obra',true);return;}
    DISP.obra=o;DISP.kiosco={obra:o,por:STAFF,ts:Date.now()};guardarDisp();bitacora('Activa modo checador en '+obraNom(o)+' (dispositivo '+DISP.id+')');guardar();
    const n=NOM();try{if(n&&n.doLogout)await n.doLogout();}catch(e){}
    MODO='kiosco';STAFF=null;YO=null;ir('acceso');};
};
VISTAS.revision=(m,p)=>{
  const n=+p||semanaDe(Date.now()),j=esJack(),filtro=j?(PARAM_OBRA||null):DISP.obra;
  if(!filtro&&!j){m.innerHTML=`<div class="as-cab"><h2>Revisión de asistencia</h2>${volver('staff','Asistencia')}</div><div class="as-vacio">Primero asigna la obra de este dispositivo.</div>`;return;}
  const{ini,filas}=resumenSemana(n,filtro),obs=filas.filter(f=>f.flags.size).length;
  m.innerHTML=`<div class="as-cab"><h2>Revisión · Semana ${n}</h2>${volver('staff','Asistencia')}</div>
  <div class="as-fila"><button data-ir="revision" data-p="${n-1}">← Semana ${n-1}</button><span class="as-nota">${fCorta(ini)} al ${fCorta(ini+6*DIA)} · ${filtro?esc(obraNom(filtro)):'Todas las obras'}</span>${n<semanaDe(Date.now())?`<button data-ir="revision" data-p="${n+1}">Semana ${n+1} →</button>`:''}
    ${j?`<select id="as-rof" style="width:auto"><option value="">Todas las obras</option>${D.obras.map(o=>`<option value="${esc(o.code)}" ${o.code===filtro?'selected':''}>${esc(obraNom(o.code))}</option>`).join('')}</select>`:''}</div>
  <p class="as-nota">${obs?obs+' trabajador'+(obs>1?'es':'')+' con algo que revisar. Toca un día para ver las checadas y corregir.':'Todo en orden.'} Las correcciones no borran la checada original. La columna "Para nómina" es lo que se llenaría en la captura de la semana (en el prototipo no se escribe en Nómina).</p>
  ${tablaSemana(filas,ini,true)}`;
  const s=$a('#as-rof');if(s)s.onchange=()=>{PARAM_OBRA=s.value||null;pintar();};
  m.querySelectorAll('[data-dia]').forEach(b=>b.onclick=()=>detalleDia(b.dataset.emp,+b.dataset.dia,n,filtro));
};
let PARAM_OBRA=null;
function tablaSemana(filas,ini,click){
  if(!filas.length)return'<div class="as-vacio">Sin checadas esta semana.</div>';
  return`<div class="as-tabla"><table><thead><tr><th>Trabajador</th>${DIAS_SEM.map((d,i)=>`<th class="as-dia">${d} ${new Date(ini+i*DIA).getDate()}</th>`).join('')}<th class="n">Total</th><th class="n">Para nómina</th><th>Revisar</th></tr></thead><tbody>
  ${filas.map(f=>`<tr class="${f.total>D.config.maxSemana?'exceso':''}"><td>${esc(f.emp.nombre)}</td>${f.dias.map((d,i)=>{const inc=d.flags.has('sin salida')||d.flags.has('sin entrada'),txt=d.js.length?(inc?'?':fmtH(d.h)):'—',col=inc?'var(--av)':d.flags.size?'var(--gd)':'inherit';
    return`<td class="as-dia">${click?`<button data-emp="${f.emp.id}" data-dia="${i}" style="color:${col}">${txt}</button>`:`<span style="color:${col}">${txt}</span>`}</td>`;}).join('')}
    <td class="n"><b>${fmtH(f.total)}</b></td><td class="n">${f.dias.map(d=>d.js.length?redondeo(d.h):'·').join(' ')}</td><td>${[...f.flags].map(x=>`<span class="as-chip ${x.startsWith('excede')?'mal':x.startsWith('sin')?'av':''}">${esc(x.toUpperCase())}</span>`).join(' ')}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function detalleDia(empId,dia,n,filtro){
  const e=emp(empId),d0=inicioSemana(n)+dia*DIA,anul=new Set(D.correcciones.filter(c=>c.tipo==='anular').map(c=>c.checadaId));
  const orig=D.checadas.filter(c=>c.empId===empId&&c.ts>=d0&&c.ts<d0+DIA),agr=efectivas().filter(c=>c.corr&&c.empId===empId&&c.ts>=d0&&c.ts<d0+DIA);
  const c=abrirModal(`<h3>${esc(e.nombre)} · ${fLarga(d0)}</h3>
    <div class="as-tabla"><table><thead><tr><th></th><th>Tipo</th><th class="n">Hora</th><th>Método</th><th></th></tr></thead><tbody>
    ${orig.concat(agr).sort((a,b)=>a.ts-b.ts).map(x=>`<tr${anul.has(x.id)?' style="opacity:.5;text-decoration:line-through"':''}><td>${x.foto?`<img class="as-mini" src="${x.foto}" alt="">`:''}</td><td>${x.tipo}</td><td class="n">${hhmm(x.ts)}</td><td style="white-space:normal">${esc(x.metodo)}${x.corr?' · '+esc(x.corr.motivo)+' ('+esc(x.corr.por)+')':''}</td><td>${!x.corr&&!anul.has(x.id)?`<button class="link" data-anular="${x.id}">Anular</button>`:''}</td></tr>`).join('')||'<tr><td colspan="5" class="as-vacio">Sin checadas</td></tr>'}
    </tbody></table></div>
    <h3>Agregar checada faltante</h3>
    <div class="as-form"><label>Tipo<select id="as-ct"><option value="entrada">Entrada</option><option value="salida">Salida</option></select></label><label>Hora<input type="time" id="as-ch"></label></div>
    <label>Motivo (obligatorio también para anular)<input id="as-cm" placeholder="Ej. olvidó checar salida, confirmado en obra"></label>
    <div class="as-fila"><button data-r="cerrar">Cerrar</button><button class="pri" data-r="agregar">Agregar corrección</button></div>`);
  c.onclick=ev=>{const quien=nombreUsuario(STAFF),an=ev.target.closest('[data-anular]');
    if(an){const mot=$a('#as-cm').value.trim();if(!mot){toast('Escribe el motivo',true);$a('#as-cm').focus();return;}
      D.correcciones.push({id:uid(),tipo:'anular',checadaId:an.dataset.anular,empId,motivo:mot,por:quien,creado:Date.now()});bitacora('Anula checada '+an.dataset.anular+': '+mot);guardar();detalleDia(empId,dia,n,filtro);return;}
    const b=ev.target.closest('[data-r]');if(!b)return;if(b.dataset.r==='cerrar'){cerrarModal();pintar();return;}
    const h=$a('#as-ch').value,mot=$a('#as-cm').value.trim();if(!h||!mot){toast('Pon la hora y el motivo',true);return;}
    const[hh,mm]=h.split(':').map(Number),t=new Date(d0);t.setHours(hh,mm,0,0);
    D.correcciones.push({id:uid(),tipo:'agregar',tipoChecada:$a('#as-ct').value,ts:t.getTime(),obra:filtro||(orig[0]&&orig[0].obra)||DISP.obra,empId,motivo:mot,por:quien,creado:Date.now()});
    bitacora('Agrega '+$a('#as-ct').value+' '+h+' a '+e.nombre+': '+mot);guardar();detalleDia(empId,dia,n,filtro);};
}
VISTAS.autorizaciones=(m)=>{
  if(!esJack())return ir('staff');
  const pend=D.solicitudes.filter(s=>s.estado==='pendiente').sort((a,b)=>a.creado-b.creado),hist=D.solicitudes.filter(s=>s.estado!=='pendiente').sort((a,b)=>b.resolucion.ts-a.resolucion.ts).slice(0,30);
  m.innerHTML=`<div class="as-cab"><h2>Autorizaciones</h2>${volver('staff','Asistencia')}</div><p class="as-nota">Solo tú puedes autorizar. Cada autorización queda firmada con fecha y hora.</p>
  <div class="as-card"><h3>Pendientes (${pend.length})</h3>${listaSolicitudes(pend,true)}</div><div class="as-card"><h3>Resueltas recientes</h3>${listaSolicitudes(hist,true)}</div>`;
};
// Trabajadores: se toman del catálogo de Nómina (mismo id: e0, e1, n…) y aquí se completan sus datos de asistencia
VISTAS.empleados=(m,p)=>{
  if(!esJack())return ir('staff');
  const cat=catEmps();
  cat.forEach(c=>{const e=emp(c.id);if(e&&e.nombre!==c.name){e.nombre=c.name;}});
  const lista=cat.map(c=>emp(c.id)||{id:c.id,nombre:c.name,nuevo:true}).concat(D.empleados.filter(e=>!cat.some(c=>c.id===e.id)));
  const ed=p?(emp(p)||lista.find(x=>x.id===p)):null;
  m.innerHTML=`<div class="as-cab"><h2>Trabajadores</h2>${volver('staff','Asistencia')}</div>
  <p class="as-nota">La lista sale del catálogo de Nómina. Aquí se completa lo que necesita Asistencia: número de empleado, código, salario diario, fecha de ingreso y rostro.</p>
  ${ed?`<div class="as-card"><h3>${esc(ed.nombre)}</h3><form id="as-fe" class="as-form">
    <label>Número de empleado<input id="as-en" inputmode="numeric" required value="${esc(ed.num||'')}"></label>
    <label>Salario diario<input id="as-es" type="number" step="0.01" min="0" required value="${ed.salarioDiario||''}"></label>
    <label>Fecha de ingreso<input id="as-ei" type="date" required value="${esc(ed.ingreso||'')}"></label>
    <label>${ed.codigo?'Nuevo código (vacío = sin cambio)':'Código de acceso (4 a 6 dígitos)'}<input id="as-ec" inputmode="numeric" maxlength="6" ${ed.codigo?'':'required'}></label>
    <div class="as-fila"><button type="button" data-ir="empleados">Cancelar</button><button class="pri" type="submit">Guardar</button></div></form></div>`:''}
  <div class="as-card"><div class="as-tabla"><table><thead><tr><th></th><th>Nombre</th><th>No.</th><th class="n">Salario</th><th>Ingreso</th><th>Acceso</th><th></th></tr></thead><tbody>
  ${lista.map(e=>`<tr><td>${e.foto?`<img class="as-mini" src="${e.foto}" alt="">`:''}</td><td>${esc(e.nombre)}</td><td>${esc(e.num||'—')}</td><td class="n">${e.salarioDiario?dinero(e.salarioDiario):'—'}</td><td>${esc(e.ingreso||'—')}</td>
    <td>${e.nuevo||!e.codigo?'<span class="as-chip">SIN ALTA</span>':e.descriptores&&e.descriptores.length?'<span class="as-chip ok">ROSTRO Y CÓDIGO</span>':'<span class="as-chip">SOLO CÓDIGO</span>'}</td>
    <td><div class="as-fila" style="flex-wrap:nowrap"><button data-ir="empleados" data-p="${esc(e.id)}">${e.nuevo?'Dar de alta':'Editar'}</button>${!e.nuevo&&e.codigo?`<button data-rostro="${esc(e.id)}">${e.descriptores&&e.descriptores.length?'Rehacer rostro':'Registrar rostro'}</button>`:''}${!e.nuevo&&e.descriptores&&e.descriptores.length?`<button data-quitar="${esc(e.id)}">Quitar rostro</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="7" class="as-vacio">No se encontró el catálogo de Nómina.</td></tr>'}
  </tbody></table></div></div>`;
  const f=$a('#as-fe');if(f)f.onsubmit=async ev=>{ev.preventDefault();
    const num=$a('#as-en').value.trim(),cod=$a('#as-ec').value.trim();
    if(D.empleados.some(x=>x.num===num&&x.id!==ed.id)){toast('Ese número ya lo tiene otro trabajador',true);return;}
    if(cod&&!/^\d{4,6}$/.test(cod)){toast('El código debe tener de 4 a 6 dígitos',true);return;}
    let x=emp(ed.id);if(!x){x={id:ed.id,nombre:ed.nombre,activo:true,descriptores:[],foto:null,consent:null,obras:[]};D.empleados.push(x);}
    x.num=num;x.salarioDiario=+$a('#as-es').value;x.ingreso=$a('#as-ei').value;if(cod)x.codigo=await hashCodigo(num,cod);
    bitacora('Datos de asistencia de '+x.nombre);guardar();toast('Guardado');ir('empleados');};
  m.querySelectorAll('[data-quitar]').forEach(b=>b.onclick=async()=>{const e=emp(b.dataset.quitar);if(!await confirmar('Quitar rostro','Se borran los datos biométricos de '+e.nombre+'. Podrá entrar con su número y código.'))return;
    e.descriptores=[];e.foto=null;e.consent=Object.assign({},e.consent,{revocado:Date.now()});bitacora('Quita rostro '+e.nombre);guardar();pintar();});
  m.querySelectorAll('[data-rostro]').forEach(b=>b.onclick=()=>consentimiento(emp(b.dataset.rostro)));
};
function consentimiento(e){
  const c=abrirModal(`<h3>Consentimiento · ${esc(e.nombre)}</h3>
    <div class="as-legal"><b>Aviso y consentimiento para uso de datos biométricos.</b> ${esc(D.config.empresa)} tratará la imagen de mi rostro, convertida en una plantilla numérica, con la única finalidad de identificarme al registrar mi asistencia y al firmar solicitudes. No se usará para otro fin ni se compartirá con terceros, salvo requerimiento de autoridad. Se conservará mientras dure mi relación laboral y el plazo que exige la ley. Puedo revocarlo en cualquier momento y seguir usando mi número de empleado y código.<br><i>Texto de ejemplo: debe revisarlo un abogado junto con el aviso de privacidad.</i></div>
    <label style="flex-direction:row;gap:10px;align-items:flex-start;color:var(--t)"><input type="checkbox" id="as-cok" style="width:22px;height:22px;flex:none"> El trabajador leyó el aviso y otorga su consentimiento expreso.</label>
    ${htmlFirma('as-fc')}<div class="as-fila"><button data-r="no">Cancelar</button><button class="pri" data-r="si">Firmar y registrar rostro</button></div>`);
  FIRMAS['as-fc']=panelFirma($a('#as-fc'));
  c.onclick=ev=>{const b=ev.target.closest('[data-r]');if(!b)return;if(b.dataset.r==='no'){cerrarModal();return;}
    if(!$a('#as-cok').checked||FIRMAS['as-fc'].vacio()){toast('Falta el consentimiento y la firma del trabajador',true);return;}
    enrolar(e,{ts:Date.now(),firma:FIRMAS['as-fc'].png(),por:'Jack'});};
}
async function enrolar(e,consent){
  const c=abrirModal(`<h3>Registrar rostro · ${esc(e.nombre)}</h3><div class="as-cam"><video id="as-ve" playsinline muted autoplay></video></div><p class="as-nota" id="as-em">Encendiendo cámara…</p>
    <div style="height:10px;background:var(--sup2);border-radius:99px;overflow:hidden"><i id="as-eb" style="display:block;height:100%;width:0;background:var(--g);transition:width .25s"></i></div><div class="as-fila"><button data-r="no">Cancelar</button></div>`);
  let cancel=false;c.onclick=ev=>{if(ev.target.closest('[data-r]')){cancel=true;cerrarModal();apagarCamara();pintar();}};
  const v=$a('#as-ve'),m=t=>{const el=$a('#as-em');if(el)el.textContent=t;};
  try{await prenderCamara(v);m('Cargando reconocimiento…');await cargarModelos();}catch(x){m('No se pudo usar la cámara: '+(x.message||x.name));return;}
  const pasos=['Mira de frente a la cámara','Gira un poco a la izquierda','Gira un poco a la derecha','Levanta un poco la barbilla','Mira de frente otra vez'],ds=[];let f=null,k=0;
  while(ds.length<5&&!cancel&&k++<150){m(pasos[ds.length]);let r=null;try{r=await detectar(v);}catch(x){}
    if(r&&r.detection.score>0.7&&r.detection.box.width>v.videoWidth*0.22){ds.push(Array.from(r.descriptor,x=>+x.toFixed(4)));if(!f)f=foto(v,r.detection.box);$a('#as-eb').style.width=ds.length*20+'%';await new Promise(s=>setTimeout(s,700));}
    else await new Promise(s=>setTimeout(s,150));}
  if(cancel)return;if(ds.length<5){m('No se vio bien la cara. Busca mejor luz y vuelve a intentar.');return;}
  apagarCamara();
  const media=new Float32Array(128);ds.forEach(d=>d.forEach((x,i)=>media[i]+=x/5));
  const otro=mejor(media,D.empleados.filter(x=>x.id!==e.id&&x.activo));
  if(otro.emp&&otro.dist<0.45&&!await confirmar('Posible duplicado','Este rostro se parece mucho al de '+otro.emp.nombre+'. ¿Es otra persona?','Sí, es otra persona')){pintar();return;}
  e.descriptores=ds;e.foto=f;e.consent=consent;bitacora('Registra rostro de '+e.nombre);if(guardar())toast('Rostro registrado');cerrarModal();pintar();
}
VISTAS.reporte=(m,p)=>{
  if(!esJack())return ir('staff');
  const n=+p||semanaDe(Date.now()),{ini,filas}=resumenSemana(n,null);
  m.innerHTML=`<div class="as-cab"><h2>Reporte · Semana ${n}</h2>${volver('staff','Asistencia')}</div>
  <div class="as-fila"><button data-ir="reporte" data-p="${n-1}">← Semana ${n-1}</button><span class="as-nota">${fCorta(ini)} al ${fCorta(ini+6*DIA)}</span>${n<semanaDe(Date.now())?`<button data-ir="reporte" data-p="${n+1}">Semana ${n+1} →</button>`:''}<span style="flex:1"></span><button class="pri" id="as-xls">Descargar Excel</button></div>
  ${tablaSemana(filas,ini,false)}
  <div class="as-card"><h3>Bitácora reciente</h3><div class="as-tabla"><table><tbody>${D.bitacora.slice(-20).reverse().map(b=>`<tr><td>${fCorta(b.ts)} ${hhmm(b.ts)}</td><td>${esc(b.quien)}</td><td style="white-space:normal">${esc(b.txt)}</td></tr>`).join('')||'<tr><td class="as-vacio">Sin movimientos.</td></tr>'}</tbody></table></div></div>`;
  $a('#as-xls').onclick=()=>exportar(n);
};
async function exportar(n){
  const{ini,filas}=resumenSemana(n,null),fin=ini+7*DIA;
  const res=filas.map(f=>{const o={'No.':f.emp.num,Nombre:f.emp.nombre};f.dias.forEach((d,i)=>o[DIAS_SEM[i]+' '+iso(ini+i*DIA)]=+d.h.toFixed(2));o['Total h']=+f.total.toFixed(2);o.Observaciones=[...f.flags].join(', ');return o;});
  const chk=efectivas().filter(c=>c.ts>=ini&&c.ts<fin).map(c=>{const e=emp(c.empId)||{};return{'No.':e.num,Nombre:e.nombre,Tipo:c.tipo,Fecha:iso(c.ts),Hora:hhmm(c.ts),Obra:obraNom(c.obra),Metodo:c.metodo,Correccion:c.corr?c.corr.motivo+' ('+c.corr.por+')':''};});
  const sols=D.solicitudes.map(s=>{const e=emp(s.empId)||{};return{Folio:s.id.toUpperCase(),Tipo:s.tipo,Nombre:e.nombre,Estado:s.estado,Solicitada:iso(s.creado),Detalle:s.tipo==='vacaciones'?s.datos.dias+' días del '+s.datos.desde+' al '+s.datos.hasta:(s.estado==='autorizada'?'Autorizado '+dinero(s.datos.monto)+' en '+s.datos.semanas+' sem. (solicitó '+dinero(s.datos.solicitado)+')':'Solicitó '+dinero(s.datos.solicitado)),Saldo:s.tipo==='prestamo'&&s.estado==='autorizada'?saldoPrestamo(s):''};});
  try{if(!window.XLSX)await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(res.length?res:[{Nombre:'Sin datos'}]),'Resumen');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(chk.length?chk:[{Nombre:'Sin datos'}]),'Checadas');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(sols.length?sols:[{Folio:'Sin datos'}]),'Solicitudes');
    XLSX.writeFile(wb,'asistencia_semana_'+n+'.xlsx');}
  catch(e){toast('No se pudo generar el Excel: '+(e.message||e),true);}
}
VISTAS.ajustes=(m)=>{
  if(!esJack())return ir('staff');
  const C=D.config;
  m.innerHTML=`<div class="as-cab"><h2>Ajustes de asistencia</h2>${volver('staff','Asistencia')}</div>
  <div class="as-card"><form id="as-fa2" class="as-form">
    <label>Salario mínimo diario<input id="as-sm" type="number" step="0.01" value="${C.salarioMinimo}"></label>
    <label>Jornada máxima semanal (h)<input id="as-mx" type="number" value="${C.maxSemana}"></label>
    <label>Redondeo para nómina<select id="as-rd">${[[60,'Hora entera'],[30,'Media hora'],[15,'15 minutos']].map(([v,t])=>`<option value="${v}" ${C.redondeoMin==v?'selected':''}>${t}</option>`).join('')}</select></label>
    <label>Descuento de comida (min)<input id="as-cm2" type="number" min="0" value="${C.comidaMin}"></label>
    <label>Exigencia del reconocimiento <span id="as-uv">${C.umbral.toFixed(2)}</span><input id="as-um" type="range" min="0.35" max="0.6" step="0.01" value="${C.umbral}"></label>
    <button class="pri" type="submit">Guardar</button></form>
  <p class="as-nota">El salario mínimo de 2027 se publica en diciembre. La jornada máxima legal en 2027 es de 46 h. El redondeo y la comida dependen de la política de la empresa.</p></div>
  <div class="as-card"><h3>Datos del prototipo</h3><p class="as-nota">${D.empleados.length} trabajadores · ${D.checadas.length} checadas · ${D.solicitudes.length} solicitudes, guardados solo en este navegador.</p>
  <div class="as-fila"><button class="peligro" id="as-reset">Borrar los datos de asistencia de este navegador</button></div></div>`;
  $a('#as-um').oninput=e=>$a('#as-uv').textContent=(+e.target.value).toFixed(2);
  $a('#as-fa2').onsubmit=ev=>{ev.preventDefault();Object.assign(C,{salarioMinimo:+$a('#as-sm').value||C.salarioMinimo,maxSemana:+$a('#as-mx').value||C.maxSemana,redondeoMin:+$a('#as-rd').value,comidaMin:Math.max(0,+$a('#as-cm2').value||0),umbral:+$a('#as-um').value});bitacora('Cambia ajustes');guardar();toast('Ajustes guardados');};
  $a('#as-reset').onclick=async()=>{if(!await confirmar('Borrar datos de asistencia','Se borran trabajadores dados de alta, rostros, checadas y solicitudes de este navegador. Nómina y Reposiciones no se tocan.'))return;D=vacio();sincronizarObras();guardar();pintar();};
};

/* ═════════ Vigilar la app de Nómina: botón en el inicio de sesión y modo checador ═════════ */
let pausaK=0;
function pausarKiosco(){pausaK=Date.now()+2*60e3;detenerAcceso();apagarCamara();ov.hidden=true;MODO=null;}
setInterval(()=>{
  if(!document.body)return;
  if(!DISP)cargar();montar();
  const paso=pantallaNomina(),enLogin=paso==='login';
  // Modo checador: si el dispositivo está en modo checador y no hay sesión de Nómina, se abre solo
  if(DISP.kiosco&&!sesionNomina()&&ov.hidden&&Date.now()>pausaK){MODO='kiosco';STAFF=null;YO=null;ov.hidden=false;ir('acceso');}
  // Si alguien entra a Nómina mientras el checador está abierto en modo trabajador o kiosco, se cierra
  if(sesionNomina()&&!ov.hidden&&MODO!=='staff'){detenerAcceso();apagarCamara();ov.hidden=true;MODO=null;YO=null;}
  // Si Nómina se bloquea (PIN) o se cierra la sesión, la vista de residente/Jack se cierra también
  if(MODO==='staff'&&!sesionNomina()){cerrar();}
  $a('#as-entrar').hidden=!(enLogin&&ov.hidden);
},700);

window.GTAsistencia={abrir:m=>abrir(m==='personal'?'staff':m),cerrar};
})();
