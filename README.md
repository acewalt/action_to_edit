# Action to Edit

Herramienta web para reunir animaciones de múltiples archivos FBX que comparten el mismo rig.

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
