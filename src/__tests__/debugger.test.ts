import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../canonical.js";
import { renderMetamapExplanationHtml } from "../debugger.js";
import {
  createMetamapExplanationRequest,
  explainMetamap,
  metamapExplanationDigest,
} from "../explanation.js";
import { captureReplayBundle } from "../replay.js";
import { sourceFixture } from "./helpers/source-fixture.js";

function fixture() {
  const f = sourceFixture();
  const report = (
    selection = {
      kind: "entity" as "entity" | "mapping",
      id: f.graph.entities[0].id,
      projection: f.spec.id as string | null,
    },
  ) => {
    f.rebind();
    const capture = captureReplayBundle(f.graph, f.policy, {
      ...f.options,
      projections: [f.spec],
      sourceCapture: f.sourceCapture,
    });
    const result = explainMetamap(
      createMetamapExplanationRequest(capture, {
        consumer: f.spec.consumer,
        selection,
      }),
    );
    if (result.status !== "explained") throw new Error(JSON.stringify(result));
    return result.report;
  };
  return { ...f, report };
}
describe("static local debugger over the shared explanation", () => {
  it("escapes labels, literal executable-looking locators and JSON evidence", () => {
    const f = fixture();
    f.graph.entities[0].label =
      '<script>alert("label")</script> & <img src="https://example.invalid/x">';
    f.graph.entities[0].locators = [{ uri: "javascript:alert(1)" }];
    f.policy.evidence.push({
      id: "urn:debugger:literal",
      kind: "note",
      subjects: [f.graph.mappings[0].id],
      producer: "synthetic-source",
      result: "inconclusive",
      attributes: { text: '</pre><svg onload="alert(2)">' },
    });
    const html = renderMetamapExplanationHtml(f.report());
    expect(html).not.toMatch(/<(script|img|svg|iframe)\b/i);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;/pre&gt;&lt;svg");
    expect(html).not.toMatch(/href="(?:https?:|javascript:)/);
    expect(html).toContain("javascript:alert(1)");
  });
  it("binds its only inline style to the fixed content security policy hash", () => {
    const html = renderMetamapExplanationHtml(fixture().report());
    const styles = html.match(/<style>([\s\S]*?)<\/style>/)![1];
    const digest = createHash("sha256").update(styles).digest("base64");
    expect(html).toContain("style-src &#39;sha256-" + digest + "&#39;");
    expect(html).toContain("default-src &#39;none&#39;");
    expect(html).not.toMatch(/<(script|link|img|form|input|button)\b/i);
  });
  it("renders an explicit missing selection without inventing bindings or source membership", () => {
    const r = fixture().report({
      kind: "mapping",
      id: "urn:missing:mapping",
      projection: null,
    });
    const html = renderMetamapExplanationHtml(r);
    expect(html).toContain("Selection: missing");
    expect(html).toContain("No runtime entries are available");
    expect(html).toContain("No captured source membership is available");
    expect(html).toContain("No derivations are recorded");
  });
  it("retains both duplicate records and unavailable proof/authority states", () => {
    const f = fixture();
    f.graph.entities[0].label = "first recorded label";
    f.graph.entities.push({
      ...f.graph.entities[0],
      label: "second recorded label",
    });
    const html = renderMetamapExplanationHtml(f.report());
    expect(html).toContain("Selection: ambiguous");
    expect(html).toContain("first recorded label");
    expect(html).toContain("second recorded label");
    expect(html).toContain("current occurrences: 2");
    expect(html).toContain("Proof validation: <code>recorded</code>");
  });
  it("rejects a rehashed explanation that changes its checked record or authority", () => {
    const r = structuredClone(fixture().report());
    r.subjects[0].current[0].label = "unsupported change";
    r.digest = metamapExplanationDigest(r);
    r.id = "urn:metamap:explanation:" + r.digest.slice(7);
    expect(() => renderMetamapExplanationHtml(r)).toThrow(/differs/);
  });
  it("preserves the complete report and deterministic local-only output", () => {
    const r = fixture().report(),
      before = canonicalJson(r),
      first = renderMetamapExplanationHtml(r);
    expect(renderMetamapExplanationHtml(r)).toBe(first);
    expect(canonicalJson(r)).toBe(before);
    expect(first).toContain("A unique cause is not established");
    expect(first).toContain(
      "Current authenticated authority and deployed state are not evaluated",
    );
  });
});
