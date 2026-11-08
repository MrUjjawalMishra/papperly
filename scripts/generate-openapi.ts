import { writeFileSync, readFileSync } from "node:fs";
import process from "node:process";
import { format } from "prettier";
import { zodToJsonSchema } from "zod-to-json-schema";
import { operations, readTables, listFilters } from "../apps/api/src/routes";
import { login, errorSchema } from "../packages/contracts/src/index";
import {
  accountInput,
  credentialChangeInput,
  reauthenticationInput,
  importConfirmationInput,
  authLoginResponse,
  authSessionResponse,
  passwordChangeResponse,
  accountProvisionResponse,
  importConfirmationResponse,
} from "../packages/contracts/src/auth";
const schema = (s: Parameters<typeof zodToJsonSchema>[0]) => {
  const { $schema: _, ...json } = zodToJsonSchema(s, {
    $refStrategy: "none",
    target: "openApi3",
  });
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
        429: { $ref: "#/components/responses/Error" },
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
        ...Object.entries(listFilters)
          .filter(([field]) => table.select.split(",").includes(field))
          .map(([name, type]) => ({
            name,
            in: "query",
            schema:
              type === "uuid"
                ? { type: "string", format: "uuid" }
                : { type: "string", maxLength: 200 },
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
        429: { $ref: "#/components/responses/Error" },
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
      429: { $ref: "#/components/responses/Error" },
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
    "Separate owner entry using a pinned UUID or the active singleton owner. Same login body schema; school fields are ignored for owner lookup. No public owner provisioning route exists.",
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
    "jobId and up to 300 selected integer row numbers. At most five new identities per response; resume remainingRows until complete. Per-response counts and issue-only credentials in no-store response.",
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
        429: { $ref: "#/components/responses/Error" },
        403: { $ref: "#/components/responses/Error" },
        409: { $ref: "#/components/responses/Error" },
        503: { $ref: "#/components/responses/Error" },
      },
    },
  };
// Primary account/session/import contracts are shared with runtime validation.
const primaryContracts = [
  ["/v1/auth/login", "post", login, authLoginResponse],
  ["/v1/auth/owner-login", "post", login, authLoginResponse],
  ["/v1/auth/session", "get", null, authSessionResponse],
  ["/v1/auth/password", "post", credentialChangeInput, passwordChangeResponse],
  ["/v1/accounts", "post", accountInput, accountProvisionResponse],
  [
    "/v1/imports/confirm",
    "post",
    importConfirmationInput,
    importConfirmationResponse,
  ],
] as const;
for (const [path, method, input, output] of primaryContracts) {
  const entry = paths[path] as Record<string, Record<string, unknown>>;
  const operation = entry[method];
  if (input)
    operation.requestBody = {
      required: true,
      content: { "application/json": { schema: schema(input) } },
    };
  const responses = operation.responses as Record<string, unknown>;
  responses["200"] = {
    description:
      "Validated response. No provider tokens or internal cookie values in JSON.",
    headers: path.includes("/auth/")
      ? {
          "Set-Cookie": {
            description:
              "When establishing/replacing a session: Secure; HttpOnly; SameSite=Strict; Path=/.",
            schema: { type: "string" },
          },
        }
      : undefined,
    content: { "application/json": { schema: schema(output) } },
  };
}
const reauth = paths["/v1/auth/reauthenticate"] as {
  post: Record<string, unknown>;
};
reauth.post.requestBody = {
  required: true,
  content: { "application/json": { schema: schema(reauthenticationInput) } },
};
const preview = paths["/v1/imports/preview"] as {
  post: Record<string, unknown>;
};
preview.post.parameters = [
  {
    name: "classId",
    in: "query",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
  {
    name: "Idempotency-Key",
    in: "header",
    required: true,
    schema: { type: "string", minLength: 8, maxLength: 200 },
  },
];
preview.post.requestBody = {
  required: true,
  content: {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
      schema: { type: "string", format: "binary" },
    },
  },
};
const upload = paths["/v1/files/upload"] as { post: Record<string, unknown> };
upload.post.parameters = [
  {
    name: "Idempotency-Key",
    in: "header",
    required: false,
    description:
      "Retry with identical parent, file bytes and metadata. Conflicting payload returns 409; absent key derives an uploader/content reservation. Deleted reservations require a new key.",
    schema: { type: "string", pattern: "^[A-Za-z0-9._:-]{8,128}$" },
  },
  {
    name: "X-Filename",
    in: "header",
    required: true,
    schema: { type: "string", maxLength: 200 },
  },
  ...["postId", "messageId"].map((name) => ({
    name,
    in: "query",
    required: false,
    description: "Supply exactly one parent ID.",
    schema: { type: "string", format: "uuid" },
  })),
];
upload.post.requestBody = {
  required: true,
  content: Object.fromEntries(
    [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ].map((type) => [type, { schema: { type: "string", format: "binary" } }]),
  ),
};
for (const [path, item] of Object.entries(paths)) {
  const names = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (!names.length) continue;
  for (const operation of Object.values(
    item as Record<string, Record<string, unknown>>,
  ))
    operation.parameters = [
      ...((operation.parameters as object[]) ?? []),
      ...names.map((name) => ({
        name,
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      })),
    ];
}
const generated = await format(
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
  { parser: "json" },
);
if (process.argv.includes("--check")) {
  if (readFileSync("docs/openapi.json", "utf8") !== generated)
    throw Error("OpenAPI is stale; run npm run contracts:generate");
} else writeFileSync("docs/openapi.json", generated);
