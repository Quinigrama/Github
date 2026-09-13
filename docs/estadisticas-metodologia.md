# Metodología estadística de DataLotto

Glosario interno: qué mide cada estadístico visible en la app, cómo se calcula
y un ejemplo numérico concreto. Objetivo: que cualquier sesión futura (Claude,
Gemini, o el propio Rober) entienda de un vistazo el significado real de cada
número que la app le muestra al usuario, sin tener que releer el código fuente
cada vez.

Todos los ejemplos usan cifras ilustrativas redondeadas — el objetivo es
entender la mecánica, no reproducir un cálculo exacto de producción.

---

## 1. Score Nash (popularidad de calendario)

**Qué mide:** cuánto se parece un número a los que la gente elige por sesgo
de calendario — días del mes (1-31), meses (1-12), y "números de la suerte"
múltiplos de 7. No tiene relación con el equilibrio de Nash de teoría de
juegos; es solo el nombre que se le dio a esta métrica en el proyecto.

**Cómo se calcula** (`popularity.ts` → `computePopularityWeight`): cada
número parte de un peso base de 30. Si es ≤31 suma +30 (rango de días), si
además es ≤12 suma +10 más (rango de meses), y si es múltiplo de 7 suma +8.
El resultado se escala según cuánto domina el sesgo de calendario en el
rango total del juego (`31 / numberRange`) — en Powerball/MegaMillions
(rango 69-70) el sesgo de calendario pesa menos que en los juegos españoles
(rango ~49).

**Ejemplo (Bonoloto, numberRange=49):**
- Número 7: 30 (base) + 30 (≤31) + 10 (≤12) + 8 (múltiplo de 7) = 78 → escalado ≈ 64.
- Número 45: 30 (base, no cumple ninguna otra condición) → escalado ≈ 24.
- Combinación `[7, 45]` → score Nash = media(64, 24) / 10 = **4.4** (escala 0.0–10.0).

**Insuficiente:** no aplica — no depende del histórico, solo del rango del juego.

---

## 2. Percentil de hueco (Gap)

**Qué mide:** dónde cae el "hueco actual" de un número (sorteos desde su
última aparición) dentro de la distribución histórica de sus propios huecos.

**Cómo se calcula** (`gapFilter.ts` → `calcularGaps` / `percentilHueco`): se
listan todos los huecos históricos del número, y se calcula qué porcentaje
de esos huecos es menor o igual al hueco actual.

**Ejemplo:** un número con huecos históricos `[2, 15, 3, 8, 20, 5, 4, 25]`
(8 huecos) y un hueco actual de 12 sorteos → 5 de esos 8 huecos históricos
son ≤12 → percentil = 5/8 × 100 = **62,5%**. Es decir, el número lleva más
tiempo sin salir que en el 62,5% de sus rachas históricas — ni extremo ni
irrelevante.

**Insuficiente:** menos de 8 huecos históricos (`minGapsRequeridos`). Con
menos datos el percentil no es representativo y se marca como tal en la UI.

---

## 3. Test de rachas — Wald-Wolfowitz (runs test) — NUEVO

**Qué mide:** si el patrón de aparición/no-aparición de un número a lo largo
del histórico está anormalmente agrupado o anormalmente alternado respecto a
lo que produciría una secuencia aleatoria — a diferencia del percentil de
hueco (punto 2), que es solo descriptivo, este es un test de hipótesis real
con p-valor.

**Cómo se calcula** (`gapFilter.ts` → `testRachasWaldWolfowitz`): se
convierte el histórico en una secuencia binaria (apareció / no apareció) y
se cuenta el número de "rachas" (bloques consecutivos del mismo valor). Se
compara ese número de rachas contra la media y varianza esperadas bajo
aleatoriedad, dando un estadístico z y un p-valor de dos colas.

**Ejemplo:** de 12 sorteos, un número aparece en 6 y falta en 6
(`n1=6, n2=6`). Media esperada de rachas = 2·6·6/12 + 1 = 7. Si en la
práctica solo hay 2 rachas (todas las apariciones agrupadas al principio,
luego todas las ausencias), el estadístico z ≈ -3,03 y el p-valor ≈ 0,0024
— muy por debajo de 0,05: el patrón de agrupación es estadísticamente
significativo, no sería lo esperable de una secuencia aleatoria. Si en vez
de eso las apariciones y ausencias se alternan de forma casi perfecta
(muchas rachas), el z sería positivo y muy alto, con la misma conclusión de
"no aleatorio" pero en el sentido contrario (demasiado ordenado).

**Insuficiente:** menos de 5 apariciones o menos de 5 ausencias — la
aproximación normal del test deja de ser fiable con muestras tan pequeñas.

---

## 4. Entropía de Shannon (terminaciones e intervalos)

**Qué mide:** cuán repartida está la diversidad de terminaciones (último
dígito de cada número) o de intervalos (diferencias entre números
consecutivos) dentro de **una combinación concreta** — no del histórico. Más
alta = más variedad; más baja = más repetición.

**Cómo se calcula** (`combinatorial.ts`): fórmula estándar de Shannon,
`H = -Σ p·log2(p)`, sobre las frecuencias de terminaciones/intervalos dentro
de la combinación. El máximo teórico es `log2(maxNumbers)` (todas las
categorías distintas y equiprobables).

**Ejemplo:** combinación `[7, 17, 23, 34, 45, 49]` (Bonoloto, 6 números).
Terminaciones: `7, 7, 3, 4, 5, 9` → la terminación 7 se repite (2/6), el
resto son únicas (1/6 cada una, 4 categorías distintas). Entropía:
`H = -(2/6·log2(2/6) + 4·(1/6·log2(1/6))) ≈ 2,25`. El máximo posible con 6
números sería `log2(6) ≈ 2,58` (las 6 terminaciones distintas) — así que
2,25 refleja una diversidad alta pero no perfecta, por esa terminación
repetida.

**Insuficiente:** no aplica — se calcula sobre una única combinación, no
sobre el histórico.

---

## 5. Regresión lineal (tendencia de suma / frecuencia)

**Qué mide:** si la suma total de los sorteos, o la frecuencia de un número
concreto, muestra una tendencia lineal ascendente o descendente a lo largo
del histórico cargado.

**Cómo se calcula** (`regression.ts` → `linearRegression`,
`getSumTrendScore`, `getNumberTrendScore`): regresión de mínimos cuadrados
estándar (pendiente e intercepto) sobre la serie temporal de sumas o
frecuencias por ventana.

**Nota de honestidad:** una pendiente distinta de cero en una regresión
lineal simple, sin más, **no implica significancia estadística** — para eso
está el test de homogeneidad del punto 6. La regresión aquí es descriptiva
(muestra la tendencia visual en el gráfico), no una prueba de hipótesis.

---

## 6. Chi-cuadrado de homogeneidad + p-valor — ACTUALIZADO

**Qué mide:** si la distribución de frecuencias observada de números (o
estrellas) en el histórico vigente se aleja de la distribución uniforme que
predice el azar puro, de forma estadísticamente significativa.

**Cómo se calcula** (`regression.ts` + `statHelpers.ts`): estadístico
chi-cuadrado clásico `Σ (observado - esperado)² / esperado`, con
`df = numberRange - 1` grados de libertad. El valor crítico se obtiene con
la aproximación de Wilson-Hilferty (`chiSquareCriticalValue`), y desde esta
sesión también se calcula un **p-valor real** invirtiendo esa misma
aproximación (`chiSquarePValue`) — antes solo se mostraba un booleano de
"sesgo detectado sí/no".

**Ejemplo (Bonoloto, df=48, 500 sorteos vigentes):** frecuencia esperada por
número ≈ 61,2. Si el estadístico chi-cuadrado observado es 55 (df=48, muy
cerca de lo esperado bajo azar puro, que es ≈df), el valor crítico al 95%
es ≈65,1 → no se detecta sesgo, y el p-valor asociado es ≈0,23 (muy por
encima de 0,05: no hay evidencia de desviación del azar).

**Insuficiente:** menos de 50 sorteos vigentes (umbral ya existente en la
UI). Además, para juegos con muy poco histórico total — hoy en día
**EuroDreams, con solo ~292 sorteos desde noviembre de 2023** — cualquier
resultado de este test tiene mucho menos poder estadístico que en
Bonoloto/Primitiva: un chi-cuadrado "no significativo" ahí es menos
concluyente, no porque el cálculo esté mal, sino porque hace falta más
histórico para que el test pueda detectar una desviación real si existiera.

---

## 7. Co-ocurrencia (pares/tríos) + corrección FDR — ACTUALIZADO

**Qué mide:** qué pares o tríos de números han salido juntos con más
frecuencia de la esperada por azar — y, desde esta sesión, si esa frecuencia
sigue pareciendo "caliente" **después** de corregir por el hecho de que se
están testeando cientos o miles de pares/tríos a la vez.

**Cómo se calcula** (`coocurrencia.ts` + `statHelpers.ts`): para cada par
mostrado se calcula un p-valor con la cola superior de una distribución de
Poisson (`poissonUpperTailPValue`, con λ = frecuencia esperada por azar).
Después se aplica la corrección de **Benjamini-Hochberg (FDR)** sobre el
total de comparaciones reales de la familia — no solo sobre los 20 que se
muestran en pantalla: para un juego 6/49 eso son `C(49,2) = 1.176` pares
posibles, o `C(49,3) = 18.424` tríos posibles.

**Ejemplo (por qué esto importa):** en Bonoloto, con 1.500 sorteos, la
frecuencia esperada por azar para cualquier par concreto es de ~19 veces
juntos. Si el par más repetido del histórico ha salido junto 32 veces, su
p-valor "en solitario" (sin corregir) es de ~0,002 — parece muy llamativo.
Pero como es el candidato nº1 de entre 1.176 pares testeados, el umbral de
Benjamini-Hochberg para que sobreviva es `(1/1176) × 0,05 ≈ 0,0000425` —
muchísimo más estricto que 0,002. **Ese par no sobrevive la corrección.**
Este es exactamente el resultado esperado y honesto: con tantas comparaciones
simultáneas, hasta el par "más caliente" del histórico suele ser ruido
estadístico, no señal — coherente con lo que ya confirman los backtests de
DataLotto para filtros de exclusión.

**Insuficiente / "ninguno significativo":** es el resultado más probable y
correcto en la mayoría de los juegos — si la tabla muestra 0 de 20 pares/
tríos marcados como significativos tras la corrección, **eso no es un fallo
del cálculo**, es la conclusión estadísticamente honesta.

---

## Profundidad de histórico por juego (referencia rápida)

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

EuroDreams es, con diferencia, el juego con menor poder estadístico
disponible — cualquier test (chi-cuadrado, runs test, co-ocurrencia) debería
interpretarse ahí con más cautela que en el resto.
