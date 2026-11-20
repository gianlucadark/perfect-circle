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
- il portale parte dal livello scelto dalla calibrazione del dispositivo (vedi «Calibrazione e DPR»): tra il 65% e il 100% su mobile, tra il 60% e il 72% su desktop;
- con margine stabile sale fino al 100% su mobile e al 72% su desktop; sui dispositivi lenti può scendere fino al 35%;
- posizione e raggio delle cinque gocce si calcolano una volta per fotogramma sulla CPU, mantenendo le stesse orbite. Lo shader riusa questi valori in tutti i passi primari, nelle normali e nei riflessi.

## Percorso circolare

`scroll.ts` sostituisce lo scroll nativo con un valore virtuale illimitato, in schermate:
- **rotella:** delta normalizzati;
- **touch:** movimento diretto, con inerzia al rilascio;
- **tastiera:** frecce, PagSu/PagGiù, spazio.

La regia ne prende il modulo sulla lunghezza del giro, `TOTAL_LEN` = 2 (portale) + 11 (galleria, 12 soste) + 2,8 (ascesa). L'ultima sosta coincide con l'inizio dell'outro: la sua didascalia resta visibile finché la camera riparte, poi entra «Il cerchio si chiude». Lo smorzamento lavora sul valore non ridotto, così il passaggio dalla fine all'inizio non torna indietro attraverso il percorso.

Il punto di giunzione è costruito perché due fotogrammi coincidano:
1. **Salita.** Dopo il giro attorno alla Custode (sosta frontale, poi il dorso), la camera sale lungo la spina fino al cerchio tatuato alla base della nuca e ruota di 90° verso l'alto.
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

La **qualità adattiva** misura il frame time ogni ~0,9 s, separando portale, galleria e transizione. Sotto ~34 fps abbassa soltanto la risoluzione di una scena effettivamente renderizzata; sopra ~57 fps per due finestre consecutive la rialza. Le risoluzioni sono limitate esplicitamente: portale minimo 35%, galleria 60–100%. I cambi scena e le pause lunghe azzerano i campioni, per evitare che una pausa della scheda abbassi la qualità. Ogni aumento resta sotto osservazione per due finestre: se la media scende sotto ~52 fps si torna al livello precedente, e quel livello non si ritenta più nella stessa fase. Così una scena al limite del vsync non rimbalza fra 60 e 30 fps. La soglia di riduzione conserva quella precedente, senza penalizzare il dettaglio nelle transizioni più pesanti che già girano fluidamente.

Il ridimensionamento adattivo modifica solo i render target delle scene: non rialloca il compositore/bloom e non ricrea il percorso della camera. Il compositore non ha un depth buffer, perché lavora su immagini 2D. Il composito campiona entrambe le sorgenti solo durante la dissolvenza, conservando la protezione dai NaN. Quando una sorgente è più piccola dell'uscita la ingrandisce in Catmull-Rom (5 letture bilineari), limitato al minimo e massimo dei 4 texel vicini, così non compaiono aloni attorno alle luci HDR. A piena risoluzione la lettura resta singola. Il costo misurato è di circa 0,1–0,2 ms a 487×1055.

### Calibrazione e DPR

Il canvas parte dal DPR storico `[1, 1,25]` (`BASE_DPR` in `quality.ts`). Prima di abilitare l'ingresso, mentre il loader è ancora visibile, `Engine.calibrate` misura il dispositivo:
- **cosa misura:** il fotogramma completo di hero, attraversamento e galleria, più i soli pass finali, con una lettura sincrona di un pixel;
- **come separa i costi:** hero e galleria si misurano anche su un quarto dei pixel (viewport di metà lato, senza riallocare). Così si distinguono i costi fissi (ombre, riflesso del pavimento, vertici) da quelli per pixel. Il tempo del thread principale si sottrae, perché non cresce con la risoluzione;
- **riscaldamento:** un giro di riscaldamento e ~200 ms di lavoro continuo fanno uscire la GPU dal risparmio energetico del loader. Poi tre giri misurati, di cui vale il migliore (le interferenze possono solo rallentare). In tutto la calibrazione aggiunge circa mezzo secondo al loader;
- **uscite anticipate:** se un hero misurato supera 50 ms, o se la scheda è nascosta, restano le impostazioni storiche.

`planQuality` (funzione pura, testata) decide:
- **portale:** parte dal livello più alto che sta nel budget dell'hero (75% del fotogramma a 60 Hz). Non scende mai sotto la partenza storica e non sale mai sopra il massimo storico, in risoluzione assoluta;
- **DPR del canvas, solo su telefono:** sale a 1,5, 1,75 o 2 (mai oltre lo schermo) solo se, con i pixel in più, restano nel budget la galleria (80%), l'hero con il portale al massimo storico (75%) e l'attraversamento (90%). Il portale resta alla stessa risoluzione assoluta e nel composito si ingrandisce in bicubico.

A DPR alzato la qualità adattiva è in modalità rigorosa: non adatta nulla e conta i fotogrammi in ritardo (> 1/45 s). Due finestre consecutive con più di un fotogramma su cinque in ritardo, o una con più della metà, riportano il canvas al DPR di base una volta per tutte (`dropDpr`); da lì riprende l'adattamento normale. Un singolo intoppo isolato, come un caricamento di texture o il garbage collector, non conta.

L'aspetto resta identico a qualsiasi DPR:
- **bloom:** lavora sempre alla risoluzione di riferimento, perché sfoca in texel. Il suo passa-alto legge quattro campioni bilineari, che coprono l'impronta di ogni texel anche quando il canvas ha più pixel. Con il rapporto storico 2:1 il risultato coincide con la lettura singola originale;
- **grana filmica:** è calcolata sulla griglia del DPR di riferimento e interpolata fra i pixel, come faceva prima l'ingrandimento del browser;
- **pulviscolo:** i punti, disegnati in pixel, sono scalati sull'altezza della render target della galleria.

In sviluppo `?pcdpr=2` forza il DPR alzato, per confrontare l'aspetto. `window.__pc.calibration` riporta misure e piano.

Misure su Intel UHD (390×844, DPR 3 emulato), con risoluzione del portale a 2,5 s dall'ingresso:
- prima: 341×739, cioè il 65%, poi una salita graduale con oscillazioni (77% a 9 s);
- dopo: 488×1055 subito.

Su questa GPU la calibrazione ha scelto DPR 1,5 in 3 esecuzioni su 4. Con `?pcdpr=2` restano 58–60 fps in hero, attraversamento, galleria, Custode e ascesa; a DPR 3 la rete di sicurezza riporta il canvas a 1,25. I tempi della stessa GPU variano fino al 40% fra un'esecuzione e l'altra, e la calibrazione resta prudente.

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

I test unitari coprono:
- isolamento delle scene e limiti delle risoluzioni;
- recupero graduale e pause della scheda;
- stabilità delle transizioni e recupero anche sotto carico molto elevato (3 fps simulati);
- annullamento degli aumenti che costano fluidità;
- modalità rigorosa a DPR alzato;
- scelte della calibrazione per telefoni veloci, medi e lenti, desktop e misure non valide.

Il benchmark usa Chrome/Edge locale e il dev server su `http://127.0.0.1:3000`, oppure su un altro indirizzo indicato in `PC_URL`. `--check-only` esegue soltanto rotazione/ridimensionamento e ritorno circolare.

Nel confronto finale mobile: hero a 60 fps con target 463×1002 (prima 351×760, circa il 74% di pixel in più), attraversamento a 56,4 fps, galleria e ritorno a 60 fps. I valori desktop variano tra le esecuzioni e non costituiscono una misura isolata dello shader. Per controllarlo si è quindi alternata la formula originale delle gocce con quella ottimizzata **nella stessa sessione**, a tempo, scena e risoluzione fissi, usando `EXT_disjoint_timer_query_webgl2`: mediane GPU 20,64 e 24,44 ms con l'ottimizzazione, 25,97 e 25,82 ms con l'originale. Il risultato completo è in `docs/performance/gpu-comparison.json`; riguarda il costo GPU della scena di attraversamento, non gli fps di un telefono.

Riferimenti API: [compilazione asincrona](https://threejs.org/docs/pages/WebGLRenderer#compileAsync) e [dimensionamento del compositore](https://threejs.org/docs/pages/EffectComposer#setSize).

## Modelli

Tutte le opere sono scansioni SMK in GLB Draco, per ~2,4 MB in totale. Busti e statue hanno un profilo per fasce (`statues.json`). Le tre statue intere (Notte, Apollo, Custode) sono esportate da `pc_export_classics.py` a misura umana, così i tatuaggi si disegnano in centimetri reali, e decimate a 110–150k triangoli. Gli assi degli arti (braccio, avambraccio, coscia, bacino) sono stati misurati con sezioni esatte della mesh (bisect in Blender): il centro di ogni sezione orizzontale sta sull'asse dell'arto. Le coordinate dei tatuaggi sono state lette da viste ortografiche con griglia metrica, renderizzate in Blender lungo la direzione di proiezione. La testa del David è proiettata a 0,7 rad, cioè frontale al volto, e la statua è ruotata dello stesso angolo verso la camera.

## Tatuaggi

- **Disegno.** I disegni sono in `statueTattoos.ts`, `torsoTattoos.ts`, `davidTattoo.ts` e `ritahTattoos.ts`. Si disegnano in metri, nelle coordinate di una carta della pelle (vedi sotto), con una trasformazione del canvas. Le primitive di `tattoo.ts` e `inkArt.ts` non dipendono dall'unità.
- **Black & grey.** Le primitive di `inkArt.ts` lavorano a grigi, non a linee:
  - ogni forma prima ripulisce la pelle sotto di sé, così un fiore disegnato dentro un nero pieno resta in negativo;
  - le rose hanno cinque giri di petali, con un'ombra sotto ogni giro, il bordo arrotolato in luce e il cuore a spirale;
  - `withLine(k, …)` regola il peso dei contorni per un disegno intero. Con k < 0,6 (la Custode usa 0,5: realismo, ma con abbastanza linea da leggersi da lontano) le primitive passano al realismo: contorni quasi invisibili, petali chiari che si scuriscono solo dove si infilano sotto il giro interno, foglie a sfumatura continua con la nervatura in luce, cuore della rosa chiuso e scuro. La forma la danno ombre e luci, non le linee;
  - `smokeCloud` mette un fumo morbido dietro ogni fiore, con un pepe d'ago solo sul bordo: i petali escono dal buio;
  - le squame del serpente sono ciottoli chiari su fondo nero, più chiari sul dorso e scuri sui fianchi, con le macchie romboidali e l'ombra portata;
  - i neri pieni (`blackFill`) hanno il bordo mosso e sfumano in un puntinato.
  Le sfocature del canvas si usano solo per le ombre larghe, perché ogni chiamata ha un costo fisso; i tratti piccoli si sfumano con passate sovrapposte. Le squame e le barbe delle piume sono raggruppate in pochi tracciati. Tra la generazione di un'opera e la successiva il caricamento cede il thread, e il loader continua ad animarsi.
- **Repertorio:**
  - la Notte: sulla faccia esterna della coscia sollevata, una falce con la stella (come quella del diadema) e sette fasi lunari in fila lungo il femore, con un cielo di puntini; lontano dall'inguine;
  - Apollo: sole blackwork con la frase in negativo sul plesso solare, sotto la bandoliera che attraversa il petto e sopra l'ombelico; bracciale (due fasce e triangoli in negativo) sull'omero destro e raggi pieni sull'avambraccio;
  - Nefertiti: collare usekh, anelli al collo, fregio della corona (oro su pietra nera);
  - il gigante: al collo, rosa sulla gola dentro l'ansa di un serpente. Il serpente nasce sul trapezio destro, passa dietro la nuca restando alto (più in basso la pelle scende sul trapezio e la carta non la segue), scende lungo lo sternocleidomastoideo sinistro e posa la testa sotto la mascella. Sul petto, la pietra della fionda con le ali lungo le clavicole;
  - la Custode (Ritah, Venere con la mela): manica sinistra in due carte cilindriche lungo omero e avambraccio, su un fondo nero continuo (`blackGround`: sfumature sovrapposte fino al nero pieno, bordi che si sciolgono in puntinato), con rose e peonie in negativo; sul lato interno verso l'ascella e sul davanti della spalla il nero si apre; al polso un bracciale di perle, rombi e gocce. Mandala sul dorso della mano sinistra. Fianco destro: rosa sull'anca e peonia sulla coscia lungo la linea dell'anca; il nero sta solo attorno ai fiori e davanti si ferma lontano dall'inguine (pube a u ≈ +0,2 sulla carta, disegno entro +0,05). Alla base della nuca un cerchio perfetto; lungo la spina perle, falci, un loto, fasi lunari e una goccia. Seno, pube e volto restano puliti;
  - coro: un solo segno ciascuno, al collo o sotto la gola.
  Nessun segno sui volti.
- **Proiezione:**
  - statue: fino a tre carte locali per busto e fino a sei per le statue intere (`MAX_CHARTS`; gli shader dei busti restano a tre) (`InkChart`). Ogni carta è uno stencil appoggiato sulla pelle: punto d'appoggio sulla superficie (sterno, gola, corona), normale media attorno e raggio del cilindro che segue la sezione orizzontale del corpo, tutti stimati dalla mesh al caricamento (`anchorChart`). Nello shader la coordinata orizzontale è la lunghezza d'arco attorno a quel cilindro, quella verticale la quota: il disegno si srotola su collo, petto e spalle invece di stirarsi ai lati. I colli usano un giro completo. L'inchiostro si ferma dove la superficie si allontana dal cilindro (altre parti del corpo) o gli volge le spalle;
  - arti: con `limb` la carta è un cilindro attorno a un asse qualsiasi (punto, direzione dell'osso, raggio misurati sulle sezioni), con u = 0 nella direzione indicata da `front` (verso la camera della sosta). Le carte a giro completo disegnano due volte i motivi vicini alla cucitura. Con `pin` la carta si appoggia al vertice più vicino a un punto 3D: serve su schiena e fianchi, dove la ricerca per vista frontale può trovare la superficie opposta;
  - torsi: un'unica carta cilindrica che avvolge il tronco, ma con l'asse che ne segue il centro quota per quota (`computeTorsoFrame`: baricentro delle sezioni, levigato in altezza), così un torso seduto o ruotato come il Belvedere resta centrato. Il canvas è in metri (arco dal centro del petto, quota); i punti anatomici sono stati letti con la griglia di debug `?inkgrid` (solo sviluppo). Niente inchiostro sulle superfici rivolte in alto, in basso o verso l'asse, né sotto una linea di cintura per torso (`BELT`): bacino, pube e cosce restano puliti. Belvedere e Psiche hanno pezzi pieni in stile black & grey: sfumature morbide, ornamenti e fiori che seguono pettorali, costole, clavicole e moncherini;
- **Strumenti di sviluppo.**
  - `?inkgrid` sostituisce i disegni con griglie metriche (etichette `u|v` in cm) su torsi e statue; `?inkgrid=charts` le mostra solo sulle carte locali.
  - `window.__pc.gallery.inspect = { pos, look }` sposta la camera liberamente e completa tutti i tatuaggi, per guardare un'opera da ogni lato; `null` torna al percorso.
- **Texture.** Le maschere sono texture R8 (un quarto della memoria di una RGBA) con mipmap. Su schermi piccoli la risoluzione scende al 75%.
- **Rivelazione:**
  - ogni opera arriva in marmo intatto: il disegno parte da solo ~0,65 s dopo che è inquadrata (camera sulla sua stazione, opera dentro lo schermo) e si completa in ~2,5 s, propagandosi sulla superficie dal punto d'appoggio della prima carta; il cursore che la sfiora lo fa partire subito da quel punto;
  - il fronte emette un bagliore ambrato (`uGlowCol`), che si vede in bloom come un ago caldo;
  - Nefertiti ha marmo nero e inchiostro d'oro metallico.
- **Inchiostro liquido.** `liquidMask` (GLSL passato al materiale) rende inchiostro lucido una zona della statua: nella Custode è la mela, una sfera di 4,4 cm di raggio tra le dita (le dita, appena fuori dalla sfera, restano marmo); la sua base sta in una pozza (`uDressY`) che risale con viticci. Il tatuaggio della Custode si propaga dalla mela.
- **Pioggia della rotonda.** Le gocce a meno di ~2 m dalla camera si ritirano nel vertex shader: davanti alla Custode non passano più sbarre nere, mentre nell'ascesa (camera al centro, pioggia a 3 m) l'anello resta intero.

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
