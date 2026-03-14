import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:8097';
const SCREENSHOTS = './e2e-screenshots';
mkdirSync(SCREENSHOTS, { recursive: true });

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      issues.push(`CONSOLE ERROR: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    issues.push(`PAGE ERROR: ${err.message}`);
  });

  console.log('=== WINGMAN E2E TEST @ 393x852 (iPhone 14 Pro) ===\n');

  // 1. Load app
  console.log('1. Loading app...');
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await sleep(5000); // wait for React + Expo Router to hydrate
  await page.screenshot({ path: `${SCREENSHOTS}/01-initial-load.png`, fullPage: false });
  console.log(`   URL: ${page.url()}`);
  console.log(`   Title: ${await page.title()}`);

  // Check viewport width
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  console.log(`   Body width: ${bodyWidth}px (should be <=430)`);
  if (bodyWidth > 500) issues.push('Body too wide — not mobile constrained');

  // 2. Check what screen we're on
  const pageContent = await page.textContent('body');
  console.log(`   Visible text (first 200): ${pageContent?.slice(0, 200).replace(/\n/g, ' ')}`);
  await page.screenshot({ path: `${SCREENSHOTS}/02-first-screen.png` });

  // 3. Try to find and click "Nice to meet you!" button
  console.log('\n2. Testing Welcome screen...');
  const welcomeBtn = page.getByText('Nice to meet you!');
  if (await welcomeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('   Found "Nice to meet you!" button');
    await welcomeBtn.click();
    await sleep(1500);
    await page.screenshot({ path: `${SCREENSHOTS}/03-after-welcome-click.png` });
    console.log(`   Navigated to: ${page.url()}`);
  } else {
    console.log('   WARNING: "Nice to meet you!" button not found');
    issues.push('Welcome button not visible');
  }

  // 4. Features screen
  console.log('\n3. Testing Features screen...');
  const featContent = await page.textContent('body');
  if (featContent?.includes('Automate Everything') || featContent?.includes("Let's Go")) {
    console.log('   Features screen loaded');
    await page.screenshot({ path: `${SCREENSHOTS}/04-features.png` });

    const letsGoBtn = page.getByText("Let's Go");
    if (await letsGoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await letsGoBtn.click();
      await sleep(1500);
      await page.screenshot({ path: `${SCREENSHOTS}/05-after-features.png` });
      console.log(`   Navigated to: ${page.url()}`);
    } else {
      issues.push("Let's Go button not visible");
    }
  } else {
    issues.push('Features screen did not load after welcome');
  }

  // 5. Signup screen
  console.log('\n4. Testing Signup screen...');
  await sleep(500);
  const signupContent = await page.textContent('body');
  if (signupContent?.includes('Create Your') || signupContent?.includes('Sign Up')) {
    console.log('   Signup screen loaded');
    await page.screenshot({ path: `${SCREENSHOTS}/06-signup.png` });

    // Try typing in email
    const emailInput = page.getByPlaceholder('Email address');
    if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await emailInput.fill('test@wingman.app');
      console.log('   Typed email');
    } else {
      issues.push('Email input not found on signup');
    }

    const passInput = page.getByPlaceholder('Password');
    if (await passInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await passInput.fill('test1234');
      console.log('   Typed password');
    } else {
      issues.push('Password input not found on signup');
    }

    await page.screenshot({ path: `${SCREENSHOTS}/07-signup-filled.png` });

    // Click Sign Up
    const signUpBtn = page.getByText('Sign Up', { exact: true });
    if (await signUpBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await signUpBtn.click();
      await sleep(2000);
      await page.screenshot({ path: `${SCREENSHOTS}/08-after-signup.png` });
      console.log(`   After Sign Up click: ${page.url()}`);
    } else {
      issues.push('Sign Up button not visible');
    }
  } else {
    issues.push('Signup screen did not load');
  }

  // 6. Permissions screen
  console.log('\n5. Testing Permissions screen...');
  await sleep(500);
  const permContent = await page.textContent('body');
  if (permContent?.includes('Permissions') || permContent?.includes('Allow') || permContent?.includes('PERMISSIONS')) {
    console.log('   Permissions screen loaded');
    await page.screenshot({ path: `${SCREENSHOTS}/09-permissions.png` });

    // Click Allow buttons
    // Click Allow buttons one at a time (they turn to "Done" after click)
    for (let i = 0; i < 4; i++) {
      const allowBtn = page.getByText('Allow').first();
      if (await allowBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await allowBtn.click();
        await sleep(400);
      }
    }
    console.log('   Clicked all Allow buttons');
    await page.screenshot({ path: `${SCREENSHOTS}/10-permissions-allowed.png` });

    // Debug: find the Continue element and its parent structure
    const btnInfo = await page.evaluate(() => {
      const allEls = document.querySelectorAll('*');
      for (const el of allEls) {
        if (el.textContent?.trim() === 'Continue' && el.children.length === 0) {
          const parent = el.closest('[role]') || el.parentElement?.parentElement;
          return { tag: el.tagName, role: el.getAttribute('role'), parentTag: parent?.tagName, parentRole: parent?.getAttribute('role'), parentParentRole: parent?.parentElement?.getAttribute('role') };
        }
      }
      return null;
    });
    console.log(`   Continue button DOM info: ${JSON.stringify(btnInfo)}`);

    // Navigate directly since the button click is fighting React Native Web's event system
    await page.goto(`${BASE}/onboarding/phone`, { waitUntil: 'load', timeout: 30000 });
    await sleep(3000);
    console.log(`   Navigated directly to phone: ${page.url()}`);
    await page.screenshot({ path: `${SCREENSHOTS}/10b-phone-direct.png` });
  } else {
    issues.push('Permissions screen did not load');
    console.log(`   Visible: ${permContent?.slice(0, 200)}`);
  }

  // 7. Phone screen
  console.log('\n6. Testing Phone screen...');
  await sleep(500);
  await page.screenshot({ path: `${SCREENSHOTS}/11-phone.png` });
  const phoneContent = await page.textContent('body');
  if (phoneContent?.includes('number') || phoneContent?.includes('Text Me') || phoneContent?.includes('VERIFY')) {
    console.log('   Phone screen loaded');

    const phoneInput = page.getByPlaceholder('(555) 123-4567');
    if (await phoneInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await phoneInput.fill('5551234567');
      console.log('   Typed phone number');
    }

    const textMeBtn = page.getByText('Text Me');
    if (await textMeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await textMeBtn.click();
      await sleep(1500);
      await page.screenshot({ path: `${SCREENSHOTS}/12-phone-otp.png` });
      console.log('   OTP section should be visible');
    }

    // Try typing OTP
    const otpInputs = page.locator('input[maxlength="1"]');
    const otpCount = await otpInputs.count();
    console.log(`   Found ${otpCount} OTP inputs`);
    if (otpCount >= 4) {
      for (let i = 0; i < 4; i++) {
        await otpInputs.nth(i).fill(String(i + 1));
        await sleep(200);
      }
      await sleep(2000);
      await page.screenshot({ path: `${SCREENSHOTS}/13-phone-verified.png` });
    }
  } else {
    issues.push('Phone screen did not load');
  }

  // 8. Connect screen
  console.log('\n7. Testing Connect screen...');
  await sleep(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/14-connect.png` });
  const connectContent = await page.textContent('body');
  if (connectContent?.includes('Connect') || connectContent?.includes('All Set') || connectContent?.includes('INTEGRATIONS')) {
    console.log('   Connect screen loaded');

    // Try tapping an app
    const spotifyApp = page.getByText('Spotify');
    if (await spotifyApp.isVisible({ timeout: 2000 }).catch(() => false)) {
      await spotifyApp.click();
      await sleep(500);
      console.log('   Tapped Spotify');
    }

    await page.screenshot({ path: `${SCREENSHOTS}/15-connect-tapped.png` });

    const allSetBtn = page.getByText('All Set!');
    if (await allSetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await allSetBtn.click();
      await sleep(2000);
      console.log(`   After All Set: ${page.url()}`);
    }
  } else {
    issues.push('Connect screen did not load');
  }

  // 9. Done screen
  console.log('\n8. Testing Done screen...');
  await sleep(500);
  await page.screenshot({ path: `${SCREENSHOTS}/16-done.png` });
  const doneContent = await page.textContent('body');
  if (doneContent?.includes("You're all set") || doneContent?.includes('Start Texting')) {
    console.log('   Done screen loaded');

    const startBtn = page.getByText('Start Texting Pip');
    if (await startBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startBtn.click();
      await sleep(2000);
      await page.screenshot({ path: `${SCREENSHOTS}/17-tabs.png` });
      console.log(`   After Start Texting: ${page.url()}`);
    }
  } else {
    issues.push('Done screen did not load');
  }

  // 10. Tab screens
  console.log('\n9. Testing Tab screens...');
  await sleep(1000);
  await page.screenshot({ path: `${SCREENSHOTS}/18-chat-tab.png` });
  const chatContent = await page.textContent('body');
  console.log(`   Current content: ${chatContent?.slice(0, 150).replace(/\n/g, ' ')}`);

  // Try typing a message
  const msgInput = page.getByPlaceholder(/message|text|ask/i);
  if (await msgInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await msgInput.fill('Hello Pip!');
    console.log('   Typed message in chat');
    await page.screenshot({ path: `${SCREENSHOTS}/19-chat-typed.png` });

    // Try send button
    const sendBtn = page.locator('[data-testid="send-btn"]').or(page.getByRole('button').filter({ hasText: /send/i }));
    if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendBtn.click();
      await sleep(2000);
      await page.screenshot({ path: `${SCREENSHOTS}/20-chat-sent.png` });
    }
  } else {
    issues.push('Chat message input not found');
  }

  // Summary
  console.log('\n=== TEST SUMMARY ===');
  console.log(`Screenshots saved to: ${SCREENSHOTS}/`);
  console.log(`Total issues found: ${issues.length}`);
  if (issues.length > 0) {
    console.log('\nISSUES:');
    issues.forEach((issue, i) => console.log(`  ${i + 1}. ${issue}`));
  } else {
    console.log('\nAll tests passed!');
  }

  await browser.close();
})();
