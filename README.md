# ¿Dónde cae?

Juego diario de física para navegador. Cada día, cinco experimentos: **Equilibrio**, **¿Dónde cae?**, **¿Cuál llega antes?**, **Carambola** y **¿Aguanta?**. Todo el mundo juega el mismo reto y comparte su resultado con cuadros de colores.

## Cómo funciona

- **El navegador no simula, reproduce.** Un script genera y simula cada reto una vez, lo filtra para que sea justo y guarda las trayectorias en `public/days/AAAA-MM-DD.json`. Así todos ven exactamente lo mismo en cualquier móvil.
- **El reto depende solo de la fecha.** Regenerar un día produce el mismo resultado. Por defecto el generador no toca los días que ya existen.
- **Dificultad por día de la semana:** lunes y martes suaves, de miércoles a viernes medios, sábado y domingo los más duros.
- **La carrera rota de formato** cada día: curvas, objetos (canica, rueda, aro, hielo) y terrenos con arena.
- **La web es estática:** `public/` se puede subir a cualquier hosting gratuito. No hay servidor ni base de datos.

```
config.json              nombre, fecha de lanzamiento (reto #1) y zona horaria
scripts/rounds.mjs       los cinco experimentos: física y filtros de calidad
scripts/generate.mjs     crea los archivos de cada día
scripts/validate.mjs     comprueba que los días están completos
scripts/serve.mjs        servidor local para probar
public/                  la web: index.html, styles.css, game.js y days/
.github/workflows/       generación automática cada noche
```

## Probar en tu ordenador

Necesitas [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm run generate          # crea los retos de los próximos 30 días
npm run dev               # abre http://localhost:5173
```

Para jugar otro día: `http://localhost:5173/?d=2026-10-25`.

Otras opciones del generador:

```bash
node scripts/generate.mjs --days 60                      # dos meses
node scripts/generate.mjs --from 2026-12-01 --days 7     # desde una fecha
node scripts/generate.mjs --force                        # rehacer días existentes (¡cuidado con los ya jugados!)
npm run validate                                         # revisar que todo esté bien
```

## Publicarlo en internet (Cloudflare Pages, gratis)

1. **Crea un repositorio en GitHub** y sube esta carpeta tal cual (incluida `public/days`).
2. **Cloudflare Pages:** en [dash.cloudflare.com](https://dash.cloudflare.com) entra en *Workers & Pages → Create → Pages → Connect to Git* y elige el repositorio.
   - Framework preset: *None*
   - Build command: `npm run validate`
   - Build output directory: `public`
3. **Dominio:** en el proyecto de Pages, *Custom domains*, añade el tuyo cuando lo tengas. Mientras tanto tendrás una dirección `*.pages.dev`.
4. **Generación automática:** el workflow `.github/workflows/generar-retos.yml` se ejecuta cada noche, genera los días que falten hasta 30 por delante, los valida y hace commit. Cloudflare detecta el commit y publica solo.
   - En GitHub: *Settings → Actions → General → Workflow permissions* → marca *Read and write permissions*.
   - Para lanzarlo a mano: pestaña *Actions → Generar retos → Run workflow*.

Si prefieres GitHub Pages en lugar de Cloudflare, funciona igual sirviendo la carpeta `public/`.

## Cambiar cosas

- **Fecha del reto #1:** `launch` en `config.json`. El número de reto se calcula desde ahí.
- **Dificultad o formatos:** `LEVEL_BY_WEEKDAY` y `RACE_FORMATS` en `scripts/generate.mjs`.
- **Física y filtros de cada experimento:** `scripts/rounds.mjs`. Cada `genX` explica qué escenas descarta.
- **Puntuación y textos:** `scoreRound` y `PROMPTS` en `public/game.js`.
- **Probar un cambio en la física sin estropear días ya jugados:** genera en fechas futuras con `--from` y `--force`, nunca sobre el pasado.

## Pendiente para próximas fases

- Estadísticas globales ("el 34% acertó") y enlace de reto a un amigo: necesitan un pequeño servidor.
- Imagen de vista previa por día para WhatsApp.
- Las respuestas viajan dentro del JSON del día; quien abra las herramientas de desarrollador puede verlas. Para el lanzamiento no importa; más adelante se servirán solo tras responder.
- Anuncios: en España requieren aviso de cookies y consentimiento (RGPD).
