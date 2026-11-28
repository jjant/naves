# Texturas del exterior (calle, fachadas, árboles)

Las usa `web/js/street.js`. Todas son **CC0 (dominio público)**. Convenciones como en `../CREDITS.md`:
`albedo` sRGB, `normal` OpenGL, `arm.jpg` = AO / rugosidad / metalicidad.

De [Poly Haven](https://polyhaven.com) (licencia: https://polyhaven.com/license), descargadas en 1K JPG y
recomprimidas (calidad 84) sin otros cambios:

| Carpeta | Fuente | Licencia | Tamaño real | Uso |
|---|---|---|---|---|
| `red_brick_03/` | [red_brick_03](https://polyhaven.com/a/red_brick_03) | CC0 | 1,0 m | Fachada de obra vista (Zona Hermètica) y muretes de ladrillo |
| `gravel_concrete_04/` | [gravel_concrete_04](https://polyhaven.com/a/gravel_concrete_04) | CC0 | 2,0 m | Panel prefabricado de árido visto (Can Comelles, foto 01) |
| `bark_platanus/` | [bark_platanus](https://polyhaven.com/a/bark_platanus) | CC0 | 1,5 m | Troncos y ramas de los árboles de las aceras (tintada en gris para el lledoner) |
| `concrete_floor_02/` | [concrete_floor_02](https://polyhaven.com/a/concrete_floor_02) | CC0 | 2,0 m | Patios delanteros de hormigón |

De [ambientCG](https://ambientcg.com) (licencia CC0: https://docs.ambientcg.com/license/), compuesto con
`tools/naves3d/tex/foliage.py` (solo los mapas `Color` y `Opacity` de cada juego, 1K-JPG):

| Archivo | Fuentes | Licencia | Uso |
|---|---|---|---|
| `foliage/albedo.webp` (1024², RGBA) | [LeafSet010](https://ambientcg.com/a/LeafSet010) (hoja palmeada verde), [LeafSet021](https://ambientcg.com/a/LeafSet021) (palmeada amarilla), [LeafSet011](https://ambientcg.com/a/LeafSet011) (hojas secas), [LeafSet001](https://ambientcg.com/a/LeafSet001) y [LeafSet014](https://ambientcg.com/a/LeafSet014) (aserradas, lledoner), [LeafSet026](https://ambientcg.com/a/LeafSet026) (diente de león) | CC0 | Ramilletes de plátano (verde y en otoño) y de lledoner, hojas sueltas para el borde de las copas, hojas caídas y una mata de hierba con dientes de león; la hierba y las ramillas se dibujan en el script |
| `foliage/normal.webp` (1024²) | (generado) | CC0 | Una inclinación al azar por hoja: unas brillan al sol y otras no |

El resto de lo que se ve en la calle reutiliza texturas del set del visor (`asphalt`, `sidewalk` = panot,
`wall_block`, `wall_precast`, `roof_metal` como chapa grecada de fachada, portones y marquesina) o se dibuja
en un lienzo al construir la escena (desgaste de la pintura vial, fundición de tapas e imbornales, mallas de
valla, nervios de portón, suciedad de fachada, rótulos, señales, pintadas e interiores vistos por las
ventanas): no hay más imágenes de terceros. Los logotipos de los rótulos de Snowpark salen de `web/brand/`
(= `assets/logos/`).
