# Logic Lab

A small, static Boolean circuit workbench. It runs entirely in the browser and does not need a server, package install, or build step.

## Run locally

Open `index.html` in a modern browser, or serve this folder with any static file server.

## Publish with GitHub Pages

1. Put `index.html`, `app.js`, and `style.css` together in the repository's published folder. If the app files are already in the repository root, add this `index.html` to the root as well. It is the entry point that makes Pages open the editor instead of the README instructions.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select the branch and `/ (root)` (or `/docs`), then save.
4. GitHub will publish the site at the Pages URL shown in that section. If the files are in the repository root, the editor opens at the main Pages URL.

The site stores the current circuit in browser local storage. Use **Export JSON** to back it up or move it to another browser, and **Import** to open a saved circuit.

Use **My Circuits** in the left panel to create a blank circuit, save it by its circuit name, and switch between saved circuits. Circuits autosave in the browser and remain available on the same browser and device.

## Editor controls

- Click or drag a component from the left rail onto the canvas.
- Connect an output port (right side) to an input port (left side).
- Drag an output port onto an input port to connect them. Connections are plain lines without arrowheads. Click a wire to select it, then press **Delete** or click the **Delete** button to remove it.
- Turn on **Quick delete** in the canvas toolbar to delete a component or wire with one click. Click the toggle again to return to select-then-delete behavior.
- To reroute a connection, drag its connected gate input port to a different output port. Drag it to empty canvas space to disconnect it.
- You can also drag a wire near either endpoint to reroute that end; click the wire without dragging to select it.
- Rename the circuit by editing its title in the top bar. The title saves with this browser’s circuit and is included when exporting JSON.
- Select a component and use the **Delete** button or Delete/Backspace key to remove it and its connections.
- Click an input node or press **A** to toggle the first input.
- Select an input and enter its 0/1 sequence in **Input bit sequence** (for example `0011` or `0 0 1 1`). The truth table evaluates the sequences row by row; shorter sequences repeat to match the longest one.
- You can also edit each input sequence directly above the truth table. Enter a string such as `1010`, then press Enter or leave the field to recalculate.
- Press **Run** to calculate the output named **Y** (or the first output if Y is absent). The result shows Y’s bit array and opens a truth table for the inputs connected to Y. Gates can run with only some of their input ports connected; unconnected ports are ignored.
- Input variable names must be unique, ignoring letter case.
- Gate nodes use standard circuit drawings: AND has a flat input side and rounded output side; OR/XOR have curved input sides; NOT has a triangle; NAND/NOR/XNOR add an inversion bubble.
- Scroll to pan vertically and use **Shift + scroll** to pan horizontally. Hold **Space** and drag to pan in any direction; use **⌘/Ctrl + scroll** or the zoom controls to zoom.
- Select a gate to rename it or change its input count.
- Select a gate and use **Gate type** in the Inspector to change AND, OR, NOT, XOR, NAND, NOR or XNOR in place.
- Edit the circuit name in the top bar. The title is saved with the circuit.
- Press **T** to show or hide the truth table.
- Export and import circuits as JSON.

If the app is stored in a subfolder instead, open the matching folder URL, such as `<your Pages URL>/logic-lab/`. Everything is plain HTML, CSS and JavaScript, so it can also be customized without a framework.
