/**
 * Papago branding for the Payload admin.
 *
 * `Logo` is the big mark on the login screen. `Icon` is the small one in the
 * top left of the admin nav, on every screen once you are signed in. Both are
 * wired up in payload.config.ts under admin.components.graphics.
 *
 * The lockup sits on a navy panel rather than bare. papago-stacked.svg is the
 * footer version of the logo: the mountain and the wordmark are painted white
 * with a gold accent, so on Payload's light theme it would be an invisible
 * rectangle. Navy is how the mark is drawn on the real site, it keeps the
 * brand colours exact, and it survives the admin being switched to dark.
 */
const NAVY = "#303c47";

export function Logo() {
  return (
    <div
      style={{
        background: NAVY,
        borderRadius: 18,
        padding: "34px 48px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/papago-stacked.svg"
        alt="Papago Vans"
        width={169}
        height={101}
        style={{ display: "block" }}
      />
    </div>
  );
}

export function Icon() {
  return (
    <div
      style={{
        background: NAVY,
        borderRadius: 8,
        padding: "7px 10px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/papago-stacked.svg"
        alt="Papago Vans"
        width={44}
        height={26}
        style={{ display: "block" }}
      />
    </div>
  );
}
