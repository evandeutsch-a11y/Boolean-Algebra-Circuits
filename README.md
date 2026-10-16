# Logic Lab

A small, static Boolean circuit workbench. It runs entirely in the browser and does not need a server, package install, or build step.

## Run locally

Open `logic-lab.html` in a modern browser, or serve this folder with any static file server. GitHub Pages normally expects `index.html` at the published folder root, so to avoid overwriting an existing one, publish this folder as a subfolder or link to `logic-lab.html` from your existing homepage.

## Publish with GitHub Pages

1. Copy the contents of this folder into the root of a GitHub repository (or into a `docs/` folder).
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select the branch and `/ (root)` (or `/docs`), then save.
4. GitHub will publish the site at the Pages URL shown in that section.

The site stores the current circuit in browser local storage. Use **Export JSON** to back it up or move it to another browser, and **Import** to open a saved circuit.

## Editor controls

- Click or drag a component from the left rail onto the canvas.
- Connect an output port (right side) to an input port (left side).
- Click an input node or press **A** to toggle the first input.
- Hold **Space** and drag to pan; use the wheel or zoom controls to zoom.
- Select a gate to rename it or change its input count.
- Press **T** to show or hide the truth table.
- Export and import circuits as JSON.

Everything is plain HTML, CSS and JavaScript, so it can also be customized without a framework.
