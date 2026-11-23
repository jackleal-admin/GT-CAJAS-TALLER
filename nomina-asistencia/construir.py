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
ORIGEN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, 'nomina-original.html')
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

    for viejo, nuevo in PARCHES:
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
