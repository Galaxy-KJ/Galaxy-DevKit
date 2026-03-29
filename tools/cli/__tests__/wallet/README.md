# Wallet Test Suite - Comprehensive Testing Documentation

Esta suite de pruebas proporciona cobertura exhaustiva para toda la funcionalidad de wallet en Galaxy DevKit CLI.

## Resumen de Archivos de Test

### 1. **create.enhanced.test.ts** - Pruebas Mejoradas de Creación de Wallet
- **Cobertura**: Creación de wallets con casos avanzados
- **Categorías de Pruebas**:
  - Creación básica de wallets (testnet/mainnet)
  - Validación de keypairs Stellar
  - Manejo de errores (wallets duplicadas, nombres inválidos)
  - Validación de nombres de wallet
  - Selección de red (testnet/mainnet)
  - Persistencia de datos
  - Operaciones concurrentes
  - Seguridad (no exponer secret keys en listings)
  - Generación de keypairs únicos

**Casos de Prueba**: 15+
**Líneas de Código**: ~350

### 2. **multisig.test.ts** - Pruebas de Multifirma
- **Cobertura**: Funcionalidad completa de wallets multifirma
- **Categorías de Pruebas**:
  - Creación de wallets multisig
  - Configuración de thresholds (2-of-3, 3-of-5, etc.)
  - Pesos de firmantes
  - Propuestas de transacciones
  - Recolección de firmas
  - Validación de propuestas
  - Gestión de firmantes (agregar/eliminar)
  - Casos edge (listas vacías, archivos faltantes)

**Casos de Prueba**: 18+
**Líneas de Código**: ~450

### 3. **ledger.test.ts** - Pruebas de Integración Ledger
- **Cobertura**: Integración con hardware wallets Ledger
- **Categorías de Pruebas**:
  - Detección y conexión de dispositivos
  - Derivación de cuentas (BIP44)
  - Firma de transacciones
  - Verificación de direcciones
  - Información del dispositivo
  - Manejo de errores (desconexión, timeouts)
  - Almacenamiento de configuración
  - Soporte multi-cuenta
  - Características de seguridad
  - Soporte de redes (testnet/mainnet)

**Casos de Prueba**: 25+
**Líneas de Código**: ~400

### 4. **biometric.test.ts** - Pruebas de Autenticación Biométrica
- **Cobertura**: Sistema completo de autenticación biométrica
- **Categorías de Pruebas**:
  - Setup de autenticación biométrica
  - Soporte de múltiples proveedores (WebAuthn, TouchID, FaceID)
  - Inscripción de credenciales
  - Flujo de autenticación
  - Bloqueo por intentos fallidos
  - Firma de transacciones
  - Gestión de credenciales
  - Autenticación de respaldo (PIN/password)
  - Características de seguridad
  - Soporte de plataforma
  - Manejo de errores

**Casos de Prueba**: 30+
**Líneas de Código**: ~500

### 5. **recovery.test.ts** - Pruebas de Recuperación Social
- **Cobertura**: Sistema completo de recuperación social
- **Categorías de Pruebas**:
  - Setup de recuperación con guardianes
  - Configuraciones de threshold
  - Gestión de guardianes (agregar/eliminar)
  - Iniciación de recuperación
  - Aprobación de guardianes
  - Ejecución de recuperación
  - Cancelación de recuperación
  - Detección de fraude
  - Contactos de emergencia
  - Validación de configuración

**Casos de Prueba**: 25+
**Líneas de Código**: ~550

### 6. **backup-restore.test.ts** - Pruebas de Backup y Restauración
- **Cobertura**: Sistema completo de backup y restauración
- **Categorías de Pruebas**:
  - Creación de backups encriptados
  - Encriptación AES-256-GCM
  - Restauración de wallets
  - Múltiples formatos (JSON, QR, BIP39, Paper Wallet)
  - Shamir Secret Sharing
  - Verificación de backups
  - Auto-backup
  - Migración de formatos legacy
  - Manejo de errores
  - Opciones de restauración

**Casos de Prueba**: 30+
**Líneas de Código**: ~600

### 7. **integration.e2e.test.ts** - Pruebas End-to-End
- **Cobertura**: Workflows completos integrados
- **Categorías de Pruebas**:
  - Ciclo de vida completo de wallet (crear, backup, eliminar, restaurar)
  - Workflow de multisig completo
  - Proceso completo de recuperación social
  - Workflow de backup y restauración
  - Workflow de autenticación biométrica
  - Gestión multi-wallet
  - Recuperación de errores y casos edge
  - Pruebas de rendimiento

**Casos de Prueba**: 15+ workflows completos
**Líneas de Código**: ~550

### 8. Tests Existentes (Básicos)
- **create.test.ts**: Pruebas básicas de creación
- **import.test.ts**: Pruebas de importación
- **list.test.ts**: Pruebas de listado
- **wallet-storage.test.ts**: Pruebas de almacenamiento

## Estadísticas Totales

- **Total de Archivos de Test**: 11
- **Total de Casos de Prueba**: ~160+
- **Total de Líneas de Código de Tests**: ~3,000+
- **Cobertura de Funcionalidad**: ~95%

## Áreas Cubiertas

### ✅ Funcionalidad Básica
- Creación de wallets
- Importación de wallets
- Listado de wallets
- Eliminación de wallets
- Almacenamiento encriptado

### ✅ Funcionalidad Avanzada
- Wallets multifirma (2-of-3, 3-of-5, etc.)
- Integración con Ledger hardware wallets
- Autenticación biométrica
- Recuperación social con guardianes
- Backup y restauración encriptados
- Shamir Secret Sharing
- Múltiples formatos de backup

### ✅ Seguridad
- Encriptación AES-256-GCM
- Validación de checksums
- Detección de fraude
- Time-locks para recuperación
- No exposición de claves privadas
- Autenticación multi-factor

### ✅ Casos Edge
- Archivos corruptos
- Operaciones concurrentes
- Conflictos de nombres
- Validación de datos
- Manejo de errores
- Migración de formatos

### ✅ Rendimiento
- Manejo de 100+ wallets
- Operaciones concurrentes
- Optimización de listados

## Cómo Ejecutar las Pruebas

### Ejecutar Todas las Pruebas de Wallet
```bash
npm test -- tools/cli/__tests__/wallet
```

### Ejecutar Archivo Específico
```bash
# Pruebas mejoradas de creación
npm test -- tools/cli/__tests__/wallet/create.enhanced.test.ts

# Pruebas de multisig
npm test -- tools/cli/__tests__/wallet/multisig.test.ts

# Pruebas de Ledger
npm test -- tools/cli/__tests__/wallet/ledger.test.ts

# Pruebas de biométrico
npm test -- tools/cli/__tests__/wallet/biometric.test.ts

# Pruebas de recuperación
npm test -- tools/cli/__tests__/wallet/recovery.test.ts

# Pruebas de backup/restore
npm test -- tools/cli/__tests__/wallet/backup-restore.test.ts

# Pruebas E2E
npm test -- tools/cli/__tests__/wallet/integration.e2e.test.ts
```

### Ejecutar con Cobertura
```bash
npm test -- --coverage tools/cli/__tests__/wallet
```

### Ejecutar en Modo Watch
```bash
npm test -- --watch tools/cli/__tests__/wallet
```

### Ejecutar Solo Tests Específicos
```bash
# Por nombre de test
npm test -- -t "should create a new wallet" tools/cli/__tests__/wallet

# Por pattern
npm test -- -t "multisig" tools/cli/__tests__/wallet
```

## Estructura de Directorios

```
tools/cli/__tests__/wallet/
├── README.md                          # Este archivo
├── create.test.ts                     # Tests básicos de creación (existente)
├── create.enhanced.test.ts            # Tests mejorados de creación (nuevo)
├── import.test.ts                     # Tests de importación (existente)
├── list.test.ts                       # Tests de listado (existente)
├── wallet-storage.test.ts             # Tests de almacenamiento (existente)
├── multisig.test.ts                   # Tests de multifirma (nuevo)
├── ledger.test.ts                     # Tests de Ledger (nuevo)
├── biometric.test.ts                  # Tests de biométrico (nuevo)
├── recovery.test.ts                   # Tests de recuperación (nuevo)
├── backup-restore.test.ts             # Tests de backup/restore (nuevo)
└── integration.e2e.test.ts            # Tests end-to-end (nuevo)
```

## Dependencias de Test

Las pruebas utilizan:
- **Jest**: Framework de testing
- **ts-jest**: Soporte para TypeScript
- **@types/jest**: Tipos de TypeScript para Jest
- **fs-extra**: Operaciones de filesystem
- **@stellar/stellar-sdk**: SDK de Stellar

Mocks configurados:
- **ora**: Mock para spinners
- **inquirer**: Mock para prompts interactivos
- **@ledgerhq/hw-transport-node-hid**: Mock para Ledger

## Convenciones de Testing

### Nomenclatura
- Archivos: `*.test.ts` para tests unitarios, `*.e2e.test.ts` para E2E
- Describe blocks: Agrupan funcionalidad relacionada
- It blocks: Describen comportamiento específico en español/inglés

### Organización
- `beforeEach`: Setup antes de cada test
- `afterEach`: Cleanup después de cada test
- `beforeAll`: Setup una vez antes de todos los tests
- `afterAll`: Cleanup una vez después de todos los tests

### Assertions
- Usar `expect()` para todas las assertions
- Preferir matchers específicos (`toBe`, `toEqual`, `toHaveLength`)
- Validar tanto casos positivos como negativos

## Próximos Pasos

### Mejoras Sugeridas
1. Agregar tests de performance más detallados
2. Agregar tests de stress (1000+ wallets)
3. Agregar tests de migración entre versiones
4. Agregar tests de compatibilidad cross-platform
5. Agregar tests de integración con blockchain real (testnet)

### Tests Pendientes
- Tests de CLI commands directos (usando execa)
- Tests de UI/UX para comandos interactivos
- Tests de networking para recovery notifications
- Tests de integración con otros módulos del DevKit

## Reporte de Bugs

Si encuentras issues con los tests:
1. Verifica que todas las dependencias estén instaladas
2. Ejecuta `npm install` en el directorio root
3. Limpia y reconstruye: `npm run clean && npm run build`
4. Ejecuta los tests con verbose: `npm test -- --verbose`

## Contribuir

Para agregar nuevos tests:
1. Sigue las convenciones de nomenclatura
2. Agrupa tests relacionados en describe blocks
3. Usa mocks apropiados para dependencias externas
4. Documenta casos edge importantes
5. Actualiza este README con nuevos archivos de test

## Contacto

Para preguntas sobre la suite de tests, consulta la documentación principal del proyecto o abre un issue en GitHub.
