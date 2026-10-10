/** Example consumer over checked static artifacts; no inference or source reads. */
export function createScientificLookup(resolveBinding, projection, graph) {
  const entries = new Map(
    projection.entries.map((entry) => [entry.subject.id, entry]),
  );
  const assertions = new Map(
    graph.mappings.map((mapping) => [mapping.id, mapping]),
  );
  return (id) => {
    const binding = resolveBinding(id),
      entry = entries.get(id);
    if (!entry) throw new Error("Missing checked projection entry: " + id);
    return {
      subject: binding.subject,
      slots: Object.fromEntries(
        entry.slots.map((slot) => [
          slot.name,
          {
            relation: slot.relation,
            direction: slot.direction,
            targets: binding.slots[slot.name],
            assertions: slot.mappings.map((mappingId) => {
              const assertion = assertions.get(mappingId);
              if (!assertion)
                throw new Error("Missing captured assertion: " + mappingId);
              return assertion;
            }),
          },
        ]),
      ),
    };
  };
}
