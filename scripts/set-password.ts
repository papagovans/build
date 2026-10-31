/**
 * Sets a new password on an admin account from the terminal, for when someone
 * is locked out and the admin cannot send reset emails yet (no email adapter).
 *
 *   npm run set-password -- jerry@papagovans.com
 *
 * Asks for the password twice, hidden, and clears any login lockout. Needs the
 * database connection in .env.local, so only someone who already has that can
 * run it. Prints nothing secret.
 */
import { createRequire } from "module";
import readline from "node:readline";

const email = process.argv[2];
if (!email) {
  console.error("usage: npm run set-password -- <email>");
  process.exit(1);
}

/* Production mode, so Payload does not try to sync the database schema. */
(process.env as Record<string, string>).NODE_ENV = "production";
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Hide what is typed.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.includes(question)) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = await ask(`New password for ${email}: `);
if (password.length < 10) {
  console.error("Use at least 10 characters.");
  process.exit(1);
}
if ((await ask("Type it again: ")) !== password) {
  console.error("Those did not match. Nothing changed.");
  process.exit(1);
}

const { getPayload } = await import("payload");
const { default: config } = await import("../payload.config.ts");
const payload = await getPayload({ config });
const { docs } = await payload.find({ collection: "users", where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true });
if (!docs[0]) {
  console.error(`No admin account for ${email}. Nothing changed.`);
  process.exit(1);
}
await payload.update({ collection: "users", id: docs[0].id, data: { password, loginAttempts: 0, lockUntil: null } as never, overrideAccess: true });
console.log(`Password set for ${email}. Log in at https://build.papagovans.com/admin`);
process.exit(0);
