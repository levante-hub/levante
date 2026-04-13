# Windows Code Signing — Manual Flow

## Situación actual

- **Certificado**: Certum "Open Source Code Signing in the cloud" (Standard, no EV)
- **Gestión**: SimplySign Desktop (Windows)

### Por qué no está automatizado en CI/CD

El certificado es **cloud-only** y reside en los HSM de Certum — no se puede exportar como `.p12`. El acceso requiere:

1. App móvil SimplySign con TOTP (código de 6 dígitos cada 30s)
2. App SimplySign Desktop en Windows con sesión activa que **expira cada 2h**

Esto hace imposible un pipeline 100% desatendido en GitHub Actions. Las alternativas cloud reales (SSL.com eSigner, DigiCert KeyLocker) tienen coste anual (~$300+) y quedan fuera de alcance por ahora.

### Alcance de la firma manual

- ✅ **Firmado**: `LevanteSetup-X.X.X.exe` (el instalador) — elimina "Unknown Publisher" en el paso crítico
- ❌ **No firmado**: `Levante.exe` interno de la app (requeriría integración en build)

> Nota: SmartScreen de Windows seguirá apareciendo inicialmente (certificado Standard), y la advertencia desaparecerá gradualmente según el volumen de descargas acumule reputación.

---

## Flujo para sacar una release firmada (main → producción)

### 1. Disparar la release sin auto-publicar

Desde `main`, en lugar del flujo normal:

```bash
bash scripts/release.sh --no-ci-wait
```

El flag `--no-ci-wait` es **crítico** — deja el release en **draft** cuando el CI termine, sin publicarlo. Esto nos da la ventana para firmar antes de que los usuarios lo vean.

### 2. Esperar a que el CI termine

Monitorizar en GitHub Actions hasta que el workflow `Release Build & Publish` haya subido todos los artefactos al draft release.

### 3. Descargar el instalador Windows

```bash
gh release download vX.X.X --pattern "*Setup*.exe" --dir ./sign-tmp
```

### 4. Firmar el instalador en Windows

En una máquina Windows con SimplySign Desktop:

1. Abrir SimplySign Desktop → login con email + TOTP desde la app móvil
2. Confirmar que el certificado aparece en "Manage certificates → Certificate list"
3. Abrir una terminal y ejecutar:

```cmd
signtool sign /n "<COMMON_NAME_DEL_CERTIFICADO>" /tr http://time.certum.pl /td sha256 /fd sha256 /v LevanteSetup-X.X.X.exe
```

> Reemplazar `<COMMON_NAME_DEL_CERTIFICADO>` por el "Subject" que muestra SimplySign Desktop en la lista de certificados.

Verificar que la firma es válida:

```cmd
signtool verify /pa /v LevanteSetup-X.X.X.exe
```

### 5. Resubir el instalador firmado

```bash
gh release upload vX.X.X LevanteSetup-X.X.X.exe --clobber
```

El flag `--clobber` sobrescribe el `.exe` sin firmar.

### 6. Publicar el release

```bash
gh release edit vX.X.X --draft=false --latest
```

---

## Betas (develop)

Los releases beta (`v*-beta.*`) **no se firman**. Son para testeo interno y el coste de firmar manualmente cada beta no compensa. Usar el flujo normal sin `--no-ci-wait`.

---

## Migración futura

Cuando el proyecto justifique el coste, migrar a **SSL.com eSigner** (certificado EV + firma cloud desatendida):

- GitHub Action oficial: `ssl-com/esigner-codesign`
- Reputación SmartScreen inmediata desde el primer release
- CI/CD 100% automatizado

Integrar directamente en `forge.config.js` (maker NSIS) y añadir los steps correspondientes en `.github/workflows/release.yml` y `beta-release.yml`.
