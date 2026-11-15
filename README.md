# Nicholas Zhao Academic Homepage

Source files for Nicholas Zhao's academic [homepage](https://nicholaszhao-19.github.io/).
The site is served by GitHub Pages with HTML, CSS, and browser JavaScript.

## Files

- `index.html` contains the page content and metadata.
- `styles.css` contains the responsive styling.
- `background.js` and `background.css` render the night sky. `sky-physics.js` contains the orbit, sky projection, and gravitational lens calculations.
- `stars.bin` contains the compact stellar catalog used by the night sky.
- `robots.txt` allows crawler access and points to the sitemap.
- `sitemap.xml` lists the canonical homepage URL.

## Local Preview

Serve the directory over HTTP so the browser can load the sky module and its catalog.

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Night Sky

- **Planets.** Fixed heliocentric ellipses use [NASA/JPL's J2000 orbital elements](https://ssd.jpl.nasa.gov/planets/approx_pos.html). Mean anomaly advances at a common clock of six simulated days per second and Kepler's equation determines position, so the planets speed up near perihelion. The display opens on an illustrative orbital configuration and uses enlarged planet sizes, compressed semimajor axes, and an inclined projection. Planet textures and Saturn's ring angle are illustrative.
- **Stars.** The display uses 24,367 candidate stars from [Astronexus's HYG Database v4.1](https://github.com/astronexus/HYG-Database/blob/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/README.md). A subset is visible at each viewport size. The build selects stars brighter than visual magnitude 8.7 or equal to it, with a catalog distance below 5,000 parsecs and a trajectory that enters the camera's padded field. Positions and space velocities are transformed to Galactic coordinates and projected from the Sun. The renderer extrapolates stars along their catalog velocities, including radial velocity where HYG has it, on a separate clock that starts at 5,400 years per second and approaches a 350,000-year horizon. The magnitude and B−V color bins control the point sprites. Diffuse Milky Way light and dust are procedural.
- **Lensing.** Inside the active patch, the cursor defines the center of a circular thin lens applied to the distant sky. The inverse sampling reproduces arcs, multiple imaging, and the Einstein ring on alignment. The visual model enlarges the Einstein radius, gives the lens a finite central core, and tapers the outer deflection into the surrounding sky. A local contrast curve makes the lensed starlight easier to see. The nearby Solar System layer and page content are in front of the lens.

The transformed HYG data in `stars.bin` carry the source's [CC BY-SA 4.0 license](https://creativecommons.org/licenses/by-sa/4.0/). To rebuild them, download the [pinned HYG 4.1 CSV](https://raw.githubusercontent.com/astronexus/HYG-Database/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/CURRENT/hygdata_v41.csv) and run `python3 scripts/build-star-catalog.py hygdata_v41.csv`.

## Maintenance

- Add news to `.news-list` in `index.html`, newest first. Use `<time datetime="YYYY-MM-DD">Mon D, YYYY</time>` for confirmed announcement dates.
- Update publications with links to papers, preprints, code, and related pages; keep venue and track details consistent with news. Keep the publication timeline in reverse chronological order, newest first. Use the confirmed milestone dates: 22 May 2026 for Improved Dual Attack and 7 July 2026 for the IEEE QCE paper. Do not replace these with arXiv submission dates.
- Add a CV section and navigation link when a downloadable CV is ready.
- Add repository links when project code is available.
- Add a talks section when slides or event details are available.
- Keep `sitemap.xml` current when the canonical URL or main page changes.

## Pre-Push Checks

- Confirm there are no broken local links such as missing PDFs.
- Preview the site locally before pushing.
- Check the live GitHub Pages URL after deployment.
- Keep the GitHub Pages repository name aligned with the GitHub username.
