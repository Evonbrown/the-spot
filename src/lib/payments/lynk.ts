/*
 * src/lib/payments/lynk.ts
 *
 * WHAT: generateLynkQRCode() (name from our SDS): the payment details for a
 *       Lynk order (who to pay, how much, which reference) plus a QR-code
 *       PICTURE to show on the confirmation page.
 *
 * LAYER: Application layer (External services: Lynk / Jamdex). The
 *        confirmation page (Presentation) only DRAWS what this returns.
 *
 * FR-02: "Payment method: Lynk (show QR code) or Cash. Lynk payments are
 *        verified by the Supervisor; the order is still submitted immediately."
 *
 * IMPORTANT: THIS IS A SAMPLE (decision: "a clearly marked SAMPLE placeholder,
 * no QR package"). We are not connected to Lynk yet, so the pattern is NOT a
 * real QR code: no phone can scan it and no money can move. It only LOOKS like
 * one, so the page can be designed and tested. isSample: true tells the page
 * to label it SAMPLE.
 * When the real Lynk service is connected, only THIS function changes (it
 * would ask Lynk for a real code); the page that draws it stays the same.
 */

import { LYNK_ID, LYNK_ID_CONFIRMED } from "@/lib/store-info";

// A real QR code is a square grid of black/white "cells" (25 × 25 is a small
// real size). Three corners have the big "finder" squares phones look for.
const GRID = 25;
const FINDER = 7; // each corner square is 7 × 7 cells

/*
 * LynkQRCode: what generateLynkQRCode returns.
 *   cells[row][col] = true -> a black square at that spot.
 *   reference       = the Order ID, so the Supervisor can match a payment to
 *                     its order (FR-02: Supervisor verifies Lynk payments).
 */
export type LynkQRCode = {
  isSample: true; // always true until Lynk is really connected
  payeeLynkId: string; // who to pay (The Spot's Lynk ID, sample for now)
  payeeLynkIdConfirmed: boolean; // false = show "(sample)" next to it
  amount: number; // J$, the order total (items + extras + delivery fee)
  reference: string; // the Order ID, e.g. "1001"
  cells: boolean[][];
};

/*
 * makeRandom(seed) -> a function giving "random-looking" numbers 0 to 1.
 * "Pseudo-random": a fixed formula (here called mulberry32) whose numbers look
 * random but are the SAME every time for the same seed. So order 1001 always
 * shows the same pattern (it doesn't change on refresh), while order 1002
 * looks different. (Math.random() would give a new pattern on every refresh.)
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0; // ">>> 0" keeps it a whole, positive 32-bit number
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * finderCell(row, col) -> true/false if (row, col) is inside one of the three
 * corner squares (top-left, top-right, bottom-left), or null if it isn't.
 * Each corner square = a black ring, a white ring, then a 3 × 3 black middle,
 * with a white border around it (like a real QR code).
 */
function finderCell(row: number, col: number): boolean | null {
  const corners = [
    [0, 0],
    [0, GRID - FINDER],
    [GRID - FINDER, 0],
  ];
  for (const [top, left] of corners) {
    const r = row - top;
    const c = col - left;
    // The 1-cell white border just outside the square.
    if (r >= -1 && r <= FINDER && c >= -1 && c <= FINDER) {
      if (r < 0 || r >= FINDER || c < 0 || c >= FINDER) return false;
      const ring = Math.min(r, c, FINDER - 1 - r, FINDER - 1 - c); // 0 = outer edge
      return ring !== 1; // outer ring black, next ring white, middle black
    }
  }
  return null;
}

/*
 * generateLynkQRCode({ orderId, amount }) -> LynkQRCode
 * Example: generateLynkQRCode({ orderId: 1001, amount: 1550 })
 *   -> pay [sample Lynk ID] J$1,550, reference "1001", plus a sample pattern.
 * The seed mixes the Order ID and the amount (in cents), so every order gets
 * its own pattern, the way a real code would encode those details.
 */
export function generateLynkQRCode({
  orderId,
  amount,
}: {
  orderId: number;
  amount: number;
}): LynkQRCode {
  const random = makeRandom(orderId * 100003 + Math.round(amount * 100));

  const cells: boolean[][] = [];
  for (let row = 0; row < GRID; row++) {
    const line: boolean[] = [];
    for (let col = 0; col < GRID; col++) {
      const finder = finderCell(row, col);
      line.push(finder ?? random() < 0.5); // corners fixed, the rest "random"
    }
    cells.push(line);
  }

  return {
    isSample: true,
    payeeLynkId: LYNK_ID,
    payeeLynkIdConfirmed: LYNK_ID_CONFIRMED,
    amount,
    reference: String(orderId),
    cells,
  };
}
