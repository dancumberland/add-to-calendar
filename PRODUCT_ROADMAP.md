# Product Roadmap: Add-to-Calendar for Kit

**Last Updated**: October 16, 2025  
**Status**: Planning Phase

---

## Vision

Transform the Add-to-Calendar plugin from a simple content block into a premium, feature-rich calendar integration platform with user engagement tracking and recurring event support.

---

## Feature Roadmap

### 🎯 Phase 1: Core Feature Enhancements (FREE Tier)
**Timeline**: 2-3 weeks  
**Status**: Planned

#### 1.1 Recurring Events (MVP)
- **Priority**: High
- **Effort**: 6-9 hours
- **User Value**: High - Eliminates need for multiple broadcasts
- **Features**:
  - ✅ Weekly recurrence
  - ✅ Repeat for X weeks (1-52)
  - ✅ Same day of week as initial event
  - ⏳ Daily/Monthly patterns (Phase 2)

#### 1.2 Event Reminders
- **Priority**: Medium
- **Effort**: 2-3 hours
- **User Value**: Medium - Increases event attendance
- **Features**:
  - ✅ Pre-event reminders (15, 30, 60 min, 1 day)
  - ✅ Apple Calendar: Full support via VALARM
  - ✅ Outlook: URL parameter support
  - ⚠️ Google: Uses user's default settings (limitation)

**Success Metrics**:
- Adoption rate: % of events created with recurrence
- User feedback: Positive sentiment on feature requests
- Usage growth: 20%+ increase in events created

---

### 🔐 Phase 2: User Opt-In & Email Capture (FREE Tier)
**Timeline**: 3-4 weeks  
**Status**: Architecture Planning  
**Goal**: Build user database for marketing and feature communication

#### 2.1 User Authentication System
- **Priority**: High
- **Effort**: 15-20 hours
- **Dependencies**: Database, Privacy Policy

**Features**:
- One-time opt-in flow when user first adds plugin
- Email capture with double opt-in
- User profile stored in database
- Graceful degradation (works without opt-in during transition)
- "Manage Subscription" link in emails

**User Experience**:
```
First-time plugin use:
┌─────────────────────────────────────┐
│  Welcome to Add-to-Calendar!        │
│                                      │
│  Get access to:                      │
│  ✓ Event creation                   │
│  ✓ Updates & new features           │
│  ✓ Priority support                 │
│                                      │
│  [Enter your email] [Sign Up]       │
│                                      │
│  We respect your privacy. Unsubscribe│
│  anytime. [Privacy Policy]          │
└─────────────────────────────────────┘
```

#### 2.2 Usage Tracking & Analytics
- **Priority**: Medium
- **Effort**: 8-10 hours

**Features**:
- Track events created per user
- Click tracking on calendar buttons
- Most popular features
- User engagement metrics
- Export to CSV for email campaigns

#### 2.3 Email Marketing Integration
- **Priority**: Medium
- **Effort**: 5-8 hours

**Features**:
- Sync user list to Kit account
- Automated welcome email
- Feature announcement system
- Monthly usage reports to users
- Re-engagement campaigns

**Success Metrics**:
- Opt-in conversion rate: >60%
- Email list growth: 100+ users in first 3 months
- Open rate on feature announcements: >25%

---

### 💰 Phase 3: Premium Subscription (PAID Tier)
**Timeline**: 4-6 weeks  
**Status**: Business Model Definition  
**Goal**: Monetize power users with premium features

#### 3.1 Subscription Management System
- **Priority**: High
- **Effort**: 25-35 hours
- **Dependencies**: Stripe account, user database, legal review

**Architecture Components**:
- Stripe integration for payments
- Subscription tiers (Free, Pro, Business)
- Feature gating middleware
- User dashboard for billing
- Webhook handlers for subscription events
- Grace period handling
- Cancellation flow

**Pricing Model (Suggested)**:
```
FREE Tier:
- Basic calendar buttons (Google, Apple, Outlook)
- Up to 50 events/month
- Standard support

PRO Tier - $9/month or $90/year:
- Everything in Free
- ✨ Recurring events
- ✨ Custom reminders
- ✨ Kit tag integration
- ✨ Click tracking analytics
- Unlimited events
- Priority support

BUSINESS Tier - $29/month or $290/year:
- Everything in Pro
- ✨ Team collaboration
- ✨ Custom branding
- ✨ API access
- ✨ White-label options
- Dedicated support
```

#### 3.2 Feature Gating Implementation
- **Priority**: High
- **Effort**: 10-12 hours

**Technical Approach**:
```javascript
// Middleware to check subscription status
async function checkSubscription(userEmail) {
  const user = await db.users.findByEmail(userEmail);
  
  if (!user) return { tier: 'free', features: ['basic'] };
  if (user.subscription === 'pro') return { 
    tier: 'pro', 
    features: ['basic', 'recurring', 'reminders', 'tracking'] 
  };
  if (user.subscription === 'business') return { 
    tier: 'business', 
    features: ['all'] 
  };
  
  return { tier: 'free', features: ['basic'] };
}

// In calendar-block handler
if (settings.recurrence && !features.includes('recurring')) {
  return { 
    code: 403, 
    errors: ['Recurring events require Pro subscription'],
    upgradeUrl: 'https://kit-app-build.vercel.app/upgrade'
  };
}
```

#### 3.3 User Dashboard
- **Priority**: Medium
- **Effort**: 20-25 hours

**Features**:
- View current subscription & usage
- Billing history
- Update payment method
- Upgrade/downgrade plan
- Usage analytics dashboard
- Download invoices

**Success Metrics**:
- Conversion rate (free → paid): >5%
- Monthly recurring revenue (MRR): $500+ in first 3 months
- Churn rate: <5% monthly
- Customer lifetime value (LTV): >$100

---

### 🏷️ Phase 4: Kit Integration & Tagging
**Timeline**: 3-4 weeks  
**Status**: Research Phase  
**Goal**: Track subscriber engagement via Kit tags

#### 4.1 Kit OAuth Integration
- **Priority**: High
- **Effort**: 12-15 hours
- **Dependencies**: Kit API access, OAuth setup

**Features**:
- OAuth flow to connect user's Kit account
- Secure token storage
- Token refresh handling
- Disconnect/reconnect flow

#### 4.2 Event Click Tracking & Tagging
- **Priority**: High
- **Effort**: 15-20 hours

**How It Works**:
```
1. User creates event with "Track clicks" enabled
2. Calendar button URLs are proxied through our service:
   Original: https://calendar.google.com/...
   Proxied: https://kit-app-build.vercel.app/track/[id]?redirect=google
   
3. When subscriber clicks:
   - Log click event
   - Tag subscriber in Kit (e.g., "clicked-event-abc")
   - Redirect to actual calendar service
   
4. User can create Kit automations based on tags:
   - Send follow-up email
   - Add to specific sequence
   - Segment by engagement
```

**Features**:
- Click tracking for all calendar buttons
- Automatic Kit tagging on click
- Custom tag naming
- Click analytics dashboard
- Integration with Kit's automation rules

**Technical Architecture**:
```javascript
// Track endpoint
GET /api/track/:eventId?redirect=google&subscriber=:subscriberId

1. Log click: { eventId, subscriberId, button: 'google', timestamp }
2. Tag in Kit: POST /v3/tags/:tagId/subscribe { email: subscriber }
3. Redirect: 302 → actual calendar URL
```

#### 4.3 Advanced Automations (Future)
- **Priority**: Low
- **Effort**: TBD

**Ideas**:
- Send reminder emails through Kit
- Tag attendees vs non-attendees (requires calendar integration)
- Segment based on event type
- A/B test different event times
- Wait list management for limited capacity events

**Success Metrics**:
- Kit integration adoption: >40% of Pro users
- Click-through rate improvement: +15%
- Automation usage: >30% of tagged subscribers enter sequences

---

## Technical Architecture

### Current Architecture
```
Kit Editor → POST /api/calendar-block → HTML Response
                                      ↓
                              ICS file generation
                              (stored in Vercel KV)
```

### Phase 2 Architecture (User Opt-In)
```
┌─────────────────────────────────────────────────────────┐
│                     Kit Plugin                          │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────┐│
│  │ First Use    │→ │ Email Form  │→ │ Create Event   ││
│  │ Detection    │  │ (Opt-in)    │  │                ││
│  └──────────────┘  └─────────────┘  └────────────────┘│
└────────────────────────┬────────────────────────────────┘
                         ↓
              POST /api/calendar-block
              { email, settings, ... }
                         ↓
┌────────────────────────┴────────────────────────────────┐
│              Vercel Serverless Functions                │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────┐│
│  │ Check/Create │→ │ Generate    │→ │ Track Usage    ││
│  │ User         │  │ Calendar    │  │                ││
│  └──────────────┘  │ Files       │  └────────────────┘│
│                    └─────────────┘                     │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌────────────────────────┴────────────────────────────────┐
│              Database (Vercel Postgres)                 │
│  ┌──────────────────────────────────────────────────┐  │
│  │ users                                             │  │
│  │ - id, email, created_at, opt_in_date             │  │
│  │ - subscription_tier, stripe_customer_id          │  │
│  │                                                   │  │
│  │ events                                            │  │
│  │ - id, user_id, title, date, has_recurrence       │  │
│  │                                                   │  │
│  │ clicks                                            │  │
│  │ - id, event_id, subscriber_email, button_type    │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Phase 3 Architecture (Paid Subscriptions)
```
                    ┌──────────────────────┐
                    │   User Dashboard     │
                    │  (Next.js App)       │
                    └──────────┬───────────┘
                               ↓
┌──────────────────────────────┴───────────────────────────┐
│                 Vercel Functions                         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ Auth        │  │ Subscription │  │ Feature Gate   │ │
│  │ Middleware  │→ │ Check        │→ │ Middleware     │ │
│  └─────────────┘  └──────────────┘  └────────────────┘ │
└──────────────────────────┬───────────────────────────────┘
                           ↓
                    ┌──────────────┐
                    │   Stripe     │
                    │   Webhooks   │
                    └──────────────┘
```

### Phase 4 Architecture (Kit Integration)
```
Subscriber clicks button in email
            ↓
GET /api/track/:eventId?redirect=google&subscriber=:id
            ↓
┌───────────┴──────────────────────────────────────────┐
│  Track & Tag Service                                 │
│  1. Log click to database                            │
│  2. POST to Kit API to tag subscriber                │
│  3. 302 Redirect to calendar service                 │
└──────────────────────────────────────────────────────┘
            ↓
    Calendar Service
    (Google/Apple/Outlook)
```

---

## Implementation Effort Analysis

### Level 1: Free Opt-In System

**Total Effort**: 30-40 hours (~1 week full-time)

| Component | Effort | Complexity |
|-----------|--------|------------|
| Database setup (Vercel Postgres) | 3-4 hours | Low |
| User authentication flow | 8-10 hours | Medium |
| Opt-in UI in Kit plugin | 5-6 hours | Medium |
| Backend user management | 6-8 hours | Medium |
| Privacy policy & compliance | 3-4 hours | Low |
| Email marketing integration | 5-6 hours | Low-Medium |
| Testing & deployment | 4-5 hours | Low |

**Key Decisions**:
1. **Database**: Use Vercel Postgres (native integration, scalable)
2. **Authentication**: Simple email-based (no password needed initially)
3. **Opt-in timing**: Show on first plugin use
4. **Data retention**: 2 years inactive → automatic deletion (GDPR)

**Challenges**:
- ⚠️ GDPR compliance (EU users)
- ⚠️ User experience - can't be too disruptive
- ⚠️ Migration path for existing users
- ⚠️ Email deliverability

**Mitigation**:
- Start opt-in as optional, make required after 30 days
- Clear value proposition in opt-in copy
- Double opt-in for compliance
- Use established ESP (Kit itself, SendGrid, or Resend)

---

### Level 2: Paid Subscription System

**Total Effort**: 60-80 hours (~2 weeks full-time)

| Component | Effort | Complexity |
|-----------|--------|------------|
| Stripe integration | 12-15 hours | High |
| Subscription management API | 10-12 hours | High |
| User dashboard (UI) | 15-20 hours | Medium-High |
| Feature gating system | 8-10 hours | Medium |
| Webhook handlers | 6-8 hours | Medium |
| Billing & invoicing | 5-6 hours | Low-Medium |
| Upgrade/downgrade flows | 6-8 hours | Medium |
| Testing & edge cases | 8-10 hours | Medium |

**Key Decisions**:
1. **Payment processor**: Stripe (industry standard, great API)
2. **Pricing model**: Monthly + Annual (20% discount for annual)
3. **Trial period**: 14-day free trial for Pro tier
4. **Billing day**: Anniversary of subscription (not calendar month)
5. **Proration**: Yes - charge/credit on upgrades/downgrades

**Technical Stack**:
- **Frontend**: Next.js dashboard (separate from Kit plugin)
- **Backend**: Vercel Functions + Stripe webhooks
- **Database**: Vercel Postgres
- **Email**: Transactional via Resend or Kit API

**User Flows**:

1. **Free to Pro Upgrade**:
```
User clicks "Enable Recurring Events" in Kit
    ↓
"Recurring events require Pro subscription"
    ↓
[Upgrade to Pro] button
    ↓
Stripe Checkout (pre-filled email)
    ↓
Webhook: subscription.created
    ↓
Update user.subscription_tier = 'pro'
    ↓
Redirect back to Kit with success message
    ↓
Recurring events now available
```

2. **Pro to Free Downgrade**:
```
User goes to dashboard.kit-app-build.vercel.app
    ↓
Click "Manage Subscription"
    ↓
Click "Cancel Subscription"
    ↓
Stripe: Cancel at period end
    ↓
User retains Pro until billing date
    ↓
Webhook: subscription.deleted
    ↓
Update user.subscription_tier = 'free'
    ↓
Email: "Your subscription has ended"
```

**Challenges**:
- ⚠️ Complex state management (trials, paused, cancelled, etc.)
- ⚠️ Failed payment handling
- ⚠️ Refund requests & customer support
- ⚠️ Tax calculation (varies by region)
- ⚠️ Churn management

**Mitigation**:
- Use Stripe's built-in state machine
- Dunning emails via Stripe
- Clear refund policy (30-day money back)
- Stripe Tax for automatic calculation
- Exit surveys to understand churn reasons

**Revenue Projections** (Conservative):
```
Month 1-3: 0-5 paid users × $9 = $0-45/mo
Month 4-6: 10-20 paid users × $9 = $90-180/mo
Month 7-12: 30-50 paid users × $9 = $270-450/mo

Year 1 Target: $3,000-5,000 MRR
Break-even: ~50 Pro subscribers
```

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  opt_in_date TIMESTAMP,
  subscription_tier VARCHAR(20) DEFAULT 'free', -- 'free', 'pro', 'business'
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  kit_oauth_token TEXT,
  kit_account_id VARCHAR(100),
  settings JSONB DEFAULT '{}',
  last_active_at TIMESTAMP,
  
  INDEX idx_email (email),
  INDEX idx_stripe_customer_id (stripe_customer_id)
);
```

### Events Table
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  title VARCHAR(500) NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone VARCHAR(100),
  has_recurrence BOOLEAN DEFAULT false,
  recurrence_pattern JSONB,
  has_reminder BOOLEAN DEFAULT false,
  reminder_minutes INT,
  location VARCHAR(500),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);
```

### Clicks Table (for tracking)
```sql
CREATE TABLE clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id),
  subscriber_email VARCHAR(255),
  button_type VARCHAR(20), -- 'google', 'apple', 'outlook'
  clicked_at TIMESTAMP DEFAULT NOW(),
  user_agent TEXT,
  referrer TEXT,
  
  INDEX idx_event_id (event_id),
  INDEX idx_clicked_at (clicked_at)
);
```

### Subscriptions Table (audit log)
```sql
CREATE TABLE subscription_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  from_tier VARCHAR(20),
  to_tier VARCHAR(20),
  reason VARCHAR(100), -- 'upgrade', 'downgrade', 'trial_ended', 'payment_failed'
  changed_at TIMESTAMP DEFAULT NOW(),
  stripe_event_id VARCHAR(100),
  
  INDEX idx_user_id (user_id)
);
```

---

## Go-to-Market Strategy

### Phase 1: Free Features Launch
**Timing**: Weeks 1-3

**Marketing**:
- Announce recurring events in Kit creator community
- Email existing users (if we have a list)
- Social media posts (Twitter/X, LinkedIn)
- Blog post: "How to schedule recurring meetings in Kit"

### Phase 2: Opt-In Launch
**Timing**: Weeks 4-6

**Marketing**:
- In-app messaging about new features coming
- Email capture campaign
- Value proposition: "Get early access to Pro features"
- Referral program: "Invite 3 friends → 1 month free Pro"

### Phase 3: Pro Launch
**Timing**: Weeks 7-12

**Strategy**:
- Soft launch to opted-in users first
- Limited-time founder pricing: $7/mo (save 22%)
- Testimonial collection
- Case studies from beta users

**Channels**:
- Kit App Store featured placement
- Kit community forum announcement
- Email campaign to free users
- Social proof (Twitter, testimonials)
- Content marketing (SEO)

---

## Risk Analysis

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stripe integration issues | Medium | High | Extensive testing, sandbox environment |
| Database performance | Low | Medium | Index optimization, caching |
| Kit API changes | Medium | High | Monitor Kit changelog, abstraction layer |
| Security vulnerabilities | Low | Critical | Security audit, penetration testing |

### Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Low conversion to paid | Medium | High | Strong value prop, trial period |
| High churn rate | Medium | High | Customer success, feature requests |
| Kit policy changes | Low | Critical | Stay compliant, diversify if needed |
| Competition | Medium | Medium | Unique features, better UX |

---

## Success Criteria

### Phase 1 (Free Features)
- ✅ 50+ users create recurring events in first month
- ✅ 80%+ satisfaction score
- ✅ <5 bug reports per week

### Phase 2 (Opt-In)
- ✅ 60%+ opt-in conversion rate
- ✅ 200+ email subscribers in first 3 months
- ✅ <2% spam complaints

### Phase 3 (Paid)
- ✅ 5%+ free-to-paid conversion
- ✅ $500+ MRR within 3 months
- ✅ <5% monthly churn
- ✅ 4.5+ star rating in Kit App Store

---

## Next Steps

### Immediate (This Week)
1. ✅ Create this roadmap document
2. ⏳ User research: Interview requester about specific use case
3. ⏳ Competitive analysis: Check other add-to-calendar tools' pricing
4. ⏳ Legal review: Privacy policy & terms of service requirements

### Short-term (Next 2 Weeks)
1. ⏳ Prototype recurring events UI
2. ⏳ Build MVP of recurring events backend
3. ⏳ Set up Vercel Postgres database
4. ⏳ Design opt-in flow mockups

### Medium-term (Next Month)
1. ⏳ Launch recurring events (free)
2. ⏳ Implement opt-in system
3. ⏳ Build email list to 100+ users
4. ⏳ Research Stripe integration requirements

### Long-term (Next Quarter)
1. ⏳ Launch Pro subscription tier
2. ⏳ Reach 50 paid subscribers
3. ⏳ Implement Kit tagging integration
4. ⏳ Build analytics dashboard

---

## Questions to Resolve

### Business Model
- [ ] What's the ideal price point? ($7, $9, $12?)
- [ ] Should there be a lifetime deal option?
- [ ] How to handle refunds?
- [ ] What's included in each tier?

### Technical
- [ ] How to handle failed payments gracefully?
- [ ] What's the migration path for existing free users?
- [ ] How much database storage will we need?
- [ ] What's the strategy for handling high traffic?

### Legal/Compliance
- [ ] Do we need terms of service updates?
- [ ] How to handle GDPR for EU users?
- [ ] What about CCPA for California users?
- [ ] Do we need a DPA (Data Processing Agreement)?

---

**Document Owner**: Dan Cumberland  
**Last Review**: October 16, 2025  
**Next Review**: November 1, 2025
