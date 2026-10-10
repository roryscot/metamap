export function validateCreateUser(input) {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    typeof input.name !== "string" ||
    input.name.trim().length === 0
  ) {
    throw new Error("INVALID_CREATE_USER_INPUT");
  }
  return Object.freeze({ name: input.name.trim() });
}
