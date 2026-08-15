// subatom/package/core/docs/swaggerHtml.ts
export function renderSwaggerUiHtml(
	openApiUrl: string = "/openapi.json",
	logoUrl: string = "https://res.cloudinary.com/drdfur81n/image/upload/v1786723813/SubAtom_no_background_lbmgvu.png", // Replace with your logo path/URL
	appName: string = "",
	shortLogo: string = "https://res.cloudinary.com/drdfur81n/image/upload/v1786723815/SubAtom_short_logo_a3aa59.png",
): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Subatom Docs</title>
  <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <link rel="icon" type="image/png" href="${shortLogo}" sizes="32x32" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; }

    /* Customizing the Swagger UI Top Bar background */
    .swagger-ui .topbar {
      background-color: #0f172a; /* Dark slate look, similar to modern frameworks */
      padding: 10px 0;
    }
    .swagger-ui .topbar a {
      max-width: none;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "${openApiUrl}",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });

      // Safely replace the topbar contents once Swagger UI mounts
      const checkTopbar = setInterval(() => {
        const topbarWrapper = document.querySelector('.swagger-ui .topbar .topbar-wrapper');
        if (topbarWrapper) {
          clearInterval(checkTopbar);
          topbarWrapper.innerHTML = \`
            <a class="link" href="#" style="display: flex; align-items: center; text-decoration: none;">
              <img src="${logoUrl}" alt="${appName} Logo" style="height: 35px; width: auto; margin-right: 12px;" />
              <span style="color: #ffffff; font-size: 20px; font-weight: 600; font-family: system-ui, -apple-system, sans-serif;">${appName}</span>
            </a>
          \`;
        }
      }, 50);
    };
  </script>
</body>
</html>`;
}
