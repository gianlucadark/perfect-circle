# Perfect Circle — Ink Gallery

Esperienza WebGL per Perfect Circle Tattoo Studio (Terracina). Si parte da un portale d'inchiostro liquido, calcolato in raymarching: lo scroll lo apre e lo attraversa. Oltre il portale c'è un regno di statue tatuate, governato dalla Custode. Alla fine la camera sale verso l'oculo della rotonda e ritrova il cerchio iniziale. Il percorso è un anello senza fine.

![Percorso completo](docs/previews/contact_sheet.png)

## Avvio

Richiede Node.js 22 o superiore.

```sh
npm install
npm run dev        # http://localhost:3000 (su questa macchina la 3000 è occupata: usare -p 3001)
npm run typecheck
npm run build && npm start
```

Le preview si rigenerano con Chrome o Edge locale (headless, GPU reale) e il dev server attivo:

```sh
node scripts/capture.mjs http://localhost:3000 docs/previews
node scripts/capture.mjs http://localhost:3000 docs/previews/mobile --mobile
```

Senza `--at`, lo script fotografa:
- l'hero e l'attraversamento;
- ogni stazione;
- l'ascesa finale.

In sviluppo, `window.__pc.seek(0..1)` porta il percorso a un punto preciso.

## Il percorso

1. **Loader.** Un cerchio d'inchiostro si disegna mentre si caricano gli asset. Poi si sceglie "Entra con il suono" o "in silenzio".
2. **Hero.** L'anello emerge da un lago d'inchiostro. Il vuoto interno è una membrana liquida che il puntatore increspa.
3. **Attraversamento.** La membrana si apre e la camera passa nel cerchio con un dolly-zoom.
4. **Galleria.** Dodici soste:
   - **La Notte** (Michelangelo), sdraiata su un plinto lungo sotto una luce di luna: sulla coscia sollevata una falce con la stella, come quella del suo diadema, e le fasi lunari in fila lungo il femore (fine line e dotwork);
   - **Apollo** del Belvedere, statua intera: il sole nero con la frase dello studio sul plesso solare, sotto la bandoliera, e sul braccio destro un bracciale e raggi blackwork come un'armatura;
   - **Flash**: tavole che si disegnano da sole;
   - **Nefertiti**: pietra nera e inchiostro d'oro, incorniciata dall'anello-soglia;
   - **sala dei corpi**, con i sei torsi;
   - **Il gigante**: la testa del David di Michelangelo. Un serpente black & grey gira dietro la nuca, scende lungo il collo e si chiude attorno a una rosa sulla gola; sul petto, la pietra della fionda con due ali sulle clavicole;
   - **coro** di dodici teste femminili con aureole;
   - **La Custode**: la Venere con la mela di Thorvaldsen come Ritah, la tatuatrice dello studio, dea dell'inchiostro. Ha le braccia, quindi porta i tatuaggi di chi tatua: una manica intera sul braccio sinistro (rose e peonie in negativo su fumo nero, chiusa al polso da un bracciale), un mandala sul dorso della mano, un pezzo di rose e peonie che segue la linea dell'anca destra fino alla coscia. Nella mano destra, al posto della mela, una goccia d'inchiostro liquido: il disegno parte da lì. Seno, pube e volto restano puliti;
   - **Il segno**: la camera gira attorno alla dea dal lato della manica e si ferma sul dorso. Lungo la spina una colonna di perle, un loto e le fasi lunari; alla base della nuca il segno dello studio, un cerchio perfetto.
   Ogni opera arriva in marmo intatto. Il cursore che la sfiora (su touch: un tocco) fissa l'origine del tatuaggio in quel punto e l'inchiostro si propaga sulla superficie della scultura. Se nessuno la tocca, il tatuaggio comincia a disegnarsi da solo un attimo dopo che l'opera è inquadrata (~0,65 s). I tatuaggi seguono la forma del corpo: sono stencil srotolati sulla superficie, non proiezioni piatte. Ogni opera ha la sua luce: temperatura, taglio e fascio diversi.
5. **Ascesa e ritorno.**
   - Dal dorso la camera sale lungo la spina fino al cerchio sulla nuca e guarda in alto, nel pozzo della rotonda: il cerchio della pelle, poi l'oculo, poi il portale.
   - Dopo «Il cerchio si chiude», dentro l'oculo compare l'invito finale: «Ogni corpo è un'opera. La prossima potrebbe essere la tua.» con il pulsante *Prenota una consulenza* (link in `CTA_CAPTION.href`, `src/components/three/engine/stations.ts`).
   - L'oculo ha la stessa misura a schermo del cerchio iniziale, quindi una dissolvenza lo trasforma nel portale dell'hero.
   - Il giro ricomincia senza stacchi, anche scorrendo all'indietro.

Ogni tatuaggio si disegna mentre la camera arriva: un fronte d'inchiostro avanza con un bagliore ambrato, come un ago caldo.

## Struttura

- `src/app/`: layout (font Cormorant Garamond e Inter via `next/font`), pagina e stili.
- `src/components/InkGallery.tsx`: overlay UI (loader, nav, hero, didascalie con titoli a cascata, cursore, misuratore) e montaggio del canvas.
- `src/components/three/Experience.tsx`: Canvas di React Three Fiber. Il rendering è affidato alla regia (`useFrame` con priorità 1).
- `src/components/three/engine/`:
  - `Engine.ts`: regia, linea del tempo circolare, composito, qualità adattiva.
  - `scroll.ts`: scroll virtuale senza fine (rotella, touch con inerzia, tastiera).
  - `stations.ts`: soste, testi, inquadrature per schermi verticali, lunghezze del percorso.
  - `gallery.ts`: architettura, opere, luci a pool, rotonda con oculo e pioggia, camera dell'ascesa.
  - `statueTattoos.ts`: tatuaggi delle statue, disegnati in metri su carte locali della pelle.
  - `davidTattoo.ts`: il pezzo grande del gigante;
  - `ritahTattoos.ts`: la Custode (Ritah), cioè messa in scena, inchiostro liquido della mela e sei carte: avambraccio, braccio, mano, fianco, nuca, spina.
  - `inkArt.ts`: primitive black & grey realistiche: rosa, peonia, foglie, serpente a scaglie, piume, sfera, fumo.
  - `torsoTattoos.ts`: tatuaggi dei torsi, su un cilindro il cui asse segue il tronco.
  - `tattoo.ts`: primitive di disegno, tavole flash.
  - `materials.ts`: marmo tatuato, anello liquido, membrana, pavimento a specchio, fasci, tavole flash.
  - `portalShader.ts`: portale in raymarching.
  - `post.ts`: composito e pass finale.
  - `audio.ts`: drone generativo WebAudio.
- `public/models/`: GLB compressi in Draco; [crediti e licenze](public/models/CREDITS.md).
- `public/draco/`: decoder Draco di three.js.
- `scripts/capture.mjs`: cattura delle preview.
- `docs/previews/`: fotogrammi e contact sheet desktop e mobile; [note tecniche](docs/EXPERIENCE_NOTES.md).

## Stato

Tutti i modelli sono scansioni SMK di pubblico dominio: in totale ~2,4 MB di geometria (tre statue intere, busti, teste e torsi). I tatuaggi e le tavole flash sono disegni procedurali e non sono attribuiti all'artista.

Mancano ancora:
- il logo;
- le opere reali dello studio;
- i contatti.

Il file `.blend` della fase 2 e gli script di esportazione sono in `../PerfectCircle/03_blender/`.
