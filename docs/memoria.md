# Sistema de memoria

## Visión general

Mochi tiene memoria persistente en una base SQLite local usando **Turso embebido** (`@tursodatabase/database`), con **búsqueda híbrida** que combina full-text search y vectores. Todo corre en local, sin servicios externos: la DB es un archivo en disco y el modelo de embeddings corre en la misma máquina con ONNX Runtime.

- **Esquema**: `src/store/memoryDb.ts` — tabla `memories` (más tablas `state`, `messages` y `reminders` compartidas) e índices FTS.
- **Lógica**: `src/store/memoryStore.ts` — clase `MemoryStore` con alta, búsqueda, borrado y mantenimiento.

Un record de memoria (`MemoryRecord`) tiene: `id`, `kind` (fact/preference/context/event/todo), `content`, `createdAt`, `updatedAt`, `expiresAt`, `confidence` y `sourceMessageId` (metadato interno, no lo setean las tools del agente).

## Embeddings locales

Fuente: `src/config/embeddingService.ts`.

- **Modelo**: `onnx-community/embeddinggemma-300m-ONNX` de Hugging Face con Transformers.js. Se usa el mirror de la comunidad porque el Google original (`google/embeddinggemma-300m`) está gated en Hugging Face.
- **Quantización**: `q8` sobre ONNX Runtime en CPU.
- **Dimensiones**: el modelo produce un output de 768 dimensiones que se trunca a **256** vía MRL (Matryoshka Representation Learning) y se renormaliza después de truncar. La constante es `EMBEDDING_DIMENSIONS = 256`.
- **Prompts obligatorios del modelo EmbeddingGemma**: cada embedding debe generarse con su prefijo:
  - Query: `task: search result | query: {texto}` (método `embedQuery`).
  - Documento: `title: none | text: {texto}` (método `embedDocuments`).
  
  Sin estos prefijos la calidad de los embeddings cae notablemente; el servicio los agrega siempre, por lo que quien use `EmbeddingService` no tiene que preocuparse.
- **Carga lazy**: singleton con promesa (`ready()`); el pipeline se crea solo la primera vez que se pide un embedding. La primera ejecución descarga ~300MB al caché de Hugging Face y tarda uno a dos minutos.
- **Importante**: para las restricciones del modelo (no usar fp16, no usar WebGPU con q8/q4 que genera errores silenciosos), ver `docs/decisiones.md`.

## Búsqueda híbrida

El método central es `MemoryStore.searchScored(query, limit)`, que combina dos canales en paralelo (`Promise.all`):

### Canal semántico (peso 0.7)

Similitud de coseno vía la función `vector_distance_cos` de Turso sobre la columna `embedding`. Los vectores se guardan como **JSON string en una columna TEXT**, y la consulta pasa el vector de la query serializado como parámetro: `vector_distance_cos(vector32(embedding), vector32(?))`, donde `?` es el JSON del embedding de la query. La función `searchSemantic()` expone este canal de forma pura y devuelve `ScoredMemory` (score = `1 - distance`).

### Canal FTS (peso 0.3)

Funciones `fts_match(content, ?)` y `fts_score(content, ?)` de Turso. Este índice FTS requiere abrir la DB con el flag experimental `index_method`; `openMemoryDb` en `memoryDb.ts` lo intenta así y hace fallback a una conexión normal si no está disponible (en ese caso el canal FTS simplemente falla y el score depende de la semántica o del fallback).

### Combinación de scores

- Pool de candidatos: **60 resultados por canal** (`HYBRID_CANDIDATE_POOL`).
- Cada canal se **normaliza por su máximo** (el mejor match del canal vale 1).
- Score final = `0.7 * semántica_normalizada + 0.3 * fts_normalizado`. Si una memoria aparece en ambos canales, se toma la mejor contribución.
- Resultado ordenado por score, truncado a `limit`.

### Fallback

Si ambos canales fallan (o devuelven vacío), se usa keyword matching simple: se tokeniza la query en términos de **3+ caracteres** y se matchean por inclusión contra el contenido de hasta 500 memorias recientes.

### Variantes de búsqueda

| Método | Devuelve | Uso |
|---|---|---|
| `search(query, limit)` | `MemoryRecord[]` | Solo los records (lo usan la tool `recall` y el recall proactivo) |
| `searchScored(query, limit)` | `{ memory, score }[]` | Score + record |
| `searchSemantic(query, limit)` | `{ memory, score }[]` | Canal vectorial puro (lo usa `forget`) |

En todas las variantes, las memorias expiradas (`expires_at` en pasado) se **excluyen** de los resultados (`expires_at IS NULL OR expires_at > ?`).

## Dedup al guardar

`MemoryStore.add()` evita duplicados en dos pasos:

1. **Matcheo exacto por contenido**: si ya existe una memoria con el mismo texto, se actualiza su `updated_at` (y `expires_at` si se pasa uno nuevo) en vez de insertar.
2. **Dedup semántico**: si no hay match exacto, se calcula el embedding del contenido nuevo y se busca la memoria más cercana. Si la similitud de coseno es **>= 0.86** (constante `SEMANTIC_DEDUP_THRESHOLD`), se considera duplicado y se actualiza la fila existente en vez de insertar.

El umbral 0.86 está **calibrado empíricamente**: parafreasis reales del mismo contenido dieron 0.8665 de similitud.

## Mantenimiento

`runMemoryMaintenance` en `src/bot/botLoop.ts` corre al inicio de cada ejecución del bot:

- `purgeExpired()`: borra físicamente todas las memorias con `expires_at` vencido. Devuelve la cantidad borrada (se loguea).
- `backfillEmbeddings()`: regenera los vectores de las filas que tienen `embedding IS NULL` (memorias creadas antes de la migración de embeddings, o filas donde falló el embedding en su momento). Procesa en **batches de 32**, ordenando por `updated_at DESC`. Solo si `countMissingEmbeddings() > 0`.

## Tools del agente

Las tools de memoria viven en `src/agents/tools/memoryTools.ts` (ver detalles en `docs/herramientas.md`):

| Tool | Entrada | Qué hace |
|---|---|---|
| `remember` | `content`, `kind` opcional (`fact`/`preference`/`context`/`event`/`todo`), `expiresAt` ISO opcional, `confidence` | Guarda una memoria persistente (con dedup automático) |
| `recall` | `query` + `limit` (default 5, máx 20) | Busca con la búsqueda híbrida y devuelve kind, content y fecha |
| `forget` | `query` | Borra todas las memorias que matcheen la query usando búsqueda semántica |

## Recall proactivo

Antes de cada respuesta, el loop del bot llama a `recallProactiveMemories` (`src/bot/botLoop.ts`): concatena los mensajes pendientes del usuario (hasta 500 chars), busca con la búsqueda híbrida (`search`) las **top-5 memorias relacionadas**, e inyecta su contenido en el system prompt de `runPersonalAgent`. Así el modelo recuerda datos relevantes sin necesidad de invocar la tool `recall`.

## Rendimiento

- **Primera carga lenta**: descargar y compilar el modelo de embeddings lleva uno a dos minutos la primera vez (y la primera tool `remember` también dispara la carga).
- **Embedding por query**: ~0.5s en CPU.
- **Puntos calientes**:
  - `add()`: un embedding por memoria nueva (además del embedding de dedup semántico si no hay match exacto).
  - `searchScored()`: un embedding de la query por búsqueda.
  - `backfillEmbeddings()`: embeddings en batches de 32 (solo cuando hay filas pendientes).