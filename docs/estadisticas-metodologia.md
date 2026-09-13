# Metodología estadística de DataLotto (glosario completo)

Glosario interno de referencia: qué mide, cómo se calcula y un ejemplo de
**cada** estadístico, filtro y score presente en la app — no solo los
tocados en la última sesión. Objetivo: que cualquier sesión futura (Claude,
Gemini, o el propio Rober) pueda buscar aquí el significado exacto de
cualquier número que la app muestre, sin releer el código fuente cada vez.

Está organizado en bloques, de lo más simple (generación) a lo más
complejo (tests de hipótesis), para poder leerlo de corrido una vez y
después usarlo como referencia puntual. Todos los ejemplos son cifras
ilustrativas redondeadas.

## Índice

- [Bloque 1 — Generación de combinaciones](#bloque-1)
- [Bloque 2 — Filtros descriptivos de una combinación](#bloque-2)
- [Bloque 3 — Análisis del histórico](#bloque-3)
- [Bloque 4 — Scoring y optimización](#bloque-4)
- [Bloque 5 — Referencia rápida](#bloque-5)

---

<a name="bloque-1"></a>
## Bloque 1 — Generación de combinaciones

### 1.1 Generador aleatorio criptográfico
`src/utils/secureRandom.ts`. Usa `crypto.getRandomValues()` (Web Crypto API)
en vez de `Math.random()` — la misma fuente de entropía que usa el sistema
operativo para claves criptográficas. Sustituyó a `Math.random()` en toda la
generación de combinaciones y en la simulación estadística interna (ver
Bloque 3.3 y 3.4). No mejora las probabilidades de ganar; cierra cualquier
duda teórica sobre sesgos ocultos en la fuente de aleatoriedad.

### 1.2 Exclusión geométrica
`src/utils/geometry.ts` (`isLine`, `isDiagonal`, `hasTriangle`, `hasCross`,
`hasCircle`, `isSpaced`, `hasGeometricPattern`). Detecta si los números
elegidos forman un patrón visual reconocible en la rejilla del boleto
(línea recta, diagonal, triángulo, cruz, círculo) y permite excluir esas
combinaciones. Es un filtro puramente visual/estético — el patrón no afecta
a la probabilidad real de ganar, solo evita boletos que "se ven" marcados.

### 1.3 Grupo de Control
`index.tsx` (`controlGroupStats`). Cada vez que se guarda un boleto, la app
genera en segundo plano una combinación de control totalmente aleatoria
(sin ningún filtro aplicado) y la valida contra los sorteos reales igual
que el boleto real del usuario. Los aciertos de ambos se acumulan por
separado y se muestran lado a lado en el Historial ("Grupo de Control (%)")
— es la comprobación más directa que tiene la app de si sus filtros
aportan algo frente al azar puro, sorteo a sorteo, con datos reales de uso.

---

<a name="bloque-2"></a>
## Bloque 2 — Filtros descriptivos de una combinación

Todos se calculan sobre **una combinación concreta** (no sobre el
histórico) en `src/utils/combinatorial.ts` → `getCombinationStats()`, y
tienen su propio popup de estadísticas en `src/utils/filterStatsTemplates.ts`.

| Filtro | Qué mide | Cómo se calcula |
|---|---|---|
| Suma total | Suma de los números elegidos | `Σ números` |
| Suma de dígitos | Suma de los dígitos individuales de cada número (ej. 23 → 2+3=5) | `Σ dígitos` |
| Desviación estándar | Cuán dispersos están los números entre sí | Desviación estándar clásica sobre la combinación |
| Par/Impar | Balance entre números pares e impares | Conteo, ej. `3/3` |
| Bajos/Altos | Balance respecto al punto medio del rango del juego | Conteo, ej. `4/2` |
| Primos | Cantidad de números primos en la combinación | Conteo contra una tabla de primos precalculada |
| Consecutivos | Bloques de números correlativos (ej. 12-13-14 cuenta como bloque de 3) | Patrón ordenado, ej. `3/2/1` |
| Distancia entre números | Separación entre cada par de números consecutivos, una vez ordenados | Cada diferencia debe caer en `[min, max]` — filtro validado en `combinationValidator.ts` |
| Agrupación por decenas | Cuántos números caen en cada decena (1-10, 11-20, ...) | Conteo por decena |
| Variedad de terminaciones | Cuántos últimos dígitos distintos hay entre los números elegidos | Conteo de valores únicos |
| Rango óptimo por posición | Ver Bloque 3.6 — combina teoría con el histórico, no es solo descriptivo de la combinación |

### Entropía de Shannon (terminaciones e intervalos)

Las dos entradas que faltan en la tabla merecen una explicación aparte
porque **miden diversidad, no un valor concreto**, y es el concepto que
más se malinterpreta si no se explica bien.

**Qué es la entropía, en una frase:** un número que dice cuán "repartida"
está una distribución. Si todos los valores posibles aparecen por igual,
la entropía es máxima (mucha diversidad, difícil de predecir). Si un solo
valor domina y el resto no aparecen, la entropía es mínima (nada
repartida, muy predecible). No tiene que ver con el azar del sorteo en sí
— es una propiedad de **la combinación que tú (o la app) habéis elegido**.

**Fórmula:** `H = -Σ p·log2(p)`, donde `p` es la proporción de cada
categoría dentro de la combinación.

**Entropía de terminaciones** — categorías = último dígito de cada número.
Ejemplo con la combinación `[7, 17, 23, 34, 45, 49]` (Bonoloto, 6 números):
terminaciones `7, 7, 3, 4, 5, 9` → el dígito 7 se repite (2/6 = 0,333), el
resto son únicos (1/6 = 0,167 cada uno, 4 categorías). Entropía:
`H = -(0,333·log2(0,333) + 4·(0,167·log2(0,167))) ≈ 2,25`. El máximo
posible con 6 números sería `log2(6) ≈ 2,58` (las 6 terminaciones
distintas) — 2,25 refleja diversidad alta pero no perfecta, por esa
terminación repetida.

**Entropía de intervalos** — categorías = las distancias entre números
consecutivos una vez ordenados (el mismo concepto que usa el filtro
"Distancia entre Números", pero midiendo su diversidad en vez de acotarla).
Con la misma combinación, las distancias son `10, 6, 11, 11, 4` — el valor
11 se repite (2/5), el resto son únicos (1/5 cada uno, 3 categorías).
Entropía: `H = -(0,4·log2(0,4) + 3·(0,2·log2(0,2))) ≈ 1,92`. Máximo
posible con 5 intervalos: `log2(5) ≈ 2,32`.

En ambos casos, el `game-configs.ts` define un rango `[min, max]` aceptable
por juego (`entropyTerminaciones`, `entropyIntervalos`) para poder usarlas
como filtro de exclusión, igual que cualquier otro filtro de la tabla.

---

<a name="bloque-3"></a>
## Bloque 3 — Análisis del histórico

Estos, a diferencia del Bloque 2, se calculan sobre **el historial de
sorteos pasados**, no sobre una combinación aislada.

### 3.1 Percentil de hueco (Gap)

`src/utils/gapFilter.ts`. Dónde cae el "hueco actual" de un número
(sorteos desde su última aparición) dentro de la distribución histórica de
sus propios huecos. Ejemplo: huecos históricos `[2, 15, 3, 8, 20, 5, 4, 25]`
y hueco actual de 12 → 5 de 8 huecos históricos son ≤12 → percentil =
**62,5%**. Es descriptivo, no predictivo: no indica que "toque" salir.
**Insuficiente** con menos de 8 huecos históricos (`minGapsRequeridos`).

### 3.2 Test de rachas — Wald-Wolfowitz (runs test)

`src/utils/gapFilter.ts` → `testRachasWaldWolfowitz`. Convierte el
histórico de un número en una secuencia binaria (apareció/no apareció) y
comprueba si el número de "rachas" (bloques consecutivos del mismo valor)
es compatible con una secuencia aleatoria, dando un p-valor real — a
diferencia del percentil de hueco (3.1), que es solo descriptivo. Ejemplo:
con 6 apariciones y 6 ausencias en 12 sorteos, la media esperada de rachas
es 7; si en la práctica solo hay 2 (todo agrupado), z ≈ -3,03 y p ≈ 0,0024
(agrupación significativa). **Insuficiente** con menos de 5 apariciones o
menos de 5 ausencias.

### 3.3 Chi-cuadrado de homogeneidad + p-valor

`src/utils/regression.ts` + `src/utils/statHelpers.ts`. Si la distribución
de frecuencias observada en el histórico vigente se aleja de la uniforme
esperada por azar, de forma significativa. Estadístico clásico
`Σ (observado-esperado)²/esperado`, valor crítico vía aproximación de
Wilson-Hilferty, y desde esta sesión también un **p-valor real**
(`chiSquarePValue`) en vez de solo un booleano. Ejemplo (Bonoloto, df=48,
500 sorteos): chi-cuadrado observado 55 (crítico ≈65,1) → sin sesgo
detectado, p ≈ 0,23. **Insuficiente** con menos de 50 sorteos vigentes; y
para juegos con poco histórico total (ver Bloque 5), el test tiene menos
poder aunque el cálculo en sí sea correcto.

### 3.4 Co-ocurrencia (pares/tríos) + corrección FDR

`src/utils/coocurrencia.ts` + `src/utils/statHelpers.ts`. Qué pares/tríos
han salido juntos más de lo esperado por azar, corregido por el hecho de
testear cientos o miles de combinaciones a la vez (p-valor de Poisson +
corrección Benjamini-Hochberg sobre el total real de comparaciones, no solo
las 20 mostradas). Ejemplo: en Bonoloto (1.500 sorteos), un par con 32
coincidencias frente a ~19 esperadas tiene p≈0,002 en solitario, pero el
umbral FDR para el candidato nº1 de entre `C(49,2)=1.176` pares es
`(1/1176)×0,05 ≈ 0,0000425` — no sobrevive. **0 de 20 significativos es el
resultado más probable y correcto**, no un fallo del cálculo.

### 3.5 Regresión lineal (tendencia de suma / frecuencia)

`src/utils/regression.ts` → `linearRegression`, `getSumTrendScore`,
`getNumberTrendScore`. Pendiente e intercepto de mínimos cuadrados sobre la
serie temporal de sumas de sorteo o de frecuencia de un número. Es
descriptivo (alimenta el gráfico de tendencia): una pendiente no nula por
sí sola no implica significancia — para eso está el test de homogeneidad
(3.3), que sí es una prueba de hipótesis real.

### 3.6 Rango óptimo por posición (estadística de orden)

`src/utils/orderStatistics.ts`. Para cada posición ordenada de la
combinación (1ª, 2ª, ... k-ésima menor de los `n` números elegidos entre
`1..N`), calcula un rango "normal" combinando teoría y datos reales:
- Media teórica: `E[X_k] = k·(N+1)/(n+1)`.
- Varianza teórica y rango al 90% de confianza (`z=1,645`) alrededor de esa
  media.
- Percentiles 5-95 empíricos del histórico real en esa posición (si hay al
  menos 10 sorteos).
- Rango final: promedio entre el rango teórico y el empírico.

Es la única estadística de este bloque que mezcla teoría pura del juego
(combinatoria) con el histórico real.

### 3.7 Score Nash (popularidad de calendario)

`src/utils/popularity.ts`. Cuánto se parece un número a los que la gente
elige por sesgo de calendario (días 1-31, meses 1-12, múltiplos de 7). El
nombre no tiene relación con el equilibrio de Nash de teoría de juegos.
Ejemplo (Bonoloto): número 7 → peso ≈64; número 45 → peso ≈24; combinación
`[7,45]` → score Nash = 4,4 (escala 0,0-10,0). No depende del histórico,
solo del rango del juego.

### 3.8 Score Markov (dependencia de sorteos recientes)

`src/utils/optimizer.ts` → `getMarkovScore`. Suma cuántas veces aparece
cada número de la combinación candidata dentro de los últimos
`markovDepth` sorteos. Es una heurística de "calor reciente", no un modelo
de Markov formal con matriz de transición — el nombre es más ambicioso que
el cálculo real, que es un conteo simple de recencia.

### 3.9 Penalización Nash geométrica

`src/utils/optimizer.ts` → `getNashPenalty`. Combina el score Nash (3.7)
con la posición del número en la rejilla del boleto (penaliza estar en el
borde) y con si la combinación forma una línea recta en la rejilla (ver
Bloque 1.2). Se usa internamente para puntuar candidatos durante la
optimización, no se muestra como estadística independiente al usuario.

---

<a name="bloque-4"></a>
## Bloque 4 — Scoring y optimización (uso interno)

Estas funciones combinan varias de las anteriores para puntuar y elegir
entre múltiples combinaciones candidatas — no son estadísticas que el
usuario vea de forma aislada, sino la lógica interna de "Restaurar
Filtros"/"Intuición".

- **`calculateOptimizationScore`** (`optimizer.ts`): combina score Nash,
  tendencia de regresión, score Markov y penalización geométrica en un
  único score para rankear candidatos.
- **Backtesting walk-forward** (`scripts/backtestRoberTheorem.ts` y
  similares): simulación retrospectiva histórica, ya validada en sesiones
  anteriores contra las 4 loterías principales — confirma que ningún
  filtro de exclusión supera estadísticamente al azar puro. Es el resultado
  que sostiene la sección "Honestidad matemática" de la web.

---

<a name="bloque-5"></a>
## Bloque 5 — Referencia rápida: profundidad de histórico por juego

| Juego | Sorteos aprox. | Desde |
|---|---|---|
| Lotería Nacional | ~23.860 | 2008 |
| Bonoloto | 4.000+ | — |
| MegaMillions | ~2.536 | 2002-05-17 |
| Euromillones | ~1.933 | 2004-02-13 |
| Primitiva | 1.500+ | — |
| Powerball | ~1.367 | 2015-10-07 |
| El Gordo | ~1.092 | 2005-02-06 |
| **EuroDreams** | **~292** | **2023-11-06** |

EuroDreams tiene, con diferencia, el menor poder estadístico disponible —
cualquier test del Bloque 3 debería interpretarse ahí con más cautela que
en el resto de juegos.
