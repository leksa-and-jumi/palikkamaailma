# CLAUDE.md

Tämä repo kuuluu Julius (7 v) ja Leo (10 v) -veljesten pelistudioon (GitHub-organisaatio `leksa-and-jumi`). Vanhempi valvoo aina istuntoja.

**Palikkamaailma** on 3D-palikkapeli (Minecraft-tyylinen), jossa rakennetaan yhdessä saarella. Moninpeli toimii maailmakoodilla, ja ✨ taikarakentaja (tekoäly) rakentaa sen, mitä pojat kirjoittavat. Pojat päättävät pelin säännöt, palikat, hahmot ja uudet ominaisuudet.

## Näin puhut pojille

- **Aina suomeksi**, lyhyesti ja kannustavasti. Emojit auttavat (🧱✨🏰).
- Julius ei välttämättä lue vielä sujuvasti: vanhempi voi lukea viestit ääneen.
- **Vain pojille**: ei git-, PR- tai tekniikkapuhetta. Tekniikka hoidetaan hiljaa.
- Kysy **yksi asia kerrallaan**, 2–4 vaihtoehtoa emojeineen + "✨ keksi oma".
- Jos vanhempi kysyy jotain suoraan, vastaa hänelle lyhyesti.

## Turvallisuus (älä riko näitä)

- Pelaajat ovat eläimiä (`AVATARS` tiedostossa `src/config.ts`): **ei nimiä, ikää, kuvia tai muita henkilötietoja** peliin, Convexiin tai huonepalvelimelle.
- **Ei chattia** eikä vapaata tekstiä pelaajalta toiselle. Ei julkista maailmalistaa: maailmaan pääsee vain koodilla. Ei mainoksia, seurantaa tai ostoja.
- Huonepalvelin hyväksyy vain sallitut sivut (`ALLOWED_ORIGINS` tiedostossa `wrangler.jsonc`) ja tarkistaa jokaisen viestin (`src/logic/protocol.ts`).
- Taikarakentajan tekoäly palauttaa **vain muotoja** (JSON), ei tekstiä, jota näytettäisiin pojille. Kehote rajattu 60 merkkiin ja nopeusraja per maailma (`BUILDER` configissa).
- Älä koskaan commitoi salaisuuksia: `.env.local` ja `.dev.vars` ovat gitignoressa. Avaimia ei tulosteta.

## Tekniikka

- **TypeScript (strict) + Vite + Three.js** (ei Phaser: peli on 3D).
- **Cloudflare Worker + Durable Objects** (`worker/index.ts`): jokaisella maailmakoodilla oma huone, joka tallentaa muutetut palikat SQLiteen ja välittää liikkeet WebSocketilla (hibernation API).
- **Convex** (`convex/`): maailmakoodit (`worlds`), taikarakentaja (`builder.build` -action kutsuu OpenRouteria) ja sen nopeusraja (`builds`). HTTP `/world?code=` kertoo huonepalvelimelle, onko koodi oikea.
- **OpenRouter**: oletusmalli `anthropic/claude-haiku-5.5`, vaihdettavissa Convexin env-muuttujalla `OPENROUTER_MODEL`. Ilman avainta taikarakentaja käyttää valmiita rakennuksia (`src/logic/blueprints.ts`).
- Rakenne:
  - `src/config.ts` – kaikki vakiot. Puhdas tiedosto, jota myös worker ja Convex käyttävät.
  - `src/logic/` – puhdas logiikka: palikat, maasto, maailma, mesher, fysiikka, raycast, protokolla, koodit, muodot. **Jokaisella logiikkatiedostolla on testi.**
  - `src/render/` – Three.js: maailman piirto, tekstuurit (piirretty koodilla), muiden pelaajien hahmot.
  - `src/net/` – huoneyhteys (WebSocket) ja Convex-asiakas. `src/ui/` – HUD ja ohjaus. `src/data/` – localStorage.
  - `worker/` – huonepalvelin. `convex/` – skeema ja funktiot; `convex/_generated` commitoidaan.
- Uusi palikka: lisää id ja rivi `src/logic/blocks.ts`:ään (älä koskaan muuta vanhoja id:itä), tekstuurin nimi `TILE_NAMES`iin ja piirtäjä `src/render/textures.ts`:ään.
- Maailma on 192 × 192 × 64 palikkaa (saari). Sama koodi antaa aina saman saaren (`seedFromCode`), joten vain muutokset tallennetaan.

## Ympäristömuuttujat

`.env.local` (pohja `.env.example`):

| Muuttuja                 | Mihin                                                                  |
| ------------------------ | ---------------------------------------------------------------------- |
| `CONVEX_DEPLOY_KEY_DEV`  | `npm run convex:dev` (dev-deployment)                                  |
| `CONVEX_DEPLOY_KEY_PROD` | `npm run convex:deploy` + GitHub-secret `CONVEX_DEPLOY_KEY`            |
| `VITE_CONVEX_URL`        | Convex-URL paikallista `npm run dev`:iä varten                         |
| `CLOUDFLARE_API_TOKEN`   | `npm run room:deploy` + GitHub-secret                                  |
| `CLOUDFLARE_ACCOUNT_ID`  | `npm run room:deploy` + GitHub-secret                                  |
| `VITE_ROOM_URL`          | Huonepalvelin (paikallisesti `http://localhost:8788`)                  |
| `OPENROUTER_API_KEY`     | Vain varmuuskopio: oikea paikka on Convexin env (`npx convex env set`) |

Paikallinen huonepalvelin lukee `.dev.vars`-tiedostosta `CONVEX_SITE_URL`:n (Convexin `.convex.site`-osoite).

GitHub Actions -deploy käyttää secretejä `CONVEX_DEPLOY_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` ja repo-muuttujaa `ROOM_URL`. Puuttuvat osat ohitetaan, ja peli toimii silti (yksinpeli + valmiit rakennukset).

## Kehitysputki (aina sama)

1. Idea → GitHub issue (otsikko englanniksi, kuvaus poikien omin sanoin suomeksi).
2. Uusi haara mainista: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
3. Pienet commitit, Conventional Commits englanniksi.
4. PR pohjan mukaan: tekninen kuvaus englanniksi + osio **Pojille**. `Closes #n`.
5. `npm run check` ja `npm run build` paikallisesti. CI:n pitää olla vihreä.
6. Pojat kokeilevat ja sanovat "hyvä". Vasta sitten **squash merge** ja haaran poisto.
7. `main` on suojattu. Merge julkaisee automaattisesti (Pages + Worker + Convex).

## Testaus selaimessa

- Studion juuren `.claude/launch.json`: `palikkamaailma` (portti 5178). Käynnistä lisäksi `npm run dev:room` (8788) ja Convex.
- Automaattiselaimessa hiiren lukitus ei toimi: kehitystilassa `window.__game()` antaa pelin, jolla voi testata (`paused = false`, `breakBlock()`, `magicBuild('linna')`).
- Taustalla oleva välilehti ei piirrä ruutuja (rAF pysähtyy): tuo välilehti eteen tai ota kuvakaappaus.

## Komennot

| Komento                 | Mitä tekee                                |
| ----------------------- | ----------------------------------------- |
| `npm run dev`           | Peli kehityspalvelimelle                  |
| `npm run dev:room`      | Huonepalvelin paikallisesti (Wrangler)    |
| `npm run convex:dev`    | Convex dev -synkronointi (dev deploy key) |
| `npm run convex:deploy` | Convex tuotantoon (prod deploy key)       |
| `npm run room:deploy`   | Huonepalvelin Cloudflareen                |
| `npm run check`         | Tyypit, lint, muotoilu ja testit          |
| `npm run build`         | Tuotantoversio `dist/`-kansioon           |
