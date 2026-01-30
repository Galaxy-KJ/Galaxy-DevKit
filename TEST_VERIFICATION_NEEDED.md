# ⚠️ Verificación de Tests Necesaria

## Problema Potencial Detectado

Los tests y el código fuente importan tipos que pueden no existir en @blend-capital/blend-sdk v3.2.2:

### Importaciones en Cuestión

```typescript
import {
  PoolContractV2,  // ⚠️ Puede ser solo "PoolContract"
  Request,         // ⚠️ Verificar si existe como tipo exportado
  RequestType      // ✅ Probablemente existe
} from '@blend-capital/blend-sdk';
```

### Ubicaciones Afectadas

1. **Código Fuente**: `packages/core/defi-protocols/src/protocols/blend/blend-protocol.ts:21-23`
   - Usa `PoolContractV2.spec.funcArgsToScVals()` en línea 161
   - Usa `Request` y `RequestType` para crear requests

2. **Tests**: `packages/core/defi-protocols/__tests__/protocols/blend-protocol-operations.test.ts:25`
   - Mockea estos tipos

## Pasos para Verificar

### 1. Verifica las Exportaciones del SDK

```bash
cd packages/core/defi-protocols
npx tsc --noEmit
```

Si hay errores como:
```
Module '"@blend-capital/blend-sdk"' has no exported member 'PoolContractV2'
Module '"@blend-capital/blend-sdk"' has no exported member 'Request'
```

Entonces necesitas corregir las importaciones.

### 2. Verifica la Versión del SDK

```bash
npm list @blend-capital/blend-sdk
```

### 3. Revisa la Documentación del SDK

- Docs: https://docs.blend.capital/tech-docs/integrations/integrate-pool
- GitHub: https://github.com/blend-capital

### 4. Ejecuta los Tests

```bash
cd packages/core/defi-protocols
npm test
```

## Posibles Soluciones

### Si PoolContractV2 no existe:

**Opción A: Cambiar a PoolContract**
```typescript
// Cambiar de:
import { PoolContractV2 } from '@blend-capital/blend-sdk';

// A:
import { PoolContract } from '@blend-capital/blend-sdk';

// Y luego:
PoolContract.spec.funcArgsToScVals('submit', submitArgs);
```

**Opción B: Usar la estructura directa**
```typescript
// Si no existe .spec.funcArgsToScVals
import { nativeToScVal } from '@stellar/stellar-sdk';

const scVals = [
  nativeToScVal(request, { type: 'map' }),
  // ... otros argumentos
];
```

### Si Request no existe como tipo:

```typescript
// Definir el tipo localmente
interface Request {
  address: Address;
  amount: bigint;
  request_type: RequestType;
}
```

## Tests Integración

Los tests de integración pueden pasar porque usan el SDK real:
- `blend-testnet.integration.test.ts` - Usa SDK real
- `blend-live-transactions.test.ts` - Usa SDK real

Si estos pasan, significa que el SDK funciona pero los tipos pueden estar incorrectos.

## Resumen

**Estado**: ⚠️ NECESITA VERIFICACIÓN
**Bloqueante**: Potencialmente SÍ (errores de TypeScript)
**Prioridad**: ALTA

**Acción Inmediata**:
```bash
cd packages/core/defi-protocols
npm run type-check
```

Si el type-check pasa, los tests probablemente también pasen.
Si falla, necesitas ajustar las importaciones según las exportaciones reales del SDK.
