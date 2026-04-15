// src/services/snapshot-rebuild.ts
//
// Re-export shim. Der Code wurde nach `snapshot-admin.ts` migriert (siehe
// dort), weil die Datei jetzt mehr als nur Rebuild-Jobs enthält (Edit-
// Sessions). Diese Shim hält den alten Import-Pfad funktional, damit
// keine externen Tools/Tests brechen.
export * from "./snapshot-admin.js";
