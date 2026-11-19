# Note tecniche — Ink Gallery

## Perché il portale è scritto in codice

Il brief chiede di non usare simulazioni di fluidi. Il portale è un unico campo di distanza in GLSL, calcolato in raymarching:
- **anello:** il bordo interno resta un cerchio perfetto, mentre la massa esterna è organica;
- **gocce:** cinque gocce in orbita si fondono e si separano dall'anello con una smooth union;
- **lago:** un piano analitico con increspature, che riflette anello e membrana.

La **membrana** è un piano opaco a z = 0, con un vortice in fbm e filamenti di luce. Con lo scroll si apre un'apertura dal bordo liquido. L'apertura campiona la galleria, già renderizzata in una render target, con distorsione a lente.

Prestazioni del portale:
- il raymarching resta dentro un box attorno all'anello (72 passi);
- il riflesso secondario è limitato a 36–40 passi;
- il portale parte al 65% della risoluzione del canvas su mobile (prima 45%) e al 60% su desktop;
- con margine stabile sale fino al 100% su mobile e al 72% su desktop; sui dispositivi lenti può scendere fino al 35%;
- posizione e raggio delle cinque gocce si calcolano una volta per fotogramma sulla CPU, mantenendo le stesse orbite. Lo shader riusa questi valori in tutti i passi primari, nelle normali e nei riflessi.

## Percorso circolare

`scroll.ts` sostituisce lo scroll nativo con un valore virtuale illimitato, in schermate:
- **rotella:** delta normalizzati;
- **touch:** movimento diretto, con inerzia al rilascio;
- **tastiera:** frecce, PagSu/PagGiù, spazio.

La regia ne prende il modulo sulla lunghezza del giro, `TOTAL_LEN` = 2 (portale) + 10 (galleria) + 2,8 (ascesa). Lo smorzamento lavora sul valore non ridotto, così il passaggio dalla fine all'inizio non torna indietro attraverso il percorso.

Il punto di giunzione è costruito perché due fotogrammi coincidano:
1. **Salita.** Dopo la Custode, la camera passa sul volto e ruota di 90° verso l'alto.
2. **Allineamento.** La camera si porta sull'asse dell'oculo, un anello orizzontale d'inchiostro con membrana. Da lì sale con un ease-out che si ferma.
3. **Quota dell'oculo.** In `Gallery.setSize` l'oculo è messo alla quota in cui, a fine salita, il suo raggio a schermo è uguale a quello del cerchio dell'hero:
   - galleria: `R / (d · tan(fov/2))`;
   - portale: `RR · fl / (z · k)`, dove `k` è la correzione per gli schermi verticali.
   Su schermi verticali l'oculo sale (~29 m invece di ~21 m).
4. **Dissolvenza.** Durante la salita il portale è renderizzato con la camera arretrata (`uDist`). La sua distanza è calcolata ogni fotogramma perché l'anello abbia a schermo la stessa misura dell'oculo. Il composito dissolve galleria → portale.
5. **Rientro dell'hero.** Lago, parete e luce del portale tornano con `uVeil`. Il titolo PERFECT CIRCLE rientra dai lati.

A fine giro tutti gli uniform valgono come a scroll 0. Anche la rivelazione dei tatuaggi è funzione della posizione, quindi a ogni giro si ridisegnano.

## Pipeline di rendering

1. Galleria → `rtGallery` (HalfFloat, MSAA 4 su desktop), solo quando serve.
2. Portale → `rtPortal` (HalfFloat, risoluzione adattiva), solo quando serve.
3. Composito (dissolvenza con sorgenti ripulite) → bloom → pass finale:
   - aberrazione cromatica e distorsione;
   - tonemapping ACES;
   - grading;
   - vignetta e grana.

La **qualità adattiva** misura il frame time ogni ~0,9 s, separando portale, galleria e transizione. Sotto ~34 fps abbassa soltanto la risoluzione di una scena effettivamente renderizzata; sopra ~57 fps per due finestre consecutive la rialza. Le risoluzioni sono limitate esplicitamente: portale minimo 35%, galleria 60–100%. I cambi scena e le pause lunghe azzerano i campioni, per evitare che una pausa della scheda abbassi la qualità. La soglia di riduzione conserva quella precedente, senza penalizzare il dettaglio nelle transizioni più pesanti che già girano fluidamente.

Il ridimensionamento adattivo modifica solo i render target delle scene: non rialloca il compositore/bloom e non ricrea il percorso della camera. Il compositore non ha un depth buffer, perché lavora su immagini 2D. Il composito campiona entrambe le sorgenti solo durante la dissolvenza, conservando la protezione dai NaN.

Il loader prepara entrambe le scene con `compileAsync` e riscalda anche i pass finali prima di abilitare l'ingresso. Mentre aspetta la scelta dell'utente, il rendering nascosto è sospeso. I caricamenti già annullati vengono fermati ai confini asincroni, evitando il doppio caricamento iniziale in Strict Mode. Durante l'animazione si riusano gli oggetti temporanei e si aggiornano le variabili CSS solo quando cambiano. Luci, materiali, effetti, grana filmica, layout e temporizzazione dell'intro restano invariati.

Misure su Intel UHD Graphics (D3D11), 1600×900, Chrome headless con GPU:

| Fase | fps |
| --- | --- |
| Hero | 60 |
| Attraversamento | 35–47 |
| Galleria | 41–60 |
| Ascesa e ritorno | 56–60 |

Su 390×844 l'esperienza resta a 60 fps sulla stessa GPU. Un telefono reale non è stato misurato.

Le misure sopra sono quelle storiche. Per il confronto del 18 novembre 2026, con formato mobile **390×844 e DPR 3** (canvas sempre limitato a DPR 1,25), vedere i report e le schermate in `docs/performance/`. Il benchmark registra risoluzione effettiva, fps e percentili dei tempi dei fotogrammi. Esegue anche controlli di ridimensionamento e ritorno circolare nelle due direzioni. Le misure di sviluppo su GPU desktop non simulano potenza, temperatura o memoria di un telefono: Safari iOS e Android reali restano da provare.

```sh
node scripts/benchmark.mjs docs/performance/check-mobile --mobile
node scripts/benchmark.mjs docs/performance/check-desktop
node --test scripts/quality.test.mjs # Node 24+, nessuna dipendenza aggiunta
```

I sei test unitari coprono isolamento delle scene, limiti delle risoluzioni, recupero graduale, pause della scheda, stabilità delle transizioni e recupero anche sotto carico molto elevato (3 fps simulati). Il benchmark richiede il dev server su `http://127.0.0.1:3000` e Chrome/Edge locale. `--check-only` esegue soltanto rotazione/ridimensionamento e ritorno circolare.

Nel confronto finale mobile: hero a 60 fps con target 463×1002 (prima 351×760, circa il 74% di pixel in più), attraversamento a 56,4 fps, galleria e ritorno a 60 fps. I valori desktop variano tra le esecuzioni e non costituiscono una misura isolata dello shader. Per controllarlo si è quindi alternata la formula originale delle gocce con quella ottimizzata **nella stessa sessione**, a tempo, scena e risoluzione fissi, usando `EXT_disjoint_timer_query_webgl2`: mediane GPU 20,64 e 24,44 ms con l'ottimizzazione, 25,97 e 25,82 ms con l'originale. Il risultato completo è in `docs/performance/gpu-comparison.json`; riguarda il costo GPU della scena di attraversamento, non gli fps di un telefono.

Riferimenti API: [compilazione asincrona](https://threejs.org/docs/pages/WebGLRenderer#compileAsync) e [dimensionamento del compositore](https://threejs.org/docs/pages/EffectComposer#setSize).

## Modelli

Tutte le opere sono scansioni SMK in GLB Draco, per ~2 MB in totale. Busti e statua hanno un profilo per fasce (`statues.json`). Le coordinate dei tatuaggi sono state lette da viste ortografiche con griglia metrica, renderizzate in Blender lungo la direzione di proiezione. La testa del David è proiettata a 0,7 rad, cioè frontale al volto, e la statua è ruotata dello stesso angolo verso la camera.

## Tatuaggi

- **Disegno.** I disegni sono in `statueTattoos.ts`. Si disegnano in metri, nelle coordinate di una carta locale della pelle (vedi sotto), con una trasformazione del canvas. Le primitive di `tattoo.ts` non dipendono dall'unità.
- **Repertorio:**
  - Costanza: fasi lunari lungo le clavicole, cerchio sullo sterno, girocollo sottile;
  - Antinoo: sole blackwork con scritta in negativo, rombi sulle clavicole;
  - Nefertiti: collare usekh, anelli al collo, fregio della corona (oro su pietra nera);
  - il gigante: serpente a scaglie avvolto attorno al collo;
  - la Custode: mandala sullo sterno, lampadario di gocce, colonna fino all'ombelico, girocollo a punte;
  - coro: un solo segno ciascuno, al collo o sotto la gola.
  Nessun segno sui volti.
- **Proiezione:**
  - statue: fino a tre carte locali per opera (`InkChart`). Ogni carta è uno stencil appoggiato sulla pelle: punto d'appoggio sulla superficie (sterno, gola, corona), normale media attorno e raggio del cilindro che segue la sezione orizzontale del corpo, tutti stimati dalla mesh al caricamento (`anchorChart`). Nello shader la coordinata orizzontale è la lunghezza d'arco attorno a quel cilindro, quella verticale la quota: il disegno si srotola su collo, petto e spalle invece di stirarsi ai lati. I colli usano un giro completo. L'inchiostro si ferma dove la superficie si allontana dal cilindro (altre parti del corpo) o gli volge le spalle;
  - torsi: cilindrica.
- **Texture.** Le maschere sono texture R8 (un quarto della memoria di una RGBA) con mipmap. Su schermi piccoli la risoluzione scende al 75%.
- **Rivelazione:**
  - ogni opera arriva in marmo intatto: il disegno parte da solo ~0,65 s dopo che è inquadrata (camera sulla sua stazione, opera dentro lo schermo) e si completa in ~2,5 s, propagandosi sulla superficie dal punto d'appoggio della prima carta; il cursore che la sfiora lo fa partire subito da quel punto;
  - il fronte emette un bagliore ambrato (`uGlowCol`), che si vede in bloom come un ago caldo;
  - Nefertiti ha marmo nero e inchiostro d'oro metallico.
- **Veste della Custode.** È inchiostro liquido lucido (`uDressY`) che risale con viticci animati.

## Luci

- **Pool.** Un pool di 5 spot viene riassegnato ogni frame alle opere più vicine alla camera. Il numero di luci resta costante, quindi gli shader non si ricompilano.
- **Luci fisse.** Coro e rotonda hanno luci fisse. Nella rotonda ci sono uno spot principale con ombre e una luce lunare dall'oculo.
- **Coni volumetrici.** Sono mesh additive.
- **Mappa d'ambiente.** È una PMREM generata da una stanza con softbox e strisce: dà agli anelli, alla veste e all'oro riflessi lunghi.

## Schermi verticali

Ogni stazione può avere:
- `lift`: spostamento verticale dell'inquadratura con `setViewOffset`; il soggetto sale e la didascalia ha spazio sotto, mentre la camera arretra un poco;
- `mpos` / `mlook`: posizione e sguardo alternativi, interpolati dal formato.

Didascalie e navigazione hanno un layout dedicato sotto i 760 px.

## Problemi risolti e da ricordare

- Su ANGLE/D3D11:
  - `smoothstep` con estremi invertiti non è definito: si usa `1.0 - smoothstep(a, b, x)`;
  - `pow` di un valore appena negativo dà NaN: il bordo aperto dei coni di luce lasciava una riga tratteggiata nera, ora gli argomenti sono limitati con `clamp`.
- Il composito ripulisce ogni sorgente con `min/max` prima della dissolvenza: `0 * NaN = NaN` contaminava l'immagine attraverso il bloom.
- In three r187:
  - `iridescenceThicknessRange` genera NaN;
  - `PCFSoftShadowMap` è stato rimosso; si usa `PCFShadowMap`.
- La rotonda ha l'ingresso verso la navata (+Z). Con l'apertura sul lato sbagliato, la camera attraversava una parete.

## Limiti e prossimi passi

- **Contenuti dello studio.** Le opere reali vanno inserite come fotografie autorizzate, al posto delle tavole flash o accanto alle statue.
- **Audio.** Il drone generativo è un segnaposto per un sound design vero.
- **Accessibilità:**
  - lo scroll virtuale funziona con la tastiera, ma non c'è una versione statica per dispositivi senza WebGL2;
  - con `prefers-reduced-motion` lo smorzamento è più rapido.
- **Verifiche mancanti.** Va provato su telefoni reali, iOS Safari in particolare: inerzia del touch e memoria GPU.
