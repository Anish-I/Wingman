import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:8098';
const SCREENSHOTS = './e2e-screenshots';
mkdirSync(SCREENSHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  isMobile: true,
  deviceScaleFactor: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
});
const page = await ctx.newPage();

const errors = [];
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text()); });
page.on('pageerror', e => { console.log('PAGE ERR:', e.message); errors.push(e.message); });

// Auto-accept dialogs (for logout confirm)
page.on('dialog', async dialog => {
  console.log(`  DIALOG: "${dialog.message()}" -> accepting`);
  await dialog.accept();
});

async function shot(name) {
  await page.screenshot({ path: `${SCREENSHOTS}/${name}.png`, fullPage: false });
  console.log(`  📸 ${name}.png`);
}

async function clickText(text, opts = {}) {
  const loc = page.getByText(text, opts);
  if (await loc.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loc.click();
    await sleep(1500);
    return true;
  }
  // Fallback: JS click
  const clicked = await page.evaluate((t) => {
    const els = document.querySelectorAll('*');
    for (const el of els) {
      if (el.textContent?.trim() === t && el.children.length === 0) {
        el.click();
        el.parentElement?.click();
        el.parentElement?.parentElement?.click();
        return true;
      }
    }
    return false;
  }, text);
  if (clicked) await sleep(1500);
  return clicked;
}

console.log('=== WINGMAN E2E QA TEST (Round 2) ===\n');

// ===== A. ONBOARDING FLOW =====
console.log('--- A. ONBOARDING FLOW ---\n');

// 1. Welcome
console.log('1. Welcome screen');
await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await sleep(5000);
console.log(`  URL: ${page.url()}`);
await shot('01-welcome');

const welcomeClicked = await clickText('Nice to meet you!');
console.log(`  Welcome button clicked: ${welcomeClicked}, URL: ${page.url()}`);
await shot('02-after-welcome');

// 2. Features
console.log('\n2. Features screen');
await sleep(500);
await shot('03-features');
const letsGoClicked = await clickText("Let's Go");
console.log(`  Let's Go clicked: ${letsGoClicked}, URL: ${page.url()}`);
await shot('04-after-features');

// 3. Signup
console.log('\n3. Signup screen');
await sleep(500);
await shot('05-signup');

const emailInput = page.getByPlaceholder('Email address');
if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
  await emailInput.fill('test@wingman.app');
  console.log('  Filled email');
}
const passInput = page.getByPlaceholder('Password');
if (await passInput.isVisible({ timeout: 2000 }).catch(() => false)) {
  await passInput.fill('Test1234!');
  console.log('  Filled password');
}
await shot('06-signup-filled');

const signUpClicked = await clickText('Sign Up', { exact: true });
console.log(`  Sign Up clicked: ${signUpClicked}, URL: ${page.url()}`);
await sleep(1000);
await shot('07-after-signup');

// 4. Permissions
console.log('\n4. Permissions screen');
await sleep(500);
await shot('08-permissions');

for (let i = 0; i < 4; i++) {
  const allowBtn = page.getByText('Allow').first();
  if (await allowBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await allowBtn.click();
    await sleep(400);
  }
}
console.log('  Clicked Allow buttons');
await shot('09-permissions-allowed');

// Navigate directly to phone (known RN Web issue)
await page.goto(`${BASE}/onboarding/phone`, { waitUntil: 'load', timeout: 30000 });
await sleep(3000);

// 5. Phone
console.log('\n5. Phone screen');
await shot('10-phone');

const phoneInput = page.getByPlaceholder('(555) 123-4567');
if (await phoneInput.isVisible({ timeout: 2000 }).catch(() => false)) {
  await phoneInput.fill('5551234567');
  console.log('  Filled phone');
}

const textMeClicked = await clickText('Text Me');
console.log(`  Text Me clicked: ${textMeClicked}`);
await shot('11-phone-otp');

const otpInputs = page.locator('input[maxlength="1"]');
const otpCount = await otpInputs.count();
console.log(`  OTP inputs found: ${otpCount}`);
if (otpCount >= 4) {
  for (let i = 0; i < otpCount; i++) {
    await otpInputs.nth(i).fill(String(i + 1));
    await sleep(200);
  }
  await sleep(2000);
}
await shot('12-phone-verified');

// 6. Connect
console.log('\n6. Connect screen');
await sleep(1000);
console.log(`  URL: ${page.url()}`);
await shot('13-connect');

await clickText('Spotify');
await shot('14-connect-tapped');

const allSetClicked = await clickText('All Set!');
console.log(`  All Set clicked: ${allSetClicked}, URL: ${page.url()}`);
await shot('15-after-connect');

// 7. Done
console.log('\n7. Done screen');
await sleep(500);
await shot('16-done');

const startClicked = await clickText('Start Texting Pip');
console.log(`  Start Texting clicked: ${startClicked}`);
await sleep(3000);
console.log(`  URL: ${page.url()}`);
await shot('17-after-done');

// ===== B. AUTH - Should land on chat tab =====
console.log('\n--- B. AUTH CHECK ---');
console.log(`  Current URL: ${page.url()}`);
console.log(`  Landed on chat: ${page.url().includes('chat')}`);

// ===== C. CHAT =====
console.log('\n--- C. CHAT TEST ---');
await shot('18-chat-screen');

// Try multiple strategies for finding the chat input
let chatInputFound = false;

// Strategy 1: getByPlaceholder
const msgInput1 = page.getByPlaceholder('Text Pip...');
if (await msgInput1.isVisible({ timeout: 3000 }).catch(() => false)) {
  await msgInput1.fill('Hello Pip!');
  chatInputFound = true;
  console.log('  Found input via getByPlaceholder');
}

// Strategy 2: CSS selector for textarea/input
if (!chatInputFound) {
  const textarea = page.locator('textarea, input[type="text"]').last();
  if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
    await textarea.fill('Hello Pip!');
    chatInputFound = true;
    console.log('  Found input via CSS selector');
  }
}

// Strategy 3: find via evaluate
if (!chatInputFound) {
  const found = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input, textarea');
    for (const input of inputs) {
      if (input.placeholder?.includes('Pip') || input.placeholder?.includes('text') || input.placeholder?.includes('Text')) {
        input.value = 'Hello Pip!';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  });
  if (found) {
    chatInputFound = true;
    console.log('  Found input via JS evaluate');
  }
}

if (chatInputFound) {
  await shot('19-chat-typed');

  // Click send button - find the last button-like element near the input
  await page.evaluate(() => {
    // Find all elements with role="button"
    const buttons = document.querySelectorAll('[role="button"]');
    // The send button should be the last one in the input area
    const lastBtn = buttons[buttons.length - 1];
    if (lastBtn) {
      lastBtn.click();
      return 'clicked last button';
    }
    return 'no button found';
  });

  await sleep(3000);
  await shot('20-chat-sent');

  const chatText = await page.textContent('body');
  const hasResponse = chatText?.includes('Hello Pip!') || false;
  console.log(`  Message sent visible: ${hasResponse}`);
  console.log(`  Chat snippet: ${chatText?.slice(-200).replace(/\n/g, ' ')}`);
} else {
  console.log('  WARNING: Chat input not found with any strategy');
  // Debug: list all inputs on the page
  const inputInfo = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input, textarea');
    return Array.from(inputs).map(i => ({
      tag: i.tagName,
      placeholder: i.placeholder,
      type: i.type,
      visible: i.offsetParent !== null,
      className: i.className?.substring(0, 50),
    }));
  });
  console.log(`  Available inputs: ${JSON.stringify(inputInfo, null, 2)}`);
}

// ===== D. ALL 4 TAB SCREENS =====
console.log('\n--- D. TAB SCREENS ---');

// Navigate to each tab via URL
const tabs = [
  { name: 'Chat', path: 'chat' },
  { name: 'Apps', path: 'apps' },
  { name: 'Workflows', path: 'workflows' },
  { name: 'Settings', path: 'settings' },
];

for (const tab of tabs) {
  console.log(`\n  ${tab.name} tab:`);
  await page.goto(`${BASE}/${tab.path}`, { waitUntil: 'load', timeout: 30000 });
  await sleep(2000);
  await shot(`21-tab-${tab.name.toLowerCase()}`);
  const content = await page.textContent('body');
  console.log(`    Content: ${content?.slice(0, 100).replace(/\n/g, ' ')}`);
  console.log(`    URL: ${page.url()}`);
}

// ===== E. LOGOUT =====
console.log('\n--- E. LOGOUT TEST ---');
// Make sure we're on settings
await page.goto(`${BASE}/settings`, { waitUntil: 'load', timeout: 30000 });
await sleep(2000);
await shot('25-settings-before-logout');

// Scroll to Log Out button
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await sleep(500);

const logoutClicked = await clickText('Log Out');
console.log(`  Log Out clicked: ${logoutClicked}`);
await sleep(2000);
console.log(`  URL after logout: ${page.url()}`);
await shot('26-after-logout');

const isLoggedOut = page.url().includes('login') || page.url().includes('welcome') || page.url().includes('onboarding');
console.log(`  Redirected to login/onboarding: ${isLoggedOut}`);

// ===== VISUAL BUG CHECK =====
console.log('\n--- VISUAL BUG CHECK ---');
await page.goto(`${BASE}/onboarding/welcome`, { waitUntil: 'load', timeout: 30000 });
await sleep(3000);
await shot('27-visual-welcome');

const styles = await page.evaluate(() => {
  const results = {};
  results.bodyBg = getComputedStyle(document.body).backgroundColor;
  results.fonts = document.fonts ? Array.from(document.fonts).map(f => `${f.family}:${f.status}`).join(', ') : 'N/A';
  results.viewport = { w: window.innerWidth, h: window.innerHeight };
  // Check pip avatar - find circular containers
  const pipContainers = document.querySelectorAll('[style*="border-radius"]');
  results.pipContainerCount = pipContainers.length;
  return results;
});
console.log(`  Body bg: ${styles.bodyBg}`);
console.log(`  Fonts: ${styles.fonts}`);
console.log(`  Viewport: ${JSON.stringify(styles.viewport)}`);

console.log('\n=== TEST COMPLETE ===');
console.log(`  Console errors: ${errors.length}`);
errors.forEach(e => console.log(`    - ${e}`));

await browser.close();
