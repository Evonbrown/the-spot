/*
 * src/components/ScreenPlaceholder.tsx   (TEMPORARY)
 *
 * WHAT: A simple "coming soon" box used by the 4 staff screens until we build
 *       them (queue, deliveries, reports, payments). It shows who is logged in
 *       and lists what this screen will do, taken from our SRS features.
 * LAYER: Presentation.
 *
 * WHY one shared component? The 4 placeholder screens look the same, so we write
 * the look once. Each page only passes in its own title and list (as props).
 */

import type { Profile } from "@/lib/auth/get-profile";
import { ROLE_LABELS } from "@/lib/auth/roles";

type Props = {
  title: string;
  profile: Profile; // the logged-in user, already checked by requireRole()
  upcoming: string[]; // what this screen will do later
};

export default function ScreenPlaceholder({ title, profile, upcoming }: Props) {
  return (
    <>
      <h1 className="text-3xl font-extrabold">{title}</h1>
      <p className="mt-1 text-sm text-stone-600">
        Logged in as {profile.full_name || profile.email} ({ROLE_LABELS[profile.role]})
      </p>

      <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="font-bold">Coming soon on this screen</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {upcoming.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
