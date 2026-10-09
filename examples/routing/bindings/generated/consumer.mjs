import { createUser as handler0 } from "./inputs/service/handlers/create-user.689adf3371d4bdce1c6af91d9c93354133a7c10719e794a8b1c93f30ee2d5c1b.mjs";
import { validateCreateUser as input0 } from "./inputs/contract/input-schema.91ef94507725d4dd0b453a69687ae40428ced2b20875a023e980bd38982f5bf0.mjs";
export const bindingDigest =
  "sha256:b3cd11a74a9b7e1e8e0cd668a31e7c5755f8627f19cf999e9b9b1bd98a5b5400";
export const bindings = Object.freeze({
  "urn:bindings:command:create-user": Object.freeze({
    handler: handler0,
    input: input0,
    locators: Object.freeze({
      handler: "javascript:service/handlers/create-user.mjs#createUser",
      input: "javascript:contract/input-schema.mjs#validateCreateUser",
    }),
    endpoint: Object.freeze({
      id: "urn:bindings:endpoint:production",
      method: "POST",
      path: "/users",
    }),
  }),
});
export function invoke(id, input) {
  if (!Object.hasOwn(bindings, id)) throw new Error("UNKNOWN_OPERATION");
  const binding = bindings[id];
  return binding.handler(binding.input(input));
}
export function handleRequest(method, path, input) {
  const id = Object.keys(bindings).find(
    (key) =>
      bindings[key].endpoint.method === method &&
      bindings[key].endpoint.path === path,
  );
  if (id === undefined) throw new Error("UNKNOWN_ENDPOINT");
  return invoke(id, input);
}
