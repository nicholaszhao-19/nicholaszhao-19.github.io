# Nicholas Zhao Academic Homepage

Source files for Nicholas Zhao's academic [homepage](https://nicholaszhao-19.github.io/).
The site is a minimal static GitHub Pages site built with HTML and CSS, with a small script for the light/dark theme switch.

## Files

- `index.html` contains the page content and metadata.
- `styles.css` contains the responsive styling.
- `robots.txt` allows crawler access and points to the sitemap.
- `sitemap.xml` lists the canonical homepage URL.

## Local Preview

Open `index.html` directly in a browser, or serve the directory locally:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Maintenance

- Add news to `.news-list` in `index.html`, newest first. Use `<time datetime="YYYY-MM-DD">Mon D, YYYY</time>` for confirmed announcement dates.
- Update publications with links to papers, preprints, code, and related pages; keep venue and track details consistent with news. Publication timeline dates use the first arXiv submission date, newest first, independently of conference news dates.
- Add a CV section and navigation link when a downloadable CV is ready.
- Add repository links when project code is available.
- Add a talks section when slides or event details are available.
- Keep `sitemap.xml` current when the canonical URL or main page changes.

## Pre-Push Checks

- Confirm there are no broken local links such as missing PDFs.
- Preview the site locally before pushing.
- Check the live GitHub Pages URL after deployment.
- Keep the GitHub Pages repository name aligned with the GitHub username.
