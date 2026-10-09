/**
 * Creates the first founder account on a fresh (production) database and
 * prints a one-time temporary password.
 *
 *   npm run create-founder -- --email aarav@focusrealm.com --first Aarav --last Mehta --title "Co-founder & CEO"
 */
import "dotenv/config";
import { createAccount, departmentIdByName } from "../src/lib/accounts";
import { db } from "../src/lib/db";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email");
  const first = arg("first");
  const last = arg("last") ?? "";
  if (!email || !first) {
    console.log('Usage: npm run create-founder -- --email you@focusrealm.com --first Name [--last Surname] [--title "Co-founder & CEO"] [--code FR-0001]');
    process.exit(1);
  }
  const { user, generatedPassword } = await createAccount({
    email,
    firstName: first,
    lastName: last,
    title: arg("title") ?? "Co-founder",
    employeeCode: arg("code"),
    role: "FOUNDER",
    departmentId: await departmentIdByName("Leadership"),
    source: "MANUAL",
  });
  console.log("\nFounder account created\n");
  console.log(`  Employee ID         ${user.employeeCode}`);
  console.log(`  Email               ${user.email}`);
  console.log(`  Temporary password  ${generatedPassword}`);
  console.log("\nSign in and you'll be asked to choose your own password. This is the only time the temporary one is shown.\n");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
