#!/usr/bin/env node

// Weekly report automation script
// This script triggers the weekly email report by calling your API endpoint

import { config } from 'dotenv';

// Load environment variables if .env file exists
try {
  config();
} catch (e) {
  // .env file doesn't exist, that's okay
}

const REPORT_URL = process.env.REPORT_URL || 'https://kit-app-build.vercel.app/api/weekly-report';
const EMAIL = process.env.REPORT_EMAIL || 'dan.cumberland@gmail.com';
const SECRET = process.env.WEEKLY_REPORT_SECRET || 'change-this-secret';

async function sendWeeklyReport() {
  try {
    console.log('📧 Sending weekly calendar app report...');
    console.log(`📍 URL: ${REPORT_URL}`);
    console.log(`📮 Email: ${EMAIL}`);
    
    const response = await fetch(REPORT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: EMAIL,
        secret: SECRET
      })
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Weekly report sent successfully!');
      console.log('📊 Stats:', result.stats);
    } else {
      console.error('❌ Failed to send report:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error sending weekly report:', error.message);
    process.exit(1);
  }
}

// Run the script
sendWeeklyReport();
