# OLE avatar component atlases

Original AI-generated raster components created for OLE CONNECT from a style-only reference. No stock character was extracted. The three atlases contain separate anatomy, hairstyles and wardrobe/accessory parts, not finished characters.

Runtime composition and palette normalization: `lib/avatar-renderer.ts`. Revised grid: 32 × 32, nearest-neighbor scaling, hard alpha, flat colors. Configuration/migration: `lib/avatar.ts`. No gender restrictions. User revised the direction to simple head-only portraits. Old outfit values and assets are retained. No running dashboard existed; none was added.

Generated sheets have uneven row spacing. Crop bands are explicitly recorded in the renderer; do not assume square cells.

## Simple revision

`simple.png` is an original built-in imagegen4×4 atlas: four blank faces, then12 hair-only overlays. Final prompt: minimal flat low-detail24px-style pixel head parts, transparent background, grayscale for runtime tinting, broad gutters; no bodies, labels or watermarks. User image is a style-only reference, not stock extraction. Generated once, inspected, integrated. Output1254px square; crop row bands `[0,300,580,905,1254]`. Front hair clips keep eyes visible; flat tint removes generated shading.
