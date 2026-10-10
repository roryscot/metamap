import { fileURLToPath } from "node:url";
import { canonicalJson } from "@roryscot/metamap/canonical";
import {
  promoteMetamapGeneration,
  readGovernedActivationRequestStream,
} from "@roryscot/metamap/activation";

// Install this code, its dependencies and trust.json under the consumer owner's control.
// The service wrapper fixes code, interpreter, environment and arguments; only stdin is untrusted.
if (process.argv.length !== 2)
  throw new Error("The fixed promoter accepts no arguments");
const trustPath = fileURLToPath(new URL("./trust.json", import.meta.url));
try {
  const result = await promoteMetamapGeneration(
    await readGovernedActivationRequestStream(process.stdin),
    { mode: "governed", trustPath },
  );
  process.stdout.write(canonicalJson(result) + "\n");
  process.exitCode =
    result.status === "indeterminate"
      ? 3
      : result.status === "rejected"
        ? 1
        : 0;
} catch (error) {
  process.stderr.write(
    (error instanceof Error ? error.message : String(error)) + "\n",
  );
  process.exitCode = 1;
}
