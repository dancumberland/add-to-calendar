#!/usr/bin/env node

// Test script for Make.com webhook
// This sends a sample report to test the webhook integration

const WEBHOOK_URL = 'https://hook.us1.make.com/3fala4mhh5jusbzxdsqar467eiw8evwa';
const TEST_EMAIL = 'dan.cumberland@gmail.com';

const sampleReport = {
  period: {
    start: '2025-01-13',
    end: '2025-01-19'
  },
  summary: {
    totalEvents: 15,
    avgPerDay: 2.1,
    locationPercentage: 60,
    topTimezone: 'America/Los_Angeles',
    topEventType: 'meeting'
  },
  allTime: {
    totalEvents: 127,
    firstEvent: '2024-12-01',
    locationPercentage: 55,
    topTimezone: 'America/Los_Angeles',
    topEventType: 'meeting'
  },
  dailyBreakdown: {
    '2025-01-13': 3,
    '2025-01-14': 1,
    '2025-01-15': 4,
    '2025-01-16': 2,
    '2025-01-17': 5,
    '2025-01-18': 0,
    '2025-01-19': 0
  },
  timezones: {
    'America/Los_Angeles': 8,
    'America/New_York': 4,
    'Europe/London': 3
  },
  eventTypes: {
    'meeting': 9,
    'appointment': 3,
    'personal': 2,
    'other': 1
  }
};

function generateTestHTML(report) {
  const { summary, allTime, period } = report;
  
  return `
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #4285F4;">📅 Calendar App Weekly Report (TEST)</h2>
      <p style="color: #666;">Period: ${period.start} to ${period.end}</p>
      
      <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #34a853;">
        <h3 style="margin-top: 0; color: #34a853;">🎯 All-Time Totals</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="margin: 10px 0;"><strong>Total Events Ever Created:</strong> ${allTime.totalEvents}</li>
          <li style="margin: 10px 0;"><strong>First Event:</strong> ${allTime.firstEvent || 'N/A'}</li>
          <li style="margin: 10px 0;"><strong>All-Time Location Usage:</strong> ${allTime.locationPercentage}%</li>
        </ul>
      </div>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">📊 This Week's Summary</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="margin: 10px 0;"><strong>Events This Week:</strong> ${summary.totalEvents}</li>
          <li style="margin: 10px 0;"><strong>Average per Day:</strong> ${summary.avgPerDay}</li>
          <li style="margin: 10px 0;"><strong>Events with Location:</strong> ${summary.locationPercentage}%</li>
        </ul>
      </div>
      
      <p style="color: #666; font-size: 12px;">
        🧪 This is a test email from your Calendar App webhook integration.
      </p>
    </body>
    </html>
  `;
}

function generateTestPlainText(report) {
  const { summary, allTime, period } = report;
  
  return `
CALENDAR APP WEEKLY REPORT (TEST)
Period: ${period.start} to ${period.end}

ALL-TIME TOTALS:
- Total Events Ever Created: ${allTime.totalEvents}
- First Event: ${allTime.firstEvent || 'N/A'}
- All-Time Location Usage: ${allTime.locationPercentage}%

THIS WEEK'S SUMMARY:
- Events This Week: ${summary.totalEvents}
- Average per Day: ${summary.avgPerDay}
- Events with Location: ${summary.locationPercentage}%

🧪 This is a test email from your Calendar App webhook integration.
  `;
}

async function testWebhook() {
  try {
    console.log('🧪 Testing Make.com webhook...');
    console.log(`📍 URL: ${WEBHOOK_URL}`);
    console.log(`📮 Email: ${TEST_EMAIL}`);
    
    const payload = {
      to: TEST_EMAIL,
      subject: `🧪 TEST: Calendar App Weekly Report - ${sampleReport.summary.totalEvents} events this week`,
      html: generateTestHTML(sampleReport),
      text: generateTestPlainText(sampleReport),
      reportData: sampleReport
    };
    
    console.log('📤 Sending test payload...');
    
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    console.log(`📊 Response Status: ${response.status}`);
    
    if (response.ok) {
      const responseText = await response.text();
      console.log('✅ Webhook test successful!');
      console.log('📋 Response:', responseText);
      console.log('\n🎯 Next steps:');
      console.log('1. Check your Make.com scenario execution log');
      console.log('2. Verify you received the test email');
      console.log('3. If successful, your Friday reports will work automatically!');
    } else {
      const errorText = await response.text();
      console.error('❌ Webhook test failed');
      console.error('📋 Error response:', errorText);
      console.log('\n🔧 Troubleshooting:');
      console.log('1. Check your Make.com webhook URL is correct');
      console.log('2. Verify your Make.com scenario is active');
      console.log('3. Check Make.com execution logs for errors');
    }
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check your internet connection');
    console.log('2. Verify the webhook URL is accessible');
    console.log('3. Check Make.com service status');
  }
}

// Run the test
testWebhook();
