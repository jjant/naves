# Personas realistas: procedencia y licencias

Generadas por `tools/naves3d/blender/people/build.sh` (Blender 5.1 sin interfaz + MPFB 2.0.18, el
generador de humanos de MakeHuman para Blender) a partir de assets **CC0** y **CC BY** del repositorio
oficial de MakeHuman (packs de https://static.makehumancommunity.org/assets/assetpacks.html, descargados
de `files.makehumancommunity.org` y verificados por sha256 en `build.sh`). Ningun asset de Mixamo,
Renderpeople ni de otras fuentes con licencia restrictiva.

- **CC0** (dominio publico): se puede usar, modificar y publicar sin condiciones.
- **CC BY** (atribucion): se puede usar, modificar y publicar, incluso comercialmente, citando al
  autor y la licencia e indicando que hubo cambios. Los cambios en todas las prendas: reajustadas al
  cuerpo, infladas / alargadas, textura pasada a gris neutro y tenida por color, malla simplificada y
  empaquetada en un atlas. Atribucion: *"Sudadera 'Hooded sweat jacket' y vaqueros 'Jeans straight
  leg' de Elvaerwyn; vaqueros 'Female tight jeans' de punkduck (MakeHuman community assets, CC BY),
  modificados."* Hay que mantener este archivo junto a los GLB (y citarlo donde se publiquen).
- MPFB (GPL-3.0) y gltfpack (MIT) solo se usan como herramientas: su codigo no se publica.

## Fuentes

| Asset | Autor | Licencia | Pagina | Pack | Uso |
|---|---|---|---|---|---|
| Malla base hm08, targets de forma, rig "game_engine" y sus pesos | MakeHuman (Data Collection AB, Joel Palmius, Jonas Hauquier) | CC0 1.0 | https://extensions.blender.org/add-ons/mpfb/ (datos de MPFB 2.0.18) | `MPFB 2.0.18` | cuerpo y esqueleto de todas las personas |
| Pieles young/middleage_* , ojos, cejas eyebrow0xx, pestanas eyelashes0x, pelo short01/02/04, bob01/02, ponytail01, zapatillas shoes06 | MakeHuman system assets | CC0 1.0 | http://www.makehumancommunity.org | `makehuman_system_assets_cc0` | piel, ojos, pelo, zapatillas |
| Piel mindfront_aksel_skin | Mindfront | CC0 1.0 | http://www.makehumancommunity.org/node/850 | `skins02_cc0` | piel de m1 |
| Pantalon cortu_cargo_pants | Cortu | CC0 1.0 | http://www.makehumancommunity.org/node/2798 | `pants01_cc0` | pantalon de snowboard (inflado, acampanado y alargado sobre la bota) |
| Pantalon toigo_wool_pants | MargaretToigo | CC0 1.0 | http://www.makehumancommunity.org/node/1194 | `pants01_cc0` | pantalon del personal |
| Guantes toigo_gloves_short | MargaretToigo | CC0 1.0 | http://www.makehumancommunity.org/node/1852 | `gloves01_cc0` | guantes (acolchados) |
| Botas toigo_ankle_boots_male | MargaretToigo | CC0 1.0 | http://www.makehumancommunity.org/node/1743 | `shoes01_cc0` | botas de snowboard (infladas, suela mas gruesa) |
| Polo namuhekam_male_polo_shirt | Namuhekam | CC0 1.0 | http://www.makehumancommunity.org/node/2909 | `shirts01_cc0` | polo del personal |
| Camiseta toigo_basic_tucked_t-shirt | MargaretToigo | CC0 1.0 | http://www.makehumancommunity.org/node/1203 | `shirts01_cc0` | camiseta |
| Camiseta elvs_crude_t-shirt_male | Elvaerwyn | CC0 1.0 | http://www.makehumancommunity.org/node/1416 | `shirts01_cc0` | camiseta |
| Jersey toigo_fisherman_sweater | MargaretToigo | CC0 1.0 | http://www.makehumancommunity.org/node/1187 | `shirts01_cc0` | jersey de visitante |
| Sudadera con capucha elvs_hooded_sweat_jacket1 | Elvaerwyn | CC BY | http://www.makehumancommunity.org/node/1450 | `shirts02_ccby` | chaqueta de snowboard (inflada y alargada) y sudadera |
| Vaqueros elvs_jeans_straight_leg | Elvaerwyn | CC BY | http://www.makehumancommunity.org/node/1802 | `pants02_ccby` | vaqueros de visitante |
| Vaqueros punkduck_female_tight_jeans | punkduck | CC BY 3.0 | http://www.makehumancommunity.org/node/391 | `pants02_ccby` | vaqueros del personal y visitantes |
| Casco, orejeras, gafas de snowboard y su correa | este repo (make_people.py) | mismo que el repo | - | `-` | modelados por codigo a la medida de cada cabeza |

## Archivos

Cada persona: 3 mallas / 3 materiales (piel; ropa y equipo en un atlas con detalle en gris +
tinte por vertice; pelo, cejas, pestanas y ojos con alpha clip), rig `game_engine` de MPFB mas un
hueso `goggles` (gafas bajadas en reposo; subidas = transformacion `gogglesUp` de `people.json`).
`<id>.glb` = detalle completo (meshopt + WebP, atlas de ropa 2048x1536, piel 1024);
`<id>.lod1.glb` = movil (mitad de triangulos, texturas a la mitad).

| Archivo | Roles | Cuerpo | Ropa | Triangulos | Tamano | Piezas |
|---|---|---|---|---|---|---|
| `rider-f1.glb` / `rider-f1.lod1.glb` | rider, instructor | mujer, 23 anos, 1.64 m | snow | 15,134 | 0.75 / 0.28 MB | body: MakeHuman hm08 + targets via MPFB 2 (CC0); skin: young_caucasian_female - makehuman_system_assets (CC0); eyes/brows/lashes/hair: makehuman_system_assets (CC0); top: elvs_hooded_sweat_jacket1 - Elvaerwyn, shirts02 (CC-BY 4.0); bottom: cortu_cargo_pants - Cortu, pants01 (CC0); hands: toigo_gloves_short - MargaretToigo, gloves01 (CC0); feet: toigo_ankle_boots_male - MargaretToigo, shoes01 (CC0) |
| `rider-f2.glb` / `rider-f2.lod1.glb` | rider | mujer, 21 anos, 1.61 m | hoodie | 15,135 | 0.67 / 0.25 MB | body: MakeHuman hm08 + targets via MPFB 2 (CC0); skin: young_asian_female - makehuman_system_assets (CC0); eyes/brows/lashes/hair: makehuman_system_assets (CC0); top: elvs_hooded_sweat_jacket1 - Elvaerwyn, shirts02 (CC-BY 4.0); bottom: cortu_cargo_pants - Cortu, pants01 (CC0); hands: toigo_gloves_short - MargaretToigo, gloves01 (CC0); feet: toigo_ankle_boots_male - MargaretToigo, shoes01 (CC0) |
| `rider-m1.glb` / `rider-m1.lod1.glb` | rider, instructor | hombre, 24 anos, 1.76 m | snow | 15,133 | 0.74 / 0.26 MB | body: MakeHuman hm08 + targets via MPFB 2 (CC0); skin: mindfront_aksel_skin - Mindfront, skins02 (CC0); eyes/brows/lashes/hair: makehuman_system_assets (CC0); top: elvs_hooded_sweat_jacket1 - Elvaerwyn, shirts02 (CC-BY 4.0); bottom: cortu_cargo_pants - Cortu, pants01 (CC0); hands: toigo_gloves_short - MargaretToigo, gloves01 (CC0); feet: toigo_ankle_boots_male - MargaretToigo, shoes01 (CC0) |
| `rider-m2.glb` / `rider-m2.lod1.glb` | rider, instructor | hombre, 22 anos, 1.78 m | snow | 14,740 | 0.66 / 0.25 MB | body: MakeHuman hm08 + targets via MPFB 2 (CC0); skin: young_african_male - makehuman_system_assets (CC0); eyes/brows/lashes/hair: makehuman_system_assets (CC0); top: elvs_hooded_sweat_jacket1 - Elvaerwyn, shirts02 (CC-BY 4.0); bottom: cortu_cargo_pants - Cortu, pants01 (CC0); hands: toigo_gloves_short - MargaretToigo, gloves01 (CC0); feet: toigo_ankle_boots_male - MargaretToigo, shoes01 (CC0) |
| `rider-m3.glb` / `rider-m3.lod1.glb` | rider | hombre, 25 anos, 1.72 m | hoodie | 15,134 | 0.64 / 0.23 MB | body: MakeHuman hm08 + targets via MPFB 2 (CC0); skin: young_asian_male - makehuman_system_assets (CC0); eyes/brows/lashes/hair: makehuman_system_assets (CC0); top: elvs_hooded_sweat_jacket1 - Elvaerwyn, shirts02 (CC-BY 4.0); bottom: cortu_cargo_pants - Cortu, pants01 (CC0); hands: toigo_gloves_short - MargaretToigo, gloves01 (CC0); feet: toigo_ankle_boots_male - MargaretToigo, shoes01 (CC0) |
| `rider-m4.glb` / `rider-m4.lod1.glb` | rider, instructor | hombre, 41 anos, 1.93 m | snow | 15,059 | 0.77 / 0.28 MB | body: MakeHuman hm08 + targets via MPFB 2 (CC0); skin: middleage_caucasian_male - makehuman_system_assets (CC0); eyes/brows/lashes/hair: makehuman_system_assets (CC0); top: elvs_hooded_sweat_jacket1 - Elvaerwyn, shirts02 (CC-BY 4.0); bottom: cortu_cargo_pants - Cortu, pants01 (CC0); hands: toigo_gloves_short - MargaretToigo, gloves01 (CC0); feet: toigo_ankle_boots_male - MargaretToigo, shoes01 (CC0) |
| `kid-k1.glb` / `kid-k1.lod1.glb` | kid | hombre, 11 anos, 1.42 m | snow | 14,713 | 0.69 / 0.25 MB | body: MakeHuman hm08 + targets via MPFB 2 (CC0); skin: young_caucasian_male - makehuman_system_assets (CC0); eyes/brows/lashes/hair: makehuman_system_assets (CC0); top: elvs_hooded_sweat_jacket1 - Elvaerwyn, shirts02 (CC-BY 4.0); bottom: cortu_cargo_pants - Cortu, pants01 (CC0); hands: toigo_gloves_short - MargaretToigo, gloves01 (CC0); feet: toigo_ankle_boots_male - MargaretToigo, shoes01 (CC0) |
| `kid-k2.glb` / `kid-k2.lod1.glb` | kid | mujer, 9 anos, 1.28 m | snow | 15,133 | 0.71 / 0.27 MB | body: MakeHuman hm08 + targets via MPFB 2 (CC0); skin: young_african_female - makehuman_system_assets (CC0); eyes/brows/lashes/hair: makehuman_system_assets (CC0); top: elvs_hooded_sweat_jacket1 - Elvaerwyn, shirts02 (CC-BY 4.0); bottom: cortu_cargo_pants - Cortu, pants01 (CC0); hands: toigo_gloves_short - MargaretToigo, gloves01 (CC0); feet: toigo_ankle_boots_male - MargaretToigo, shoes01 (CC0) |
| `kid-k3.glb` / `kid-k3.lod1.glb` | kid | hombre, 13 anos, 1.49 m | hoodie | 15,134 | 0.64 / 0.23 MB | body: MakeHuman hm08 + targets via MPFB 2 (CC0); skin: young_asian_male - makehuman_system_assets (CC0); eyes/brows/lashes/hair: makehuman_system_assets (CC0); top: elvs_hooded_sweat_jacket1 - Elvaerwyn, shirts02 (CC-BY 4.0); bottom: cortu_cargo_pants - Cortu, pants01 (CC0); hands: toigo_gloves_short - MargaretToigo, gloves01 (CC0); feet: toigo_ankle_boots_male - MargaretToigo, shoes01 (CC0) |
| `staff-f1.glb` / `staff-f1.lod1.glb` | staff | mujer, 23 anos, 1.60 m | tee_f | 14,385 | 0.77 / 0.24 MB | body: MakeHuman hm08 + targets via MPFB 2 (CC0); skin: young_caucasian_female - makehuman_system_assets (CC0); eyes/brows/lashes/hair: makehuman_system_assets (CC0); top: toigo_basic_tucked_t-shirt - MargaretToigo, shirts01 (CC0); bottom: punkduck_female_tight_jeans - punkduck, pants02 (CC-BY 4.0); feet: shoes06 - makehuman_system_assets (CC0) |
| `staff-m2.glb` / `staff-m2.lod1.glb` | staff | hombre, 22 anos, 1.74 m | polo | 14,330 | 0.51 / 0.18 MB | body: MakeHuman hm08 + targets via MPFB 2 (CC0); skin: young_african_male - makehuman_system_assets (CC0); eyes/brows/lashes/hair: makehuman_system_assets (CC0); top: namuhekam_male_polo_shirt - Namuhekam, shirts01 (CC0); bottom: toigo_wool_pants - MargaretToigo, pants01 (CC0); feet: shoes06 - makehuman_system_assets (CC0) |
| `visitor-f3.glb` / `visitor-f3.lod1.glb` | visitor | mujer, 38 anos, 1.66 m | tee_f | 14,387 | 0.66 / 0.21 MB | body: MakeHuman hm08 + targets via MPFB 2 (CC0); skin: middleage_african_female - makehuman_system_assets (CC0); eyes/brows/lashes/hair: makehuman_system_assets (CC0); top: toigo_basic_tucked_t-shirt - MargaretToigo, shirts01 (CC0); bottom: punkduck_female_tight_jeans - punkduck, pants02 (CC-BY 4.0); feet: shoes06 - makehuman_system_assets (CC0) |
| `visitor-m3.glb` / `visitor-m3.lod1.glb` | visitor | hombre, 25 anos, 1.68 m | tee_m | 13,753 | 0.86 / 0.21 MB | body: MakeHuman hm08 + targets via MPFB 2 (CC0); skin: young_asian_male - makehuman_system_assets (CC0); eyes/brows/lashes/hair: makehuman_system_assets (CC0); top: elvs_crude_t-shirt_male - Elvaerwyn, shirts01 (CC0); bottom: elvs_jeans_straight_leg - Elvaerwyn, pants02 (CC-BY 4.0); feet: shoes06 - makehuman_system_assets (CC0) |
| `visitor-m4.glb` / `visitor-m4.lod1.glb` | visitor | hombre, 41 anos, 1.89 m | sweater | 14,985 | 1.28 / 0.32 MB | body: MakeHuman hm08 + targets via MPFB 2 (CC0); skin: middleage_caucasian_male - makehuman_system_assets (CC0); eyes/brows/lashes/hair: makehuman_system_assets (CC0); top: toigo_fisherman_sweater - MargaretToigo, shirts01 (CC0); bottom: elvs_jeans_straight_leg - Elvaerwyn, pants02 (CC-BY 4.0); feet: shoes06 - makehuman_system_assets (CC0) |
