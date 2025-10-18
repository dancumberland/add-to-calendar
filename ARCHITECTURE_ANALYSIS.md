# Architecture Analysis: Monetization & User Management

**Date**: October 16, 2025  
**Purpose**: Deep technical analysis of opt-in and subscription systems  
**Status**: Planning Phase

---

## Executive Summary

This document analyzes the technical architecture required for:
1. **Level 1**: Free opt-in system for email capture
2. **Level 2**: Paid subscription system with feature gating
3. **Integration**: Kit API integration for click tracking and tagging

**Key Findings**:
- Level 1 is **feasible** with 30-40 hours effort
- Level 2 is **complex but achievable** with 60-80 hours effort
- Both can be built incrementally without breaking existing users
- Estimated total cost: ~$50-100/month in infrastructure

---

## Level 1: Free Opt-In System

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                       Kit Plugin                             │
│  (Content Block in Kit Editor)                              │
│                                                              │
│  First Use Detection:                                        │
│  - Check if user_email exists in request                    │
│  - If no → Show opt-in form                                 │
│  - If yes → Normal operation                                │
└───────────────────┬──────────────────────────────────────────┘
                    ↓
         POST /api/calendar-block
         { email: "user@example.com", settings: {...} }
                    ↓
┌───────────────────┴──────────────────────────────────────────┐
│              /api/calendar-block Handler                     │
│                                                              │
│  1. Extract email from request                              │
│  2. Check if user exists in database                        │
│  3. If new → Create user record                             │
│  4. If exists → Update last_active_at                       │
│  5. Generate calendar HTML as normal                        │
│  6. Track event creation                                    │
└───────────────────┬──────────────────────────────────────────┘
                    ↓
┌───────────────────┴──────────────────────────────────────────┐
│           Vercel Postgres Database                           │
│                                                              │
│  users table:                                                │
│  - id (UUID)                                                 │
│  - email (unique)                                            │
│  - opt_in_date (timestamp)                                   │
│  - created_at (timestamp)                                    │
│  - last_active_at (timestamp)                                │
│  - settings (JSONB)                                          │
└──────────────────────────────────────────────────────────────┘
```

### Implementation Details

#### 1. Database Setup

**Provider**: Vercel Postgres  
**Reason**: Native integration, serverless-friendly, scales automatically  
**Cost**: $0-20/month (starts free)

```sql
-- Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  opt_in_date TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP DEFAULT NOW(),
  subscription_tier VARCHAR(20) DEFAULT 'free',
  stripe_customer_id VARCHAR(100),
  kit_account_id VARCHAR(100),
  settings JSONB DEFAULT '{}',
  
  -- Indexes for performance
  INDEX idx_email (email),
  INDEX idx_last_active (last_active_at)
);

-- Create events table
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone VARCHAR(100),
  has_recurrence BOOLEAN DEFAULT false,
  recurrence_data JSONB,
  location VARCHAR(500),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at),
  INDEX idx_event_date (event_date)
);
```

#### 2. User Management API

**File**: `/api/users/index.js`

```javascript
import { sql } from '@vercel/postgres';

export async function createOrUpdateUser(email) {
  try {
    // Check if user exists
    const { rows } = await sql`
      SELECT id, email, subscription_tier 
      FROM users 
      WHERE email = ${email}
    `;
    
    if (rows.length > 0) {
      // Update last active
      await sql`
        UPDATE users 
        SET last_active_at = NOW() 
        WHERE email = ${email}
      `;
      return { user: rows[0], isNew: false };
    }
    
    // Create new user
    const { rows: newUser } = await sql`
      INSERT INTO users (email, opt_in_date, last_active_at)
      VALUES (${email}, NOW(), NOW())
      RETURNING id, email, subscription_tier
    `;
    
    // Send welcome email (async, don't wait)
    sendWelcomeEmail(email).catch(console.error);
    
    return { user: newUser[0], isNew: true };
    
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  }
}

export async function trackEventCreation(userId, eventData) {
  await sql`
    INSERT INTO events (
      user_id, title, event_date, start_time, end_time,
      timezone, has_recurrence, recurrence_data,
      location, description
    )
    VALUES (
      ${userId}, ${eventData.title}, ${eventData.date},
      ${eventData.start_time}, ${eventData.end_time},
      ${eventData.timezone}, ${eventData.has_recurrence},
      ${JSON.stringify(eventData.recurrence_data || {})},
      ${eventData.location || ''}, ${eventData.description || ''}
    )
  `;
}
```

#### 3. Updated Calendar Block Handler

**File**: `/api/calendar-block/index.js`

```javascript
import { createOrUpdateUser, trackEventCreation } from '../users/index.js';

export default async function handler(req, res) {
  // ... existing CORS and validation ...
  
  const settings = req.body?.settings || {};
  const { email, ...eventSettings } = settings;
  
  // Require email for all requests
  if (!email || !isValidEmail(email)) {
    return res.status(200).json({
      code: 400,
      errors: ['Email required. Please sign up to use this plugin.'],
      requiresOptIn: true
    });
  }
  
  try {
    // Create or update user
    const { user, isNew } = await createOrUpdateUser(email);
    
    // ... existing calendar generation logic ...
    
    // Track event creation
    await trackEventCreation(user.id, {
      title: eventSettings.title,
      date: eventSettings.date,
      start_time: eventSettings.start_time,
      end_time: eventSettings.end_time,
      timezone: eventSettings.tz,
      has_recurrence: !!eventSettings.recurrence,
      recurrence_data: eventSettings.recurrence,
      location: eventSettings.location,
      description: eventSettings.description
    });
    
    // Return calendar HTML
    return res.status(200).json({ 
      code: 200, 
      html: generatedHtml,
      isNewUser: isNew 
    });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(200).json({
      code: 500,
      errors: ['An error occurred. Please try again.']
    });
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
```

#### 4. Opt-In UI in Kit Plugin

**Kit Plugin Configuration** (updated):

```json
{
  "settings": [
    {
      "type": "text",
      "id": "email",
      "label": "Your Email",
      "help": "Required to track your events and access premium features",
      "default": "",
      "required": true,
      "validation": {
        "type": "email"
      }
    },
    // ... existing settings (title, date, etc.) ...
  ]
}
```

**In Kit Editor Experience**:
```
┌─────────────────────────────────────────────────────┐
│  Add-to-Calendar Buttons                            │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                      │
│  Your Email *                                        │
│  [your@email.com                            ]       │
│  💡 Required for event tracking and premium features│
│                                                      │
│  Event Title *                                       │
│  [Team Meeting                              ]       │
│  ...                                                 │
└─────────────────────────────────────────────────────┘
```

### Migration Strategy for Existing Users

**Problem**: Existing users don't have emails stored  
**Solution**: Graceful degradation + soft enforcement

1. **Phase 1 (Week 1-2)**: Email optional, encourage with benefits
2. **Phase 2 (Week 3-4)**: Email optional, show "limited features" message
3. **Phase 3 (Week 5+)**: Email required for new features (recurring, reminders)

```javascript
// In calendar-block handler
if (!email) {
  // Allow basic functionality
  if (!hasAdvancedFeatures(settings)) {
    return generateBasicCalendar(settings);
  }
  
  // Block advanced features
  return res.status(200).json({
    code: 403,
    errors: ['Email required for recurring events and reminders'],
    requiresOptIn: true
  });
}
```

### Privacy & Compliance

#### GDPR Requirements

1. **Lawful Basis**: Consent + Legitimate Interest
2. **Data Collected**: Email, usage stats, timestamps
3. **Retention**: 2 years inactive → automatic deletion
4. **Rights**: Access, deletion, portability

**Privacy Policy Updates Needed**:
```markdown
## What We Collect
- Email address (required for service)
- Event details (title, date, time)
- Usage statistics (anonymous)
- Click tracking data

## How We Use It
- Provide calendar service
- Send feature updates (opt-out anytime)
- Improve product based on usage patterns

## Your Rights (GDPR)
- Access your data
- Delete your account
- Export your data
- Opt out of marketing emails
```

#### Implementation

**File**: `/api/users/delete.js`

```javascript
// GDPR: Right to be forgotten
export default async function handler(req, res) {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }
  
  try {
    // Delete user and all associated data (CASCADE)
    await sql`
      DELETE FROM users 
      WHERE email = ${email}
    `;
    
    // Also remove from email list
    await removeFromEmailList(email);
    
    return res.status(200).json({ 
      message: 'Account deleted successfully' 
    });
    
  } catch (error) {
    console.error('Deletion error:', error);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
}
```

**Unsubscribe Link** (in all emails):
```html
<a href="https://kit-app-build.vercel.app/unsubscribe?email={{ email }}&token={{ unsubscribe_token }}">
  Unsubscribe
</a>
```

### Cost Analysis for Level 1

| Service | Purpose | Cost/Month |
|---------|---------|------------|
| Vercel Postgres | User database | $0-20 (free tier initially) |
| Vercel Functions | API endpoints | $0 (included in Pro) |
| Vercel KV | ICS file storage | $0 (existing) |
| Email Service | Welcome emails | $0-10 (Resend free tier) |
| **TOTAL** | | **$0-30/month** |

**Scaling**:
- 0-1,000 users: Free tier
- 1,000-10,000 users: ~$20-50/month
- 10,000+ users: ~$100-200/month

---

## Level 2: Paid Subscription System

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    User Dashboard                            │
│              dashboard.kit-app-build.vercel.app             │
│                                                              │
│  - View subscription status                                  │
│  - Manage billing                                            │
│  - View usage analytics                                      │
│  - Upgrade/downgrade                                         │
└───────────────────┬──────────────────────────────────────────┘
                    ↓
         Authentication (Magic Link / OAuth)
                    ↓
┌───────────────────┴──────────────────────────────────────────┐
│                  Subscription API                            │
│              /api/subscriptions/*                            │
│                                                              │
│  - /create-checkout-session                                  │
│  - /webhook (Stripe events)                                  │
│  - /manage-subscription                                      │
│  - /usage-stats                                              │
└───────────────────┬──────────────────────────────────────────┘
                    ↓
         ┌──────────┴────────────┐
         ↓                       ↓
┌─────────────────┐    ┌──────────────────┐
│  Stripe API     │    │  Database        │
│                 │    │  (Postgres)      │
│  - Checkout     │    │  - Update tier   │
│  - Subscriptions│    │  - Track changes │
│  - Webhooks     │    │  - Audit log     │
└─────────────────┘    └──────────────────┘
```

### Implementation Details

#### 1. Stripe Integration

**Setup Steps**:
1. Create Stripe account
2. Get API keys (test + production)
3. Create products and prices
4. Set up webhook endpoint

**Products**:
```javascript
// In Stripe Dashboard or via API
const products = {
  pro_monthly: {
    name: "Pro Monthly",
    price: 900, // $9.00 in cents
    interval: "month",
    features: [
      "Recurring events",
      "Custom reminders",
      "Kit tag integration",
      "Click analytics",
      "Unlimited events"
    ]
  },
  pro_annual: {
    name: "Pro Annual",
    price: 9000, // $90.00 (save 16%)
    interval: "year",
    features: "Same as monthly"
  }
};
```

#### 2. Checkout Flow

**File**: `/api/subscriptions/create-checkout-session.js`

```javascript
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  const { email, priceId, returnUrl } = req.body;
  
  if (!email || !priceId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    // Check if customer exists
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customer = customers.data[0];
    
    if (!customer) {
      // Create new customer
      customer = await stripe.customers.create({
        email,
        metadata: { source: 'kit-add-to-calendar' }
      });
      
      // Save customer ID to database
      await sql`
        UPDATE users 
        SET stripe_customer_id = ${customer.id}
        WHERE email = ${email}
      `;
    }
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      success_url: `${returnUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}?canceled=true`,
      subscription_data: {
        trial_period_days: 14, // 14-day free trial
        metadata: {
          user_email: email
        }
      },
      allow_promotion_codes: true, // Enable discount codes
    });
    
    return res.status(200).json({ 
      sessionId: session.id,
      url: session.url 
    });
    
  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ 
      error: 'Failed to create checkout session' 
    });
  }
}
```

#### 3. Webhook Handler

**File**: `/api/subscriptions/webhook.js`

```javascript
import Stripe from 'stripe';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Disable body parsing to get raw body
export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];
  
  let event;
  
  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;
        
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
        
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
        
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
        
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    return res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}

async function handleSubscriptionCreated(subscription) {
  const customerEmail = subscription.metadata.user_email;
  
  await sql`
    UPDATE users 
    SET 
      subscription_tier = 'pro',
      stripe_subscription_id = ${subscription.id}
    WHERE email = ${customerEmail}
  `;
  
  // Log the change
  await sql`
    INSERT INTO subscription_changes (
      user_id, from_tier, to_tier, reason, stripe_event_id
    )
    SELECT id, 'free', 'pro', 'subscription_created', ${subscription.id}
    FROM users WHERE email = ${customerEmail}
  `;
  
  // Send welcome email
  await sendProWelcomeEmail(customerEmail);
}

async function handleSubscriptionDeleted(subscription) {
  await sql`
    UPDATE users 
    SET 
      subscription_tier = 'free',
      stripe_subscription_id = NULL
    WHERE stripe_subscription_id = ${subscription.id}
  `;
  
  // Log the change
  await sql`
    INSERT INTO subscription_changes (
      user_id, from_tier, to_tier, reason
    )
    SELECT id, 'pro', 'free', 'subscription_cancelled'
    FROM users WHERE stripe_subscription_id = ${subscription.id}
  `;
}

async function handlePaymentFailed(invoice) {
  // Get customer email
  const customer = await stripe.customers.retrieve(invoice.customer);
  
  // Send dunning email (Stripe handles this automatically, but we can add custom logic)
  await sendPaymentFailedEmail(customer.email, {
    invoiceUrl: invoice.hosted_invoice_url,
    amountDue: invoice.amount_due / 100,
    attemptCount: invoice.attempt_count
  });
}
```

#### 4. Feature Gating Middleware

**File**: `/api/middleware/feature-gate.js`

```javascript
import { sql } from '@vercel/postgres';

export async function checkFeatureAccess(email, feature) {
  try {
    const { rows } = await sql`
      SELECT subscription_tier, stripe_subscription_id
      FROM users
      WHERE email = ${email}
    `;
    
    if (rows.length === 0) {
      return { allowed: false, tier: 'none' };
    }
    
    const user = rows[0];
    const tier = user.subscription_tier || 'free';
    
    // Define feature access matrix
    const features = {
      basic: ['free', 'pro', 'business'],
      recurring: ['pro', 'business'],
      reminders: ['pro', 'business'],
      tracking: ['pro', 'business'],
      kit_integration: ['pro', 'business'],
      analytics: ['pro', 'business'],
      team: ['business'],
      api_access: ['business']
    };
    
    const allowed = features[feature]?.includes(tier) || false;
    
    return {
      allowed,
      tier,
      feature,
      upgradeRequired: !allowed
    };
    
  } catch (error) {
    console.error('Feature gate error:', error);
    return { allowed: false, tier: 'error' };
  }
}

// Use in calendar-block handler
export async function requireFeature(req, res, next, feature) {
  const { email } = req.body.settings;
  
  const access = await checkFeatureAccess(email, feature);
  
  if (!access.allowed) {
    return res.status(200).json({
      code: 403,
      errors: [`This feature requires ${access.upgradeRequired ? 'Pro' : 'higher'} subscription`],
      upgradeUrl: 'https://kit-app-build.vercel.app/pricing',
      currentTier: access.tier
    });
  }
  
  // Feature allowed, continue
  req.user = access;
  next();
}
```

**Updated Calendar Block Handler**:

```javascript
export default async function handler(req, res) {
  // ... existing validation ...
  
  const { email, recurrence, reminder, track_clicks } = req.body.settings;
  
  // Check feature access
  if (recurrence) {
    const access = await checkFeatureAccess(email, 'recurring');
    if (!access.allowed) {
      return res.status(200).json({
        code: 403,
        errors: ['Recurring events require Pro subscription'],
        upgradeUrl: 'https://kit-app-build.vercel.app/upgrade',
        upgradeMessage: 'Upgrade to Pro to create recurring events'
      });
    }
  }
  
  // ... rest of handler ...
}
```

#### 5. User Dashboard

**Stack**: Next.js App Router + Tailwind CSS

**File Structure**:
```
/dashboard
├── app/
│   ├── layout.tsx
│   ├── page.tsx (Dashboard home)
│   ├── subscription/
│   │   ├── page.tsx (Manage subscription)
│   │   └── upgrade/page.tsx (Upgrade flow)
│   ├── analytics/
│   │   └── page.tsx (Usage stats)
│   └── settings/
│       └── page.tsx (Account settings)
├── components/
│   ├── SubscriptionCard.tsx
│   ├── UsageChart.tsx
│   └── PricingTable.tsx
└── lib/
    ├── stripe.ts
    ├── auth.ts
    └── db.ts
```

**Example Dashboard Page**:

```typescript
// app/page.tsx
import { getUser } from '@/lib/auth';
import { getUsageStats } from '@/lib/db';
import SubscriptionCard from '@/components/SubscriptionCard';
import UsageChart from '@/components/UsageChart';

export default async function DashboardPage() {
  const user = await getUser();
  const stats = await getUsageStats(user.id);
  
  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">
        Welcome back, {user.email}
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard 
          title="Events This Month"
          value={stats.eventsThisMonth}
          change="+12% from last month"
        />
        <StatCard 
          title="Total Clicks"
          value={stats.totalClicks}
          change="+8% from last month"
        />
        <StatCard 
          title="Click Rate"
          value={`${stats.clickRate}%`}
          change="Average across all events"
        />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SubscriptionCard user={user} />
        <UsageChart data={stats.dailyUsage} />
      </div>
    </div>
  );
}
```

### Cost Analysis for Level 2

| Service | Purpose | Cost/Month |
|---------|---------|------------|
| Vercel Pro | Hosting dashboard + functions | $20 |
| Vercel Postgres | User + subscription data | $20-50 |
| Stripe | Payment processing | 2.9% + $0.30/transaction |
| Email Service | Transactional emails | $10-20 |
| **TOTAL** | | **$50-100/month** |

Plus Stripe fees: ~3% of revenue

**Break-even Analysis**:
```
Fixed costs: $75/month
Stripe fees: 3% of revenue
Target: 50 Pro subscribers @ $9/mo = $450/mo

Revenue: $450
Costs: $75 + ($450 × 0.03) = $88.50
Net profit: $361.50/month
Margin: 80%
```

---

## Implementation Timeline

### Level 1: Opt-In System (3-4 weeks)

**Week 1**: Setup & Foundation
- Day 1-2: Set up Vercel Postgres, create schema
- Day 3-4: Build user management API
- Day 5: Update calendar-block handler

**Week 2**: UI & Integration
- Day 1-2: Add email field to Kit plugin config
- Day 3-4: Build opt-in flow and validation
- Day 5: Privacy policy updates

**Week 3**: Testing & Polish
- Day 1-2: End-to-end testing
- Day 3-4: Migration strategy for existing users
- Day 5: Deploy to production

**Week 4**: Monitoring & Iteration
- Monitor opt-in rates
- Fix any issues
- Collect user feedback

### Level 2: Paid Subscriptions (4-6 weeks)

**Week 1-2**: Stripe Integration
- Set up Stripe account and products
- Build checkout flow
- Implement webhook handlers
- Test payment flows

**Week 3-4**: Dashboard Development
- Build Next.js dashboard app
- Create subscription management UI
- Implement usage analytics
- Add billing management

**Week 5**: Feature Gating
- Implement feature gate middleware
- Update calendar-block handler
- Add upgrade prompts in Kit plugin
- Test feature restrictions

**Week 6**: Testing & Launch
- End-to-end testing
- Security audit
- Soft launch to beta users
- Full launch

---

## Risk Mitigation

### Technical Risks

**Database Performance**
- **Risk**: Slow queries as user base grows
- **Mitigation**: Proper indexing, caching layer, query optimization
- **Monitoring**: Set up Vercel Analytics for database queries

**Stripe Webhook Reliability**
- **Risk**: Missed webhooks could cause state inconsistency
- **Mitigation**: Idempotency keys, retry logic, manual sync tools
- **Monitoring**: Log all webhook events, alert on failures

**Feature Gate Bypass**
- **Risk**: Users could manipulate requests to access Pro features
- **Mitigation**: Server-side validation, audit logs, rate limiting
- **Monitoring**: Track unusual usage patterns

### Business Risks

**Low Conversion Rate**
- **Risk**: Free users don't convert to paid
- **Mitigation**: Strong value prop, 14-day trial, limited free tier
- **A/B Testing**: Test different pricing and messaging

**High Churn**
- **Risk**: Users cancel after first month
- **Mitigation**: Deliver continuous value, collect feedback, improve features
- **Win-back**: Offer discounts to churned users

---

## Recommendations

### Start with Level 1

**Why**:
1. Lower complexity and risk
2. Build user base before monetizing
3. Validate feature demand
4. Establish trust and privacy compliance

**Timeline**: Launch in 4 weeks

### Then Add Level 2

**Why**:
1. Have proven user base to sell to
2. Know which features users value most
3. Have usage data to inform pricing
4. Have testimonials and case studies

**Timeline**: Launch 2-3 months after Level 1

### Parallel Track: Recurring Events

**Why**:
1. High user demand (proven by request)
2. Technical feasibility is clear
3. Differentiates from competitors
4. Can be free feature to drive adoption

**Timeline**: Launch with Level 1 (free for all users)

---

## Next Actions

1. **This Week**:
   - [ ] Review this architecture document
   - [ ] Decide on Level 1 vs Level 2 priority
   - [ ] Set up Vercel Postgres (test environment)
   - [ ] Draft privacy policy updates

2. **Next Week**:
   - [ ] Start Level 1 implementation
   - [ ] Create mockups for opt-in flow
   - [ ] Set up development database
   - [ ] Begin recurring events feature

3. **Week 3-4**:
   - [ ] Complete Level 1 MVP
   - [ ] Beta test with 5-10 users
   - [ ] Iterate based on feedback
   - [ ] Plan Level 2 launch

---

**Document Owner**: Dan Cumberland  
**Last Updated**: October 16, 2025  
**Status**: Ready for Review
