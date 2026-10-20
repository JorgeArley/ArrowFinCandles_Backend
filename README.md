# ArrowFin Candles Backend

API de velas OHLCV sobre el dataset de `dataset/`, construida con [NestJS](https://nestjs.com/)
y organizada con clean architecture.

- `GET /candles?symbol=MES&tf=5m` devuelve las velas del contrato y el timeframe pedidos.
- El dataset se lee **una sola vez al arrancar** y se mantiene en memoria: no hay base de
  datos ni lecturas en cada petición.
- [DECISIONS.md](./DECISIONS.md) recoge las decisiones de diseño (identidad de duplicado,
  alineación de los grupos, minutos ausentes, política de conflictos).

---

## Requisitos

| Herramienta | Versión | Para qué |
| --- | --- | --- |
| Node.js | >= 22 (probado en 24) | El runner de tests es `node:test`, nativo desde Node 22 |
| npm | >= 10 | Dependencias |

No hace falta nada más: no hay base de datos, ni Docker, ni variables de entorno
obligatorias.

---

## Ejecutar el proyecto

### 1. Instalar dependencias

```bash
npm install
```

### 2. Arrancar

```bash
npm run start        # compila y arranca (sin watch)
npm run start:dev    # arranca en modo watch: recompila al guardar
npm run start:debug  # arranca con el inspector de Node (--debug --watch)
```

El servidor queda escuchando en `http://localhost:3000`. Para usar otro puerto:

```bash
PORT=8080 npm run start:dev
```

### 3. Modo producción

```bash
npm run build        # compila TypeScript a dist/
npm run start:prod   # ejecuta dist/main.js
```

> `npm run build` borra `dist/` antes de compilar, así que `npm run start:prod` siempre
> sirve el código recién compilado.

### 4. Comprobar que está vivo

```bash
curl "http://localhost:3000/candles?symbol=MES&tf=5m"
```

En los logs de arranque verás el resumen de la carga:

```
[JsonCandleRepository] Dataset cargado: 775 filas, 772 velas unicas, 3 duplicados descartados, 0 conflictos
[NestApplication] Nest application successfully started
```

Si el dataset es ilegible, el error se registra, el proceso sale con código `1` y **no
abre el puerto**: el servicio nunca queda "listo" con datos corruptos.

### Variables de entorno

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `PORT` | `3000` | Puerto en el que escucha el servidor |
| `DATASET_DIR` | búsqueda automática | Carpeta del dataset. Si se define, se respeta en exclusiva: un valor inválido es un error de arranque, no un motivo para caer al dataset por defecto |

```bash
# dataset en otra ubicación
DATASET_DIR=/srv/datasets/arrow-fin npm run start:prod

# o apuntando al dataset directamente
DATASET_DIR=/srv/datasets/arrow-fin/dataset npm run start:prod
```

Sin `DATASET_DIR`, la carpeta se busca subiendo por el árbol de directorios desde el propio
fichero, así que funciona igual ejecutando desde `src/` o desde `dist/`.

### Otros scripts

| Script | Qué hace |
| --- | --- |
| `npm run lint` | ESLint con auto-fix sobre `src/` y `tests/` |
| `npm run format` | Prettier sobre `src/` |
| `npm run build` | Compila a `dist/` |

---

## Correr las pruebas

```bash
npm test
```

Usa el runner nativo de Node (`node --test`) con `ts-node` para compilar los `.ts` en el
vuelo: **no hace falta instalar jest ni ninguna dependencia de test**.

Salida esperada:

```
ℹ tests 35
ℹ suites 10
ℹ pass 35
ℹ fail 0
```

### Ejecutar un solo fichero

```bash
node --test -r ts-node/register tests/aggregation.spec.ts
node --test -r ts-node/register tests/duplicates.spec.ts
```

### Ejecutar un solo caso por nombre

```bash
node --test -r ts-node/register --test-name-pattern="volumen 100" tests/duplicates.spec.ts
```

### Qué comprueba cada fichero

Las pruebas viven en `tests/` (fuera de `src/`, así que no se compilan a `dist/`) y solo
tocan la capa de dominio, que es pura: no necesitan base de datos ni servidor en marcha.

| Fichero | Qué comprueba |
| --- | --- |
| `tests/aggregation.spec.ts` | Que los cálculos de agregación son correctos: reglas de open/high/low/close/volume, límites temporales de cada grupo, orden, grupos incompletos y valores esperados sobre el dataset real |
| `tests/duplicates.spec.ts` | Que las filas duplicadas no alteran el resultado: el volumen no se cuenta dos veces y el resultado es invariante al inyectar y reordenar duplicados |

Detalle de `tests/aggregation.spec.ts`:

| Caso | Qué verifica |
| --- | --- |
| `open es el open de la primera vela del grupo` | `o` sale de la primera vela |
| `close es el close de la ultima vela del grupo` | `c` sale de la última vela |
| `high es el maximo de los high del grupo` | `h` es el máximo del grupo |
| `low es el minimo de los low del grupo` | `l` es el mínimo del grupo |
| `volume es la suma de los volumenes del grupo` | `v` suma los volúmenes |
| `agrupa por minutos anchored al epoch UTC` | 14:00 y 14:04 caen en el mismo grupo |
| `una vela de las 14:05 abre el grupo siguiente` | los límites del grupo son correctos |
| `el grupo horario contiene todos los minutos de esa hora` | 13:58 y 13:59 caen en `13:00` |
| `un grupo con minutos ausentes se agrega con los minutos que existen` | no se inventan velas |
| `nunca produce NaN ni Infinity` | ningún valor numérico corrupto |
| `produce el numero de velas esperado en cada timeframe` | 388/78/26/7 en MES y NQ |
| `agrega el grupo de las 14:00 con los valores esperados` | `o:5635.75, h:5636.75, l:5627.5, c:5628.75, v:9940` |

Detalle de `tests/duplicates.spec.ts`:

| Caso | Qué verifica |
| --- | --- |
| `una vela con volumen 100 repetida no produce un volumen de 200` | el volumen no se cuenta dos veces |
| `el resultado de MES/NQ en 1m/5m/15m/1h no cambia al inyectar duplicados` | invariancia en los 8 casos |
| `reenviar el dataset entero no altera ningun volumen agregado` | el volumen de cada grupo es idéntico |
| `el resultado no depende del orden en que llegan las filas` | el orden del JSON no altera el resultado |
| `el grupo de MES 14:10 en 5m no suma los minutos reenviados` | `v = 9896` y no `13635` |
| `no se fusionan como duplicados ni suman sus volumenes` | dos filas del mismo minuto con OHLCV distinto no son un duplicado |

---

## API

### `GET /candles`

| Parámetro | Obligatorio | Valores admitidos | Ejemplo |
| --- | --- | --- | --- |
| `symbol` | sí | `MES`, `NQ` | `MES` |
| `tf` | sí | `1m`, `5m`, `15m`, `1h` | `5m` |

Los valores son **exactos**: `mes` en minúsculas se rechaza.

### Ejemplos de peticiones

**Velas de MES en 5 minutos**

```bash
curl "http://localhost:3000/candles?symbol=MES&tf=5m"
```

```json
{
  "symbol": "MES",
  "tf": "5m",
  "candles": [
    {
      "t": "2026-08-25T13:30:00Z",
      "o": 5630,
      "h": 5635.25,
      "l": 5629.75,
      "c": 5635,
      "v": 13195
    },
    {
      "t": "2026-08-25T13:35:00Z",
      "o": 5635,
      "h": 5640.25,
      "l": 5634.25,
      "c": 5639,
      "v": 12212
    }
  ]
}
```

**Velas de NQ en 1 hora**

```bash
curl "http://localhost:3000/candles?symbol=NQ&tf=1h"
```

```json
{
  "symbol": "NQ",
  "tf": "1h",
  "candles": [
    {
      "t": "2026-08-25T13:00:00Z",
      "o": 19810,
      "h": 19831.75,
      "l": 19729.5,
      "c": 19737,
      "v": 27183
    }
  ]
}
```

**Solo una vela concreta (con `jq`)**

```bash
curl -s "http://localhost:3000/candles?symbol=MES&tf=5m" \
  | jq '.candles[] | select(.t == "2026-08-25T14:00:00Z")'
```

```json
{
  "t": "2026-08-25T14:00:00Z",
  "o": 5635.75,
  "h": 5636.75,
  "l": 5627.5,
  "c": 5628.75,
  "v": 9940
}
```

**Resumen sin las velas**

```bash
curl -s "http://localhost:3000/candles?symbol=MES&tf=15m" \
  | jq '{symbol, tf, total: (.candles | length)}'
```

```json
{
  "symbol": "MES",
  "tf": "15m",
  "total": 26
}
```

**Desde JavaScript (Node 18+ o navegador)**

```js
const response = await fetch(
  'http://localhost:3000/candles?symbol=MES&tf=5m',
);
const { symbol, tf, candles } = await response.json();

console.log(symbol, tf, candles.length); // MES 5m 78
console.log(candles[0]); // { t: '2026-08-25T13:30:00Z', o: 5630, ... }
```

**Desde Python**

```python
import json
import urllib.request

with urllib.request.urlopen(
    "http://localhost:3000/candles?symbol=MES&tf=5m"
) as response:
    body = json.load(response)

print(body["symbol"], body["tf"], len(body["candles"]))  # MES 5m 78
```

**Desde Postman / Insomnia**

- Método: `GET`
- URL: `http://localhost:3000/candles`
- Query params: `symbol` = `MES`, `tf` = `5m`

### Formato de la respuesta

| Campo | Significado |
| --- | --- |
| `t` | Inicio del grupo, ISO-8601 en UTC (`2026-08-25T14:00:00Z`) |
| `o` | Apertura: `open` de la primera vela del grupo |
| `h` | Máximo: el `high` más alto del grupo |
| `l` | Mínimo: el `low` más bajo del grupo |
| `c` | Cierre: `close` de la última vela del grupo |
| `v` | Volumen: suma del volumen de las velas **únicas** del grupo |

Las velas vienen ordenadas de la más antigua a la más reciente. Los grupos van anclados al
epoch UTC (`14:00`, `14:05`, `14:10`…), así que el grupo horario de la sesión, que empieza
a las `13:30`, aparece etiquetado como `13:00`.

El número de velas por combinación:

| `tf` | MES | NQ |
| --- | --- | --- |
| `1m` | 388 | 384 |
| `5m` | 78 | 78 |
| `15m` | 26 | 26 |
| `1h` | 7 | 7 |

### Errores

| Petición | Código | Respuesta |
| --- | --- | --- |
| `?symbol=ABC&tf=5m` | `400` | `{ "statusCode": 400, "message": "symbol \"ABC\" must be one of the following values: MES, NQ", "error": "Bad Request" }` |
| `?symbol=MES&tf=2m` | `400` | `{ "statusCode": 400, "message": "tf \"2m\" must be one of the following values: 1m, 5m, 15m, 1h", "error": "Bad Request" }` |
| `?tf=5m` | `400` | `{ "message": "symbol should not be empty; symbol must be a string", "error": "Bad Request", "statusCode": 400 }` |
| (sin parámetros) | `400` | `{ "message": "symbol should not be empty; symbol must be a string; tf should not be empty; tf must be a string", ... }` |
| `?symbol=MES&tf=5m&foo=1` | `400` | `{ "message": "property foo should not exist", "error": "Bad Request", "statusCode": 400 }` |
| error inesperado | `500` | `{ "statusCode": 500, "message": "Internal server error" }` |

```bash
curl -i "http://localhost:3000/candles?symbol=ABC&tf=5m"
# HTTP/1.1 400 Bad Request
# {"statusCode":400,"message":"symbol \"ABC\" must be one of the following values: MES, NQ","error":"Bad Request"}
```

La validación de negocio (qué símbolos y timeframes están soportados) vive en el dominio:
el DTO de HTTP solo comprueba que los parámetros llegan como texto no vacío. Los errores
de negocio (`ValidationError`) los traduce el filtro de la capa de presentación a un `400`.

---

## Arquitectura

Clean architecture con la regla de dependencia apuntando hacia dentro: las capas externas
dependen de las internas, nunca al revés.

```
src/
  domain/                          Núcleo. No conoce Nest ni el sistema de ficheros.
    candles/
      candle.ts                    Entidades: Candle, AggregatedCandle, CandlesResponse
      candle-repository.ts         Puerto de salida (CandleRepository)
      deduplicate-candles.ts       Servicio de dominio: identidad de duplicado
      aggregate-candles.ts         Servicio de dominio: agrupado por timeframe
      symbol.ts / timeframe.ts     Vocabulario del dominio y reglas de soporte
      errors.ts                    Errores de negocio

  application/                     Casos de uso. Dependen solo del dominio.
    candles/
      get-candles.use-case.ts      GetCandlesUseCase

  infrastructure/                  Adaptadores que implementan los puertos.
    persistence/
      json-candle-repository.ts    Implementa CandleRepository sobre el JSON
      dataset-paths.ts             Localización y lectura de los ficheros

  presentation/                    Entrada/salida HTTP.
    http/
      candles.controller.ts        GET /candles
      dto/candles-query.dto.ts     Contrato de transporte de la query
      filters/                     Traduce errores de dominio a códigos HTTP
      pipes/                       ValidationPipe global

  app.module.ts                    Composition root: aquí se conectan las piezas
  main.ts                          Bootstrap
```

Reglas que se respetan:

- `domain` no importa nada de `application`, `infrastructure`, `presentation` ni de Nest.
- `application` solo importa de `domain`.
- `infrastructure` implementa los puertos del `domain`; es la única capa que toca el disco.
- `presentation` traduce HTTP a entradas del caso de uso, y los errores de negocio a
  códigos HTTP.

El detalle de las decisiones de diseño está en [DECISIONS.md](./DECISIONS.md).

---

## Dataset

`dataset/` contiene datos fabricados para una única sesión: **2026-08-25, de 13:30 a 20:00
UTC**, con velas de 1 minuto de los contratos `MES` y `NQ`.

El formato y sus particularidades (archivo sin ordenar, filas reenviadas y minutos sin
vela) están descritos en [`dataset/README.md`](./dataset/README.md).

Al arrancar se leen 775 filas, que se reducen a **772 velas únicas**: 3 filas son reenvíos
idénticos de una vela ya presente y se descartan para no contar su volumen dos veces.
