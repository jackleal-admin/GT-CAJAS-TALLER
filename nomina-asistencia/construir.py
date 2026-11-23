"""Arma nomina-asistencia/index.html: la app Nómina semanal con el módulo de Asistencia integrado.

Uso:  python3 nomina-asistencia/construir.py [ruta/al/index.html/original]

El index.html original es un paquete: el código de la app va como una cadena JSON dentro de
<script type="__bundler/template">. Este script la desempaca, aplica tres cambios pequeños,
agrega asistencia-modulo.js antes de </body> y la vuelve a empacar. Cada cambio verifica que
el texto original exista exactamente una vez, para no aplicar nada a ciegas si la app cambió.
"""
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
ORIGEN = ARGS[0] if ARGS else os.path.join(AQUI, 'nomina-original.html')
DESTINO = os.path.join(AQUI, 'index.html')

PARCHES = [
    # 1. Exponer el catálogo de trabajadores (igual que ya se expone el de obras para Reposiciones)
    ("window.__NOMINA_OBRAS = () => {",
     "window.__NOMINA_EMPS = () => { const cat = this.state.cat || emptyCat(); "
     "return EMP.concat(cat.extraEmp||[]).filter(e=>!(cat.bajas||{})[e.id]).map(e=>({id:e.id,name:e.name})); }; "
     "window.__NOMINA_OBRAS = () => {"),
    # 2. Tarjeta "Asistencia" en el menú de inicio
    ('<button class="rp-mcard pri" data-a="repo">',
     '<button class="rp-mcard" data-a="asis"><span class="rp-mico"><i class="ph ph-fingerprint"></i></span>'
     '<span><b>Asistencia</b><small>${j?\'Checadas, vacaciones y préstamos\':\'Checador, revisión y cambio de obra\'}</small></span></button>'
     '<button class="rp-mcard pri" data-a="repo">'),
    # 3. Qué hace la tarjeta: cierra el menú de Reposiciones y abre Asistencia
    ("case 'nomina':S.open=false;M=null;modal();paint();break;",
     "case 'asis':S.open=false;M=null;modal();paint();if(window.GTAsistencia)window.GTAsistencia.abrir('personal');break;\n"
     "    case 'nomina':S.open=false;M=null;modal();paint();break;"),
]


# Solo para el prototipo: Nómina y Reposiciones quedan en solo lectura. La app toma las funciones
# de Firebase en un solo lugar (const FBX = window.__FB_MOCK__ || window.FB); ahí se le entrega una
# copia donde guardar, cambiar y borrar fallan con "permission-denied". Iniciar sesión y leer siguen
# funcionando. Para la versión real: construir.py --sin-bloqueo
SCRIPT_FB = '<script src="f1b0c0de-7e90-4a1b-9c1d-000000000001"></script>'
BLOQUEO = SCRIPT_FB + r'''
<script>
(function(){
  var t=0,W=null;
  function aviso(){
    if(Date.now()-t<4000)return;t=Date.now();
    var el=document.createElement('div');
    el.textContent='Prototipo: Nómina y Reposiciones están en solo lectura. Este cambio no se guardó.';
    el.style.cssText='position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:9999;background:#C62828;color:#fff;padding:12px 18px;border-radius:12px;font:600 14px/1.4 Inter,system-ui,sans-serif;max-width:calc(100% - 32px);box-shadow:0 8px 30px rgba(0,0,0,.3)';
    document.body.appendChild(el);setTimeout(function(){el.remove();},5000);
  }
  function bloq(){aviso();var e=new Error('Prototipo: guardar está bloqueado');e.code='permission-denied';return Promise.reject(e);}
  window.__gtBloquearFB=function(O){
    if(W)return W;W={};for(var k in O)W[k]=O[k];
    ['setDoc','updateDoc','deleteDoc','addDoc','runTransaction'].forEach(function(n){if(O[n])W[n]=bloq;});
    if(O.writeBatch)W.writeBatch=function(){var b={set:function(){return b;},update:function(){return b;},delete:function(){return b;},commit:bloq};return b;};
    return W;};
  function cinta(){if(!document.body)return setTimeout(cinta,100);var c=document.createElement('div');
    c.textContent='PROTOTIPO · Nómina y Reposiciones en solo lectura';
    c.style.cssText='position:fixed;left:50%;top:0;transform:translateX(-50%);z-index:9998;background:#B26A00;color:#fff;padding:3px 12px;border-radius:0 0 8px 8px;font:700 11px/1.4 Inter,system-ui,sans-serif;letter-spacing:.04em;pointer-events:none';
    document.body.appendChild(c);}
  cinta();
})();
</script>'''


def codificar(texto):
    # Mismo formato que el paquete original: JSON con < > & ' escapados
    s = json.dumps(texto, ensure_ascii=False)
    for a, b in (('<', '\\u003c'), ('>', '\\u003e'), ('&', '\\u0026'), ("'", '\\u0027')):
        s = s.replace(a, b)
    return s


def main():
    html = open(ORIGEN, encoding='utf-8').read()
    m = re.search(r'(<script type="__bundler/template">\s*)(".*?")(\s*</script>)', html, re.S)
    if not m:
        sys.exit('No encontré el bloque __bundler/template en ' + ORIGEN)
    plantilla = json.loads(m.group(2))
    if codificar(plantilla) != m.group(2):
        sys.exit('El formato del paquete cambió: el reempaquetado no sería idéntico. Revisa construir.py.')

    parches = list(PARCHES)
    if '--sin-bloqueo' not in sys.argv:
        parches.append((SCRIPT_FB, BLOQUEO))
        parches.append(('const FBX = window.__FB_MOCK__ || window.FB;',
                        'const FBX = window.__FB_MOCK__ || (window.FB && window.__gtBloquearFB ? window.__gtBloquearFB(window.FB) : window.FB);'))
    for viejo, nuevo in parches:
        n = plantilla.count(viejo)
        if n != 1:
            sys.exit('Se esperaba 1 vez y se encontró %d: %s' % (n, viejo[:70]))
        plantilla = plantilla.replace(viejo, nuevo)

    modulo = open(os.path.join(AQUI, 'asistencia-modulo.js'), encoding='utf-8').read()
    if '</script' in modulo:
        sys.exit('asistencia-modulo.js no puede contener "</script"')
    cierre = '</body></html>'
    if plantilla.count(cierre) != 1:
        sys.exit('No encontré el cierre </body></html> de la plantilla')
    plantilla = plantilla.replace(cierre, '<script>\n' + modulo + '\n</script>\n' + cierre)

    salida = html[:m.start(2)] + codificar(plantilla) + html[m.end(2):]
    salida = salida.replace('<title>Nómina semanal — Grupo Trego', '<title>Nómina semanal — Grupo Trego (prueba con Asistencia)', 1)
    open(DESTINO, 'w', encoding='utf-8').write(salida)
    print('Listo:', DESTINO, '(%d KB)' % (len(salida.encode('utf-8')) // 1024))


if __name__ == '__main__':
    main()
