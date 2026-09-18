# Action to Edit

Herramienta web para reunir animaciones de múltiples archivos FBX que comparten el mismo rig.

## Abrir la herramienta

**GitHub Pages:** https://acewalt.github.io/action_to_edit/

## Flujo

1. Importa varios archivos **.fbx** a la vez.
2. La aplicación recupera todos los `AnimationClip` de cada archivo.
3. Elige uno de los FBX como **modelo base**.
4. Reproduce cualquier action sobre el modelo base y revisa el porcentaje de tracks compatibles.
5. Cambia el nombre de las actions y decide cuáles incluir.
6. Exporta:
   - **FBX binario** con malla, skin, esqueleto y todas las actions seleccionadas.
   - **GLB** como formato alternativo.

Todo ocurre localmente en el navegador; los FBX no se suben a un servidor.

## Tecnologías

- Three.js 0.186.0
- FBXLoader
- GLTFExporter
- @comfyorg/fbx-exporter-three 1.0.1

## GitHub Pages

El proyecto está preparado para publicarse directamente desde **main / root**. No requiere build, Node ni backend.

## Consideraciones

El flujo está pensado para animaciones creadas sobre el mismo rig. La compatibilidad depende principalmente de que coincidan los nombres de huesos/nodos utilizados por los tracks. Los FBX que dependan de texturas externas no seleccionadas pueden mostrarse sin esas texturas; las texturas embebidas son el caso más seguro.


## Retargeting web

La herramienta incluye una ventana **Retargeting** para transferir una Action entre dos rigs FBX importados directamente en el navegador.

Funciones actuales:

- Source Rig, Target Rig y Source Action.
- Bone Map editable con Source/Target, Rotation, Location, Location & Rotation, ejes, Anchor e Influence.
- Auto-Match por nombres y convenciones comunes.
- Source Prefix / Target Prefix con detección automática.
- Auto-scale por altura de rig.
- Lectura opcional de Location en world space.
- Rest pose original o primer frame como override.
- Bake web a quaternion con transferencia **world-space delta-from-rest**.
- Continuidad de signo quaternion para evitar interpolaciones largas.
- Head-local/Anchor para pares de Location.
- Guardar presets personalizados en el navegador e importar/exportar JSON.
- Lectura de los presets estándar públicos de BlendCap para Rigify, Auto-Rig Pro, CloudRig, Mixamo y Mixamo Control Rig.

### BlendCap y límites de la versión web

La interfaz y el formato de presets son compatibles/adaptados a partir del flujo público de **BlendCap** de Arcomade:

https://github.com/Arcomade/BlendCap

Los presets BlendCap se leen en tiempo de ejecución desde su repositorio público y están publicados bajo **GPL-3.0-or-later**. El motor de retargeting de esta página está implementado independientemente sobre Three.js.

Un navegador que procesa FBX no tiene el runtime de Blender. Por eso no puede reproducir de forma idéntica las partes que dependen de bpy, depsgraph, drivers, constraints o propiedades particulares de control rigs. En concreto, el bake web actual genera animación FK sobre huesos del FBX; conserva el **FK → IK Mapping** en los presets, pero no ejecuta todavía el mismo Convert FK → IK de Rigify / Auto-Rig Pro / CloudRig que BlendCap ejecuta dentro de Blender.

Para skeleton-to-skeleton FBX, Mixamo y rigs con huesos animables directamente, el retarget se realiza completamente en el navegador.
