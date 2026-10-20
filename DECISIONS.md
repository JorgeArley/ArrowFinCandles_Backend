# Decisiones

## Arquitectura

Clean architecture en cuatro capas, con la regla de dependencia apuntando hacia dentro.

| Capa | Contenido | Puede importar |
| --- | --- | --- |
| `domain` | Entidades, puertos, servicios de dominio, vocabulario | Solo `domain` |
| `application` | Casos de uso | Solo `domain` |
| `infrastructure` | Adaptadores que implementan los puertos del dominio | `domain` + Nest + Node |
| `presentation` | Controllers, DTOs, filtros, pipes | `application` + `domain` + Nest |

El `domain` no conoce Nest ni el sistema de ficheros: `deduplicate-candles.ts` y
`aggregate-candles.ts` son funciones puras sobre arrays.

El puerto `CandleRepository` (`domain/candles/candle-repository.ts`) es la pieza que
invierte la dependencia: el caso de uso pide un repositorio, y `app.module.ts` le entrega
la implementacion `JsonCandleRepository`, que es la unica capa que toca el disco.

La validacion de negocio (que simbolos y timeframes estan soportados) vive en el dominio y
se expresa con errores de negocio (`ValidationError`). La capa de presentacion es la que
traduce esos errores a codigos HTTP, de modo que el dominio no sabe que existe HTTP. El DTO
solo comprueba el contrato de transporte (que los dos parametros llegan como texto no
vacio).

El caso de uso es una clase de TypeScript sin decoradores de Nest; se registra en el modulo
con un `useFactory` explicito. El `composition root` queda concentrado en `app.module.ts`.

## Endpoint de velas

### Identidad de un duplicado: por contenido, no por timestamp

El README de `dataset/` define el duplicado así: *"A duplicate is the same candle sent
again, not extra trading"*, y aclara que *"`ts` is the start of the minute"*.

De ahí se deriva que `(symbol, ts)` identifica **el minuto**, mientras que la vela es su
**contenido**. Dos filas son el mismo reenvío cuando coinciden `symbol`, `ts`, `open`,
`high`, `low`, `close` y `volume`.

Consecuencia práctica: una fila repetida **no** aporta volumen. En el dataset real hay
3 reenvíos (MES `14:11`, MES `14:12`, NQ `15:22`) que, sin deduplicar, inflaban el
volumen agregado (p. ej. el bucket 5m de MES `14:10` daba `v = 13635` en vez de `9896`).

### Filas que comparten minuto pero difieren en OHLCV: no son duplicados

Dos filas con el mismo `(symbol, ts)` y distinto OHLCV son observaciones contradictorias
del mismo minuto, no reenvíos. El README garantiza una sola vela por símbolo y minuto, así
que es una anomalía del dataset.

Política adoptada: se conserva la variante más completa (primero las velas bien formadas
`low <= open <= close <= high` con `volume >= 0`, luego la de mayor volumen, y por último
un desempate lexicográfico) y se registra un warning con ambas variantes. **Los volúmenes
nunca se suman** entre variantes contradictorias.

El desempate es un orden total e independiente del orden del archivo, porque el README
advierte de que `candles_1m.json` no está ordenado. En el dataset real no hay ningún
conflicto (0 de 775 filas), pero la lógica está definida y cubierta por tests.

### Ordenar y deduplicar son cosas distintas

Ordenar por `ts` es obligatorio e independiente de deduplicar: sin ordenar, `open` y
`close` salen mal en 71 de los 78 buckets de MES/5m, porque el bucket toma la primera y la
última vela. Deduplicar solo afecta al `volume` (medido sobre 994 buckets: 0 cambios en
OHLC, 9 cambios de volumen).

### Buckets anclados al epoch UTC

El bucket de una vela es `floor(ts / tamaño) * tamaño`, es decir, múltiplos del epoch en
UTC. Es lo que confirma el ejemplo del enunciado (`MES`/`5m` en `14:00:00Z`). La sesión
empieza a las `13:30`, así que el bucket horario de la sesión es el de las `13:00`.

### Los minutos sin fila no se rellenan

El README dice que *"Some minutes have no row, because nothing traded in them"*. Los
buckets se agregan con las velas que existen, sin interpolar ni generar velas vacías.

### El dataset se lee una sola vez

`JsonCandleRepository` implementa `OnModuleInit`: lee `candles_1m.json` e
`instruments.json` al arrancar y los mantiene en memoria. Las peticiones solo consultan esa
cache. Si el archivo es ilegible o tiene filas invalidas, el arranque falla con
`process.exit(1)` y el servicio no escucha el puerto: nunca queda "listo" con datos
corruptos.

`DATASET_DIR` permite indicar la carpeta del dataset; si se define, se respeta en
exclusiva (un valor invalido es un error, no un motivo para caer al dataset por defecto).
Sin override, la carpeta se busca subiendo por el arbol de directorios desde el propio
fichero, de modo que el resultado no depende de la profundidad a la que se compile.

### Validacion de la query

`class-validator` con un `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`) y
un `exceptionFactory` que concatena los mensajes en una frase legible. El pipe valida el
contrato de transporte; las reglas de negocio las aplica el caso de uso.

`instruments.json` se lee al arrancar como comprobacion de coherencia: avisa por log si el
dataset contiene simbolos que no estan soportados. No es la fuente de verdad para validar
la query.

### Errores

`AllExceptionsFilter` deja pasar las `HttpException` con su status y mensaje, traduce los
`ValidationError` del dominio a un `400` con su mensaje, y convierte cualquier otra
excepcion en un `500 { statusCode, message: "Internal server error" }` tras registrarla con
su stack. El proceso no se cae ante un error inesperado al atender una peticion.

Los buckets nunca estan vacios y las filas se validan al cargar, asi que no hay forma de
devolver `NaN` o `Infinity`.
