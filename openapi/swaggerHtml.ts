/**
 * @fileoverview Swagger UI dom creator.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function renderSwaggerUiHtml(
	openApiUrl: string = "/openapi.json",
	darkLogoUrl: string = "https://res.cloudinary.com/drdfur81n/image/upload/v1787205861/subatom_dark_frbair.png",
	liteLogoUrl: string = "https://res.cloudinary.com/drdfur81n/image/upload/v1787205050/subatom_lite_tpaiuf.png",
	appName: string = "SubAtom API",
	shortLogo: string = "https://res.cloudinary.com/drdfur81n/image/upload/v1786723815/SubAtom_short_logo_a3aa59.png",
): string {
	const safeOpenApiUrl = escapeHtml(openApiUrl);
	const _safeDarkLogoUrl = escapeHtml(darkLogoUrl);
	const _safeLiteLogoUrl = escapeHtml(liteLogoUrl);
	const safeShortLogo = escapeHtml(shortLogo);
	const safeAppName = escapeHtml(appName);

	// Keep the exact runtime values available to the generated HTML/JavaScript.
	// Escape "<" so user-provided data can never terminate the inline script tag.
	const runtimeConfig = JSON.stringify({
		openApiUrl,
		darkLogoUrl,
		liteLogoUrl,
		shortLogo,
		appName,
	}).replace(/</g, "\\u003c");

	return `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Interactive API reference for the SubAtom API."
    />
    <meta name="theme-color" content="#070b12" id="theme-color" />
<title>${safeAppName || "API Docs"}</title>
  <link rel="icon" type="image/png" href="${safeShortLogo}" sizes="32x32" />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"
    />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />

    <script>
      (() => {
        let theme = "dark";
        try {
          const saved = localStorage.getItem("subatom_swagger_theme");
          if (saved === "light" || saved === "dark") {
            theme = saved;
          } else if (
            window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: light)").matches
          ) {
            theme = "light";
          }
        } catch (_) {}

        document.documentElement.dataset.theme = theme;
      })();
    </script>

    <style>
      :root {
        color-scheme: dark;

        --page-bg: #070b12;
        --surface: #0d1422;
        --surface-2: #111c2e;
        --surface-3: #162238;
        --text: #e5edf8;
        --text-muted: #94a3b8;
        --text-subtle: #64748b;
        --border: rgba(148, 163, 184, 0.16);
        --border-strong: rgba(148, 163, 184, 0.28);
        --input-bg: #0b1321;
        --code-bg: #09111e;
        --topbar-bg: rgba(11, 18, 32, 0.92);
        --link: #38bdf8;
        --focus: #38bdf8;
        --shadow: 0 12px 35px rgba(0, 0, 0, 0.18);
      }

      html[data-theme="light"] {
        color-scheme: light;

        --page-bg: #f6f8fb;
        --surface: #ffffff;
        --surface-2: #f8fafc;
        --surface-3: #eef2f7;
        --text: #172033;
        --text-muted: #526174;
        --text-subtle: #64748b;
        --border: rgba(15, 23, 42, 0.11);
        --border-strong: rgba(15, 23, 42, 0.2);
        --input-bg: #ffffff;
        --code-bg: #f1f5f9;
        --topbar-bg: rgba(255, 255, 255, 0.94);
        --link: #0369a1;
        --focus: #0284c7;
        --shadow: 0 12px 35px rgba(15, 23, 42, 0.08);
      }

      * {
        box-sizing: border-box;
      }

      html {
        min-height: 100%;
        overflow-y: scroll;
        background: var(--page-bg);
      }
      /* Dark mode */
      html[data-theme="dark"] .swagger-ui .copy-to-clipboard svg {
        color: #e2e8f0 !important;
      }

      html[data-theme="light"] .swagger-ui .copy-to-clipboard:hover svg {
        color: #475569 !important;
        fill: #475569 !important;
        stroke: #475569 !important;
      }

      /* Light mode — hovered */
      html[data-theme="light"] .swagger-ui .copy-to-clipboard:hover svg {
        color: #475569 !important;
      }

      .operations-tag-default small {
        background: #000;
      }

      html[data-theme="light"]
        .swagger-ui
        .parameters-col_description
        input[type="file"] {
        background: #ffff !important;
        color: #000000 !important;
      }
      html[data-theme="light"]
        .swagger-ui
        .parameters-col_description
        input[type="file"]::file-selector-button {
        color: #000000 !important;
        background: #e7e1e1 !important;
        border: 1px solid gray;
        border-radius: 4px;
      }

    html[data-theme="light"] .swagger-ui .expand-operation svg {
        color: var(--text) !important;
      }
          html[data-theme="light"] .swagger-ui .opblock-control-arrow svg{
        color: var(--text) !important;
      }


      html[data-theme="light"] .swagger-ui .json-schema-2020-12 {
        background: #f2f2f2 !important;
      }

      html[data-theme="light"] .swagger-ui .json-schema-2020-12 button {
        background: #f2f2f2 !important;
        color: #000 !important;
      }

      html[data-theme="light"] .swagger-ui .json-schema-2020-12__title {
        color: var(--text) !important;
      }
      html[data-theme="light"] .swagger-ui .opblock .model-example .tab button {
        color: var(--text) !important;
      }

      html[data-theme="light"] .swagger-ui .json-schema-2020-12 button svg {
        color: var(--text) !important;
      }

      html[data-theme="light"] .swagger-ui section.models .models-control svg {
        color: var(--text) !important;
      }
      html[data-theme="dark"]
        .swagger-ui
        .parameters-col_description
        input[type="file"]::file-selector-button {
        border: 1px solid gray;
        border-radius: 4px;
      }

      html[data-theme="light"]
        .swagger-ui
        .parameters-col_description
        input[type="text"]::placeholder {
        color: var(--text-subtle) !important;
        opacity: 1 !important;
      }

      html[data-theme="light"] .swagger-ui .opblock-tag {
        border-bottom-color: #bcc2ba !important;
      }

      html[data-theme="light"] .swagger-ui .opblock.opblock-post thead tr th {
        border-color: #bcc2ba !important;
      }

      html[data-theme="dark"]
        .swagger-ui
        .parameters-col_description
        input[type="text"]::placeholder {
        color: #fff !important;
        opacity: 1 !important;
      }

      .opblock-description-wrapper p {
        color: var(--text-subtle) !important;
      }
      body {
        min-height: 100vh;
        margin: 0;
        font-family:
          "Inter",
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
        color: var(--text);
        background:
          radial-gradient(
            circle at 50% -10%,
            rgba(59, 130, 246, 0.08),
            transparent 34rem
          ),
          var(--page-bg);
        transition:
          background-color 180ms ease,
          color 180ms ease;
      }

      button,
      input,
      textarea,
      select {
        font: inherit;
      }

      a {
        color: var(--link);
      }

      .swagger-ui .copy-to-clipboard:not(:hover) {
        margin-right: 1rem !important;
      }

      .swagger-ui .copy-to-clipboard:not(:hover) svg {
        color: var(--text) !important;
      }
      .swagger-ui .copy-to-clipboard {
        margin-right: 1rem !important;
      }

      .theme-toggle {
        width: 38px;
        height: 38px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        padding: 0;
        border: 1px solid var(--border-strong);
        border-radius: 9px;
        color: var(--text);
        background: var(--surface-2);
        cursor: pointer;
        transition:
          background-color 160ms ease,
          border-color 160ms ease,
          color 160ms ease,
          transform 120ms ease;
      }

      .theme-toggle:hover {
        background: var(--surface-3);
        border-color: var(--border-strong);
      }

      .theme-toggle:active {
        transform: scale(0.96);
      }

      .theme-toggle:focus-visible,
      .swagger-ui a:focus-visible,
      .swagger-ui button:focus-visible,
      .swagger-ui input:focus-visible,
      .swagger-ui textarea:focus-visible,
      .swagger-ui select:focus-visible {
        outline: 2px solid var(--focus) !important;
        outline-offset: 2px !important;
      }

      .error-banner {
        display: none;
        max-width: 640px;
        margin: 96px auto 0;
        padding: 20px 24px;
        border: 1px solid rgba(251, 113, 133, 0.35);
        border-radius: 12px;
        color: #be123c;
        background: rgba(251, 113, 133, 0.08);
        font-size: 14px;
        line-height: 1.5;
      }

      html[data-theme="dark"] .error-banner {
        color: #fda4af;
      }

      /* ------------------------------------------------------------
         Swagger UI theme
         ------------------------------------------------------------ */

      .swagger-ui {
        color: var(--text) !important;
        font-family: "Inter", system-ui, sans-serif !important;
      }

      .swagger-ui,
      .swagger-ui .wrapper {
        background: transparent !important;
      }

      .swagger-ui .wrapper {
        max-width: 1320px;
        padding: 0 20px;
      }

      .swagger-ui .topbar {
        position: sticky !important;
        top: 0;
        z-index: 100;
        margin: 0 !important;
        padding: 9px 20px !important;
        background: var(--topbar-bg) !important;
        border-bottom: 1px solid var(--border) !important;
        box-shadow: 0 1px 0 rgba(0, 0, 0, 0.02);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .swagger-ui .topbar .topbar-wrapper {
        width: 100%;
        max-width: 1320px;
        min-height: 38px;
        margin: 0 auto;
        padding: 0 !important;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .swagger-ui .topbar .topbar-wrapper > * {
        margin: 0;
      }

      .swagger-ui .topbar .topbar-wrapper a {
        display: flex;
        flex-direction: column;
        align-items: center;
        max-width: 150px;
      }

      @media (width <= 555px) {
        .swagger-ui .topbar .topbar-wrapper {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
        }

        .swagger-ui .topbar .topbar-wrapper a {
          max-width: 120px;
        }
      }

      .swagger-ui .topbar img {
        max-width: 160px;
        height: 40px;
        object-fit: contain;
      }

      .swagger-ui .download-url-wrapper {
        display: none !important;
      }

      /* Global text */
      .swagger-ui .info .title .version,
      .swagger-ui .info p,
      .swagger-ui .info li,
      .swagger-ui .opblock-tag,
      .swagger-ui .opblock-tag small,
      .swagger-ui .opblock-summary-description,
      .swagger-ui .parameter__name,
      .swagger-ui .parameter__type,
      .swagger-ui .parameter__extension,
      .swagger-ui label,
      .swagger-ui table thead tr td,
      .swagger-ui table thead tr th,
      .swagger-ui .response-col_status,
      .swagger-ui .response-col_description,
      .swagger-ui .model-title,
      .swagger-ui .model,
      .swagger-ui .model-box,
      .swagger-ui section.models h4,
      .swagger-ui section.models h4 span,
      .swagger-ui .tab li,
      .swagger-ui .response-col_links {
        color: var(--text) !important;
      }

      .swagger-ui .info .title {
        font-size: 34px;
        letter-spacing: -0.025em;
      }

      .swagger-ui .info a,
      .swagger-ui .info a:visited,
      .swagger-ui .renderedMarkdown a {
        color: var(--link) !important;
      }

      .swagger-ui .info p,
      .swagger-ui .renderedMarkdown p,
      .swagger-ui .renderedMarkdown li {
        color: var(--text-muted) !important;
      }

      /* Main surfaces */
      .swagger-ui .scheme-container,
      .swagger-ui .opblock .opblock-section-header,
      .swagger-ui section.models,
      .swagger-ui section.models.is-open h4,
      .swagger-ui .model-box,
      .swagger-ui .dialog-ux .modal-ux,
      .swagger-ui .dialog-ux .modal-ux-header {
        background: var(--surface) !important;
        color: var(--text) !important;
        border-color: var(--border) !important;
      }

      .swagger-ui .scheme-container {
        margin: 0 0 24px;
        padding: 20px;
        box-shadow: var(--shadow);
      }

      .swagger-ui .opblock {
        margin: 0 0 14px;
        background: var(--surface) !important;
        border: 1px solid var(--border) !important;
        border-radius: 10px;
        box-shadow: none !important;
        overflow: hidden;
      }

      .swagger-ui .opblock .opblock-summary {
        min-height: 56px;
        background: transparent !important;
      }

      .swagger-ui .opblock .opblock-summary:hover {
        background: var(--surface-2) !important;
      }

      .swagger-ui .opblock .opblock-section-header {
        box-shadow: inset 0 -1px 0 var(--border);
      }

      .swagger-ui .opblock-body {
        background: var(--surface) !important;
      }

      /* HTTP method accents - keep these stable in both themes */
      .swagger-ui .opblock.opblock-get {
        border-left: 3px solid #38bdf8 !important;
      }

      .swagger-ui .opblock.opblock-post {
        border-left: 3px solid #34d399 !important;
      }

      .swagger-ui .opblock.opblock-put {
        border-left: 3px solid #fbbf24 !important;
      }

      .swagger-ui .opblock.opblock-delete {
        border-left: 3px solid #fb7185 !important;
      }

      .swagger-ui .opblock.opblock-patch {
        border-left: 3px solid #a78bfa !important;
      }

      /* Inputs / controls */
      .swagger-ui input[type="text"],
      .swagger-ui input[type="password"],
      .swagger-ui input[type="email"],
      .swagger-ui input[type="number"],
      .swagger-ui textarea,
      .swagger-ui select {
        color: var(--text) !important;
        background: var(--input-bg) !important;
        border: 1px solid var(--border-strong) !important;
        border-radius: 7px;
        box-shadow: none !important;
      }

      .swagger-ui input::placeholder,
      .swagger-ui textarea::placeholder {
        color: var(--text-subtle) !important;
        opacity: 1;
      }

      .swagger-ui select option {
        color: var(--text);
        background: var(--surface);
      }

      .swagger-ui .btn {
        color: var(--text) !important;
        background: var(--surface-2) !important;
        border-color: var(--border-strong) !important;
      }

      .swagger-ui .btn:hover {
        background: var(--surface-3) !important;
      }

      .swagger-ui .btn.execute {
        color: #fff !important;
        background: #2563eb !important;
        border-color: #2563eb !important;
      }

      .swagger-ui .btn.cancel {
        color: var(--text) !important;
        background: transparent !important;
      }

      /* Code blocks */
      .swagger-ui,
      .swagger-ui .highlight-code,
      .swagger-ui .microlight,
      .swagger-ui .opblock-body pre.microlight {
        color: var(--text) !important;
        background: var(--code-bg) !important;
        border: 1px solid var(--border) !important;
      }

      .swagger-ui,
      .title {
        color: var(--text) !important;
      }
      .swagger-ui small,
      pre {
        color: var(--text) !important;
        background: var(--code-bg) !important;
      }

      .swagger-ui .highlight-code > .microlight {
        background: transparent !important;
        border: 0 !important;
      }

      .swagger-ui code {
        // color: #fff !important;
        /* background: var(--code-bg) !important; */
      }

      .swagger-ui .microlight, .swagger-ui .opblock-body pre.microlight{
      color: #ffffff !important;
      }
      /* Tables */
      .swagger-ui table {
        color: var(--text) !important;
      }

      .swagger-ui table thead tr {
        background: var(--surface-2) !important;
      }

      .swagger-ui table tbody tr td {
        color: var(--text-muted) !important;
        border-color: var(--border) !important;
      }

      /* Models */
      .swagger-ui .model-box-control,
      .swagger-ui .model-toggle {
        color: var(--text) !important;
      }

      .swagger-ui .prop-type,
      .swagger-ui .prop-format,
      .swagger-ui .property.primitive {
        color: var(--text-muted) !important;
      }

      /* Dialog / auth modal */
      .swagger-ui .dialog-ux {
        background: rgba(0, 0, 0, 0.48);
      }

      .swagger-ui .dialog-ux .modal-ux {
        box-shadow: var(--shadow) !important;
      }

      .swagger-ui .dialog-ux .modal-ux-header {
        border-bottom: 1px solid var(--border) !important;
      }

      .swagger-ui .dialog-ux .modal-ux-content p,
      .swagger-ui .dialog-ux .modal-ux-content label,
      .swagger-ui .auth-container,
      .swagger-ui .auth-container label {
        color: var(--text) !important;
      }

      /* Expand/collapse and operation controls */
      .swagger-ui .opblock-summary-control,
      .swagger-ui .opblock-tag-section h4,
      .swagger-ui .servers > label,
      .swagger-ui .servers-title,
      .swagger-ui .try-out__btn {
        color: var(--text) !important;
      }

      .swagger-ui .opblock-summary-path,
      .swagger-ui .opblock-summary-method {
        color: var(--text) !important;
      }

      .swagger-ui .responses-inner h4,
      .swagger-ui .responses-inner h5 {
        color: var(--text) !important;
      }

      /* Remove Swagger's light-only hardcoded fills where possible */
      .swagger-ui .parameter__in,
      .swagger-ui .response-col_links a,
      .swagger-ui .download-contents {
        color: #e4e6e6 !important;
      }

      .swagger-ui .opblock .parameter__in {
        color: #869292 !important;
      }
      swagger-ui .opblock .opblock-section-header .try-out__btn.cancel {
       border-color: #ff5f5f !important;
       color: #ff5f5f !important;
      }
      .swagger-ui .parameter__name.required::after {
        color: #ef4444 !important;
      }

      /* Loading / empty state */
      #loading-fallback {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
        background: var(--page-bg);
        transition: opacity 180ms ease;
      }

      #loading-fallback .spinner {
        width: 42px;
        height: 42px;
        border: 3px solid var(--border);
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      #loading-fallback .loading-text {
        margin-top: 14px;
        font-size: 14px;
        font-weight: 500;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (max-width: 700px) {
        .swagger-ui .wrapper {
          padding: 0 12px;
        }

        .swagger-ui .topbar {
          padding: 8px 12px !important;
        }

        .swagger-ui .topbar img {
          max-width: 135px;
          height: 36px;
        }

        .swagger-ui .info .title {
          font-size: 28px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          scroll-behavior: auto !important;
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }
    </style>
  </head>

  <body>
    <noscript>
      <div
        style="
          max-width: 640px;
          margin: 96px auto;
          padding: 20px 24px;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          font-family: sans-serif;
        "
      >
        This API reference needs JavaScript enabled to render. Please enable
        JavaScript, or view the raw
        <a href="${safeOpenApiUrl}">openapi.json</a> directly.
      </div>
    </noscript>

    <div id="loading-fallback" aria-live="polite">
      <div class="spinner"></div>
      <div class="loading-text">Loading ${safeAppName || "API"}...</div>
    </div>

    <div id="error-banner" class="error-banner" role="alert"></div>
    <div id="swagger-ui"></div>

    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>

    <script>
      (() => {
        "use strict";

        const root = document.documentElement;
        const THEME_KEY = "subatom_swagger_theme";

        let memoryStore = {};

        const storage = {
          get(key) {
            try {
              return window.localStorage.getItem(key);
            } catch (_) {
              return Object.prototype.hasOwnProperty.call(memoryStore, key)
                ? memoryStore[key]
                : null;
            }
          },

          set(key, value) {
            try {
              window.localStorage.setItem(key, value);
            } catch (_) {
              memoryStore[key] = value;
            }
          },
        };

        function getTheme() {
          return root.dataset.theme === "light" ? "light" : "dark";
        }

        function setTheme(theme) {
          const nextTheme = theme === "light" ? "light" : "dark";

          root.dataset.theme = nextTheme;
          storage.set(THEME_KEY, nextTheme);

          const meta = document.getElementById("theme-color");
          if (meta) {
            meta.setAttribute(
              "content",
              nextTheme === "light" ? "#f6f8fb" : "#070b12",
            );
          }
        }

        const RUNTIME_CONFIG = ${runtimeConfig};

        function resolveSpecUrl() {
          const params = new URLSearchParams(window.location.search);
          const override = params.get("spec");

          if (override) {
            try {
              return new URL(override, window.location.href).toString();
            } catch (_) {
              return override;
            }
          }

          // Use the URL supplied to renderSwaggerUiHtml().
          // Override with ?spec=... when required.
          try {
            return new URL(
              RUNTIME_CONFIG.openApiUrl,
              window.location.href,
            ).toString();
          } catch (_) {
            return RUNTIME_CONFIG.openApiUrl;
          }
        }

        function showError(message) {
          const fallback = document.getElementById("loading-fallback");
          if (fallback) {
            fallback.remove();
          }

          const banner = document.getElementById("error-banner");
          if (!banner) return;

          banner.textContent = message;
          banner.style.display = "block";
        }

        function createThemeButton() {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "theme-toggle";
          button.id = "theme-toggle";
          button.title = "Toggle light/dark mode";

          // The generated page is already inside an outer template literal,
          // so build this inner HTML without introducing another backtick.
          button.innerHTML = [
            '<svg class="theme-icon sun-icon" width="17" height="17" viewBox="0 0 24 24"',
            ' fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">',
            '<circle cx="12" cy="12" r="4"></circle>',
            '<path stroke-linecap="round"',
            ' d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>',
            '</svg>',
            '<svg class="theme-icon moon-icon" width="17" height="17" viewBox="0 0 24 24"',
            ' fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">',
            '<path stroke-linecap="round" stroke-linejoin="round"',
            ' d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>',
            '</svg>',
          ].join("");       button.addEventListener("click", () => {
            setTheme(getTheme() === "dark" ? "light" : "dark");
            syncLogo();
            syncThemeButton();
          });

          return button;
        }

        function syncThemeButton() {
          const button = document.getElementById("theme-toggle");
          if (!button) return;

          const isLight = getTheme() === "light";
          const sun = button.querySelector(".sun-icon");
          const moon = button.querySelector(".moon-icon");

          if (sun) sun.style.display = isLight ? "none" : "block";
          if (moon) moon.style.display = isLight ? "block" : "none";

          button.setAttribute("aria-pressed", String(isLight));
          button.setAttribute(
            "aria-label",
            isLight ? "Switch to dark theme" : "Switch to light theme",
          );
        }

        function mountTopbar() {
          const wrapper = document.querySelector(
            ".swagger-ui .topbar .topbar-wrapper",
          );

          if (!wrapper || wrapper.dataset.subatomMounted === "true") {
            return Boolean(wrapper);
          }

          wrapper.dataset.subatomMounted = "true";
          wrapper.innerHTML = "";

          const link = document.createElement("a");
          link.href = "/";
          link.setAttribute("aria-label", "SubAtom API home");

          const logo = document.createElement("img");
          logo.id = "brand_logo";
          logo.alt = "SubAtom API";

          const lightLogoUrl =
            "";

          logo.src =
            getTheme() === "light"
              ? RUNTIME_CONFIG.liteLogoUrl
              : RUNTIME_CONFIG.darkLogoUrl;
          link.appendChild(logo);

          const button = createThemeButton();

          wrapper.appendChild(link);
          wrapper.appendChild(button);

          syncThemeButton();
          return true;
        }

        function syncLogo() {
          const logo = document.getElementById("brand_logo");
          if (!logo) return;

          logo.src =
            getTheme() === "light"
              ? RUNTIME_CONFIG.liteLogoUrl
              : RUNTIME_CONFIG.darkLogoUrl;
        }

        function observeSwagger() {
          let topbarAttempts = 0;
          const maxAttempts = 200;

          const topbarTimer = setInterval(() => {
            topbarAttempts++;

            if (mountTopbar()) {
              clearInterval(topbarTimer);
              return;
            }

            if (topbarAttempts >= maxAttempts) {
              clearInterval(topbarTimer);
            }
          }, 50);

          let loadAttempts = 0;
          const maxLoadAttempts = 150;

          const loadedTimer = setInterval(() => {
            loadAttempts++;

            const hasOperation = document.querySelector(".swagger-ui .opblock");

            const hasInfo = document.querySelector(".swagger-ui .info");
            const hasTable = document.querySelector(".swagger-ui table");

            if (hasOperation || (hasInfo && hasTable)) {
              clearInterval(loadedTimer);

              const fallback = document.getElementById("loading-fallback");
              if (fallback) {
                fallback.style.opacity = "0";
                window.setTimeout(() => fallback.remove(), 200);
              }

              mountTopbar();
              syncThemeButton();
              syncLogo();
              return;
            }

            if (loadAttempts >= maxLoadAttempts) {
              clearInterval(loadedTimer);
              showError(
                "This is taking longer than expected. The API specification may be unavailable — try refreshing the page.",
              );
            }
          }, 100);
        }

                
        
        
        
        
  function routeNameMutation() {
      const operations = document.querySelectorAll(".swagger-ui .opblock-summary");

      operations.forEach((opblock) => {
           const routePath = opblock.querySelector(".opblock-summary-path");
                  if (!routePath) return;

    // Check data-path attribute, link text, or fallback textContent
                      const pathValue = (
                      routePath.getAttribute("data-path") ||
                      routePath.textContent ||
                      ""
                      ).trim();

            if (pathValue === "/") {
                let routeName = opblock.querySelector(".opblock-summary-description");

      // Swagger UI does not render this element if no description was defined in OpenAPI
      if (!routeName) {
        routeName = document.createElement("div");
        routeName.className = "opblock-summary-description";

        const container = opblock.querySelector("button") || opblock;
        container.appendChild(routeName);
      }

      routeName.textContent = "Root";
    }
  });
}
    
  function observeRouteMutations() {
      const targetNode = document.getElementById("swagger-ui");
            if (!targetNode) return;

      const observer = new MutationObserver(() => {
            routeNameMutation();
            });

      observer.observe(targetNode, {
              childList: true,
              subtree: true,
      });
  }



        window.addEventListener("DOMContentLoaded", () => {
          if (typeof SwaggerUIBundle !== "function") {
            showError(
              "Swagger UI failed to load. Check your network connection or CDN availability.",
            );
            return;
          }

          window.ui = SwaggerUIBundle({
            url: resolveSpecUrl(),
            dom_id: "#swagger-ui",
            deepLinking: true,
            persistAuthorization: true,
            presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
            plugins: [SwaggerUIBundle.plugins.DownloadUrl],
            layout: "StandaloneLayout",

            onComplete: () => {
              mountTopbar();
              syncThemeButton();
              syncLogo();
              routeNameMutation()
            },

            onFailure: (err) => {
              console.error(
                "SubAtom API docs: failed to load OpenAPI spec",
                err,
              );

              showError(
                "Couldn't load the API specification. Check that /openapi.json is reachable and try refreshing the page.",
              );
            },
          });

          observeSwagger();
        });
      })();
    </script>
  </body>
</html>
`;
}
