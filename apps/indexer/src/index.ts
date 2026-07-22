import { getHealthStatus } from "./health.js";

// Indexing behavior is not implemented; this entry point only reports health and exits.
console.log(JSON.stringify(getHealthStatus()));
