import { env } from "./config.js";
import { validatePilotConfig } from "./lib/pilotConfig.js";

const failures = validatePilotConfig(env);
if (failures.length > 0) {
  console.error("Pilot configuration validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Pilot configuration validation passed.");
}
