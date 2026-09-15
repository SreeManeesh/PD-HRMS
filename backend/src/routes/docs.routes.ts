import { Router, type Request, type Response } from "express";

const router = Router();

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Proteccio Enterprise HRMS API",
    version: "1.0.0",
    description: "Production API specification for Proteccio HRMS — encompassing Employee Lifecycle, Attendance, Payroll, Payslip Branding, and Security Compliance.",
    contact: {
      name: "Proteccio Engineering Support",
      email: "engineering@proteccio.internal",
    },
  },
  servers: [
    {
      url: "/api",
      description: "Default API base path",
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Standard JWT bearer access token issued via /api/auth/login",
      },
    },
  },
  security: [
    {
      BearerAuth: [],
    },
  ],
  paths: {
    "/health": {
      get: {
        summary: "System Health & Liveness Probe",
        tags: ["System"],
        security: [],
        responses: {
          "200": {
            description: "Service health status and database connectivity status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    uptime: { type: "number", example: 420.5 },
                    db: { type: "string", example: "up" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/auth/login": {
      post: {
        summary: "Authenticate user and issue rotating JWT session tokens",
        tags: ["Authentication"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", example: "admin@proteccio.internal" },
                  password: { type: "string", example: "Admin@12345" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Successful login with access token, refresh token, and permissions",
          },
          "401": {
            description: "Invalid credentials or account locked",
          },
        },
      },
    },
    "/auth/refresh": {
      post: {
        summary: "Rotate refresh token and issue fresh access token",
        tags: ["Authentication"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: {
                  refreshToken: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Refreshed access token" },
        },
      },
    },
    "/auth/me": {
      get: {
        summary: "Get current authenticated user profile and permissions",
        tags: ["Authentication"],
        responses: {
          "200": { description: "Current user profile" },
        },
      },
    },
    "/auth/revoke-sessions": {
      post: {
        summary: "Revoke all active sessions across all devices for the current user",
        tags: ["Authentication"],
        responses: {
          "200": { description: "Sessions revoked count" },
        },
      },
    },
    "/employees": {
      get: {
        summary: "List employees with search, department filtering, and pagination",
        tags: ["Employees"],
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "department", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          "200": { description: "Paginated list of employees with role-masked PII" },
        },
      },
      post: {
        summary: "Create new employee record and establish auth user account",
        tags: ["Employees"],
        responses: {
          "201": { description: "Employee created successfully" },
        },
      },
    },
    "/employees/{id}": {
      get: {
        summary: "Get employee details by UUID or Employee Code",
        tags: ["Employees"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Employee profile with bank and compensation details" },
        },
      },
    },
    "/attendance/summary": {
      get: {
        summary: "Get monthly attendance summary and statistics",
        tags: ["Attendance"],
        responses: {
          "200": { description: "Monthly attendance breakdown" },
        },
      },
    },
    "/leave/requests": {
      get: {
        summary: "List leave applications with status filter",
        tags: ["Leave Management"],
        responses: {
          "200": { description: "Leave applications" },
        },
      },
    },
    "/payroll/runs": {
      get: {
        summary: "List payroll runs and monthly cycles",
        tags: ["Payroll"],
        responses: {
          "200": { description: "Payroll run records" },
        },
      },
    },
    "/company/branding": {
      get: {
        summary: "Get company visual branding, logo, and payslip color themes",
        tags: ["Payslip & Branding"],
        responses: {
          "200": { description: "Company branding parameters" },
        },
      },
      put: {
        summary: "Update company branding, custom logo, and table layout styling",
        tags: ["Payslip & Branding"],
        responses: {
          "200": { description: "Branding updated successfully" },
        },
      },
    },
  },
};

router.get("/spec.json", (_req: Request, res: Response) => {
  res.json(openApiSpec);
});

router.get("/", (_req: Request, res: Response) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Proteccio HRMS — Interactive API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; font-family: Inter, sans-serif; }
    .topbar { background: #0d1b2a !important; padding: 12px 24px; display: flex; align-items: center; }
    .topbar a { color: #fff; text-decoration: none; font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #0f766e; }
    .swagger-ui .btn.authorize { color: #0f766e; border-color: #0f766e; }
    .swagger-ui .btn.authorize svg { fill: #0f766e; }
  </style>
</head>
<body>
  <div class="topbar">
    <a href="/api/docs">
      <span>🛡️ Proteccio HRMS API Reference (OpenAPI 3.0)</span>
    </a>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
  window.onload = function() {
    window.ui = SwaggerUIBundle({
      url: "/api/docs/spec.json",
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
  };
  </script>
</body>
</html>`;
  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

export default router;
