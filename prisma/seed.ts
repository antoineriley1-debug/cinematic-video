// Development seed: two executives + one admin, ten sites, directors,
// vendors, contracts, and sample operational data. NOT used in production.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("crothall-demo-2026", 12);

  const antoine = await prisma.user.upsert({
    where: { email: "antoine@crothall-demo.local" },
    update: {},
    create: { email: "antoine@crothall-demo.local", name: "Antoine Riley", title: "Regional Vice President", role: "ADMIN", passwordHash: password },
  });
  const heather = await prisma.user.upsert({
    where: { email: "heather@crothall-demo.local" },
    update: {},
    create: { email: "heather@crothall-demo.local", name: "Heather Collins", title: "Regional Director of Operations", role: "EXECUTIVE", passwordHash: password },
  });
  await prisma.user.upsert({
    where: { email: "marcus@crothall-demo.local" },
    update: {},
    create: { email: "marcus@crothall-demo.local", name: "Marcus Webb", title: "Division President", role: "EXECUTIVE", passwordHash: password },
  });

  const siteNames = [
    ["Mercy General Hospital", "MGH"],
    ["St. Luke's Medical Center", "SLMC"],
    ["Riverside Regional Hospital", "RRH"],
    ["Baptist Memorial East", "BME"],
    ["University Health Sciences Center", "UHSC"],
    ["Piedmont Community Hospital", "PCH"],
    ["Northgate Children's Hospital", "NCH"],
    ["Summit Ridge Medical Center", "SRMC"],
    ["Lakeview Behavioral Health", "LBH"],
    ["Carolina Heart Institute", "CHI"],
  ] as const;

  const sites = [] as { id: string; name: string }[];
  for (const [name, code] of siteNames) {
    const site = await prisma.site.upsert({
      where: { code },
      update: {},
      create: { name, code, location: "Southeast Region" },
    });
    sites.push(site);
    await prisma.siteAssignment.upsert({
      where: { userId_siteId: { userId: antoine.id, siteId: site.id } },
      update: {},
      create: { userId: antoine.id, siteId: site.id },
    });
  }

  const directorNames = ["Jane Delgado", "John Smithers", "Priya Natarajan", "Kevin O'Rourke", "Dana Whitfield", "Luis Herrera", "Tamara Boyd", "Chris Yang", "Angela Pruitt", "Robert Kimball"];
  for (let i = 0; i < directorNames.length; i++) {
    const existing = await prisma.director.findFirst({ where: { name: directorNames[i] } });
    if (!existing) {
      await prisma.director.create({
        data: { name: directorNames[i], title: "Director of Environmental Services", siteId: sites[i].id, email: `${directorNames[i].split(" ")[0].toLowerCase()}@crothall-demo.local` },
      });
    }
  }

  const vendorDefs = [
    { name: "Guardian Fire & Alarm Systems", category: "Life Safety" },
    { name: "SteriTech Solutions", category: "Sterilization" },
    { name: "Apex Linen Services", category: "Linen" },
    { name: "MedWaste Environmental", category: "Waste Management" },
  ];
  const vendors = [] as { id: string; name: string }[];
  for (const v of vendorDefs) {
    let vendor = await prisma.vendor.findFirst({ where: { name: v.name } });
    if (!vendor) vendor = await prisma.vendor.create({ data: v });
    vendors.push(vendor);
  }
  for (const site of sites.slice(0, 4)) {
    await prisma.vendorSite.upsert({
      where: { vendorId_siteId: { vendorId: vendors[0].id, siteId: site.id } },
      update: {},
      create: { vendorId: vendors[0].id, siteId: site.id },
    });
  }

  const inNDays = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000);
  const contractDefs = [
    { title: "Fire Alarm Inspection & Monitoring Agreement", vendorId: vendors[0].id, endDate: inNDays(75), noticeDeadline: inNDays(45), terms: "Guardian Fire & Alarm shall perform quarterly inspections of all fire alarm systems. Either party may terminate with 60 days written notice. Renewal must be confirmed in writing no later than 45 days before expiration. Response time for critical alarm failures: 4 hours." },
    { title: "Linen Supply Master Agreement", vendorId: vendors[2].id, endDate: inNDays(200), renewalDate: inNDays(170), terms: "Apex Linen Services shall deliver processed linen daily. Quality standard: less than 1% reject rate. Pricing reviewed annually. Termination requires 90 days notice." },
    { title: "Regulated Medical Waste Services", vendorId: vendors[3].id, endDate: inNDays(30), noticeDeadline: inNDays(10), terms: "MedWaste Environmental provides weekly regulated medical waste pickup. Auto-renews for one year unless notice is given 30 days prior to expiration." },
  ];
  for (const c of contractDefs) {
    let contract = await prisma.contract.findFirst({ where: { title: c.title } });
    if (!contract) {
      contract = await prisma.contract.create({ data: c });
      await prisma.contractSite.create({ data: { contractId: contract.id, siteId: sites[0].id } });
    }
  }

  const project = await prisma.project.findFirst({ where: { name: "OR Terminal Cleaning Overhaul" } });
  if (!project) {
    await prisma.project.create({
      data: { name: "OR Terminal Cleaning Overhaul", description: "Rebuild the OR terminal cleaning program at Mercy General ahead of Joint Commission survey.", siteId: sites[0].id, priority: "HIGH", createdById: antoine.id, dueDate: inNDays(45) },
    });
  }

  console.log("Seed complete.");
  console.log("Login: antoine@crothall-demo.local / crothall-demo-2026 (admin)");
  console.log("       heather@crothall-demo.local / crothall-demo-2026");
}

main().finally(() => prisma.$disconnect());
