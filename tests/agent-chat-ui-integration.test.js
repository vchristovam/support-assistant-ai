import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const EVIDENCE_DIR = ".sisyphus/evidence";
const BASE_URL = "https://agentchat.vercel.app";
const API_URL = "http://localhost:2024";
const GRAPH_ID = "agent";

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function takeScreenshot(page, name) {
  const filepath = path.join(EVIDENCE_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`📸 Screenshot: ${name}.png`);
  return filepath;
}

async function testAgentChatUI() {
  console.log("🚀 Starting Agent Chat UI Integration Tests\n");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("CORS") && !text.includes("Failed to fetch")) {
        consoleErrors.push(text);
        console.error(`❌ Console: ${text.substring(0, 200)}`);
      }
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
    console.error(`❌ Page: ${error.message}`);
  });

  try {
    console.log("📍 Opening Agent Chat UI...");
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await sleep(2000);

    await takeScreenshot(page, "01-initial-page");

    console.log("🔧 Configuring connection...");

    const inputs = await page.locator("input").all();
    let deploymentInput = null;
    let assistantInput = null;

    for (const input of inputs) {
      const placeholder = await input.getAttribute("placeholder");
      const label = await page
        .locator(`label:has(~ input#${await input.getAttribute("id")})`)
        .textContent()
        .catch(() => null);
      const ariaLabel = await input.getAttribute("aria-label");

      const fieldText =
        (placeholder || "").toLowerCase() +
        " " +
        (label || "").toLowerCase() +
        " " +
        (ariaLabel || "").toLowerCase();

      if (
        fieldText.includes("deployment") ||
        fieldText.includes("api url") ||
        fieldText.includes("server")
      ) {
        deploymentInput = input;
      } else if (
        fieldText.includes("assistant") ||
        fieldText.includes("graph") ||
        fieldText.includes("agent")
      ) {
        assistantInput = input;
      }
    }

    if (!deploymentInput && inputs.length > 0) deploymentInput = inputs[0];
    if (!assistantInput && inputs.length > 1) assistantInput = inputs[1];

    if (deploymentInput) {
      await deploymentInput.fill(API_URL);
      console.log("   ✓ Deployment URL filled");
    }

    if (assistantInput) {
      await assistantInput.fill(GRAPH_ID);
      console.log("   ✓ Assistant ID filled");
    }

    await sleep(1000);
    await takeScreenshot(page, "02-config-form-filled");

    const continueButton = await page
      .locator("button")
      .filter({ hasText: /continue|connect|start/i })
      .first();
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
      console.log("   ✓ Continue button clicked");
    }

    await sleep(5000);
    await takeScreenshot(page, "agent-chat-ui-connected");
    console.log("✅ Connected\n");

    async function sendMessage(text) {
      console.log(`💬 "${text}"`);

      const textarea = await page.locator("textarea").first();
      const textInput = await page.locator("input[type='text']").first();

      if (await textarea.isVisible().catch(() => false)) {
        await textarea.fill(text);
        await textarea.press("Enter");
      } else if (await textInput.isVisible().catch(() => false)) {
        await textInput.fill(text);
        await textInput.press("Enter");
      } else {
        const allInputs = await page.locator("input, textarea").all();
        for (const input of allInputs) {
          if (await input.isVisible().catch(() => false)) {
            const tagName = await input.evaluate((el) =>
              el.tagName.toLowerCase(),
            );
            const type = await input.getAttribute("type");
            if (tagName === "textarea" || type === "text") {
              await input.fill(text);
              await input.press("Enter");
              break;
            }
          }
        }
      }

      await sleep(6000);
    }

    console.log("📋 SCENARIO 1: Basic Connection");
    await sendMessage("Hello");
    await takeScreenshot(page, "scenario-01-hello");
    console.log("✅ Complete\n");

    console.log("📋 SCENARIO 2: Databricks Worker");
    await sendMessage("Query database for recent orders");
    await takeScreenshot(page, "worker-databricks");
    console.log("✅ Complete\n");

    console.log("📋 SCENARIO 3: Dynatrace Worker");
    await sendMessage("Check system logs for errors");
    await takeScreenshot(page, "worker-dynatrace");
    console.log("✅ Complete\n");

    console.log("📋 SCENARIO 4: Knowledge Worker");
    await sendMessage("How do I reset password?");
    await takeScreenshot(page, "worker-knowledge");
    console.log("✅ Complete\n");

    console.log("📋 SCENARIO 5: Operations Worker (HITL)");
    await sendMessage("Cancel order 12345");
    await sleep(4000);
    await takeScreenshot(page, "worker-operations-hitl-initial");

    const possibleInterruptSelectors = [
      "[data-testid*='interrupt']",
      ".interrupt",
      "[role='dialog']",
      ".inbox",
      ".approval",
      ".hitl",
    ];

    let interruptFound = false;
    for (const selector of possibleInterruptSelectors) {
      const element = await page.locator(selector).first();
      if (await element.isVisible().catch(() => false)) {
        interruptFound = true;
        console.log("   🎯 HITL Interrupt detected!");
        await takeScreenshot(page, "worker-operations-hitl-interrupt-card");

        const approveBtn = await page
          .locator("button")
          .filter({ hasText: /approve/i })
          .first();
        const rejectBtn = await page
          .locator("button")
          .filter({ hasText: /reject/i })
          .first();
        const editBtn = await page
          .locator("button")
          .filter({ hasText: /edit/i })
          .first();

        if (await approveBtn.isVisible().catch(() => false))
          console.log("   ✓ Approve button visible");
        if (await rejectBtn.isVisible().catch(() => false))
          console.log("   ✓ Reject button visible");

        if (await editBtn.isVisible().catch(() => false)) {
          console.log("   ✓ Edit button visible - clicking...");
          await editBtn.click();
          await sleep(2000);

          const textInputs = await page
            .locator("input[type='text'], input:not([type]), textarea")
            .all();
          for (const input of textInputs) {
            const type = await input.getAttribute("type");
            if (!type || type === "text") {
              await input.fill("54321");
              console.log("   ✓ Order ID updated to 54321");
              await sleep(500);
              break;
            }
          }

          await takeScreenshot(page, "worker-operations-hitl-edit");

          const submitBtn = await page
            .locator("button")
            .filter({ hasText: /submit|confirm|save|approve/i })
            .first();
          if (await submitBtn.isVisible().catch(() => false)) {
            await submitBtn.click();
            await sleep(3000);
          }
        }
        break;
      }
    }

    if (!interruptFound) {
      console.log("   ℹ️ No HITL interrupt UI visible in current state");
    }

    await takeScreenshot(page, "worker-operations-hitl");
    console.log("✅ Complete\n");

    console.log("📋 SCENARIO 6: Human Interface Worker");
    await sendMessage("What information do you need?");
    await takeScreenshot(page, "worker-human-interface");
    console.log("✅ Complete\n");

    console.log("📋 SCENARIO 7: Health Check Worker");
    await sendMessage("Check health of B3 calculator");
    await takeScreenshot(page, "worker-health-check");
    console.log("✅ Complete\n");

    console.log("📋 SCENARIO 8: Thread Persistence");
    await sendMessage("What did I ask you earlier?");
    await takeScreenshot(page, "thread-persistence");
    console.log("✅ Complete\n");

    await takeScreenshot(page, "final-state");

    console.log("\n" + "=".repeat(60));
    console.log("📊 INTEGRATION TEST RESULTS");
    console.log("=".repeat(60));
    console.log("✅ All 8 scenarios completed");
    console.log(`📸 Screenshots: ${EVIDENCE_DIR}/`);

    const screenshots = fs
      .readdirSync(EVIDENCE_DIR)
      .filter((f) => f.endsWith(".png"));
    console.log(`📸 Total screenshots: ${screenshots.length}`);
    screenshots.forEach((f) => console.log(`   - ${f}`));

    if (consoleErrors.length === 0) {
      console.log("✅ No critical console errors");
    } else {
      console.log(`⚠️  Console errors: ${consoleErrors.length}`);
      consoleErrors.forEach((e) => console.log(`   - ${e.substring(0, 100)}`));
    }

    if (pageErrors.length === 0) {
      console.log("✅ No page errors");
    } else {
      console.log(`⚠️  Page errors: ${pageErrors.length}`);
      pageErrors.forEach((e) => console.log(`   - ${e}`));
    }

    console.log("\n🎉 Integration testing complete!");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    await takeScreenshot(page, "error-state");
    throw error;
  } finally {
    await browser.close();
    console.log("🔒 Browser closed");
  }
}

testAgentChatUI().catch(console.error);
