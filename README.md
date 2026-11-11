# Traffic replay

Project page for **Free-Viewpoint Replay of Pedestrian–Vehicle Encounters
from Dashcam Video and Revisited-Site Images**.

Shunsuke Ugamura, Hiroyuki Deguchi, Kazufumi Torii, and Hideo Saito.

The page contains videos, interactive replays, and evaluation
highlights. Placement combines contact-first initialization, directional temporal
refinement and full-body 2D reprojection. The interactive replays and CARLA
examples use this method. The manuscript PDF and software release are coming soon.
Input datasets are maintained separately. Interactive replays use
[Urban ’10](https://sketchfab.com/3d-models/urban-10-low-poly-model-2866efdfa943484391ef8313768e074d)
by Daniel Zhabotinsky, under CC BY 4.0, rotated and resized to the vehicle-proxy
dimensions. See [Credits](docs/credits.html).

Published page: https://ugamura.github.io/traffic-replay-page/
Repository: https://github.com/ugamura/traffic-replay-page

## Local preview

From this directory, run:

```bash
python3 -m http.server 8001 --bind 127.0.0.1 --directory docs
```

Open http://127.0.0.1:8001/. The interactive replays require JavaScript,
WebGL2, and a browser with gzip DecompressionStream support. The original dashcam videos
are available if the interactive view cannot load.

## Hosting

Serve `docs/` as a static site. For GitHub Pages, select branch `main` and
folder `/docs`. No installation or build step is needed.

Bundled library acknowledgments: [Third-party notices](THIRD_PARTY_NOTICES.md).
