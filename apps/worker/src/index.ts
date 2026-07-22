import { getHealthStatus } from "./health.js";

// Worker behavior is not implemented; this entry point only reports health and exits.
console.log(JSON.stringify(getHealthStatus()));
