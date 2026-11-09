# Share image

`../og.png` (1200 × 630) is made from `og.html` in this folder. To make it again, with any Chromium browser installed on
your machine (nothing is added to the repo):

```sh
chrome --headless --hide-scrollbars --window-size=1200,630 --virtual-time-budget=8000 \
  --screenshot=site/og.png file:///ABSOLUTE/PATH/TO/site/og/og.html
```

On Windows, Microsoft Edge works the same way (`msedge --headless ...`). Check the size afterwards: the file must be
exactly 1200 × 630, which `test/site/site.test.mjs` verifies.
