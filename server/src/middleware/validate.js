// Checks req.body against a zod schema and replaces it with the parsed (trimmed, coerced) value.
// A ZodError is passed on to errorHandler, which turns it into a 400.
export const validate = (schema) => (req, _res, next) => {
  req.body = schema.parse(req.body ?? {});
  next();
};
