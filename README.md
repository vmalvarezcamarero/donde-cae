# Physle

Juego diario de física, en inglés. Cada día, cinco experimentos: **Balance**, **Where will it land?**, **Which finishes first?**, **Bank shot** y **Will it stand?**. Dos intentos al día, cuentas con Google o email y rankings diario, semanal y por países.

## Cómo funciona

- **Dos retos por día.** El intento 1 es el reto común (A) y el intento 2 es otro reto distinto de la misma dificultad (B). En el ranking cuenta tu mejor intento del día.
- **El servidor puntúa.** Los retos con sus respuestas están en `public/days/`, pero el servidor bloquea su descarga. El navegador solo recibe la escena; envía su predicción y recibe el resultado y la animación.
- **Sin cuenta se puede jugar**, pero esas partidas no entran en el ranking. Los intentos se cuentan por cuenta **y** por dispositivo, para que nadie practique sin cuenta y luego juegue con ventaja.
- **Ranking:** diario (mejor intento del día), semanal (suma de lunes a domingo) y por países (media de sus jugadores). Se puede filtrar por país.
- **Dificultad:** lunes y martes fácil, de miércoles a viernes media, sábado y domingo difícil.

```
config.json                nombre, fecha del reto #1 y zona horaria
wrangler.jsonc             configuración de Cloudflare (base de datos, Firebase)
src/worker.js              servidor: API, puntuación, intentos, cuentas, rankings
migrations/0001_init.sql   tablas de la base de datos
scripts/rounds.mjs         los cinco experimentos: física y filtros de calidad
scripts/generate.mjs       crea los retos A y B de cada día
scripts/validate.mjs       comprueba que los retos estén completos
public/                    la web: index.html, app.js (cuentas y pantallas),
                           game.js (el juego), scoring.js (puntuación),
                           privacy.html, firebase-config.js, days/
.github/workflows/         genera retos nuevos cada noche
```

## Puesta en marcha (una sola vez)

### 1. Firebase: las cuentas

1. Entra en [console.firebase.google.com](https://console.firebase.google.com) y crea un proyecto llamado `physle`. Analytics no hace falta.
2. **Compilación → Authentication → Comenzar**. En *Método de acceso*, activa **Google** y **Correo electrónico/contraseña**.
3. En **Authentication → Configuración → Dominios autorizados**, añade `donde-cae.vmalvarezcamarero.workers.dev` y, más adelante, tu dominio propio.
4. **Configuración del proyecto (rueda) → General → Tus apps → icono web `</>`**. Registra la app como `physle` y copia los valores de `firebaseConfig` en `public/firebase-config.js`.
5. Copia el **ID del proyecto** (por ejemplo `physle-1a2b3`) en `wrangler.jsonc`, en `FIREBASE_PROJECT_ID`.

### 2. Cloudflare D1: la base de datos

1. En el panel de Cloudflare: **Storage & databases → D1 SQL database → Create**. Nómbrala `physle`.
2. Copia el **Database ID** en `wrangler.jsonc`, en `database_id`.
3. Abre la base de datos → pestaña **Console**. Pega el contenido de `migrations/0001_init.sql` y pulsa **Execute**.

### 3. Subir a GitHub

Sube todos los archivos al repositorio y sobrescribe los anteriores. **No subas** `.dev.vars` ni las carpetas `node_modules` y `.wrangler`. Cloudflare despliega solo en cada cambio.

En el proyecto de Cloudflare (**Settings → Build**) los comandos deben ser:
- Build command: vacío
- Deploy command: `npx wrangler deploy`

### 4. Completa la política de privacidad

En `public/privacy.html`, sustituye `[YOUR FULL NAME]` y `[YOUR CONTACT EMAIL]` (aparece dos veces). La edad mínima para crear cuenta es 16 años, la más exigente del RGPD en la UE, para que valga en todos los países.

## Probar en tu ordenador

Necesitas [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm run db:local          # crea la base de datos local
npm run dev               # http://localhost:8787
```

En local puedes simular una cuenta sin Firebase: `http://localhost:8787/?testuser=ana`. Para eso crea un archivo `.dev.vars` con la línea `ALLOW_TEST_AUTH=1`. Esto **nunca** funciona en producción.

## Tareas habituales

```bash
node scripts/generate.mjs --days 60                    # generar más días
node scripts/generate.mjs --from 2026-12-01 --days 7   # desde una fecha
npm run validate                                       # comprobar los retos
```

- **Cambiar la fecha del reto #1:** `launch` en `config.json`. Después regenera los días futuros con `--force`.
- **Puntuación:** `public/scoring.js`. La usan el servidor y la web.
- **Número de intentos:** `MAX_ATTEMPTS` en `src/worker.js`. Ya está preparado para un tercer intento a cambio de ver un vídeo.
- **Nombres prohibidos:** lista `BANNED` en `src/worker.js`.
- **Dominio propio** (por ejemplo `physle.com`): cómpralo, y luego en Cloudflare entra en el proyecto → **Domains → Add Domain**. Añádelo también a los dominios autorizados de Firebase.

## Pendiente

- Tercer intento viendo un anuncio. En la web, la opción habitual es la *Ad Placement API* de Google (AdSense para juegos); requiere aviso de cookies y consentimiento.
- Imagen de vista previa por día para compartir.
- Moderación de nombres más completa.
