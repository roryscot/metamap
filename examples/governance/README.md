# Synthetic scoped approval example

Run `npm run example:governance`. It reuses the two independently owned source
shards and checked typed configuration from `examples/provenance`.

The example prepares a complete source-bound proposal and artifact byte manifest.
Two ephemeral synthetic principals have broad grants, but only the external owner
can approve bootstrap. An agent's otherwise valid signature rejects. Reviewed
output substitution also rejects. The exact native lookup/path-tree bytes are
type-checked and executed from a disposable directory, then removed.

Keys stay in memory. The example reads no real trust configuration, signs no
production material and writes no active state. It checks P09's proposal/approval
contracts; P10's protected state permissions and activation transaction remain
outstanding. See [GOVERNANCE.md](../../GOVERNANCE.md) for scope names, exact signing
bytes, current validity rules and the distinction between verification and
consumer activation.
