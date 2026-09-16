# Nested path-tree example

This example restores Metamap's original nested route-map DX as a generated
projection. Route identities still live in the graph. The compiler then emits
a typed object whose `_` fields are path templates:

```ts
import { hydrateRoutes, routes } from "./generated/routes.js";

routes.auth.sign_in._;
// "/auth/sign_in"

hydrateRoutes({ eventId: "42", path: "a/b" }).event[":eventId"].cast._;
// "/event/42/cast"

hydrateRoutes({ eventId: "42", path: "a/b" }).files["*path"]._;
// "/files/a/b"

hydrateRoutes({ eventId: "42", path: "a/b" }).docs["*slug?"]._;
// "/docs"
```

`$` holds the projected occupant when a subject owns that exact path, including
cardinality-checked slots. Intermediate segments without a subject still exist
so nested access stays stable.

The graph is the control plane. The nested object is an immutable data-plane
artifact. The compiler refuses colliding paths, missing path attributes,
reserved `_`/`$` segments, and undeclared `pathTree` specifications.

Run:

```bash
npm run example:path-tree
```
