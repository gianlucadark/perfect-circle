# Crediti e licenze dei modelli

Tutti i modelli vengono dalla Royal Cast Collection dello **SMK — Statens Museum for Kunst** (Copenaghen):
scansioni dei calchi in gesso, marcate **Public Domain Mark 1.0**. Sono state scaricate senza account dall'API
`https://api.smk.dk/api/v1/download-3d/<file>`, usando i file `*_small.stl`.

La licenza non richiede attribuzione, quindi l'esperienza non mostra crediti a schermo. Restano qui per
documentazione. Le sorgenti STL non sono nel progetto: in `public/models/` ci sono solo i GLB derivati
(Draco).

## Busti, teste e statua — `statues/`

Script: `PerfectCircle/03_blender/scripts/pc_export_statues.py`. Decima, orienta, scala all'altezza
riportata dal museo e scrive `statues.json`, con il profilo per fasce usato per posizionare i tatuaggi.
Hash verificati al download il 18 novembre 2026.

| File | Opera | Ruolo | STL sorgente | MD5 |
| --- | --- | --- | --- | --- |
| `KAS1819.glb` | Ritratto di Costanza Bonarelli (Bernini) | busto *Costanza* | `6q182q98x_KAS1819_small.stl` | 3c94331ab610c204a3aa943d3687630a |
| `KAS1513.glb` | Antinoo come Dioniso, con corona d'edera | busto *Antinoo* | `sx61dr885_KAS1513a_small.stl` | f7fcd8dd0d66c4efa16cf2c1bca397af |
| `DEP439.glb` | Ritratto di Nefertiti | busto *Nefertiti* | `nz806404c_DEP439_small.stl` | 516376be12cd50971d97d16b11bf18a5 |
| `KAS2232.glb` | Testa del David (Michelangelo) | *Il gigante* | `nz806401j_KAS2232_small.stl` | 5b4434424670c978c84b98cd34230a4a |
| `KAS434.glb` | Venere di Milo | *La Custode* | `h128nk52f_KAS434_small.stl` | af53bcb916b4542284191afc146396e6 |
| `KAS622.glb` | Testa della Hera Barberini | coro | `mw22vb318_KAS622_small.stl` | a9bf3247bd4e99b553163b105bd74b66 |
| `KAS639.glb` | Giovane donna, "Korinna" | coro | `5d86p505h_KAS639_small.stl` | 4a89f8955af3a20295c2101ec5c98c2a |
| `KAS394.glb` | Testa femminile, "Der schöne Kopf" | coro | `fb494d972_KAS394_small.stl` | 56ca5ff5746dfa79ab1237901b2aee97 |
| `KAS615.glb` | Testa di Amazzone, tipo Sciarra | coro | `2z10wv81z_KAS615_small.stl` | ac895aedf6b4675fc115372a7b1ff32a |

## Torsi — `torsos/`

Script: `PerfectCircle/03_blender/scripts/pc_export_torsos.py` (48k triangoli, poi compressi in Draco).

| File | Opera | Inventario | MD5 dell'STL sorgente |
| --- | --- | --- | --- |
| `torso_KAS402.glb` | Torso del Belvedere | KAS402 | f3b405c87c3195e33a83d3e4c2885ff9 |
| `torso_KAS1242.glb` | Doriforo, torso Pourtalès | KAS1242 | 5c76f6a6c620cb2eafca7344c9e199d3 |
| `torso_KAS425.glb` | Torso di Apollo (rilievo) | KAS425 | 228d08a76cc8d54f97d5bcd9bf896750 |
| `torso_KAS100.glb` | Psiche di Capua | KAS100 | d8b8297ad4b29cf3b895c33178033486 |
| `torso_KAS2113.glb` | Torso femminile, Iris | KAS2113 | 48651ad2f11a85d3349e90a72c74e530 |
| `torso_KAS1048.glb` | Torso Valentini | KAS1048 | 51f69982b857e4e92a5ee01d0e7012e3 |

## Tatuaggi

I tatuaggi sulle statue e le tavole flash sono disegni procedurali generati nel browser
(`statueTattoos.ts`, `tattoo.ts`). Non sono opere dello studio o dell'artista. Prima di un uso pubblico
vanno sostituiti o affiancati da lavori reali autorizzati.
