import { writeFileSync } from "node:fs";
import { zodToJsonSchema } from "zod-to-json-schema";
import { operations, readTables } from "../apps/api/src/routes";
import { login, errorSchema } from "../packages/contracts/src/index";
const schema = (s: Parameters<typeof zodToJsonSchema>[0]) => {
  const { $schema: _, ...json } = zodToJsonSchema(s, { $refStrategy: "none" });
  void _;
  return json;
};
const paths: Record<string, unknown> = {};
const response = {
  description:
    "Successful operation. Database UTC timestamps are ISO 8601; marks are integer hundredths.",
  content: {
    "application/json": {
      schema: { type: "object", properties: { data: {} }, required: ["data"] },
    },
  },
};
for (const [route, op] of Object.entries(operations))
  paths["/v1/" + route] = {
    post: {
      operationId: op.rpc,
      tags: [route.split("/")[0]],
      description:
        "Authorization is enforced by checked PostgreSQL RPC and RLS. See docs/api.md and backend-requirements.md for role/scope and idempotency rules.",
      security: [{ sessionCookie: [], csrf: [] }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: schema(op.schema) } },
      },
      responses: {
        200: response,
        400: { $ref: "#/components/responses/Error" },
        401: { $ref: "#/components/responses/Error" },
        403: { $ref: "#/components/responses/Error" },
        409: { $ref: "#/components/responses/Error" },
        503: { $ref: "#/components/responses/Error" },
      },
    },
  };
for (const [route, table] of Object.entries(readTables))
  paths["/v1/" + route] = {
    ...(paths["/v1/" + route] as object),
    get: {
      operationId: "list_" + table.table,
      security: [{ sessionCookie: [] }],
      parameters: [
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        },
        {
          name: "offset",
          in: "query",
          schema: { type: "integer", minimum: 0, maximum: 10000, default: 0 },
        },
        ...[
          "id",
          "version_id",
          "attempt_id",
          "group_id",
          "query_id",
          "article_id",
        ]
          .filter((f) => table.select.split(",").includes(f))
          .map((name) => ({
            name,
            in: "query",
            schema: { type: "string", format: "uuid" },
          })),
      ],
      responses: {
        200: {
          description:
            "Only authorized rows. Explicit projection: " + table.select,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: Object.fromEntries(
                        table.select.split(",").map((k) => [k, {}]),
                      ),
                      additionalProperties: false,
                    },
                  },
                },
              },
            },
          },
        },
        401: { $ref: "#/components/responses/Error" },
        403: { $ref: "#/components/responses/Error" },
      },
    },
  };
paths["/v1/auth/login"] = {
  post: {
    operationId: "login",
    description:
      "School code + login ID + password. Requires an approved Origin. Returns user and CSRF token; sets a Secure HttpOnly SameSite=Strict cookie.",
    requestBody: {
      required: true,
      content: { "application/json": { schema: schema(login) } },
    },
    responses: {
      200: { description: "Session established; no provider tokens returned." },
      401: { $ref: "#/components/responses/Error" },
    },
  },
};
for (const path of ["/healthz", "/readyz"])
  paths[path] = {
    get: {
      operationId: path.slice(1),
      responses: {
        200: { description: "Health/readiness and immutable release SHA" },
        503: { $ref: "#/components/responses/Error" },
      },
    },
  };
for (const [path, method, description] of [
  [
    "/v1/accounts",
    "post",
    "Recoverable authorized account provisioning; newly issued password returned once only.",
  ],
  [
    "/v1/auth/owner-login",
    "post",
    "Separate owner entry using configured owner UUID. Same login body schema; school fields are ignored for owner lookup.",
  ],
  ["/v1/auth/session", "get", "Current user/session expiry."],
  ["/v1/auth/logout", "post", "Revoke session and clear cookie."],
  [
    "/v1/auth/password",
    "post",
    "Current-password reauthentication; self change or authorized staff reset. Revokes sessions before Auth update.",
  ],
  [
    "/v1/auth/reauthenticate",
    "post",
    "Current-password verification for sensitive operations.",
  ],
  ["/v1/imports/template", "get", "Download XLSX template."],
  [
    "/v1/imports/preview",
    "post",
    "Raw XLSX body; classId query and Idempotency-Key header. No users created.",
  ],
  [
    "/v1/imports/confirm",
    "post",
    "jobId and selected integer row numbers; issue-only credentials in no-store response.",
  ],
  [
    "/v1/files/upload",
    "post",
    "Raw file body, X-Filename and Content-Type; postId OR messageId query. Private quarantine only.",
  ],
  [
    "/v1/files/{id}",
    "get",
    "Current-parent authorization; clean files only; forced attachment.",
  ],
  [
    "/v1/exports/{id}",
    "get",
    "Actor scope, current authorization, source version, expiry checked before private CSV download.",
  ],
  [
    "/v1/public/directory",
    "get",
    "Anonymous approved public profile directory. Noindex/no-store.",
  ],
  [
    "/v1/public/profiles/{id}",
    "get",
    "Approved public profile projection only.",
  ],
] as const)
  paths[path] = {
    [method]: {
      operationId:
        path.replaceAll("/", "_").replaceAll(/[{}-]/g, "") + "_" + method,
      description,
      security:
        path.includes("/public/") || path.includes("login")
          ? []
          : [{ sessionCookie: [], ...(method === "post" ? { csrf: [] } : {}) }],
      responses: {
        200: { description },
        400: { $ref: "#/components/responses/Error" },
        401: { $ref: "#/components/responses/Error" },
        403: { $ref: "#/components/responses/Error" },
        409: { $ref: "#/components/responses/Error" },
        503: { $ref: "#/components/responses/Error" },
      },
    },
  };
writeFileSync(
  "docs/openapi.json",
  JSON.stringify(
    {
      openapi: "3.0.3",
      info: {
        title: "Papperly Version 1 backend",
        version: "1.0.0",
        description:
          "Implementation contract; read backend-status.md for incomplete coverage and live verification blockers. Schema details for ancillary responses are not yet fully typed.",
      },
      servers: [{ url: "https://STAGING_WORKER_HOST" }],
      paths,
      components: {
        securitySchemes: {
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "__Host-papperly",
          },
          csrf: { type: "apiKey", in: "header", name: "X-CSRF-Token" },
        },
        schemas: { Error: schema(errorSchema) },
        responses: {
          Error: {
            description: "Consistent error code, safe message and requestId",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    null,
    2,
  ) + "\n",
);
