import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:8098';
const SCREENSHOTS = './qa-screenshots';
mkdirSync(SCREENSHOTS, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
  });
  const page = await context.newPage();
  const issues = [];

  page.on('console', msg => {
    if (msg.type() === 'error') issues.push(`CONSOLE: ${msg.text()}`);
  });
  page.on('pageerror', err => issues.push(`PAGE_ERROR: ${err.message}`));

  console.log('=== WINGMAN QA TEST @ 393x852 ===\n');

  // 1. Initial load
  console.log('1. Loading app...');
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await sleep(5000);
  await page.screenshot({ path: `${SCREENSHOTS}/01-initial.png` });
  console.log(`   URL: ${page.url()}`);

  // 2. Onboarding: Welcome
  console.log('2. Welcome screen...');
  await page.goto(`${BASE}/onboarding/welcome`, { waitUntil: 'load' });
  await sleep(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/02-welcome.png` });

  // 3. Features
  console.log('3. Features screen...');
  await page.goto(`${BASE}/onboarding/features`, { waitUntil: 'load' });
  await sleep(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/03-features.png` });

  // 4. Signup
  console.log('4. Signup screen...');
  await page.goto(`${BASE}/onboarding/signup`, { waitUntil: 'load' });
  await sleep(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/04-signup.png` });

  // 5. Permissions
  console.log('5. Permissions screen...');
  await page.goto(`${BASE}/onboarding/permissions`, { waitUntil: 'load' });
  await sleep(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/05-permissions.png` });

  // 6. Phone
  console.log('6. Phone screen...');
  await page.goto(`${BASE}/onboarding/phone`, { waitUntil: 'load' });
  await sleep(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/06-phone.png` });

  // 7. Connect
  console.log('7. Connect screen...');
  await page.goto(`${BASE}/onboarding/connect`, { waitUntil: 'load' });
  await sleep(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/07-connect.png` });

  // 8. Done screen
  console.log('8. Done screen...');
  await page.goto(`${BASE}/onboarding/done`, { waitUntil: 'load' });
  await sleep(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/08-done.png` });

  // 9. Complete onboarding by clicking "Start Texting Pip"
  // This sets isFirstTime=false and signs in, enabling tab routes
  console.log('9. Clicking Start Texting Pip...');
  try {
    // Try clicking the button
    const startBtn = await page.$('text=Start Texting Pip');
    if (startBtn) {
      await startBtn.click();
      await sleep(3000);
      console.log(`   Navigated to: ${page.url()}`);
      await page.screenshot({ path: `${SCREENSHOTS}/09-after-start.png` });
    } else {
      console.log('   Button not found, using JS to complete onboarding...');
      // Manually set localStorage/MMKV to bypass first-time check
      await page.evaluate(() => {
        // MMKV stores in localStorage on web
        try {
          const mmkvKey = '__mmkv_default__IS_FIRST_TIME';
          localStorage.setItem(mmkvKey, 'false');
          // Also try the standard key format
          localStorage.setItem('IS_FIRST_TIME', 'false');
        } catch(e) {}
      });
      await page.goto(`${BASE}/chat`, { waitUntil: 'load' });
      await sleep(3000);
      await page.screenshot({ path: `${SCREENSHOTS}/09-after-start.png` });
    }
  } catch (e) {
    console.log(`   Error: ${e.message}`);
  }

  // 10. Chat tab
  console.log('10. Chat tab...');
  const chatUrl = page.url();
  if (!chatUrl.includes('chat')) {
    // If we're not on chat, try direct navigation
    await page.goto(`${BASE}/chat`, { waitUntil: 'load' });
    await sleep(3000);
  }
  await page.screenshot({ path: `${SCREENSHOTS}/10-chat.png` });
  console.log(`   URL: ${page.url()}`);

  // 11. Chat interaction - find and use text input
  console.log('11. Chat interaction...');
  try {
    // Try various selectors for the text input
    let input = await page.$('[placeholder="Text Pip..."]');
    if (!input) input = await page.$('textarea');
    if (!input) input = await page.$('input[type="text"]');

    if (input) {
      await input.click();
      await sleep(500);
      await input.fill('Hello!');
      await sleep(500);
      await page.screenshot({ path: `${SCREENSHOTS}/11-chat-typed.png` });

      // Try sending - click the send button (arrow-up icon button)
      const buttons = await page.$$('div[role="button"], button');
      let sent = false;
      for (const btn of buttons) {
        const text = await btn.textContent();
        if (text === '' || text === null) {
          // Could be icon button (send)
          const box = await btn.boundingBox();
          if (box && box.x > 300) { // Send button is on the right
            await btn.click();
            sent = true;
            break;
          }
        }
      }
      if (!sent) {
        // Try pressing Enter
        await input.press('Enter');
      }
      await sleep(3000);
      await page.screenshot({ path: `${SCREENSHOTS}/12-chat-sent.png` });
      console.log('   Message sent!');
    } else {
      console.log('   Text input not found');
      const html = await page.evaluate(() => document.body.innerHTML.substring(0, 1000));
      console.log('   Body preview:', html.substring(0, 300));
    }
  } catch (e) {
    console.log(`   Chat error: ${e.message}`);
  }

  // 12. Apps tab
  console.log('12. Apps tab...');
  await page.goto(`${BASE}/apps`, { waitUntil: 'load' });
  await sleep(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/13-apps.png` });
  console.log(`   URL: ${page.url()}`);

  // 13. Workflows tab
  console.log('13. Workflows tab...');
  await page.goto(`${BASE}/workflows`, { waitUntil: 'load' });
  await sleep(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/14-workflows.png` });
  console.log(`   URL: ${page.url()}`);

  // 14. Settings tab
  console.log('14. Settings tab...');
  await page.goto(`${BASE}/settings`, { waitUntil: 'load' });
  await sleep(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/15-settings.png` });
  console.log(`   URL: ${page.url()}`);

  // Summary
  console.log('\n=== ISSUES DETECTED ===');
  if (issues.length === 0) {
    console.log('No console errors.');
  } else {
    issues.forEach((issue, i) => console.log(`  ${i + 1}. ${issue}`));
  }

  console.log('\n=== QA TEST COMPLETE ===');
  await browser.close();
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
