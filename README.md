# 🧱 Palikkamaailma

Palikkapeli, jossa rakennetaan yhdessä loputtomassa maailmassa: metsiä, aavikoita, lumisia vuoria, meriä ja pimeitä luolia, joissa on malmeja ja laavaa. Kaverit pääsevät samaan maailmaan
maailman koodilla (esim. `KALA-PUU-42`). ✨ Taikarakentaja rakentaa linnan, talon tai melkein
mitä vain, kun kirjoitat mitä haluat.

Suunnittelijat: **Julius ja Leo**. Koodi: Claude.

## Näin pelaat

1. Valitse eläin 🦊🐻🐼🐸… ja pelitapa:
   - 🛠️ **Nikkaroija**: kaikki palikat ja tavarat käytössä, voit lentää, et satu.
   - ⚔️ **Selviytyjä**: louhi itse, kerää tavarat, syö ja varo putoamista, laavaa ja hukkumista.
   - Vaikeustaso: 😊 Rauhallinen, 🙂 Helppo, 😐 Normaali tai 😈 Vaikea.
2. **🌍 Uusi maailma** tekee uuden saaren ja koodin. Kerro koodi kaverille!
3. Kaveri kirjoittaa koodin kohtaan **Liity kaverin maailmaan**.
4. **🧍 Pelaa yksin** toimii ilman nettiä, ja saari tallentuu tälle koneelle.

| Näppäin                   | Mitä tapahtuu                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `W` `A` `S` `D`           | liiku                                                                                                                 |
| `Välilyönti`              | hyppää                                                                                                                |
| `Välilyönti` 2 × nopeasti | lennä / lopeta lentäminen                                                                                             |
| `Shift`                   | juokse / laskeudu                                                                                                     |
| vasen hiiri               | riko palikka                                                                                                          |
| oikea hiiri               | laita palikka / syö / ämpäri / avaa työpöytä, uuni tai arkku / käännä vipu / paina nappia / sytytä / laukaise raketti |
| `1`–`9` tai rulla         | valitse palikka                                                                                                       |
| `E`                       | reppu (2 × 2 -nikkarointi) / kaikki tavarat                                                                           |
| `Q` (`Ctrl+Q`)            | pudota yksi (koko pino)                                                                                               |
| `T` tai `Enter`           | chatti                                                                                                                |
| `B`                       | ✨ taikarakentaja                                                                                                     |
| `Z`                       | kumoa taikarakennus                                                                                                   |
| `R`                       | käännä taikarakennusta                                                                                                |
| `Esc`                     | tauko                                                                                                                 |

## Eläimet

Niityillä ja metsissä asuu possuja, lehmiä, kanoja ja lampaita. Jokaisella on oma nimi ja luonne: utelias tulee katsomaan, arka pysyy kaukana, laiska löhöää ja leikkisä hyppii. Kun katsot eläintä, näet sen nimen ja sydämet.

- Pidä kädessä **vehnää** (lehmä, kana, lammas) tai **omenaa** (possu), niin eläin seuraa sinua.
- Ruoki kahta samanlaista eläintä (oikea hiiri), niin ne saavat vauvan 💕
- Kana munii välillä munan.

## Nikkarointi

Reseptit ovat samat kuin Minecraftissa:

- **Puunrunko** → 4 lankkua · **2 lankkua päällekkäin** → 4 keppiä · **4 lankkua** → työpöytä
- **Työpöydällä** (oikea hiiri) 3 × 3: hakut, kirveet, lapiot, miekat, kuokat, haarniskat, uuni (8 mukulakiveä), arkku (8 lankkua), soihdut (hiili + keppi), ämpäri, jousi, nuolet, kirjat, kirjahylly, lumouspöytä…
- **Uuni**: raakarauta → rautaharkko, hiekka → lasi, mukulakivi → kivi, liha → paistettu liha, puu → puuhiili. Polttoaineeksi hiili, puu tai laavaämpäri. Uuni toimii, vaikka et katsoisi!
- **Arkku**: 27 paikkaa tavaroille. Rikottu arkku pudottaa tavarat maahan.

## ⚡ Punakivi, 💥 dynamiitti ja 🎆 ilotulitteet

Repun välilehdillä **⚡ Punakivi** ja **🎆 Ilotulitteet** (Nikkaroija-tilassa):

- **Punakivipöly** kuljettaa virtaa 15 palikan päähän ja nousee portaita ylös ja alas.
- **Vipu** (päälle/pois) ja **nappi** (päällä hetken) antavat virtaa. **Punakivipalikka** antaa aina.
- **Punakivisoihtu** antaa virtaa, mutta sammuu, kun sen alla olevaan palikkaan tulee virtaa (NOT-portti). Liian nopea vilkutus polttaa sen hetkeksi.
- **Punakivilamppu** syttyy virrasta, **rakettilaukaisin** ampuu raketin ja **dynamiitti** syttyy.
- **Dynamiitti** sytytetään myös **tuluksilla**. Se palaa 4 sekuntia ja räjähtää. Viereiset dynamiitit syttyvät ketjuna! Vesi, obsidiaani ja peruskallio kestävät räjähdyksen.
- **Ilotulitusraketit**: tavallinen, iso, tähti, creeper ja sydän. Kaveri näkee sinun rakettisi.

## Turvallisuus

- Pelaajat ovat eläimiä, ei nimiä eikä muita tietoja.
- Chatissa voi jutella saman maailman kavereiden kanssa. Julkista maailmalistaa ei ole: samaan maailmaan pääsee vain koodilla.
- Taikarakentajan tekoäly vastaa vain palikoilla, ei tekstillä.

## Kehittäjälle

```bash
npm install
npm run dev        # peli: http://localhost:5173
npm run dev:room   # moninpelihuoneet: http://localhost:8788
npm run convex:dev # Convex (tai `npx convex dev` ilman tiliä paikallisesti)
npm run check      # tyypit, lint, muotoilu ja testit
```

Tarkemmat ohjeet: [CLAUDE.md](CLAUDE.md).
