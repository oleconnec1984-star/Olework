# OLE Avatar QA — 2026-09-04

## Final direction

The user superseded the detailed full-body request with simple head-only pixel portraits. Actual components compose flat raster heads on a32×32 grid. Studio has Face, Hair, Accessories and Background tabs; outfit values remain stored but are not displayed or randomized. Employee IDs, authentication, access, task approval, calendar and reports remain unchanged.

## Browser checks completed

The earlier preview access block cleared on resumption. Actual Studio/renderer components were tested in the supervised preview with an explicitly synthetic, development-only lab. The lab is404 in production; its save response is simulated, not production persistence.

- All68 visible options selected:23 face,20 hair,13 accessories,12 background/frame. Each rendered without a load error and its selection state changed.
- Six distinct simple head looks visually inspected: different faces, skin, hairstyles, glasses and headphones.
- Desktop and390px iframe responsive layout inspected. Content/client widths both369px, no horizontal overflow. Not a physical-phone test.
- Keyboard Home, random/reset/cancel, success/failure feedback tested. Cancel/reopen restored saved state; failed save did not claim success. Mobile hairstyle selection and simulated save succeeded.
- Actual missing-asset failure: temporarily moved the simple atlas in local checkout, reloaded, verified image error and disabled Save, restored the original file, clicked Retry and verified successful recovery. Asset fully restored.
- Screenshots: qa/avatar-heads.jpg, qa/avatar-studio-desktop.jpg, qa/avatar-studio-mobile.jpg.

## Automated checks

- TypeScript: PASS.
- Avatar modules/lab ESLint: PASS.
- Node/D1 tests:7 PASS. Actual local D1 readback, employee isolation, extra uploaded-photo field preservation, unrelated task/event preservation, safe legacy normalization, owner/foreign-ID denial, revision races and503 storage outage.
- Built Worker test:1 PASS. Root renders; protected workspace/Avatar routes deny unauthenticated calls; lab returns404.
- Production Build: PASS.
- Whole-project lint: two pre-existing set-state-in-effect errors in workspace initialization/load and five existing warnings. Unrelated behavior was not changed to silence them.

## Limits

No production employee data was edited for QA. Real sign-out/sign-in persistence and production profile/card click-through were not browser-tested: preview has no dispatched production identity. Persistence is verified through the production handler against isolated D1. Shared rendering is connected in source to employee profiles/cards/task assignees. No employee-login mapping exists in this checkout; owner-only management remains. No running dashboard existed or was added. Uploaded-photo fields are not automatically overwritten.
