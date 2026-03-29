# Pruebas manuales – Modo interactivo Galaxy CLI

Guía para probar el modo interactivo manualmente y generar evidencia (capturas o salida de terminal).

## Requisitos

- Terminal con TTY (no piping): `process.stdin.isTTY === true`
- Node.js 18+
- Desde el repo: `cd tools/cli` y luego una de:
  - **Sin compilar (recomendado):** `npm install` y `npm run start:ts`
  - **Compilado:** `npm run build` y `npm start`

---

## 1. Entrada al modo interactivo

**Objetivo:** Verificar que `galaxy` sin argumentos y `galaxy interactive` abren el modo interactivo.

### 1.1 Sin argumentos

```bash
cd tools/cli
npm run start:ts
```
(La primera vez ejecuta `npm install` para instalar `tsx`.)

**Evidencia:** Captura donde se vea:
- Mensaje de bienvenida: "Galaxy DevKit Interactive Mode"
- "Type 'help' for commands or 'exit' to quit"
- Prompt `galaxy> `

Luego escribe `exit` y Enter para salir.

### 1.2 Comando explícito

```bash
npm run start:ts -- interactive
```

**Evidencia:** Mismo mensaje y prompt que en 1.1.

---

## 2. Comandos integrados (built-in)

**Objetivo:** Comprobar que los comandos del REPL responden correctamente.

En el prompt `galaxy> ` ejecuta y captura la salida:

| Comando   | Qué comprobar                    | Evidencia |
|----------|-----------------------------------|-----------|
| `help`   | Lista de comandos y atajos        | Captura de la salida completa |
| `help wallet` | Ayuda del grupo wallet      | Captura con "wallet" y subcomandos |
| `session`| Red, wallet, duración, variables  | Captura del resumen de sesión |
| `history`| Historial (vacío o con líneas)    | Captura de la lista |
| `network`| Red actual (ej. testnet)          | Captura con "Current network: testnet" |
| `exit`   | Mensaje de despedida y cierre     | Captura con "Goodbye" y vuelta al shell |

---

## 3. Autocompletado (Tab)

**Objetivo:** Tab completa comandos y subcomandos.

1. Entra al modo interactivo.
2. Escribe `wal` y pulsa **Tab**.
   - **Evidencia:** La línea debe completarse a `wallet`.
3. Escribe un espacio y pulsa **Tab**.
   - **Evidencia:** Deben mostrarse subcomandos (create, list, import, etc.).
4. Prueba `blend ` + Tab y `watch ` + Tab.
   - **Evidencia:** Subcomandos de blend (supply, borrow, etc.) y de watch (account, dashboard, etc.).

---

## 4. Historial con flechas (↑/↓)

**Objetivo:** Navegar por el historial con flechas arriba/abajo.

1. Ejecuta en este orden: `help`, `session`, `network`.
2. Pulsa **↑** varias veces: deben aparecer `network`, `session`, `help`.
3. Pulsa **↓** para bajar de nuevo.
4. **Evidencia:** Captura del prompt mostrando una línea recuperada del historial (ej. `session` o `help`).

---

## 5. Búsqueda en historial (Ctrl+R)

**Objetivo:** Reverse-i-search con Ctrl+R.

1. Ejecuta: `wallet create`, `oracle price XLM/USD`, `session`.
2. Pulsa **Ctrl+R**.
3. Escribe `oracle`.
   - Debe aparecer algo como `(reverse-i-search)'oracle': oracle price XLM/USD`.
4. Pulsa **Enter** para aceptar esa línea.
5. **Evidencia:** Captura mostrando la línea de búsqueda y el comando seleccionado (o la línea ya pegada en el prompt).

Opcional: **Escape** cancela la búsqueda sin cambiar la línea.

---

## 6. Estado de sesión (network, wallet)

**Objetivo:** Que la sesión guarde red y contexto de wallet.

1. `network mainnet` → mensaje tipo "Switched to mainnet".
2. `session` → debe mostrar "Network: mainnet".
3. `network testnet` → volver a testnet.
4. **Evidencia:** Captura de `session` mostrando "Network: mainnet" (o testnet).

---

## 7. Workflows guiados

**Objetivo:** Que los workflows se ejecuten sin error.

1. `workflow` → lista de workflows.
2. `workflow setup-wallet` (o `workflow create-project`).
3. Responde las preguntas (o cancela con Ctrl+C si solo quieres comprobar que arranca).
4. **Evidencia:** Captura del listado de workflows y/o de la primera pregunta de un workflow.

---

## 8. Ejecución de comandos Galaxy

**Objetivo:** Que los comandos “normales” de Galaxy se ejecuten igual que en no interactivo.

En el prompt prueba, por ejemplo:

- `wallet list` (puede no haber wallets).
- `oracle price XLM/USD` (requiere fuentes/config si aplica).

**Evidencia:** Captura de la salida (aunque sea “no wallets” o error de configuración), para mostrar que el comando se delegó correctamente.

---

## 9. Salida y atajos

| Acción   | Comportamiento esperado        | Evidencia |
|----------|--------------------------------|-----------|
| `exit` o `quit` | Mensaje de despedida y cierre | Captura del mensaje |
| **Ctrl+D**      | Cierre del REPL (como exit)   | Captura opcional |
| **Ctrl+C**      | Mensaje "Press Ctrl+D or type exit to quit", sin cerrar | Captura del mensaje |
| Línea vacía + Enter | No hace nada, nuevo prompt | No necesario |

---

## 10. Tests automatizados (evidencia de CI/local)

Para adjuntar evidencia de que los tests pasan:

```bash
cd tools/cli
npm test -- __tests__/interactive --no-coverage
```

**Evidencia:** Captura o copia del final de la salida, por ejemplo:

```
Test Suites: 4 passed, 4 total
Tests:       108 passed, 108 total
```

---

## Checklist resumido para evidencia

- [ ] 1. Entrada con `galaxy` y con `galaxy interactive` (mensaje + prompt).
- [ ] 2. Comandos: `help`, `help wallet`, `session`, `history`, `network`, `exit`.
- [ ] 3. Tab: completar `wal` → `wallet`, y Tab tras `wallet `, `blend `, `watch `.
- [ ] 4. Flechas ↑/↓ sobre historial.
- [ ] 5. Ctrl+R, escribir `oracle`, Enter.
- [ ] 6. `network mainnet` / `session` (estado de sesión).
- [ ] 7. `workflow` y al menos un workflow (ej. `workflow setup-wallet`).
- [ ] 8. Algún comando Galaxy (ej. `wallet list` o `oracle price XLM/USD`).
- [ ] 9. Salida con `exit` y opcionalmente Ctrl+C.
- [ ] 10. Salida de `npm test -- __tests__/interactive --no-coverage` (108 tests passed).

Si algo falla (por ejemplo dependencias o build), indica el paso y el mensaje de error para la evidencia.
