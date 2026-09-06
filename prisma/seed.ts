/**
 * Demo-Daten (§40): ein fiktiver SHK-Betrieb, sofort vorführbar.
 * Aufruf: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/modules/auth/password";
import { syncSystemPrompts } from "../src/modules/ai/prompt-store";
import { createTenant } from "../src/modules/tenants/provisioning";
import { nextCustomerNumber } from "../src/modules/customers/service";
import { nextOrderNumber, defaultOrderStatusId } from "../src/modules/orders/service";
import { runWorkflowsForEmail } from "../src/modules/workflows/engine";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Klarwerk2026!";

const CUSTOMERS = [
  { firstName: "Max", lastName: "Mustermann", email: "max.mustermann@example.de", phone: "+49 170 1234567", street: "Hauptstraße 15", zip: "40210", city: "Düsseldorf" },
  { firstName: "Anna", lastName: "Schneider", email: "a.schneider@example.de", phone: "+49 171 2345678", street: "Lindenweg 4", zip: "40233", city: "Düsseldorf" },
  { companyName: "Bäckerei Klein GmbH", firstName: "Petra", lastName: "Klein", email: "info@baeckerei-klein.de", phone: "+49 211 445566", street: "Marktplatz 2", zip: "40215", city: "Düsseldorf" },
  { firstName: "Thomas", lastName: "Weber", email: "t.weber@example.de", phone: "+49 172 3456789", street: "Rosenstraße 21", zip: "40468", city: "Düsseldorf" },
  { firstName: "Julia", lastName: "Hoffmann", email: "julia.hoffmann@example.de", phone: "+49 173 4567890", street: "Am Bahndamm 8", zip: "40595", city: "Düsseldorf" },
  { companyName: "Hausverwaltung Rheinblick", firstName: "Stefan", lastName: "Kramer", email: "verwaltung@rheinblick-hv.de", phone: "+49 211 998877", street: "Rheinallee 44", zip: "40545", city: "Düsseldorf" },
  { firstName: "Michael", lastName: "Bauer", email: "m.bauer@example.de", phone: "+49 174 5678901", street: "Eichenweg 12", zip: "41460", city: "Neuss" },
  { firstName: "Sabine", lastName: "Wolf", email: "sabine.wolf@example.de", phone: "+49 175 6789012", street: "Feldstraße 33", zip: "41462", city: "Neuss" },
  { firstName: "Peter", lastName: "Neumann", email: "p.neumann@example.de", phone: "+49 176 7890123", street: "Gartenstraße 7", zip: "40699", city: "Erkrath" },
  { companyName: "Autohaus Berger", firstName: "Frank", lastName: "Berger", email: "kontakt@autohaus-berger.de", phone: "+49 2104 88990", street: "Industriestraße 90", zip: "40699", city: "Erkrath" },
  { firstName: "Claudia", lastName: "Schulz", email: "c.schulz@example.de", phone: "+49 177 8901234", street: "Bergstraße 18", zip: "40625", city: "Düsseldorf" },
  { firstName: "Andreas", lastName: "Fischer", email: "andreas.fischer@example.de", phone: "+49 178 9012345", street: "Kirchweg 5", zip: "40667", city: "Meerbusch" },
  { firstName: "Nicole", lastName: "Richter", email: "n.richter@example.de", phone: "+49 179 0123456", street: "Sonnenallee 62", zip: "40670", city: "Meerbusch" },
  { companyName: "Praxis Dr. Lange", firstName: "Martina", lastName: "Lange", email: "praxis@dr-lange.de", phone: "+49 211 334455", street: "Königsallee 100", zip: "40212", city: "Düsseldorf" },
  { firstName: "Jürgen", lastName: "Krüger", email: "j.krueger@example.de", phone: "+49 160 1122334", street: "Waldstraße 29", zip: "40724", city: "Hilden" },
  { firstName: "Sandra", lastName: "Braun", email: "s.braun@example.de", phone: "+49 161 2233445", street: "Talweg 3", zip: "40721", city: "Hilden" },
  { firstName: "Dirk", lastName: "Zimmermann", email: "d.zimmermann@example.de", phone: "+49 162 3344556", street: "Poststraße 41", zip: "40878", city: "Ratingen" },
  { firstName: "Katrin", lastName: "Hartmann", email: "k.hartmann@example.de", phone: "+49 163 4455667", street: "Mühlenweg 14", zip: "40880", city: "Ratingen" },
  { companyName: "Steuerkanzlei Vogel & Partner", firstName: "Ralf", lastName: "Vogel", email: "kanzlei@vogel-partner.de", phone: "+49 211 776655", street: "Graf-Adolf-Platz 6", zip: "40213", city: "Düsseldorf" },
  { firstName: "Elena", lastName: "Petrova", email: "elena.petrova@example.de", phone: "+49 164 5566778", street: "Uhlandstraße 9", zip: "40237", city: "Düsseldorf" },
];

const EMPLOYEES = [
  { firstName: "Stefan", lastName: "Groß", jobTitle: "Meister Heizungsbau", skills: ["heizung", "sanitaer", "klima"], regions: ["40", "41"], color: "#2563eb" },
  { firstName: "Kevin", lastName: "Albrecht", jobTitle: "Monteur Sanitär", skills: ["sanitaer"], regions: ["40"], color: "#0d9488" },
  { firstName: "Mehmet", lastName: "Yilmaz", jobTitle: "Monteur Heizung", skills: ["heizung", "sanitaer"], regions: ["40", "41", "42"], color: "#d97706" },
  { firstName: "Lisa", lastName: "Roth", jobTitle: "Kundendienst-Technikerin", skills: ["heizung", "klima"], regions: ["40"], color: "#7c3aed" },
  { firstName: "Bernd", lastName: "Kaufmann", jobTitle: "Monteur Bad & Sanitär", skills: ["sanitaer"], regions: ["40", "41"], color: "#db2777" },
];

const ORDERS = [
  { title: "Gastherme startet nicht, Fehler F28", categoryKey: "heating_failure", priority: "HIGH" as const, statusKey: "in_progress", customerIndex: 0, description: "Kunde meldet: Therme geht nicht mehr an, Display zeigt F28. Baujahr 2016, Vaillant." },
  { title: "Jahreswartung Heizungsanlage", categoryKey: "heating_maintenance", priority: "NORMAL" as const, statusKey: "scheduled", customerIndex: 1, description: "Turnusmäßige Wartung der Gasbrennwerttherme." },
  { title: "Rohrbruch im Keller", categoryKey: "water_damage", priority: "URGENT" as const, statusKey: "in_progress", customerIndex: 2, description: "Wasseraustritt im Lagerraum, Hauptleitung abgesperrt." },
  { title: "Neues Badezimmer – Angebot", categoryKey: "sanitary_installation", priority: "NORMAL" as const, statusKey: "quote_required", customerIndex: 3, description: "Komplettsanierung Gäste-WC und Bad, ca. 9 m²." },
  { title: "Abfluss Küche verstopft", categoryKey: "drain_blockage", priority: "HIGH" as const, statusKey: "new", customerIndex: 4, description: "Wasser läuft nicht mehr ab, Rückstau im Spülbecken." },
  { title: "Wartung Klimaanlage Büro", categoryKey: "air_conditioning", priority: "NORMAL" as const, statusKey: "scheduled", customerIndex: 5, description: "Zwei Splitgeräte, jährliche Wartung inkl. Filtertausch." },
  { title: "Heizkörper im Obergeschoss bleibt kalt", categoryKey: "heating_failure", priority: "NORMAL" as const, statusKey: "review", customerIndex: 6, description: "Vermutlich Luft im System, Kunde bittet um Termin." },
  { title: "Austausch Waschtischarmatur", categoryKey: "sanitary_installation", priority: "LOW" as const, statusKey: "new", customerIndex: 7, description: "Armatur tropft, Ersatz gewünscht." },
  { title: "Angebot Wärmepumpe", categoryKey: "quote_request", priority: "NORMAL" as const, statusKey: "quote_required", customerIndex: 9, description: "Kunde möchte Ölheizung durch Luft-Wasser-Wärmepumpe ersetzen." },
  { title: "Kein Warmwasser in zwei Wohnungen", categoryKey: "heating_failure", priority: "HIGH" as const, statusKey: "new", customerIndex: 5, description: "Zwei Mietparteien melden kaltes Wasser, Objekt Rheinallee 44." },
];

const INBOX = [
  {
    fromName: "Max Mustermann",
    fromEmail: "max.mustermann@example.de",
    subject: "Heizung funktioniert nicht mehr",
    body: `Hallo,

unsere Heizung funktioniert seit gestern nicht mehr. Wir wohnen in der Hauptstraße 15 in 40210 Düsseldorf und brauchen möglichst schnell Hilfe. Es ist kein Warmwasser mehr da.

Am Donnerstag Nachmittag wären wir zu Hause.

Viele Grüße
Max Mustermann
Tel. 0170 1234567`,
    hoursAgo: 1,
    runPipeline: true,
  },
  {
    fromName: "Julia Hoffmann",
    fromEmail: "julia.hoffmann@example.de",
    subject: "Abfluss verstopft",
    body: `Guten Tag,

bei uns läuft das Wasser in der Küche nicht mehr ab, es staut sich im Spülbecken. Wir wohnen Am Bahndamm 8, 40595 Düsseldorf.

Können Sie morgen vormittag kommen?

Mit freundlichen Grüßen
Julia Hoffmann`,
    hoursAgo: 3,
    runPipeline: true,
  },
  {
    fromName: "Elena Petrova",
    fromEmail: "elena.petrova@example.de",
    subject: "Angebot für neues Bad",
    body: `Sehr geehrte Damen und Herren,

wir möchten unser Badezimmer komplett renovieren lassen (ca. 8 m²) und hätten gerne ein Angebot. Die Adresse ist Uhlandstraße 9, 40237 Düsseldorf.

Wann könnten Sie zur Besichtigung vorbeikommen?

Freundliche Grüße
Elena Petrova`,
    hoursAgo: 6,
    runPipeline: true,
  },
  {
    fromName: "Stefan Kramer",
    fromEmail: "verwaltung@rheinblick-hv.de",
    subject: "Kein Warmwasser Rheinallee 44",
    body: `Hallo zusammen,

in der Rheinallee 44 melden zwei Mietparteien, dass kein Warmwasser vorhanden ist. Bitte dringend prüfen.

Viele Grüße
Stefan Kramer
Hausverwaltung Rheinblick`,
    hoursAgo: 20,
  },
  {
    fromName: "Anna Schneider",
    fromEmail: "a.schneider@example.de",
    subject: "Terminverschiebung Wartung",
    body: `Hallo,

können wir den Wartungstermin am Dienstag auf die Folgewoche verschieben? Wir sind leider im Urlaub.

Danke und Grüße
Anna Schneider`,
    hoursAgo: 26,
  },
  {
    fromName: "Frank Berger",
    fromEmail: "kontakt@autohaus-berger.de",
    subject: "Rückfrage zum Angebot Wärmepumpe",
    body: `Guten Tag,

vielen Dank für Ihr Angebot. Können Sie uns noch die Fördermöglichkeiten und die voraussichtliche Bauzeit nennen?

Beste Grüße
Frank Berger`,
    hoursAgo: 30,
  },
  {
    fromName: "Petra Klein",
    fromEmail: "info@baeckerei-klein.de",
    subject: "Reklamation – Wasserschaden Nacharbeit",
    body: `Sehr geehrte Damen und Herren,

nach der Reparatur letzte Woche tropft es an der gleichen Stelle wieder. Das ist so nicht akzeptabel, bitte kommen Sie kurzfristig zur Nachbesserung.

Mit freundlichen Grüßen
Petra Klein`,
    hoursAgo: 44,
  },
  {
    fromName: "Rechnungswesen Großhandel Nord",
    fromEmail: "buchhaltung@gh-nord.de",
    subject: "Rechnung Nr. 2026-4471",
    body: `Guten Tag,

anbei erhalten Sie unsere Rechnung Nr. 2026-4471 über 1.284,50 EUR mit Zahlungsziel 14 Tage.

Freundliche Grüße
Großhandel Nord`,
    hoursAgo: 50,
  },
  {
    fromName: "SEO Marketing Agentur",
    fromEmail: "kontakt@seo-schnell-vorne.biz",
    subject: "Mehr Kunden für Ihren Handwerksbetrieb!",
    body: `Guten Tag,

wir bringen Ihre Website mit garantierten Backlinks auf Platz 1 bei Google. Melden Sie sich für ein kostenloses Erstgespräch. Newsletter abbestellen: unsubscribe.

Beste Grüße`,
    hoursAgo: 55,
  },
  {
    fromName: "Michael Bauer",
    fromEmail: "m.bauer@example.de",
    subject: "Frage zur Wartung",
    body: `Hallo,

wie oft muss eine Gastherme eigentlich gewartet werden und was kostet das bei Ihnen ungefähr?

Danke und viele Grüße
Michael Bauer`,
    hoursAgo: 70,
  },
];

async function main() {
  console.log("→ Systemprompts synchronisieren …");
  await syncSystemPrompts();

  const existing = await prisma.tenant.findUnique({ where: { slug: "muster-heizungs-sanitaer-gmbh" } });
  if (existing) {
    console.log("→ Vorhandene Demo-Daten werden entfernt …");
    await prisma.tenant.delete({ where: { id: existing.id } });
  }

  console.log("→ Betrieb anlegen …");
  const tenant = await prisma.tenant.create({
    data: {
      name: "Muster Heizungs- & Sanitär GmbH",
      slug: "muster-heizungs-sanitaer-gmbh",
      industryKey: "plumbing_heating",
      street: "Werkstraße 12",
      zip: "40227",
      city: "Düsseldorf",
      phone: "+49 211 5566778",
      email: "info@muster-shk.de",
      website: "https://muster-shk.de",
      employeeCount: 12,
      automationLevel: "SAFE",
      onboardingCompleted: true,
      onboardingStep: 8,
      settings: {
        create: {
          emailTone: "professional",
          emailSignature: "Muster Heizungs- & Sanitär GmbH\nWerkstraße 12, 40227 Düsseldorf\nTel. 0211 5566778",
          companyVoice: "Wir duzen niemanden, wir siezen. Wir nennen keine Preise ohne Aufmaß vor Ort.",
        },
      },
      subscription: {
        create: {
          plan: "BUSINESS",
          status: "ACTIVE",
          seats: 10,
          priceCentsPerMonth: 69900,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          limits: { users: 10, emails_processed: 2500, ai_calls: 10000, documents: 1000, automations: 15 },
        },
      },
    },
  });

  const { applyIndustryProfile, provisionRoles, provisionAIActions, provisionAIProviders, provisionBusinessHours, provisionWorkflows } =
    await import("../src/modules/tenants/provisioning");
  await applyIndustryProfile(tenant.id, "plumbing_heating");
  await provisionRoles(tenant.id);
  await provisionAIActions(tenant.id);
  await provisionAIProviders(tenant.id);
  await provisionBusinessHours(tenant.id);
  await provisionWorkflows(tenant.id);

  const roles = await prisma.role.findMany({ where: { tenantId: tenant.id } });
  const roleByKey = Object.fromEntries(roles.map((role) => [role.key, role]));
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  console.log("→ Benutzer anlegen …");
  const owner = await prisma.user.create({
    data: { tenantId: tenant.id, email: "max@muster-shk.de", name: "Max Muster", passwordHash, roleId: roleByKey.owner.id },
  });
  await prisma.user.create({
    data: { tenantId: tenant.id, email: "buero@muster-shk.de", name: "Sabine Wagner", passwordHash, roleId: roleByKey.office_manager.id },
  });
  await prisma.user.create({
    data: { tenantId: tenant.id, email: "stefan@muster-shk.de", name: "Stefan Groß", passwordHash, roleId: roleByKey.technician.id },
  });

  console.log("→ Mitarbeitende anlegen …");
  const employees = [];
  for (const employee of EMPLOYEES) {
    employees.push(
      await prisma.employee.create({
        data: {
          tenantId: tenant.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          jobTitle: employee.jobTitle,
          email: `${employee.firstName.toLowerCase()}@muster-shk.de`,
          skills: employee.skills,
          regions: employee.regions,
          color: employee.color,
        },
      }),
    );
  }

  // Urlaub, damit die Terminplanung etwas zu berücksichtigen hat.
  const vacationStart = new Date();
  vacationStart.setDate(vacationStart.getDate() + 2);
  vacationStart.setHours(0, 0, 0, 0);
  const vacationEnd = new Date(vacationStart);
  vacationEnd.setDate(vacationEnd.getDate() + 5);
  await prisma.absence.create({
    data: { tenantId: tenant.id, employeeId: employees[1].id, start: vacationStart, end: vacationEnd, reason: "Urlaub" },
  });

  console.log("→ Kunden anlegen …");
  const customers = [];
  for (const customer of CUSTOMERS) {
    customers.push(
      await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          customerNumber: await nextCustomerNumber(tenant.id),
          type: customer.companyName ? "COMPANY" : "PERSON",
          companyName: customer.companyName ?? null,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          street: customer.street,
          zip: customer.zip,
          city: customer.city,
          source: "seed",
        },
      }),
    );
  }

  console.log("→ Aufträge anlegen …");
  const statuses = await prisma.orderStatus.findMany({ where: { tenantId: tenant.id } });
  const statusByKey = Object.fromEntries(statuses.map((status) => [status.key, status]));
  const orders = [];
  for (const [index, order] of ORDERS.entries()) {
    const customer = customers[order.customerIndex];
    orders.push(
      await prisma.order.create({
        data: {
          tenantId: tenant.id,
          orderNumber: await nextOrderNumber(tenant.id),
          customerId: customer.id,
          title: order.title,
          description: order.description,
          categoryKey: order.categoryKey,
          priority: order.priority,
          statusId: (statusByKey[order.statusKey] ?? statusByKey.new).id,
          technicianId: employees[index % employees.length].id,
          street: customer.street,
          zip: customer.zip,
          city: customer.city,
          createdAt: new Date(Date.now() - (index + 1) * 26 * 60 * 60 * 1000),
        },
      }),
    );
  }

  console.log("→ Termine anlegen …");
  const startOfTomorrow = new Date();
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  startOfTomorrow.setHours(8, 0, 0, 0);

  // Termine nur an Werktagen – der Betrieb hat samstags und sonntags geschlossen.
  const workday = new Date(startOfTomorrow);
  const nextWorkday = () => {
    workday.setDate(workday.getDate() + 1);
    while (workday.getDay() === 0 || workday.getDay() === 6) workday.setDate(workday.getDate() + 1);
    return workday;
  };
  let slotInDay = 0;

  for (let index = 0; index < 10; index += 1) {
    const employee = employees[index % employees.length];
    const order = orders[index % orders.length];
    if (index % 3 === 0) {
      nextWorkday();
      slotInDay = 0;
    }
    const start = new Date(workday);
    start.setHours(8 + slotInDay * 3, slotInDay % 2 === 0 ? 0 : 30, 0, 0);
    slotInDay += 1;
    const end = new Date(start.getTime() + 90 * 60 * 1000);

    await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        orderId: order.id,
        customerId: order.customerId,
        employeeId: employee.id,
        title: order.title,
        start,
        end,
        status: index % 4 === 0 ? "PROPOSED" : "CONFIRMED",
        location: [order.street, `${order.zip} ${order.city}`].filter(Boolean).join(", "),
      },
    });
  }

  console.log("→ Demo-Postfach verbinden …");
  await prisma.integration.create({
    data: {
      tenantId: tenant.id,
      providerKey: "demo",
      type: "EMAIL",
      status: "CONNECTED",
      accountEmail: "info@muster-shk.de",
      displayName: "Demo-Postfach (kein echter Versand)",
      scopes: [],
      config: { note: "Nur für die Demonstration. Es werden keine Nachrichten an einen Mailserver übergeben." },
      lastSyncAt: new Date(),
    },
  });

  console.log("→ Posteingang füllen …");
  const emails = [];
  for (const message of INBOX) {
    const receivedAt = new Date(Date.now() - message.hoursAgo * 60 * 60 * 1000);
    emails.push(
      await prisma.email.create({
        data: {
          tenantId: tenant.id,
          externalId: `demo-${Buffer.from(message.subject + message.fromEmail).toString("base64url").slice(0, 24)}`,
          direction: "INBOUND",
          status: "RECEIVED",
          fromName: message.fromName,
          fromEmail: message.fromEmail,
          toEmails: ["info@muster-shk.de"],
          ccEmails: [],
          subject: message.subject,
          bodyText: message.body,
          receivedAt,
        },
      }),
    );
  }

  for (const email of emails) {
    await prisma.usageRecord.create({
      data: {
        tenantId: tenant.id,
        metric: "emails_processed",
        quantity: 1,
        periodKey: `${email.receivedAt.getFullYear()}-${String(email.receivedAt.getMonth() + 1).padStart(2, "0")}`,
        meta: { emailId: email.id, source: "seed" },
        at: email.receivedAt,
      },
    });
  }

  // Ein Teil des Posteingangs ist bereits von Hand erledigt – so wirkt die Ablage realistisch.
  await prisma.email.updateMany({
    where: { tenantId: tenant.id, subject: { in: ["Rechnung Nr. 2026-4471", "Rückfrage zum Angebot Wärmepumpe"] } },
    data: { status: "HANDLED", isRead: true },
  });

  console.log("→ Evaluationsfälle anlegen …");
  const evalCases = [
    { name: "Heizungsausfall", taskKey: "request_extract", input: { body: "Unsere Heizung ist komplett ausgefallen, es ist eiskalt." }, expected: { categoryKey: "heating_failure", priority: "HIGH" }, tags: ["shk", "prio"] },
    { name: "Wasserschaden", taskKey: "request_extract", input: { body: "Im Keller läuft Wasser aus einem Rohr, bitte sofort kommen!" }, expected: { categoryKey: "water_damage", priority: "URGENT" }, tags: ["shk", "notfall"] },
    { name: "Angebotsanfrage Bad", taskKey: "request_extract", input: { body: "Wir hätten gerne ein Angebot für ein neues Badezimmer." }, expected: { categoryKey: "sanitary_installation", priority: "NORMAL" }, tags: ["shk", "angebot"] },
    { name: "Spam erkennen", taskKey: "email_classify", input: { subject: "Mehr Kunden!", body: "Garantierte Backlinks, Newsletter abbestellen." }, expected: { categoryKey: "spam" }, tags: ["klassifikation"] },
  ];
  for (const testCase of evalCases) {
    await prisma.evaluationCase.create({
      data: {
        tenantId: tenant.id,
        taskKey: testCase.taskKey,
        name: testCase.name,
        input: testCase.input,
        expected: testCase.expected,
        tags: testCase.tags,
      },
    });
  }

  console.log("→ Automation auf neue Anfragen anwenden (erzeugt AI-Vorschläge und Freigaben) …");
  for (const [index, message] of INBOX.entries()) {
    if (!message.runPipeline) continue;
    try {
      await runWorkflowsForEmail(tenant.id, emails[index].id);
      console.log(`   ✓ ${message.subject}`);
    } catch (error) {
      console.error(`   ✗ ${message.subject}: ${(error as Error).message}`);
    }
  }

  const approvals = await prisma.approvalRequest.count({ where: { tenantId: tenant.id } });

  console.log("\n─────────────────────────────────────────────");
  console.log("Demo-Daten angelegt.");
  console.log(`Betrieb:     ${tenant.name}`);
  console.log(`Kunden:      ${customers.length}`);
  console.log(`Aufträge:    ${orders.length}`);
  console.log(`E-Mails:     ${emails.length}`);
  console.log(`Freigaben:   ${approvals}`);
  console.log("\nAnmeldung:");
  console.log(`  Inhaber:      ${owner.email} / ${DEMO_PASSWORD}`);
  console.log(`  Büroleitung:  buero@muster-shk.de / ${DEMO_PASSWORD}`);
  console.log(`  Techniker:    stefan@muster-shk.de / ${DEMO_PASSWORD}`);
  console.log("─────────────────────────────────────────────\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
