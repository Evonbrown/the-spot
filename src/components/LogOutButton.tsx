/*
 * src/components/LogOutButton.tsx
 *
 * WHAT: The "Log out" button in the header. It EMPTIES THE CART, then runs the
 *       logOut Server Action (which ends the session and goes to Home).
 *
 * LAYER: Presentation (the logging out itself happens in the Application layer,
 *        src/lib/auth/actions.ts).
 *
 * WHY: Decision: on shared campus computers, the next person must not see (or
 *      order) the previous person's cart. The cart lives in the BROWSER, so the
 *      server can't empty it; this button does it in the browser first.
 *
 * "use client" = it needs the browser (to empty the cart) before the form is sent.
 */
"use client";

import { useFormStatus } from "react-dom";
import { useCart } from "@/components/CartProvider";
import { logOut } from "@/lib/auth/actions";

export default function LogOutButton({ className }: { className: string }) {
  const { clearCart } = useCart();

  return (
    // action={logOut}: submitting this form runs the Server Action on the server.
    <form action={logOut}>
      <SubmitButton className={className} onLogOut={clearCart} />
    </form>
  );
}

/* Disable while logging out so double-taps don't send the form twice. */
function SubmitButton({ className, onLogOut }: { className: string; onLogOut: () => void }) {
  const { pending } = useFormStatus();

  return (
    // onClick runs in the browser BEFORE the form is sent: empty the cart first.
    <button
      type="submit"
      onClick={onLogOut}
      disabled={pending}
      className={`${className} disabled:opacity-60`}
    >
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}
