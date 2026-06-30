import { createDbClient } from "../src/db/client.js";
import { disclaimers } from "../src/db/schema.js";

async function seed() {
  console.log("Connecting to database...");
  const db = createDbClient();
  console.log("Connected.");

  // ─── Check existing disclaimers ─────────────────────────────
  const disclaimerRows = await db.select({ version: disclaimers.version }).from(disclaimers);
  const existingVersions = disclaimerRows.map((r) => r.version);
  console.log(`Found ${existingVersions.length} existing disclaimers.`);

  // ─── Default disclaimers ────────────────────────────────────
  const defaultDisclaimers: Array<{ version: number; context: string; text: string }> = [
    {
      version: 1,
      context: "comparison",
      text: "Esta herramienta presenta una comparativa informativa de productos bancarios basada en datos públicos. No constituye asesoramiento financiero personalizado. El usuario es responsable de verificar las condiciones directamente con la entidad bancaria antes de contratar cualquier producto.",
    },
    {
      version: 2,
      context: "pdf_analysis",
      text: "El análisis de documentos PDF se realiza de forma automática con resultados orientativos. Las condiciones financieras pueden variar. Se recomienda consultar las condiciones oficiales publicadas por la entidad bancaria.",
    },
    {
      version: 3,
      context: "regulatory_blocking",
      text: "Banco AI solo presenta comparativas informativas de productos bancarios básicos (cuentas y depósitos). No ofrece asesoramiento de inversión, acciones, fondos, criptoactivos ni productos derivados.",
    },
  ];

  let inserted = 0;
  let skipped = 0;

  for (const d of defaultDisclaimers) {
    if (!existingVersions.includes(d.version)) {
      await db.insert(disclaimers).values({
        version: d.version,
        context: d.context,
        text: d.text,
        active: true,
      });
      console.log(`Inserted disclaimer v${d.version}: ${d.context}`);
      inserted++;
    } else {
      console.log(`Disclaimer v${d.version} (${d.context}) already exists, skipping`);
      skipped++;
    }
  }

  console.log(`Seed completed: ${inserted} new, ${skipped} skipped.`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
