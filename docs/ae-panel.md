# ExpressionLab in After Effects (CEP panel)

The same app, docked in After Effects 2022 or later (Windows or macOS), with buttons that talk to AE:

- **Apply to selected:** sets the expression on every property selected in the timeline, in one undo step. AE's
  expression errors show up under the button.
- **Use selected property:** sets the graph's target (Position 2D/3D, Opacity, Source Text, an effect slider, a
  shape path and so on) from the selected property.
- **Load from selected:** opens the graph embedded in the selected property's expression (the `//@ae-nodes` line) as
  a new tab.
- **File › Create globals in comp:** runs the setup script in the active comp, creating the GLOBALS null, the layers
  and the controls. You don't need to download the `.jsx`.
- **Save project** and the setup script download open a normal save dialog.

## Install a .zxp (with your ZXP installer)

1. Get `ExpressionLab-<version>.zxp`. To build it yourself, see [Build and sign](#build-and-sign) below.
2. Open your ZXP installer (for example aescripts' ZXP Installer) and drop the `.zxp` onto it.
3. Restart After Effects, then open **Window › Extensions › ExpressionLab**.

The `.zxp` is self-signed, which is fine for installers. To uninstall, use the installer's list of extensions.

## Try it without signing (developer mode)

Unsigned panels load once CEP's debug mode is on. This is handy while developing, or to try a build from CI (the
`expressionlab-panel` artifact on a CI run).

1. Turn on debug mode, once per CEP version (AE 2022–2023 use CSXS.11; AE 2024 and later use CSXS.12; setting both
   is harmless):
   - **Windows:** run in a Command Prompt
     ```
     reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f
     reg add HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /t REG_SZ /d 1 /f
     ```
   - **macOS:** run in Terminal
     ```
     defaults write com.adobe.CSXS.11 PlayerDebugMode 1
     defaults write com.adobe.CSXS.12 PlayerDebugMode 1
     ```
2. Copy the built `dist-panel` folder into the extensions folder and rename it `com.expressionlab.panel`:
   - **Windows:** `%APPDATA%\Adobe\CEP\extensions\com.expressionlab.panel`
   - **macOS:** `~/Library/Application Support/Adobe/CEP/extensions/com.expressionlab.panel`
3. Restart After Effects and open **Window › Extensions › ExpressionLab**.

To debug, build with `PANEL_DEBUG=1 npm run build:panel`. Then open `http://localhost:8088` in Chrome while the
panel is open.

## Build and sign

```sh
npm install
npm run build:panel                    # → dist-panel/ (index.html, CSXS/manifest.xml, host/host.jsx)
ZXPSIGNCMD=/path/to/ZXPSignCmd ZXP_PASSWORD=choose-one npm run package:zxp
                                       # → release/ExpressionLab-<version>.zxp
```

`ZXPSignCmd` is Adobe's signing tool, from
[Adobe-CEP/CEP-Resources](https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD). The first run creates a
self-signed certificate in `.cert/` (git-ignored). Keep the certificate and password, and sign later versions with
them so updates install over the top.

## How it works

- `vite build --mode panel` builds the app for `file://`: a single classic script (CEP blocks module scripts there),
  relative paths, and a Chromium 88 syntax target. It also copies `cep/CSXS/manifest.xml` (bundle id
  `com.expressionlab.panel`) and `cep/host/host.jsx`.
- `cep/host/host.jsx` is ES3 ExtendScript that AE loads with the panel. It exposes `ExpressionLab.getSelection`,
  `applyExpression` and `readExpression`, which return JSON text.
- `src/app/host/` is the adapter. It detects `window.__adobe_cep__` and calls `evalScript`. On the web there's no host
  and the AE buttons are hidden. `panel.ts` fills gaps in CEP's older Chromium: `structuredClone`, `Array.at`, and
  `deflate-raw` (through Node's zlib, enabled in the manifest).
- Tests run the real `host.jsx` against a fake AE in Node (`tests/host`). They also load the built panel from
  `file://` in Playwright, with that fake behind `__adobe_cep__` (`tests/e2e/panel.spec.ts`). Real-AE checks are in
  [`ae-verification.md`](ae-verification.md).
