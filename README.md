# DOM + CSS DevTools Capture

A Chrome DevTools extension that captures the final live DOM and accessible CSS after you make changes in Chrome DevTools.

## What it does

- Adds a new DevTools panel called **DOM + CSS Capture**.
- Captures the current live DOM as `current-dom.html`.
- Records DOM mutations while capture is running.
- Serializes accessible CSS from `document.styleSheets`.
- Exports everything in one ZIP file.

## How to install

1. Unzip `dom-css-devtools-capture.zip`.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the unzipped `dom-css-devtools-capture` folder.
6. Open the web page you want to edit.
7. Open Chrome DevTools.
8. Open the **DOM + CSS Capture** panel.
9. Click **Start capture** before editing.
10. Make your edits in DevTools.
11. Click **Export ZIP**.

## What the exported ZIP contains

- `current-dom.html`: the live DOM at export time.
- `initial-dom.html`: the live DOM when capture started.
- `accessible-current-css.css`: all CSS rules the page can access.
- `current-css-snapshot.json`: per-stylesheet CSS snapshot at export time.
- `initial-css-snapshot.json`: per-stylesheet CSS snapshot when capture started.
- `css-change-summary.json`: before/after summary of stylesheet changes.
- `css-change-events.json`: polling-based CSS change events.
- `mutation-log.json`: DOM mutation log.
- `full-export.json`: all captured data in one file.
- `README.txt`: handoff explanation for your developer.

## Limits

This is a live browser snapshot, not a clean source-code patch.

A developer still needs to map your final DOM and CSS back into the site source files, templates, components, CMS theme or framework files.

Known limits:

- It cannot read Chrome DevTools' private internal Changes panel.
- It cannot know which source template or component produced a DOM node.
- Cross-origin stylesheets may block access to `cssRules`.
- Shadow DOM and iframe content may need separate handling.
- Start capture before editing if you want a useful mutation log.

