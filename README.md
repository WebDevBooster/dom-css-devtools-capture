# DOM + CSS DevTools Capture

A Chrome DevTools extension that captures the final live DOM, DOM mutations and accessible CSS rule-level changes after you make changes in Chrome DevTools. Version 1.2.2 exports CSS changes once per changed rule/property instead of every polling transition and can export `mutation-log.json` directly.

## Important: this is not opened from the toolbar

This extension does **not** work like a normal Chrome toolbar extension.

Pinning it to the Chrome toolbar is not how you use it. The panel appears **inside Chrome DevTools**, next to tabs like **Elements**, **Console**, **Sources** and **Network**.

## How to open the DOM + CSS Capture panel

1. Go to the web page you want to edit.
2. Open Chrome DevTools:
   - Mac: `Command + Option + I`
   - Windows/Linux: `Ctrl + Shift + I`
   - Or right-click the page and choose **Inspect**
3. Look at the top row of DevTools tabs where you see **Elements**, **Console**, **Sources**, **Network**, etc.
4. Look for a tab called **DOM + CSS Capture**.
5. If you do not see it, click the `>>` overflow button on the DevTools tab bar and choose **DOM + CSS Capture** from the hidden tabs.
6. If it still does not appear, close DevTools completely, refresh the page, then open DevTools again.

## How to use it

1. Open the page you want to edit.
2. Open DevTools.
3. Open the **DOM + CSS Capture** tab inside DevTools.
4. Click **Start capture**.
5. Make your HTML/DOM and CSS edits in DevTools.
6. Return to the **DOM + CSS Capture** tab.
7. Click **Export ZIP**, or click **Export mutation-log.json** if you only need the combined mutation/change log.
8. Send the exported file to your developer.

The main handoff file is now `mutation-log.json`. It contains DOM mutations and the final detected accessible CSS rule changes in one combined log.

## How to install

1. Unzip `dom-css-devtools-capture.zip`.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the unzipped `dom-css-devtools-capture` folder.
6. Open or refresh the web page you want to edit.
7. Open DevTools and find the **DOM + CSS Capture** tab.

## If the panel does not show up

Try these in order:

1. Make sure you selected the **folder**, not the ZIP file, when clicking **Load unpacked**.
2. Go to `chrome://extensions` and confirm **DOM + CSS DevTools Capture** is enabled.
3. Refresh the page you are editing.
4. Close DevTools and open it again.
5. Click the `>>` overflow menu in DevTools because the tab may be hidden.
6. Do not test it on `chrome://extensions`, `chrome://settings`, the Chrome Web Store or some restricted browser pages. Chrome blocks extensions from running on many internal pages.
7. In `chrome://extensions`, click **Reload** on this extension, then reopen DevTools.

## What it does

- Adds a new DevTools panel called **DOM + CSS Capture**.
- Captures the current live DOM as `current-dom.html`.
- Records DOM mutations while capture is running.
- Serializes accessible CSS from `document.styleSheets`.
- Compares CSS rules before and after, then exports one final property-level before/after record per changed rule when Chrome exposes it.
- Exports everything in one ZIP file.

## What the exported ZIP contains

- `current-dom.html`: the live DOM at export time.
- `initial-dom.html`: the live DOM when capture started.
- `accessible-current-css.css`: all CSS rules the page can access.
- `current-css-snapshot.json`: per-stylesheet CSS snapshot at export time.
- `initial-css-snapshot.json`: per-stylesheet CSS snapshot when capture started.
- `css-rule-changes.json`: actual accessible CSS rules that changed, with rule identity and property-level before/after values.
- `css-change-summary.json`: before/after summary of stylesheet changes.
- `css-change-events.json`: compact polling detection summary. It does not include intermediate rule values.
- `dom-mutation-log.json`: DOM mutation log only.
- `mutation-log.json`: combined DOM mutation and final CSS rule change log. Look for the single timeline entry where `category` is `css`.
- `full-export.json`: all captured data in one file.
- `README.txt`: handoff explanation for your developer.

## Limits

This is a live browser snapshot, not a clean source-code patch.

A developer still needs to map your final DOM and CSS back into the site source files, templates, components, CMS theme or framework files.

Known limits:

- It cannot read Chrome DevTools' private internal Changes panel.
- It cannot know which source template or component produced a DOM node.
- CSS rule diffs only work for stylesheets Chrome exposes through `document.styleSheets`.
- Cross-origin stylesheets may block access to `cssRules`.
- Shadow DOM and iframe content may need separate handling.
- Start capture before editing if you want useful before/after CSS diffs and a useful mutation log.


## Updating from an older version

After replacing the extension folder or reloading the unpacked extension:

1. Go to `chrome://extensions`.
2. Click **Reload** on **DOM + CSS DevTools Capture**.
3. Refresh the page you are editing.
4. Close DevTools completely and open it again.
5. Click **Start capture** again before making edits.

The page has to be refreshed because an older capture script can remain inside the already-open page until the page reloads.
