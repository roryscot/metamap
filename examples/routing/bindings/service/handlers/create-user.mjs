export function createUser(input) {
  return Object.freeze({ operation: "create-user", displayName: input.name });
}
