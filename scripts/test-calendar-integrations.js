#!/usr/bin/env node
/**
 * test-calendar-integrations.js
 *
 * Automated testing script for Add-to-Calendar integrations.
 * Runs comprehensive tests and sends alerts on failure.
 *
 * Usage:
 *   npm run test-calendars
 *   node scripts/test-calendar-integrations.js
 *
 * Environment variables required:
 *   - REPORT_URL: Base URL of the deployed app (e.g., https://kit-app-build.vercel.app)
 *   - WEEKLY_REPORT_SECRET: Secret for authenticating test requests
 *   - REPORT_EMAIL: Email to send failure alerts to
 *   - MAKE_WEBHOOK_URL: (optional) Make.com webhook for email alerts
 */

import 'dotenv/config';

const REPORT_URL = process.env.REPORT_URL || 'https://kit-app-build.vercel.app';
const SECRET = process.env.WEEKLY_REPORT_SECRET;
const REPORT_EMAIL = process.env.REPORT_EMAIL;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

async function runTests() {
  console.log('🧪 Running Calendar Integration Tests...');
  console.log(`   Target: ${REPORT_URL}/api/test-calendars`);
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log('');

  try {
    const response = await fetch(`${REPORT_URL}/api/test-calendars`, {
      method: 'GET',
      headers: {
        'x-test-secret': SECRET || '',
      },
    });

    const results = await response.json();

    // Display results
    console.log('📊 Test Results:');
    console.log('================');
    console.log(`   Total:  ${results.summary.total}`);
    console.log(`   Passed: ${results.summary.passed} ✅`);
    console.log(`   Failed: ${results.summary.failed} ${results.summary.failed > 0 ? '❌' : ''}`);
    console.log(`   KV:     ${results.kvTest.passed ? '✅' : '❌'}`);
    console.log(`   Duration: ${results.duration}`);
    console.log('');

    // Show individual test results
    for (const test of results.tests) {
      const icon = test.passed ? '✅' : '❌';
      console.log(`${icon} ${test.name}`);
      if (!test.passed && test.errors.length > 0) {
        for (const error of test.errors) {
          console.log(`   └─ ${error}`);
        }
      }
    }
    console.log('');

    // If any tests failed, send alert
    if (!results.allPassed) {
      console.log('⚠️  Some tests failed! Sending alert...');
      await sendFailureAlert(results);
    } else {
      console.log('✅ All tests passed!');
    }

    return results.allPassed;

  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    await sendFailureAlert({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    return false;
  }
}

async function sendFailureAlert(results) {
  if (!REPORT_EMAIL) {
    console.log('   No REPORT_EMAIL configured, skipping alert');
    return;
  }

  const subject = '⚠️ Calendar Integration Tests Failed';
  const failedTests = results.tests?.filter(t => !t.passed) || [];

  const htmlContent = `
    <h2>Calendar Integration Test Failure</h2>
    <p><strong>Time:</strong> ${results.timestamp || new Date().toISOString()}</p>
    <p><strong>Environment:</strong> ${results.environment || 'unknown'}</p>

    ${results.error ? `<p style="color: red;"><strong>Error:</strong> ${results.error}</p>` : ''}

    ${results.summary ? `
    <h3>Summary</h3>
    <ul>
      <li>Total: ${results.summary.total}</li>
      <li>Passed: ${results.summary.passed}</li>
      <li>Failed: ${results.summary.failed}</li>
    </ul>
    ` : ''}

    ${failedTests.length > 0 ? `
    <h3>Failed Tests</h3>
    <ul>
      ${failedTests.map(t => `
        <li>
          <strong>${t.name}</strong>
          <ul>
            ${t.errors.map(e => `<li style="color: red;">${e}</li>`).join('')}
          </ul>
        </li>
      `).join('')}
    </ul>
    ` : ''}

    ${results.kvTest && !results.kvTest.passed ? `
    <h3>KV Storage Issue</h3>
    <p style="color: red;">${results.kvTest.details}</p>
    ` : ''}

    <p style="margin-top: 20px; color: #666;">
      This is an automated alert from the Add-to-Calendar test system.
    </p>
  `;

  if (MAKE_WEBHOOK_URL) {
    try {
      const response = await fetch(MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: REPORT_EMAIL,
          subject,
          html: htmlContent,
          text: `Calendar tests failed at ${results.timestamp}. Check the dashboard for details.`
        }),
      });

      if (response.ok) {
        console.log('   Alert sent successfully via Make.com');
      } else {
        console.log('   Failed to send alert via Make.com:', response.status);
      }
    } catch (error) {
      console.error('   Error sending alert:', error.message);
    }
  } else {
    console.log('   MAKE_WEBHOOK_URL not configured, alert logged only');
  }
}

// Run if called directly
runTests().then(success => {
  process.exit(success ? 0 : 1);
});
