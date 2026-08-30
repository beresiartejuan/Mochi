# Decisiones y gotchas

> Problemas que costaron horas de debugging; leer antes de tocar esas áreas.

## Transformers.js y EmbeddingGemma (embeddings)

- El único dtype válido en Node es **q8**. `fp16` **no es soportado** por el modelo: falla con un error del estilo *“activations do not support fp16”*.
- **WebGPU + q8/q4 produce embeddings INCORRECTOS de forma silenciosa** (issue #1728 de transformers.js). En Node/wasm es seguro; no habilitar WebGPU con esos dtypes.
- El modelo oficial `google/embeddinggemma-300m` está **gated** en Hugging Face (requiere aceptar términos). Se usa el espejo `onnx-community/embeddinggemma-300m-ONNX`.
- EmbeddingGemma exige **prompts obligatorios** (prefijos distintos para query y documento). Los detalles están en [docs/memoria.md](memoria.md); no omitirlos, degrada mucho la calidad.
- **MRL**: truncar el embedding a 256 dimensiones y **renormalizar**. Truncar sin renormalizar da vectores inconsistentes.

## Telegram requiere IPv4

`api.telegram.org` resuelve a IPv6 en ciertas redes y, como la API solo funciona por IPv4, las requests fallan o hanguean. La solución es un `fetch` custom (`createIPv4Fetch`, `src/utils/createIPv4Fetch.ts`) que fuerza `family: 4` con `node:https`. El detalle completo está en [docs/integraciones.md](integraciones.md). Cualquier request nueva a Telegram debe usar ese fetch.

## Turso embebido (`@tursodatabase/database`)

- El **FTS requiere abrir la DB con el flag experimental** `connect(path, { experimental: ['index_method'] })`. Hay fallback si el flag no está disponible (ver `openMemoryDb` en `src/store/memoryDb.ts`).
- Los scores FTS hay que **seleccionarlos explícitamente**: `fts_score(content, ?)` en el SELECT con `ORDER BY fts_score DESC`.
- `prepare()` es **async** en este SDK.
- Vectores: se guardan como **JSON en una columna TEXT** y se consultan pasando el JSON string a `vector32(?)`. `vector_distance_cos` devuelve una **distancia** (menor = más cercano), así que el orden correcto es `ORDER BY ASC`.
- **No existe `vector_dims`** en esta versión; no depender de esa función.

## Empaquetado y tipos

- Dependencias **solo con pnpm** (`npm install` prohibido por seguridad del usuario).
- Los postinstalls de paquetes nativos (esbuild, onnxruntime-node, protobufjs, sharp) hay que **permitirlos en `pnpm-workspace.yaml`** con `onlyBuiltDependencies`, sino quedan sin ejecutar y los paquetes nativos fallan.
- El AI SDK v6 tiene **tipos no portables para emitir `.d.ts`**: por eso `npm run typecheck` corre con `--declaration false`, mientras que el `tsconfig` mantiene `declaration: true` para el build normal.
- Con `declaration: true` + el layout `.pnpm` de pnpm, emitir declaraciones dispara **TS2883**. No “arreglarlo” activando declarations en el typecheck.

## Elecciones del modelo

- **EmbeddingGemma 300M q8** se elige porque corre 100% local: privacidad (los embeddings nunca salen de la máquina) y cero costo por query. La latencia de una query única (~0.5s en CPU) es aceptable para un bot personal.

## Temas del dominio

- Score de mensaje = `content.length / 280`.
- Umbrales de resumen: se recalcula el resumen cuando `sum(score) > 25`; el batch de mensajes a resumir frena antes de incluir una respuesta del asistente si supera score 13.
- Debounce de **30 segundos** para agrupar mensajes del usuario antes de responder.
- El bot solo responde al `CHAT_ID` autorizado.
- Dedup semántico de memoria con umbral de coseno **0.86**, calibrado empíricamente con parafrasis del mismo contenido.

Para el diseño del sistema de memoria ver [docs/memoria.md](memoria.md).