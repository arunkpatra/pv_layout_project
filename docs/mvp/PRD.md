# PRODUCT REQUIREMENTS DOCUMENT (PRD)

**Product Name:** SolarLayout — PV Layout Design Platform
**Document Version:** 1.0
**Date:** April 2026
**Prepared For:** Application Developer
**Prepared By:** Solarlayout Product Team
**Status:** Final for Phase 1 Development

---

## 1. EXECUTIVE SUMMARY

SolarLayout is a web platform that allows solar energy professionals — including land acquisition teams, business development managers, and project engineers — to download desktop software tools that automate the design of utility-scale fixed-tilt PV solar plant layouts. Users upload a KMZ boundary file, provide plant parameters, and the software automatically generates a complete plant layout including MMS table placement, inverter placement, lightning arresters, cable routing, and energy yield analysis.

The platform is developed and maintained by veterans of the solar and renewable energy industry. The business model is usage-based one-time purchases, with entitlements tied to the user's registered email address.

---

## 2. OBJECTIVES

- Provide solar industry professionals with fast, accurate, automated PV plant layout tools
- Build a professional, trustworthy web presence for the Solarlayout brand
- Capture user registrations (email) at the point of download to build a user base
- Enable future monetisation through a usage-based entitlement system
- Establish a legally compliant platform for the Indian market from Day 1
- Release Phase 1 within 4 days of PRD sign-off

---

## 3. TARGET USERS

| User Type | Description |
|---|---|
| Land Acquisition Professionals | Need quick capacity estimates for potential solar sites |
| Business Development Managers | Need layout outputs for budgeting and project proposals |
| Project Engineers | Need detailed layout with cable routing and yield analysis |

**Primary Market:** India
**Secondary Market:** Global (English-speaking solar markets)

---

## 4. PRODUCT OVERVIEW — THE THREE SOFTWARE TOOLS

The platform distributes three Windows desktop executable (.exe) applications:

### 4.1 PV Layout Basic
- Reads plant boundary from a KMZ file
- Accepts user inputs: module dimensions, row pitch, MMS table configuration, etc.
- Automatically places MMS tables within the boundary
- Places inverters and lightning arresters (LAs)
- Excludes areas with obstructions (ponds, water bodies, transmission lines, etc.)
- Generates plant layout output
- **Entitlement:** 5 layout calculations per purchase

### 4.2 PV Layout Pro
- All capabilities of PV Layout Basic, PLUS:
- AC and DC cable placement with full quantity measurements
- **Entitlement:** 10 layout calculations per purchase

### 4.3 PV Layout Pro Plus
- All capabilities of PV Layout Pro, PLUS:
- Energy yield analysis
- Plant generation estimates
- **Entitlement:** 50 layout and yield calculations per purchase

### 4.4 Entitlement System (Future — Phase 2)
Each .exe will prompt the user for their registered email address at launch. It will call a backend API to validate the email, retrieve entitlements, and display the number of remaining calculations. This system will be implemented in the Phase 2 backend.

---

## 5. TECHNICAL STACK

| Component | Technology |
|---|---|
| Frontend Framework | Next.js (latest version) |
| Rendering Strategy | SSR / SSG for SEO optimisation |
| File Hosting | AWS S3 |
| Backend API | Developer's choice (to be architected by developer) |
| Analytics | Google Analytics (GA4) |
| SEO | next-seo or equivalent, sitemap.xml, robots.txt |

---

## 6. PHASED DELIVERY PLAN

### Phase 1 — Website Launch (Target: 4 days from PRD sign-off)

**Scope:**
- Full responsive website with all pages listed in Section 8
- Static pricing page (no payment processing)
- Email capture before download (name mandatory, mobile optional)
- Backend API to store user registration data (email, name, IP address, mobile)
- AWS S3 hosted .exe file downloads
- Google Analytics integration
- Cookie consent banner
- SEO fundamentals
- Legal pages (Terms & Conditions, Privacy Policy)

**Out of Scope for Phase 1:**
- Payment gateway integration
- User accounts / login
- Licence key generation
- Entitlement validation
- Email confirmation on download
- Admin dashboard

### Phase 2 — Full Platform (Date: To Be Decided)

**Scope:**
- User registration and login system
- Payment gateway integration (gateway to be decided by developer)
- Licence / entitlement management system tied to email ID
- Backend API for entitlement validation called by .exe files
- Confirmation email on purchase with entitlement details
- Download tracking and usage analytics
- Admin dashboard for managing users, entitlements, and downloads
- Email marketing integration
- Potentially Mac/Linux support (to be evaluated)

---

## 7. BRAND & DESIGN GUIDELINES

### 7.1 Brand Identity
- **Company Name:** Solarlayout
- **Tagline (Suggested):** *"Design Smarter. Deploy Faster. Power the Future."*
- **Logo:** To be created by the developer — should be clean, modern, and convey solar energy and precision engineering
- **Tone of Voice:** Professional, confident, technical — peer-to-peer communication with experienced solar industry professionals. Do not be patronising or over-explain basic solar concepts.

### 7.2 Colour Palette (Suggested for Solar Industry)

| Role | Colour | Hex Code |
|---|---|---|
| Primary | Deep Solar Blue | `#1A3A5C` |
| Accent / CTA | Solar Amber / Gold | `#F5A623` |
| Secondary Accent | Clean White | `#FFFFFF` |
| Background | Light Grey | `#F4F6F8` |
| Text Primary | Dark Charcoal | `#1C1C1C` |
| Text Secondary | Medium Grey | `#6B7280` |
| Success / Highlight | Solar Green | `#2CA02C` |

*Rationale: Deep blue conveys trust, precision and technology. Amber/gold represents solar energy. Clean whites and greys provide professional clarity.*

### 7.3 Design Principles
- Modern, clean, professional aesthetic appropriate for B2B solar industry
- Fully Responsive Web Design (RWD) — mobile, tablet, desktop
- Fast page load times (optimised for Core Web Vitals)
- Accessibility compliance (WCAG 2.1 AA minimum)

---

## 8. WEBSITE STRUCTURE & PAGE SPECIFICATIONS

### 8.1 Site Map

```
/                  → Home
/products          → Products
/pricing           → Pricing
/how-it-works      → How It Works
/about             → About Us
/faq               → FAQ
/contact           → Contact
/terms             → Terms & Conditions
/privacy           → Privacy Policy
```

---

### 8.2 Page 1 — Home (`/`)

**Sections (in order):**

#### Header (Sticky)
- Solarlayout logo (top left)
- Navigation links: Home, Products, Pricing, How It Works, About, FAQ, Contact
- CTA button: "Download Free Trial" (links to /products)

#### Hero Section
- Bold headline with tagline: *"Design Smarter. Deploy Faster. Power the Future."*
- Sub-headline: Short description of what SolarLayout does (automated PV plant layout from KMZ boundary files)
- Two CTA buttons: "Explore Products" → /products and "See Pricing" → /pricing
- Hero background: High quality solar field image or illustrated graphic

#### Features Overview Section
- Three feature cards — one per product (Basic, Pro, Pro Plus)
- Each card: product name, icon, 3–4 bullet points of key features
- "Learn More" link on each card pointing to /products

#### How It Works (Summary)
- 4-step visual process:
  1. Upload your KMZ boundary file
  2. Enter your plant parameters
  3. Software generates your layout automatically
  4. Export results — layout, cable quantities, energy yield
- Clean horizontal step diagram with icons

#### Screenshots Section
- 3–5 screenshots of the software in action
- Lightbox/modal on click for full-size view
- Caption under each screenshot

#### System Requirements Section
- Displayed as a clean info box or table:

| Requirement | Details |
|---|---|
| Operating System | Windows 10 or higher |
| RAM | 8 GB minimum |
| Disk Space | Developer to confirm |
| Additional Software | None required |
| Internet Connection | Required for entitlement validation (Phase 2) |

#### Footer
- Logo + tagline
- Navigation links (all pages)
- Legal links: Terms & Conditions, Privacy Policy
- Social media icons: LinkedIn, YouTube
- Contact email: support@example.com
- Location: Bangalore, India
- Copyright notice: © 2026 Solarlayout. All Rights Reserved.

---

### 8.3 Page 2 — Products (`/products`)

**Purpose:** Showcase all three products and allow users to download after email capture.

**Sections:**

#### Products Header
- Page title: "Our Products"
- Short paragraph explaining the three tiers

#### Three Product Cards (side by side on desktop, stacked on mobile)

Each card contains:
- Product name (PV Layout Basic / Pro / Pro Plus)
- Price badge
- Feature list (bullet points)
- Number of calculations included
- "Download" button → triggers email capture modal

#### Email Capture Modal (triggered on Download click)
- Headline: "Enter your details to download"
- Fields:
  - Full Name (mandatory)
  - Email Address (mandatory)
  - Mobile Number (optional)
- Checkbox: "I agree to the Terms & Conditions and Privacy Policy" (mandatory)
- Submit & Download button
- On submit: POST to backend API (saves name, email, IP address, mobile, product selected, timestamp), then immediately triggers .exe file download from AWS S3

#### Backend API Requirements (Phase 1)
- Endpoint: POST `/api/download-register`
- Payload: `{ name, email, mobile, product, ip_address, timestamp }`
- Response: Returns pre-signed S3 download URL
- Developer to handle duplicate email logic and input sanitisation

---

### 8.4 Page 3 — Pricing (`/pricing`)

**Purpose:** Static page displaying product pricing and feature comparison. No payment processing in Phase 1.

**Sections:**

#### Pricing Header
- Page title: "Simple, Transparent Pricing"
- Sub-heading: "Pay once. Use as many times as your plan allows."

#### Pricing Cards (Three columns)

| Feature | PV Layout Basic | PV Layout Pro | PV Layout Pro Plus |
|---|---|---|---|
| Price | $1.99 | $4.99 | $14.99 |
| Purchase Model | One-time | One-time | One-time |
| Calculations Included | 5 Layout | 10 Layout | 50 Layout + Yield |
| Plant Layout (MMS, Inverter, LA) | ✓ | ✓ | ✓ |
| Obstruction Exclusion | ✓ | ✓ | ✓ |
| AC & DC Cable Routing | ✗ | ✓ | ✓ |
| Cable Quantity Measurements | ✗ | ✓ | ✓ |
| Energy Yield Analysis | ✗ | ✗ | ✓ |
| Plant Generation Estimates | ✗ | ✗ | ✓ |
| Top-up Available | ✓ | ✓ | ✓ |

- "Buy Now" button on each card (static / disabled in Phase 1 with tooltip: "Payment coming soon")
- Note: "Need more calculations? Top up anytime at the same rate."

#### Top-up Note
- Explain that users can purchase additional calculation packs at any time
- Payment system coming in Phase 2

---

### 8.5 Page 4 — How It Works (`/how-it-works`)

**Purpose:** Explain the software workflow in a professional, peer-appropriate manner — not patronising, focused on the tool's capabilities.

**Sections:**

#### Page Header
- Title: "How SolarLayout Works"
- Sub-heading: "From boundary to bankable layout — in minutes."

#### Step-by-Step Section (4 steps with icons and descriptions)

1. **Import Your Boundary** — Load your site KMZ file. SolarLayout automatically reads all boundary polygons, including exclusion zones for obstacles, water bodies, and transmission line corridors.

2. **Configure Your Parameters** — Input your module specifications (dimensions, wattage), MMS table configuration, row pitch, GCR, perimeter road width, and inverter/SMB details. Both string inverter and central inverter topologies are supported.

3. **Generate Your Layout** — The software automatically places MMS tables, inverters, lightning arresters, and routes DC/AC cables — all within your boundary constraints. ICR buildings are placed and sized automatically.

4. **Export Your Results** — Export a full KMZ layout file, DXF drawing, and PDF report with plant capacity, cable quantities, energy yield, and generation estimates.

#### Supported Features List
- KMZ boundary input with multiple plant areas
- Fixed-tilt MMS table placement
- String inverter and central inverter topologies
- Automatic ICR placement (1 per 18 MWp)
- Lightning arrester placement and protection zone calculation
- DC string cable and AC/DC-to-ICR cable routing with quantity measurements
- Energy yield analysis with P50 / P75 / P90 exceedance values
- PDF, KMZ and DXF export

---

### 8.6 Page 5 — About Us (`/about`)

**Purpose:** Build credibility and trust without exposing personal details of the founders.

**Content:**
- Headline: "Built by Solar Industry Veterans"
- Body: SolarLayout has been developed by a team of experienced professionals with deep roots in the solar and renewable energy industry. With years of hands-on experience in large-scale PV plant development, land acquisition, and project engineering, we built the tools we always wished we had.
- Mission statement: "Our mission is to put powerful, automated layout design tools in the hands of every solar professional — saving hours of manual work and enabling faster, smarter project decisions."
- No individual names, photos, or personal details to be displayed

---

### 8.7 Page 6 — FAQ (`/faq`)

**Purpose:** Answer common questions to reduce support load and build user confidence.

**Suggested FAQ Items (developer to format as accordion):**

**About the Software**
- What is SolarLayout?
- What file format do I need to use as input?
- Which Windows versions are supported?
- Do I need to install anything else to run the software?
- Does the software work offline?

**Products & Downloads**
- What is the difference between the three products?
- How do I download the software?
- Is the software free?
- Can I try before I buy?

**Entitlements & Calculations**
- What counts as one calculation?
- What happens when I run out of calculations?
- Can I top up my calculations?
- Is my entitlement tied to one machine?

**Payments (Phase 2)**
- How do I purchase a plan?
- What payment methods are accepted?
- Will I receive a receipt?

**Support**
- How do I contact support?
- What if the software crashes or gives wrong results?

*Note: Developer to populate full answers. Placeholder answers acceptable for Phase 1 launch.*

---

### 8.8 Page 7 — Contact (`/contact`)

**Purpose:** Allow users and prospects to reach the Solarlayout team.

**Sections:**

#### Contact Details
- Email: support@example.com
- Location: Bangalore, India
- LinkedIn: [Solarlayout LinkedIn page URL]
- YouTube: [Solarlayout YouTube channel URL]

#### Contact Form
- Fields: Full Name (mandatory), Email (mandatory), Subject (mandatory), Message (mandatory)
- Submit button
- Backend API: POST `/api/contact` — saves all form data (name, email, subject, message, IP address, timestamp)
- Success message on submission: "Thank you for reaching out. We will get back to you within 2 business days."

---

### 8.9 Page 8 — Terms & Conditions (`/terms`)

**Requirements:**
- Full Terms & Conditions page compliant with Indian law including the Information Technology Act 2000, Consumer Protection Act 2019, and DPDP Act 2023
- Must cover: use of software, intellectual property, limitation of liability, refund policy, governing jurisdiction (Bangalore, India), prohibited uses
- Developer to engage a legal professional or use a legally reviewed template
- Link in footer on all pages
- Must be in place BEFORE Phase 1 goes live

---

### 8.10 Page 9 — Privacy Policy (`/privacy`)

**Requirements:**
- Full Privacy Policy compliant with the Digital Personal Data Protection (DPDP) Act 2023 (India)
- Must cover: what data is collected (name, email, IP, mobile), why it is collected, how it is stored, how long it is retained, user rights (access, correction, deletion), third-party sharing, cookie usage, contact for data grievances
- Cookie consent banner required on first visit — user must accept before analytics tracking begins
- Link in footer on all pages
- Must be in place BEFORE Phase 1 goes live

---

## 9. SEO REQUIREMENTS

- Next.js SSR/SSG for all pages to ensure full search engine indexability
- Unique `<title>` and `<meta description>` for every page
- Open Graph and Twitter Card meta tags for social sharing
- Structured data (JSON-LD) for organisation and software product schema
- `sitemap.xml` auto-generated and submitted to Google Search Console
- `robots.txt` configured correctly
- Image alt tags on all images
- Semantic HTML (H1, H2, H3 hierarchy respected on all pages)
- Core Web Vitals optimisation (LCP, CLS, FID targets met)
- Page load time target: under 3 seconds on 4G mobile

---

## 10. ANALYTICS & TRACKING

- Google Analytics 4 (GA4) installed on all pages
- Events to track:
  - Page views
  - Download button clicks (per product)
  - Email capture form submissions (per product)
  - Contact form submissions
  - Pricing page views
  - CTA button clicks
- Cookie consent banner must gate analytics tracking — GA4 only fires after user consent
- Developer to configure GA4 with consent mode v2

---

## 11. LEGAL & COMPLIANCE REQUIREMENTS

| Requirement | Details |
|---|---|
| Privacy Policy | DPDP Act 2023 compliant — mandatory before go-live |
| Terms & Conditions | IT Act 2000 + Consumer Protection Act compliant |
| Cookie Consent | Banner required on first visit, consent gates analytics |
| Data Storage | User data (email, name, IP, mobile) stored securely — developer to implement encryption at rest |
| Jurisdiction | Bangalore, Karnataka, India |
| Grievance Officer | Required under IT Act — developer to include contact details in Privacy Policy |

---

## 12. PERFORMANCE & HOSTING REQUIREMENTS

- Hosted on AWS (recommended: AWS Amplify or Vercel for Next.js frontend)
- .exe files hosted on AWS S3 with pre-signed URLs for secure downloads
- Backend API on AWS (Lambda + API Gateway or EC2 — developer's choice)
- Database for storing registrations and contact form data (RDS or DynamoDB — developer's choice)
- SSL certificate mandatory (HTTPS on all pages)
- Target uptime: 99.9%

---

## 13. PHASE 1 — LAUNCH CHECKLIST

| Item | Owner | Status |
|---|---|---|
| Next.js project setup | Developer | Pending |
| All 9 pages built and responsive | Developer | Pending |
| Logo and brand assets created | Developer | Pending |
| .exe files uploaded to AWS S3 | Developer | Pending |
| Email capture API live | Developer | Pending |
| Contact form API live | Developer | Pending |
| Google Analytics 4 installed | Developer | Pending |
| Cookie consent banner | Developer | Pending |
| Terms & Conditions page live | Developer | Pending |
| Privacy Policy page live | Developer | Pending |
| SSL certificate installed | Developer | Pending |
| SEO meta tags on all pages | Developer | Pending |
| sitemap.xml and robots.txt | Developer | Pending |
| Cross-browser testing | Developer | Pending |
| Mobile responsiveness testing | Developer | Pending |
| Domain configured | Developer | Pending |

---

## 14. OUT OF SCOPE FOR PHASE 1

- Payment gateway
- User login / registration portal
- Licence key generation
- Entitlement validation API
- Email confirmation on download
- Admin dashboard
- Mac / Linux support
- Multi-language support
- Blog / content section

---

## 15. OPEN ITEMS FOR DEVELOPER TO DECIDE

- Choice of backend language and framework
- Database technology (RDS vs DynamoDB)
- Hosting infrastructure details (Amplify vs Vercel vs EC2)
- Payment gateway selection (Phase 2)
- Disk space requirement for system requirements section
- Full FAQ answers
- Legal page content (recommend legal review)
- Domain name and DNS configuration
- Grievance Officer details for Privacy Policy

---

*End of Document*

*This PRD covers Phase 1 scope fully and provides architectural context for Phase 2. Any changes to scope must be agreed in writing before development begins to avoid scope creep within the 4-day Phase 1 timeline.*