// Generated from runtime Zod contracts; run npm run contracts:generate.
export const aiOutputSchemas = {
  format: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          anyOf: [
            {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                prompt: { type: "string", minLength: 1, maxLength: 20000 },
                section: { type: "string", maxLength: 100 },
                max: { type: "integer", minimum: 0, maximum: 100000 },
                primaryTopic: {
                  anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }],
                },
                type: { type: "string", const: "mcq" },
                options: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", format: "uuid" },
                      text: { type: "string", minLength: 1, maxLength: 4000 },
                    },
                    required: ["id", "text"],
                    additionalProperties: false,
                  },
                  minItems: 2,
                  maxItems: 6,
                },
                shuffleOptions: { type: "boolean" },
              },
              required: [
                "id",
                "prompt",
                "section",
                "max",
                "primaryTopic",
                "type",
                "options",
                "shuffleOptions",
              ],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                prompt: { type: "string", minLength: 1, maxLength: 20000 },
                section: { type: "string", maxLength: 100 },
                max: { type: "integer", minimum: 0, maximum: 100000 },
                primaryTopic: {
                  anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }],
                },
                type: { type: "string", const: "boolean" },
              },
              required: [
                "id",
                "prompt",
                "section",
                "max",
                "primaryTopic",
                "type",
              ],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                prompt: { type: "string", minLength: 1, maxLength: 20000 },
                section: { type: "string", maxLength: 100 },
                max: { type: "integer", minimum: 0, maximum: 100000 },
                primaryTopic: {
                  anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }],
                },
                type: { type: "string", const: "match" },
                left: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", format: "uuid" },
                      text: { type: "string", minLength: 1, maxLength: 4000 },
                    },
                    required: ["id", "text"],
                    additionalProperties: false,
                  },
                  minItems: 1,
                  maxItems: 30,
                },
                right: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", format: "uuid" },
                      text: { type: "string", minLength: 1, maxLength: 4000 },
                    },
                    required: ["id", "text"],
                    additionalProperties: false,
                  },
                  minItems: 1,
                  maxItems: 30,
                },
              },
              required: [
                "id",
                "prompt",
                "section",
                "max",
                "primaryTopic",
                "type",
                "left",
                "right",
              ],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                prompt: { type: "string", minLength: 1, maxLength: 20000 },
                section: { type: "string", maxLength: 100 },
                max: { type: "integer", minimum: 0, maximum: 100000 },
                primaryTopic: {
                  anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }],
                },
                type: { type: "string", const: "blank" },
                blanks: {
                  type: "array",
                  items: { type: "string", format: "uuid" },
                  minItems: 1,
                  maxItems: 30,
                },
              },
              required: [
                "id",
                "prompt",
                "section",
                "max",
                "primaryTopic",
                "type",
                "blanks",
              ],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                prompt: { type: "string", minLength: 1, maxLength: 20000 },
                section: { type: "string", maxLength: 100 },
                max: { type: "integer", minimum: 0, maximum: 100000 },
                primaryTopic: {
                  anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }],
                },
                type: { type: "string", const: "subjective" },
              },
              required: [
                "id",
                "prompt",
                "section",
                "max",
                "primaryTopic",
                "type",
              ],
              additionalProperties: false,
            },
          ],
        },
        minItems: 1,
        maxItems: 200,
      },
      keys: {
        type: "array",
        items: {
          type: "object",
          properties: {
            questionId: { type: "string", format: "uuid" },
            correct: {},
            units: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  max: { type: "integer", minimum: 0, maximum: 100000 },
                  alternatives: { type: "array", items: { type: "string" } },
                  right: { type: "string", format: "uuid" },
                },
                required: ["id", "max"],
                additionalProperties: false,
              },
            },
            rubric: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  max: { type: "integer", minimum: 0, maximum: 100000 },
                  description: { type: "string", minLength: 1 },
                },
                required: ["id", "max", "description"],
                additionalProperties: false,
              },
            },
            reference: { type: "string", maxLength: 20000 },
          },
          required: ["questionId"],
          additionalProperties: false,
        },
        maxItems: 200,
      },
      warnings: {
        type: "array",
        items: { type: "string", maxLength: 2000 },
        maxItems: 200,
      },
    },
    required: ["questions", "keys", "warnings"],
    additionalProperties: false,
  },
  subjective: {
    type: "object",
    properties: {
      score: { type: "integer", minimum: 0, maximum: 100000 },
      criteria: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            score: { type: "integer", minimum: 0, maximum: 100000 },
            reason: { type: "string", minLength: 1, maxLength: 2000 },
          },
          required: ["id", "score", "reason"],
          additionalProperties: false,
        },
      },
      model: { type: "string", minLength: 1, maxLength: 100 },
      promptVersion: { type: "string", minLength: 1, maxLength: 100 },
    },
    required: ["score", "criteria", "model", "promptVersion"],
    additionalProperties: false,
  },
  insight: {
    type: "object",
    properties: {
      resultIds: { type: "array", items: { type: "string", format: "uuid" } },
      strengths: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string", maxLength: 1000 },
            evidence: {
              type: "array",
              items: { type: "string", format: "uuid" },
            },
          },
          required: ["text", "evidence"],
          additionalProperties: false,
        },
        maxItems: 3,
      },
      practice: {
        type: "array",
        items: {
          type: "object",
          properties: {
            topic: { type: "string", maxLength: 100 },
            action: { type: "string", maxLength: 1000 },
            evidence: {
              type: "array",
              items: { type: "string", format: "uuid" },
            },
            resourceId: {
              anyOf: [{ type: "string", format: "uuid" }, { type: "null" }],
            },
          },
          required: ["topic", "action", "evidence", "resourceId"],
          additionalProperties: false,
        },
        maxItems: 3,
      },
      sufficiency: {
        type: "string",
        enum: ["result-specific", "trend", "more-evidence-needed"],
      },
    },
    required: ["resultIds", "strengths", "practice", "sufficiency"],
    additionalProperties: false,
  },
} as const;
