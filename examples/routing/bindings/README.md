# Independently owned consumer bindings

This example executes configuration generated from two independently owned
sources. The contract team owns the operation identity and input validator.
The service team owns the handler and transport endpoints. A third consumer
shard declares the correspondences and owns the selection and admission policy.
There is no handwritten dispatch registry beside the generated one.

```bash
npm run example:bindings
npx vitest run src/__tests__/consumer-bindings.test.ts
```

The generated consumer imports the declared validator and handler, validates
the input, and executes `createUser` through `POST /users`. Applications can
call the same stable `urn:bindings:command:create-user` directly. The generated
declaration supplies the `OperationId` union; the accompanying consumer checks
that an undeclared identity cannot compile.

Moving the handler to another location and updating the service-owned locator
changes the native import while preserving its semantic ID. Replacing it with
another entity requires an explicit new ID and correspondence. Choosing the
development context generates `/dev/users` from the same graph. Runtime input
cannot change the accepted handler, identity set, or endpoint structure.

The consumer-specific `build.mjs` uses the existing adapter registry, shard
adapter, workspace composition, viability compiler and projection compiler.
Its `owned-routing-shard` adapter adds native byte inputs to the existing
snapshot source records. It does not create a second source inventory. Native
locators must name a `.mjs` file within the source's owned directory, retain the
declared byte digest, and export a named function. Source parsing checks that
this narrow example's modules are self-contained. Generation reads code but
does not import or execute it. The emitter captures checked, self-contained
module bytes under content-addressed generated filenames and imports those
copies. Rejected changes to the original modules therefore preserve the previous
consumer's behavior as well as its registry. The consumer executes its own code
after the binding is generated; this profile is not a sandbox for untrusted programs.

`consumer/viability-template.json` is an explicitly versioned consumer build
template, not a portable viability policy. The builder verifies its graph ID
and binds the policy to the exact discovered graph digest. `generated/build.json`
records the complete evaluated portable policy alongside its generation,
projection, source snapshot and coverage/exclusions.

Coverage checks every configured owned handler, schema and endpoint against
the explicit graph correspondences, including context alternatives. An unmapped
leaf needs a consumer-recorded, source-owner-attributed exclusion with a reason
and relation scope. Declared owners are checked for consistency and delegation
narrowing; they are not yet authenticated principals.

Captured code filenames are immutable under this builder: altered existing
copies cause rejection. A user with direct write access can still modify those
files or bypass the builder. M4 must enforce the consumer's protected promoter
and artifact permissions before claiming authenticated activation.

The fixed [capability corpus](../../../evaluation/capability-corpus.json)
drives positive and negative integration cases. Missing or ambiguous bindings,
ownership conflicts, widened delegation, source byte drift, and locator escapes
reject before replacing any accepted consumer artifact. Each output file is
replaced atomically after all validation. A multi-file filesystem failure is
not a governed promotion transaction: the protected manifest boundary belongs
to M4. Reports explicitly label this example `legacy-ungoverned`.
