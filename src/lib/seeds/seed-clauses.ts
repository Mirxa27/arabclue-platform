import { seedStandardClausesWithPrisma } from "../clause-library-prisma";

async function main() {
  console.log("[seed-clauses] seeding standard clause library...");
  const result = await seedStandardClausesWithPrisma();
  console.log("[seed-clauses] result:", result);
}

main()
  .catch((e) => {
    console.error("[seed-clauses] failed", e);
    process.exit(1);
  })
  .finally(async () => {
    const { db } = await import("../db");
    await db.$disconnect().catch(() => {});
  });
