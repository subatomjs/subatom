export const postBodySchema = {
  body: {
    type: "object",
    properties: {
      application: { type: "string" },
      author: { type: "string" },
      url: { type: "string" },
      email: { type: "string", format: "email" },
      bussiness: { type: "string" },
    },
    required: ["application", "author", "email"],
  },
};

export const patchBodySchema = {
  body: {
    type: "object",
    properties: {
      application: { type: "string" },
      author: { type: "string" },
      url: { type: "string", format: "url" },
      email: { type: "string", format: "email" },
      bussiness: { type: "string" },
    },
    required: ["application", "author", "email"],
  },
};

export const putBodySchema = {
  body: {
    type: "object",
    properties: {
      application: { type: "string" },
      author: { type: "string" },
      url: { type: "string", format: "url" },
      email: { type: "string", format: "email" },
      bussiness: { type: "string" },
    },
    required: ["application", "author", "email"],
  },
};

export const queryBodySchema = {
  summary: "Query dataset using search criteria payload",
  description: "Executes a safe, read-only search using a structured payload",
  body: {
    type: "object",
    properties: {
      application: {
        type: "string",
        description: "Target application name",
      },
      filters: {
        type: "object",
        properties: {
          author: { type: "string" },
          bussiness: { type: "string" },
          createdAfter: { type: "string", format: "date-time" },
        },
      },
      sort: {
        type: "string",
        enum: ["asc", "desc"],
        default: "desc",
      },
      limit: {
        type: "integer",
        minimum: 1,
        default: 20,
      },
    },
    required: ["application"],
  },
  response: {
    200: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              application: { type: "string" },
              author: { type: "string" },
              url: { type: "string" },
              email: { type: "string" },
              bussiness: { type: "string" },
            },
          },
        },
      },
    },
  },
};
