/*
 * src/lib/store-info.ts
 *
 * WHAT: Fixed facts about The Spot that pages show: opening hours and the
 *       delivery locations.
 *
 * LAYER: Application layer (shared values used by Presentation pages).
 *
 * WHY a separate file? These used to live in the sample menu file, which is now
 * deleted because the menu comes from the database. These two facts don't have
 * a table yet.
 * LATER: the SRS (Maintainability) says the Manager must be able to edit
 * delivery locations without code changes, so they will move into the database
 * in a later part. Pages already read them from here, so only this file changes.
 */

// FR-01: opening and delivery hours (11:00 a.m. - 7:00 p.m.).
export const OPENING_HOURS = "11:00 a.m. – 7:00 p.m.";

// FR-01 / FR-04: the ONLY places we deliver to.
export const DELIVERY_LOCATIONS = ["UWI Mona", "UTech", "UWI Hospital"];
