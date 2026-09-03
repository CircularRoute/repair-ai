# Repair AI: Market Research and Findings

**Compiled from Mark's research shelf** (the market and targeting analyst agent), 2026-09-03.
Source documents: Market Landscape, Targeting and ICP, Channel Opportunities, Competitor Tracker, produced by live web research with inline source URLs, refreshed weekly since 2026-08-12. Where live verification was unavailable for a pass, the section says so explicitly and figures are directional, not verified.

---

## Executive summary

**The strategy the research supports, in one paragraph:** win the property-manager channel first, in one launch metro, by becoming the easiest vendor a mid-size property management company can route volume to; recruit one-person and very small repair businesses in that same metro to fulfill the volume, selling them the Operations Autopilot on the back of the operational requirements PMs impose; add consumer demand generation only after both sides are proven; and treat selling software to PM companies themselves as an opportunistic sideline, not a strategy.

Key findings across the four research areas:

1. **The real PM decision-maker is the regional maintenance or operations director**, who owns the preferred-vendor panel; the onsite manager only dispatches. Contracts follow a predictable shape: portfolio-wide master service agreements, not-to-exceed thresholds, certificate-of-insurance compliance gates, response-time SLAs, and work orders living inside PM software (AppFolio, Buildium, Yardi, RealPage). Meeting that shape IS the product requirement for the growth engine.

2. **What flips a PM from "call around" to "always call us"**: one point of contact and one invoice across properties, compliance handled once, documented SLA performance, and accepting/closing work orders inside their software instead of by phone. Low-glamour, high-stickiness.

3. **The Operations Autopilot's first customer is the one-person or 2-6-tech independent shop** where the owner is also the back office and admin happens at night between jobs. These are the same businesses that will receive PM-channel volume, which creates the natural bundle: channel volume arrives with operational requirements (SLAs, compliance docs, single invoicing) that the Autopilot satisfies.

4. **Distribution channels are concrete and named**: parts distributors (Marcone, ReliableParts, Encompass, RepairClinic PRO) are the highest-frequency touchpoint repairers have and the best partnership channel; manufacturer authorized-servicer directories are ready-made prospect lists; PSA and Appliantology are the trust-building communities; Angi/Yelp/Thumbtack listings are a live census of solo repairers per city.

5. **Market shape**: a $6.8-7.0B US market (IBISWorld, NAICS 81141) that is fragmenting rather than consolidating: business count keeps rising (~37,000+) while revenue growth stays flat, the signature of a market needing a software/network layer rather than a roll-up. Parts distribution has consolidated hard (Marcone as the scaled leader, now racing on same-day DoorDash delivery), while the ~83 home warranty companies show that pre-vetted contractor routing works as a business, and property managers effectively run their own informal version of it today without the infrastructure. That is the gap.

6. **Competitive picture**: NO tracked competitor is building a property-manager-facing growth/routing engine; the crowding is all on the technician-tool side (MarconeAI, Burke America's Repair Intelligence API, iFixit FixBot Pro, MyPros+ Max at $29/month, new entrant aiventic), which competes with the Autopilot's diagnosis/documentation workflow but not with the channel strategy. PM-side maintenance coordination has focused incumbents (Property Meld, Latchel); the research recommends fulfilling through that layer rather than competing with it. The demand side remains open.

---



---

*Part 1 of 4. Source document: Market Landscape (v6, 2026-09-03, live-sourced). Content verbatim from Mark's shelf; inline links are his cited sources.*

# Market Landscape: Appliance Repair

## Market size: fragmented data, but a consistent story

Third-party estimates of the U.S. appliance repair market vary widely depending on scope (the narrow NAICS "appliance repair" category versus broader "home appliance repair services" reports that bundle in adjacent categories), but a few signals are consistent across sources:

- IBISWorld, the most-cited industry-specific source (NAICS 81141), puts the market at $6.8bn in 2024, growing 3.1% to $7.0bn in 2025, with a 2.5% CAGR between 2020 and 2025 ([IBISWorld](https://www.ibisworld.com/united-states/market-size/appliance-repair/1710)).
- Growth has been sluggish for years: industry revenue declined by an average of 1.3% annually from 2018 to 2023, reaching an estimated $6.3 billion in 2023, only a 0.5% increase from the prior year ([ConsumerAffairs](https://www.consumeraffairs.com/homeowners/appliance-repair-industry-statistics.html)).
- Business count keeps growing even as revenue growth stays flat, a classic fragmentation signal: estimates put the U.S. appliance repair business count around 37,217-37,769 in 2024-2025 ([BozmanFix](https://bozmanfix.com/appliance-repair-statistics/), [BusinessResearchInsights](https://www.businessresearchinsights.com/market-reports/home-appliance-repair-service-market-104958)).
- Broader market-research vendors, which fold in adjacent categories, size the opportunity much larger: one estimate puts the U.S. market at $9.8 billion in 2024, growing to $10.3 billion in 2025 and $13.2 billion by 2033, with a North American figure of $15.2 billion in 2024 growing to $20.5 billion by 2033 ([VerifiedMarketReports](https://www.verifiedmarketreports.com/product/home-appliance-repair-service-market/)). The spread between narrow and broad estimates is itself informative: there is no single clean TAM number the industry agrees on, typical of a fragmented, locally-fulfilled service category.
- The installed base dwarfs the tracked service revenue: one estimate puts more than 860 million home appliances in use across the United States ([BusinessResearchInsights](https://www.businessresearchinsights.com/market-reports/home-appliance-repair-service-market-104958)), meaning most of the theoretical repair volume never converts into a paid, tracked professional transaction (DIY, replacement, or informal handyman work absorb a large share).
- For context on the category this sits inside: the total U.S. home maintenance services market was valued at $543 billion in 2025, forecast to grow 5.3% annually through 2030, with appliance repair a meaningful but minority slice ([Differ](https://differ.blog/p/the-shifting-landscape-of-the-u-s-home-appliance-repair-market-growt-03c351)).

**Read for Repair AI:** the addressable market is real ($6-7B narrowly defined, larger counting adjacent categories) but it is not consolidating on its own. Business count keeps rising while revenue per business stays roughly flat, the signature of a market that needs a software/network layer rather than a pure roll-up.

## Where the money flows

### 1. Labor is the core unit of production, and it's a fragmented, geographically uneven trade
The industry runs on individual technicians and small shops. Data built on BLS occupational statistics shows Florida has more home appliance repairers than any other state, while Connecticut has the highest concentration, and women make up less than 3% of the workforce ([ConsumerAffairs](https://www.consumeraffairs.com/homeowners/appliance-repair-industry-statistics.html)), all signs of a narrow, unevenly distributed labor pool that structurally limits how fast supply can scale.

### 2. Franchises exist, but they wrap operations, not technical labor
National franchise brands (Mr. Appliance under Neighborly, Kitchen Tune-Up's appliance line, TrustPro, others) sell a business-in-a-box model layered on the same underlying technician pool. Franchise marketing leans on the category's defensive characteristics, positioning appliance repair as recession-resilient because homeowners are more likely to repair than replace when appliances break ([Neighborly](https://franchise.neighborly.com/blog/top-appliance-repair-franchises)), and cites the same ~$7 billion market and ~2.5% annual growth figures used above. Critically, Neighborly is explicit that its franchise system provides business operations and systems training, but not technical trade training, leaving franchisees to source that from outside trade schools ([Neighborly](https://franchise.neighborly.com/blog/start-appliance-repair-business)). Even the franchise layer is an operations wrapper, not a labor or training solution, which is the gap Repair AI's operations layer sits in.

### 3. Parts distribution is a separate, and increasingly concentrated, money pool
Parts flow through a distinct wholesale layer between OEMs and technicians, and that layer has consolidated hard:

- Marcone markets itself directly as the largest distributor of OEM appliance parts ([Marcone](https://www.marcone.com/appliance-division/)), describing itself elsewhere as a multi-billion-dollar enterprise operating out of nearly 200 locations across North America, spanning appliance parts, HVAC, plumbing, and pool/spa categories ([Marcone](https://www.marcone.com/marcone-introduces-same-day-parts-delivery/)).
- Consolidation has been running for over a decade: Marcone Canada's rise to the country's top distributor position was accelerated when its competitor, Reliable Parts, sold out to DOT Foods in May 2014 ([PRNewswire](https://www.prnewswire.com/news-releases/marcone-canada-positioned-to-become-the-countrys-top-appliance-parts-distributor-270896911.html)).
- On the commercial-adjacent side, the 2022 acquisition of Encompass Supply Chain Solutions by Parts Town Unlimited reshaped the competitive landscape further, part of a broader pattern of scaled distributors buying share ([MatrixBCG](https://matrixbcg.com/blogs/competitors/partstown)).
- Distributors are now competing on logistics speed on top of catalog depth: Marcone's 2024 partnership with DoorDash offers nationwide on-demand parts delivery, with same-day delivery in under an hour on average, explicitly framed so technicians can keep working while the part is en route and finish jobs faster ([Marcone](https://www.marcone.com/marcone-introduces-same-day-parts-delivery/)).

**Read for Repair AI:** parts margin is increasingly captured by a small number of scaled, technology-enabled distributors racing on delivery speed and data, not just inventory breadth. A one-person repair shop has no aggregated purchasing leverage or routing intelligence in this relationship today, a real wedge for an operations layer that shortens the diagnose-order-wait cycle.

### 4. Service contracts and home warranties are a volume-routing layer, not a labor source
Home warranty companies do not repair anything themselves; they are a claims and routing intermediary sitting between homeowners and independent contractors, structurally close to the property-manager buying pattern Repair AI is targeting:

- A U.S. home warranty is typically not a legal warranty at all, but a home service contract covering repair and/or replacement costs of appliances and major systems ([Wikipedia](https://en.wikipedia.org/wiki/Home_warranty)).
- The operating model is a marketplace dispatch: when an appliance breaks, the homeowner files a claim, the warranty company routes it to a relevant provider in its network, the provider schedules and completes the repair, the customer pays a service call fee, and the warranty company pays the provider separately for labor and parts ([Workiz](https://www.workiz.com/blog/appliance-repair/appliance-repair-warranty-companies/)).
- The buyer side is itself fragmented: there are roughly 83 home warranty companies across the US, each running its own contractor network ([Workiz](https://www.workiz.com/blog/appliance-repair/appliance-repair-warranty-companies/)).
- Entry requirements into these networks are fairly consistent: most require valid trade or contractor licensing, general liability insurance, auto insurance for service vehicles, workers' compensation coverage, and background checks ([Workiz](https://www.workiz.com/blog/appliance-repair/appliance-repair-warranty-companies/)).

**Read for Repair AI:** the home warranty model is the closest existing analog to what a property-manager channel needs, a trusted intermediary that pre-vets a contractor and routes recurring claim volume, except it is consumer-facing, national, and fee-extractive rather than local and relationship-based. Property managers are effectively acting as their own informal warranty company today, without the software or vetting infrastructure warranty companies use. That is the gap.

## Current trends

### OEM self-diagnosis and the tightening of service data access
Manufacturers are pushing connectivity and self-diagnosis into appliances, reshaping the technician's job in two directions at once: shortening diagnosis when access is granted, and locking independents out when it isn't.

- Historically, diagnosing a broken appliance meant tracing the circuit and measuring voltages across switches, thermostats, relays, and motors, and manufacturers published wiring diagrams and service information that was generally available; that openness is no longer guaranteed by default, it is increasingly a manufacturer choice, which is the center of the growing Right to Repair debate ([ExpoAppliance](https://www.expoappliance.com/post/the-next-right-to-repair-battle-has-already-started)).
- Some manufacturers are choosing openness: GE Appliances' SmartHQ Service platform is cited as a positive example, allowing technicians to communicate directly with many connected appliances ([ExpoAppliance](https://www.expoappliance.com/post/the-next-right-to-repair-battle-has-already-started)), and GE Appliances, LG, and Samsung all run no-cost or low-cost training tracks covering diagnostics, Wi-Fi setup, and model-specific repair through their service networks ([Bellafsm](https://www.bellafsm.com/smart-appliance-repair/)).
- Connectivity is a double-edged sword for reliability: J.D. Power research found that owners actively using Wi-Fi features on smart appliances reported roughly 92 problems per 100 appliances, substantially higher than non-connected models, because connectivity adds failure points such as control boards, sensors, radios, and firmware that can fail independently of the mechanical systems underneath ([Bellafsm](https://www.bellafsm.com/smart-appliance-repair/)).
- Right-to-repair policy is more advanced outside the U.S. for now: France already requires a repairability index score on products including washing machines, with the EU considering harmonizing this across member states, and an EU Digital Product Passport initiative will require products to carry digital documentation of composition, repairability, and environmental impact ([Claimlane](https://www.claimlane.com/resources/blog/right-to-repair-home-appliances)). U.S. policy is trending the same direction but state-by-state and slower.

**Read for Repair AI:** self-diagnosis is not uniformly bad for independents, it depends on whether the OEM opens the data or gates it. Near-term, repair software needs to ingest and normalize whatever diagnostic signal is available (manufacturer portals like SmartHQ, error codes, firmware state) rather than assume one standard, and help a one-person shop stage the right parts and triage before the truck roll, since guessing is least defensible against manufacturer-integrated diagnosis.

### Parts distribution consolidation is accelerating, and speed is now the differentiator
The wholesale layer has consolidated for over a decade (Reliable Parts into DOT Foods in 2014, Marcone's steady share gains, Parts Town's 2022 acquisition of Encompass), and the competitive battleground has shifted from "who has the part" to "who can get it to the technician fastest," evidenced by Marcone's DoorDash-powered same-day delivery push. For independents this cuts both ways: faster logistics reduces the dead time that kills first-visit completion rates, but the distributors, not the repair shops, are accumulating the data and relationship leverage over the supply side of every job.

### Inflation and tariffs are a near-term tailwind for repair demand, but a squeeze on repair margin
Cost pressure on new appliances is pushing consumers and property managers toward repair over replacement, but the same trade pressure is raising the cost of the repair itself: new appliance prices increased roughly 2.2% from 2023 to 2024, while tariffs on parts imported from China and Mexico, including compressors, circuit boards, and motors, are pushing repair costs up 5-20% in 2025 ([BozmanFix](https://bozmanfix.com/appliance-repair-statistics/)). Net effect: repair stays the economically rational choice relative to replacement, but margin per job is getting squeezed on the parts side, raising the value of anything that improves first-visit fix rates and reduces truck rolls.

### Authorized service still captures a large share of professionally-serviced volume
One market-research estimate states that authorized service centers claimed 68.07% share of repair and maintenance services in 2023 within the broader consumer electronics and appliance repair category ([BusinessResearchInsights](https://www.businessresearchinsights.com/market-reports/home-appliance-repair-service-market-104958)), a reminder that OEM-authorized channels, not just independents, capture a large share of the professionally-serviced market. This is the segment most exposed to further OEM control over diagnostics and parts, and the segment independents most need differentiated speed, price, or trust to compete against.

## Bottom line for Repair AI

The market is real, growing slowly, and structurally fragmented across three separate money pools: labor (thousands of small, geographically uneven technician businesses, plus franchises that wrap operations but not technical training), parts (increasingly consolidated among a few scaled OEM-parts distributors racing on delivery speed), and contracts/routing (home warranty companies that already prove a trusted-intermediary-plus-vetted-network model works, but only on the consumer side). Property managers currently sit outside all three pools as informal, manual routers of repair volume, exactly the gap a growth-engine-plus-operations-autopilot product is positioned to fill. OEM self-diagnosis and parts-distribution consolidation are both accelerating, and both cut against the unaided independent repairer, making software that closes the diagnostic and logistics gap more valuable over time, not less.


---

*Part 2 of 4. Source document: Targeting and ICP (v6, 2026-09-03, analyst assessment pass, figures directional pending live verification). Content verbatim from Mark's shelf; inline links are his cited sources.*

# Targeting and ICP: Growth Engine and Operations Autopilot

Note on sourcing: live web verification was not available for this pass. What follows is analyst assessment built from established, stable structural facts about how property management and independent-repair-trade industries operate. Numeric segment sizes are given as sizing *signals and proxies* to pull live (via PM software marketplaces, trade association membership data, BLS occupational data, and franchise disclosure documents) rather than as fixed figures, so nothing here is presented as a verified statistic. Treat all figures below as directional until confirmed with primary sources.

---

## 1. Two products, two different first customers

- **Growth Engine** (demand generation for repair businesses): the property-manager channel is the priority buyer because PMs concentrate volume, decide once and route many jobs, and are reachable through a handful of institutional channels. Consumers are the secondary, higher-volume-but-lower-efficiency acquisition path.
- **Operations Autopilot** (dispatch, scheduling, invoicing, parts, comms for the repair shop itself): the first customer is the one-person or 2-6-tech independent appliance repair business, not the property manager. This is a different buyer with a different job-to-be-done (running their own business, not sourcing a vendor).

These two ICPs interact: winning property-manager volume through the Growth Engine is what gives Repair AI leverage to sell (or bundle) the Operations Autopolot to the independent repairers who fulfill that volume.

---

## 2. PRIORITY: The property-manager channel

### 2.1 How property managers and landlords buy repair services today

Buying behavior splits sharply by portfolio size and sophistication:

- **Institutional / large multifamily operators and national PM companies** (regional or national portfolios, often thousands of doors): maintenance is largely centralized. These operators run formal **preferred vendor programs**: a short list (typically 2-4) of approved vendors per trade per market, sourced through RFPs, broker relationships, or existing facilities-management aggregators. Vendors must pass a compliance gate before ever getting a work order.
- **Mid-size regional PM companies** (hundreds to a few thousand doors): maintenance decisions sit with a **regional or portfolio maintenance manager**, often supported by onsite property managers who execute but don't originate vendor relationships. Vendor sourcing is a mix of referral, review sites, and cold outreach that gets escalated to whoever owns vendor approval.
- **Small PM companies and individual landlords / SFR investors** (single properties up to a few dozen doors): sourcing is informal, driven by Google/Yelp/Angi reviews, past experience, or word of mouth from other landlords. Decision cycle is fast and price/availability-sensitive; there is often no formal contract at all, just a recurring relationship.

The throughline: as portfolio size grows, buying shifts from "find someone good enough, right now" to "qualify a small panel of vendors once, then push volume through the maintenance/work-order software stack."

### 2.2 Who decides

- **Day-to-day dispatch decision**: onsite property manager or maintenance coordinator, working inside the PM software (AppFolio, Buildium, Yardi, RealPage, Entrata, Propertyware, Rentvine).
- **Vendor approval / who gets on the preferred list**: regional property manager, director of maintenance/facilities, or VP of operations at the management company. This is the actual decision-maker for channel volume, not the onsite manager.
- **Contract and insurance sign-off**: often routed through a central procurement or risk/compliance function at larger management companies, since certificate-of-insurance (COI) and licensing verification is a legal exposure issue, not just an operational one.
- **Owner-operators and small landlords**: the "decision maker" and the "user" are the same person, so the sales motion is direct and review/referral-driven rather than institutional.

Practical implication: Repair AI's channel sales effort needs to target the regional maintenance/ops layer for volume commitments, while the actual day-to-day relationship still has to satisfy the onsite manager who initiates each ticket.

### 2.3 Typical contract shapes

Common structural elements Repair AI should expect and be ready to match:

- **Master Service Agreement (MSA)** covering all properties in a portfolio rather than property-by-property contracts, so a vendor is pre-approved everywhere at once.
- **Not-to-exceed (NTE) thresholds**: vendors can proceed without additional approval below a dollar amount (commonly a few hundred dollars); above that, a quote or work-order approval is required before work starts.
- **Certificate of insurance (COI) and licensing requirements** as a hard gate to get on the vendor list at all, refreshed annually.
- **Response-time SLAs**: differentiated for emergency (often same-day/few-hour window) versus routine/non-emergency requests (often 24-72 hours).
- **Work order routing through PM software**, with the vendor expected to accept, update status, and close out the ticket inside that system (or via an integration/portal) rather than by phone or email alone.
- **Payment terms** typically net 30, invoiced against the work order, sometimes with per-unit or trade-specific rate cards negotiated at the portfolio level rather than per job.
- **Volume consolidation dynamics**: contractors who receive consistent, predictable work volumes from a portfolio-level relationship are typically willing to negotiate preferred pricing that reflects the reduced marketing and business development costs that relationship provides them, and organizations managing multiple properties should aggregate their maintenance spend across the portfolio when negotiating master vendor agreements, rather than allowing each property to negotiate independently. This is the structural reason preferred-vendor status is worth winning: it converts a one-off job into a recurring, price-protected volume stream.

### 2.4 What makes a PM route volume to one repairer

Based on the contract structure above, the levers that actually move a PM from "call around each time" to "always call Repair AI" are:

- **One point of contact and one invoice** across appliance types and properties, removing the coordination burden from the onsite manager.
- **Reliable, documented response-time performance** against the SLA tiers the PM already reports to their own ownership/asset-management layer.
- **Compliance handled once**: standing COI, licensing, and background-checked technicians so every new work order doesn't trigger a fresh compliance check.
- **System-of-record integration**: accepting and closing work orders inside AppFolio/Buildium/Yardi/RealPage rather than forcing the manager to leave their workflow. This is one of the highest-leverage, lowest-glamour features for channel stickiness.
- **Consistent pricing and reduced admin friction** across the whole portfolio, since aggregating maintenance spend across the portfolio only pays off if the vendor can actually service every property in the portfolio at the agreed rate.
- **Preventive/reduced-emergency track record**: PMs care about total maintenance cost, and properties with structured maintenance programs for systems like HVAC, plumbing, and electrical consistently incur lower emergency repair costs than properties managed reactively, because failures are caught before they become expensive emergency calls. A repairer who can demonstrate this discipline is differentiated on economics, not just responsiveness.
- **Low comeback/warranty friction**: since the PM's own reputation with residents rides on repair quality, a repairer who resolves issues in one visit and stands behind the work reduces political risk for the manager who recommended them.

### 2.5 Concrete ways to reach the property-manager channel

- **Trade associations**: NARPM (independent/residential property managers, chapter-based), NAA and its state/local affiliates (multifamily), IREM (commercial and institutional), BOMA (commercial buildings). Local chapter events, vendor booths, and sponsorships are the standard entry point for a repair vendor trying to get in front of regional decision-makers.
- **PM software marketplaces and integration partnerships**: AppFolio, Buildium, Yardi, RealPage, Entrata, and Rentvine all have partner/vendor ecosystems; being a listed or integrated maintenance vendor inside these platforms puts Repair AI directly in the workflow where dispatch decisions happen.
- **Maintenance-coordination platform partnerships**: platforms like Property Meld and Latchel already sit between PMs and vendors for triage and dispatch; partnering as a preferred fulfillment vendor inside these tools is a faster path to volume than displacing them.
- **Regional/national PM conferences**: association annual conferences (NARPM's annual convention, NAA's Apartmentalize, IREM and BOMA events) concentrate exactly the regional maintenance directors who own vendor-panel decisions.
- **Direct outbound to regional maintenance/facilities directors** at mid-size and large management companies, framed around SLA performance and portfolio-wide consistency rather than one-off pricing.
- **Local landlord associations and investor meetups** for the small-landlord segment, where referral and reputation carry more weight than formal RFPs.
- **Review and reputation surfaces** (Google Business Profile, Angi, Thumbtack, Yelp) remain the entry point for small landlords and self-managing owners who decide informally.

---

## 3. Property managers as direct customers of Repair AI (not just channel)

This is worth separating from the channel question because it's a different sale: software/workflow tooling sold to the PM company itself, versus Repair AI being the vendor that fulfills their repair volume.

**Assessment:**

- **Large, institutional PM companies and REIT-affiliated operators** are the least attractive direct-customer target. Many already run on facilities-management aggregation platforms (the SMS Assist/Lessen category of vendor-management/aggregation services) or have built internal vendor-management workflows inside Yardi/RealPage. Displacing that stack is a long, procurement-heavy sale that competes with entrenched incumbents, and it also risks channel conflict: if Repair AI is trying to be the fulfillment vendor to this same buyer, selling them software too can muddy the relationship.
- **Mid-size PM companies** (roughly the range with enough doors to feel maintenance-coordination pain but not enough to have built or bought enterprise vendor-management tooling) are the more plausible direct-customer segment. They often coordinate maintenance manually or with lightweight tools and may be underserved by category incumbents like Property Meld and Latchel, which already target this exact segment. Repair AI would be entering a market with established, PM-focused competitors, not a greenfield.
- **Small PM companies and individual landlords** are unlikely direct-software buyers at meaningful price points; they are better served purely as a channel (routing them to Repair AI's or partner repairers) than as a software customer, since their volume and budget don't support a dedicated maintenance-coordination purchase.

**Recommendation:** treat property managers as direct software customers as a secondary, optional motion rather than a primary GTM target. The stronger and more differentiated position is being the best fulfillment vendor inside the PM's existing workflow (per section 2), not competing with Property Meld/Latchel/Lessen-type incumbents for the PM's own software budget. A lightweight vendor-facing portal (to accept/update/close work orders) supports the channel relationship without requiring a full software sale.

---

## 4. Growth Engine: consumer segment (secondary)

Consumers are the higher-volume, lower-efficiency demand source relative to the PM channel: each consumer acquisition is a single job rather than a recurring portfolio relationship, and the buying decision is fast, price- and reviews-driven, typically triggered by an appliance failure (search intent: "appliance repair near me," brand-specific searches, or manufacturer/warranty referral).

**Segment sizing signals to pull for prioritization:**
- Search volume and local search competition for appliance-repair intent terms by metro (a direct demand proxy).
- Homeownership rate and median home/appliance age by target metro (older housing stock and appliance base correlates with repair frequency).
- Density of single-family and small multifamily rentals not covered by a PM company (self-managed landlords behave like consumers for sourcing purposes).
- Review volume and rating distribution on Google/Yelp/Angi for existing local repairers (a proxy for market fragmentation and how winnable local visibility is).

Consumers should be sequenced after the PM channel is generating repeatable volume, since consumer acquisition is a marketing-spend-intensive motion that benefits from having proven fulfillment capacity (via the Operations Autopilot user base) before scaling demand generation.

---

## 5. Operations Autopilot: first customer profile

**Primary ICP: the one-person or very small (2-6 technician) independent appliance repair business.**

Defining characteristics of the first-customer profile:
- Owner is both the technician and the back office: scheduling, invoicing, parts ordering, and customer communication are handled manually (phone, text, paper, spreadsheet, or a generic calendar tool) rather than a dedicated field-service platform.
- No dedicated office/admin staff; administrative work happens at night or between jobs.
- Currently underserved by field-service-management incumbents that skew toward larger shops with dedicated dispatchers (the enterprise end of the category), leaving a gap for tools built specifically around a one-person operation's workflow.
- Likely candidate to receive PM-channel volume from Repair AI's Growth Engine, creating a natural bundling motion: shops that take channel volume from Repair AI are the same shops that need better operations tooling to handle the increased job flow reliably (meeting the SLA and compliance requirements PMs expect, per section 2.3-2.4).

**Segment sizing signals to pull for prioritization:**
- Occupational and establishment data for appliance repair and maintenance (captured under standard industry/occupation classifications) to estimate the independent versus franchise/chain split.
- Franchise unit counts for national appliance-repair franchise brands (a proxy for the "already systematized" portion of the market that is a weaker Autopilot fit).
- Count of active Google Business Profile listings for "appliance repair" per target metro as a proxy for the number of independent operators addressable in a launch city.
- Adoption levels of existing field-service tools skewed to larger shops versus the lack of adoption at the very small end, as a proxy for the size of the underserved one-person segment.

---

## 6. First-customer sequencing recommendation

1. **Growth Engine, property-manager channel first**: target regional maintenance/ops decision-makers at mid-size PM companies in one launch metro, entering through association events and PM-software marketplace/integration presence rather than cold institutional RFPs, which favor incumbents.
2. **Operations Autopilot, in the same launch metro**: recruit the one-person/small repair shops that receive or want to receive that PM-channel volume, using the operational requirements PMs impose (SLA tracking, compliance documentation, single-invoice reporting) as the product's core value proposition rather than generic scheduling software.
3. **Consumer demand generation**: layer in after the channel and fulfillment sides are proven in the launch metro, using local search and review-based acquisition to fill capacity between PM-channel jobs.
4. **PM-as-direct-customer**: hold as a secondary, opportunistic motion only where a mid-size PM company explicitly lacks maintenance-coordination tooling, rather than building a parallel enterprise sales motion against established category incumbents.


---

*Part 3 of 4. Source document: Channel Opportunities (v6, 2026-09-03, live-sourced). Content verbatim from Mark's shelf; inline links are his cited sources.*

# Channel Opportunities: Reaching Repair-Shop Owners and Independent Repairers

This maps where appliance repair shop owners, solo technicians, and one-person repair businesses already congregate, buy, and get trained. These are the places Repair AI can show up with organic content, paid placement, partnerships, or direct outbound to build both the growth-engine and operations-autopilot pipelines.

## 1. Trade Associations & Certification Bodies

Associations are the highest-trust, lowest-noise channel because membership self-selects for owners who are already professionalizing their business (exactly the operations-autopilot buyer).

- **Professional Service Association (PSA)** - the main US trade association for independent appliance service dealers. Runs the CAT (Certified Appliance Technician) and CSM (Certified Service Manager) credentials and an annual convention/trade show. Reach: sponsor the convention, advertise in member communications, or offer software discounts through the certification track.
- **United Servicers Association (USA)** - unitedservicers.com. A long-running Midwest-based association of independent appliance service contractors, historically active in negotiating manufacturer warranty-service terms on behalf of members. Good venue for reaching multi-truck shop owners specifically (not solo techs).
- **ETA International / ISCET** - eta-i.org. Certifying body for electronics and appliance technicians (ISCET certification is now administered under ETA International). A channel for reaching individual technicians early in their careers, useful for the "operations autopilot for one-person businesses" positioning.

## 2. Online Communities & Forums

These are where technicians ask diagnostic questions daily, and where Repair AI can build organic credibility before ever selling anything.

- **Appliantology** - appliantology.org. A long-standing forum built specifically for professional appliance repair technicians (run by Master Samurai Tech's Sam Fusco), with active diagnostic Q&A and a paid "Appliantology Academy" training arm. High-intent, high-professionalism audience.
- **r/appliancerepair** - reddit.com/r/appliancerepair. Active subreddit mixing professional technicians and DIYers troubleshooting specific brands/models; good for organic Q&A participation and light-touch brand visibility.
- **Appliance411** - appliance411.com. A veteran appliance-repair info site with a long-running technician Q&A section, used by both consumers and pros for parts/model lookups.
- **iFixit** - ifixit.com. Broader right-to-repair community with an appliance repair section; skews DIY but has crossover with independent techs sourcing manuals and parts.

## 3. Parts Distributors & Suppliers

Distributors are the single highest-frequency touchpoint a repair tech has, often multiple times per week, which makes them the best co-marketing and data-partnership channel.

- **Marcone Supply** - marcone.com. The largest appliance parts distributor in North America, serving independent technicians and shops through branches and e-commerce; a natural channel partner for embedding a scheduling/ops tool into an already-trusted supplier relationship.
- **ReliableParts** - reliableparts.com. Major national parts distributor network with branch locations serving independent servicers.
- **Encompass Supply Chain Solutions** - encompass.com. Another major national appliance parts distributor serving independent repair businesses.
- **PartSelect** - partselect.com. Large parts e-commerce site with an extensive video repair-help library watched by both DIYers and working technicians; strong SEO/YouTube presence to potentially co-market alongside.
- **RepairClinic** - repairclinic.com, with a **RepairClinic PRO** program specifically for professional technicians (trade pricing, account tools). Direct channel to reach working repairers who already self-identify as "pro."
- **AP Wagner** - apwagner.com. Regional (Pacific Northwest-focused) appliance parts distributor serving independent servicers.

## 4. Buying Groups & Dealer Networks

Many appliance sellers with attached service departments, and many independent service-only shops, belong to buying/marketing groups that run their own trade shows and member communications.

- **Nationwide Marketing Group** - nationwidegroup.org. A large buying group of independent appliance, electronics, and furniture dealers, many of whom run in-house service departments; hosts its own annual member conference (PrimeTime), a strong sponsorship/exhibitor channel.
- **BrandSource** - brandsource.com. Another major independent-dealer buying group with member appliance retailers that frequently operate their own repair/service divisions.

## 5. Manufacturer Authorized-Service Networks

Manufacturers certify independent shops and solo technicians as "authorized servicers" for warranty work, and publish searchable directories of them.

- **Whirlpool** (whirlpool.com) and **GE Appliances** (geappliances.com) authorized-servicer locator pages, along with similar programs from Samsung, LG, and others, effectively function as public rosters of independent repair businesses. These directories are a strong outbound-prospecting source for building a target list of shop owners for the operations-autopilot product.

## 6. Software & Tooling Ecosystem (adjacent/competitor communities)

Shop owners already research and discuss field-service software in these venues, making them both competitive-intelligence sources and paid-placement opportunities.

- **Capterra** and **G2** - review platforms where repair-shop owners compare field-service management tools; category pages for "field service management" and "HVAC/appliance repair software" surface real buyer intent and competitor positioning.
- **Syncro (formerly RepairShopr)** - syncromsp.com. Field-service/shop-management software with an active small-repair-shop user base; useful to study for feature/pricing benchmarking and potential user-community outreach.
- **ServiceTitan** and **Housecall Pro** - servicetitan.com, housecallpro.com. Broader home-service software platforms (HVAC/plumbing/electrical-centric but increasingly touching appliance repair) whose blogs, webinars, and case-study content draw the same small-trade-business owner audience Repair AI is targeting.

## 7. Marketplaces & Directories (dual-purpose: prospecting + visibility)

These platforms are where individual repairers already list themselves to win consumer jobs, making them useful both for direct-outreach list-building and for understanding how solo repairers currently price and market themselves.

- **Angi** (angi.com), **Thumbtack** (thumbtack.com), **HomeAdvisor** (homeadvisor.com), **Yelp** (yelp.com), **Nextdoor** (nextdoor.com, via its local-business/pro directory) - categorized "appliance repair" listings in any city are effectively a live census of solo repairers and small shops, usable for outbound sourcing.
- **Better Business Bureau** - bbb.org. Business directory by category/city, another prospecting source, particularly for more established shops that care about credibility signals.

## 8. Trade Shows & Events

- **PSA Annual Convention & Trade Show** - run by the Professional Service Association; the flagship US event specifically for independent appliance service businesses.
- **Nationwide Marketing Group PrimeTime** - annual conference for the dealer/buying-group network described above.
- **KBIS (Kitchen & Bath Industry Show)** - kbis.com. Major appliance-adjacent trade show (co-located with IBS in Las Vegas) where manufacturers and service partners exhibit; useful for manufacturer/distributor partnership conversations rather than direct shop-owner reach.

## 9. Content & Media

- **YouTube**: PartSelect and RepairClinic both run large repair-help video libraries that individual technicians watch for diagnostics; Master Samurai Tech/Appliantology also has an instructional YouTube presence aimed at professionals rather than DIYers. Pre-roll or partnership placement here reaches an actively-working-technician audience at the moment of a repair task.

## Prioritized Recommendation

For fastest, highest-signal reach into repair-shop owners and solo repairers:

1. **Distributors first** (Marcone, ReliableParts, Encompass, PartSelect, RepairClinic PRO) - highest frequency of contact, natural co-marketing or embedded-partner angle.
2. **Manufacturer authorized-servicer directories** - best raw list-building source for outbound sales to the operations-autopilot buyer.
3. **PSA and Appliantology** - highest-trust community/association channels for organic credibility and thought leadership before paid outreach.
4. **Marketplace directories (Angi, Yelp, HomeAdvisor, Nextdoor, BBB)** - practical, immediate prospecting lists of active local repair businesses by city.


---

*Part 4 of 4. Source document: Competitor Tracker (v3, 2026-09-03, live-sourced). Content verbatim from Mark's shelf; inline links are his cited sources.*

# Competitor Tracker: Appliance-Repair AI & Software

Scope: companies shipping AI-enabled diagnostic, triage, or software tools into the appliance-repair value chain (distributors, DIY/consumer platforms, and technician tools). Assessment sections are my analysis, not sourced fact.

## 1. MarconeAI (Marcone)

Marcone, a large North American distributor of appliance, HVAC, plumbing and commercial-kitchen parts, launched MarconeAI in August 2023 as what it called the first open-AI-based triage tool for field service ([Marcone press release](https://www.marcone.com/marcone-launches-first-distributor-based-ai-technology-marconeai-offers-innovative-troubleshooting-for-appliance-repair/)). The tool runs on OpenAI/ChatGPT to walk technicians through likely causes for a specific appliance and issue, then surfaces the parts needed to complete the fix ([marcone.com](https://www.marcone.com/marcone-launches-first-distributor-based-ai-technology-marconeai-offers-innovative-troubleshooting-for-appliance-repair/)). It is bundled free into Marcone's parts ecosystem: CEO Avichal Jain said the company was "pleased to offer this technology at no cost to our service community" ([PR Newswire](https://www.prnewswire.com/news-releases/marcone-launches-first-open-ai-based-triage-solution-for-field-service-companies-301889894.html)). The value prop is diagnosis-to-parts-to-shipping speed, backed by Marcone's 93% next-day and 100% two-day parts shipping ([marcone.com](https://www.marcone.com/marcone-launches-first-distributor-based-ai-technology-marconeai-offers-innovative-troubleshooting-for-appliance-repair/)). Trade press framed the launch as part of a broader wave of AI adoption in facilities management aimed at labor shortages ([Facilities Dive](https://www.facilitiesdive.com/news/marcone-ai-commercial-maintenace-tool/690233/)). Marcone still markets AI access as a standing perk of being a Marcone parts customer on its current site ([Marcone Appliance Parts page](https://www.marcone.com/appliance-division/), [Marcone Technology page](https://www.marcone.com/technology/)).

**Assessment:** MarconeAI is a distributor loyalty tool, not a PM-facing routing or growth product. It locks technicians into Marcone's parts pipeline rather than building demand-side (property manager) relationships. Low direct threat to a PM-channel growth engine, but relevant as an "operations autopilot" comparison point for the diagnosis-to-parts workflow.

## 2. Burke America / "Repair Intelligence"

Burke America Parts Group (founded 2015, Chicago, CEO Robert Burke per deal-data provider Preqin) runs an "all-in-one home repair AI platform" covering diagnostics, 24/7 technical support and repair content for DIYers, technicians, retailers, warranty providers and OEMs ([Preqin profile](https://www.preqin.com/data/profile/asset/burke-america-parts-group-llc/275502)). It monetizes through a mix of direct parts sales and subscriptions to the digital repair platform ([Preqin](https://www.preqin.com/data/profile/asset/burke-america-parts-group-llc/275502)). Internally the product is branded "Repair Intelligence," run by a dedicated GM who previously worked at McKinsey ([Equilar ExecAtlas](https://people.equilar.com/bio/org/burke-america/5913695)); an employee review corroborates an "AI-powered 'Repair Intelligence' system" used in day-to-day operations ([Indeed reviews](https://www.indeed.com/cmp/Burke-America/reviews)). Notably, Burke America also exposes this as a developer product: a public API portal offers "repair intelligence APIs to drive a best-in-class equipment service experience," including a parts/model taxonomy ([Burke America Parts Group API Portal](https://bapg.developer.azure-api.net/)). Crunchbase describes the company as a SaaS/DaaS platform for service organizations, retailers, warranty providers and OEMs to manage repair time and cost ([Crunchbase](https://www.crunchbase.com/organization/burke-america)).

**Assessment:** Burke America is the closest seed competitor to an actual B2B platform play, since it API-izes repair intelligence for other companies to build on, rather than only shipping an app. It targets warranty providers and OEMs, an adjacent but distinct buyer from property managers. Worth monitoring for API partnerships that could extend into the PM/warranty-claims workflow.

## 3. iFixit: FixBot (consumer) and FixBot Pro (B2B)

iFixit shipped **FixBot**, a consumer AI repair assistant, publicly in December 2025 ([9to5Mac](https://9to5mac.com/2025/12/09/ifixit-launches-fixbot-ai-repair-helper-with-free-and-paid-versions/)). It combines language, voice and vision models with a custom retrieval system over iFixit's library, letting users describe or photograph a problem and get step-by-step, voice-capable guidance ([iFixit: Introducing FixBot](https://www.ifixit.com/News/114700/introducing-fixbot), [Gizmodo](https://gizmodo.com/ifixit-made-an-ai-assistant-to-help-you-fix-your-gadgets-and-its-free-for-now-2000697275)). It's grounded in iFixit's own repair guides, forum answers and PDF manuals rather than general web data, and iFixit says it covers 
more than 72,000 products ranging from iPhones to motorcycles
 ([9to5Mac](https://9to5mac.com/2025/12/09/ifixit-launches-fixbot-ai-repair-helper-with-free-and-paid-versions/)). Monetization: currently free, with a paid tier required for step-by-step voice guides and full visual/voice diagnostics; U.S. pricing hadn't been announced as of launch, though a German outlet reports a planned subscription of roughly 5 EUR/month ([9to5Mac](https://9to5mac.com/2025/12/09/ifixit-launches-fixbot-ai-repair-helper-with-free-and-paid-versions/), [Notebookcheck (DE)](https://www.notebookcheck.com/iFixit-veroeffentlicht-Smartphone-App-mit-Akku-Analyse-und-AI-FixBot.1181458.0.html)). Community reaction has been mixed, with some contributors worried the bot will cannibalize the forum traffic that trains it ([Trendwatching](https://www.trendwatching.com/innovations/with-its-new-fixbot-ifixit-turns-to-ai-to-scale-community-expertise)).

Separately, **FixBot Pro** (fixbot.pro) is positioned as "the AI repair expert for repair operations," built on iFixit's 20-year library but aimed at repair teams/businesses rather than consumers, covering diagnosis, parts research and repair across "thousands of device categories" including home appliances ([FixBot Pro](https://fixbot.pro/)).

**Assessment:** FixBot Pro is the seed-list product most structurally similar to an "ops autopilot" for repair shops, worth close feature and pricing tracking as it matures. It is technician/shop-facing, not currently a PM channel or growth-engine product.

## 4. MyPros+ "Max"

MyPros+ is a technician-facing reference tool: Max is described on the company's own site as "a research tool, not a replacement for your judgment," which answers technician questions with citations back to source manuals ([mypros.plus](https://mypros.plus/)). The core product is a searchable library of 
78,000+ OEM service manuals, searchable by model number, on your phone
, including error codes, parts diagrams and wiring schematics, covering 55+ appliance brands ([mypros.plus](https://mypros.plus/)). Pricing is explicit and positioned against the cost of manufacturer portals: the site states multi-brand technicians typically pay $70-150/month for separate OEM portals, versus 
MyPros+ covers 55+ brands for $29/month
, with symptom-based (not just model-number) search ([mypros.plus](https://mypros.plus/)). The company says it was built by a team with 25+ years in appliance repair ([mypros.plus](https://mypros.plus/)).

**Assessment:** MyPros+ Max is a pure knowledge-retrieval tool for solo technicians and small shops, not a growth or dispatch product. It's a natural adjacent/potential-partner category (documentation layer) rather than a head-on competitor to a PM-channel growth engine, but it does compete for technician mindshare/budget with any "ops autopilot" that bundles documentation lookup.

## 5. New entrant found in this scan: aiventic

**aiventic** (aiventic.ai) markets AI tooling specifically for high-end/luxury appliance repair shops. Its pitch: instant troubleshooting guides and part identification so technicians can "get it right the first time," plus AI-generated customer-facing service summaries meant to protect premium brand reputation ([aiventic](https://www.aiventic.ai/industries/high-end-appliance-repair)). Feature claims include step-by-step repair walkthroughs, automatic parts identification, and pulling up past service records for a job ([aiventic](https://www.aiventic.ai/industries/high-end-appliance-repair)).

**Assessment:** Directly overlaps with the "operations autopilot for repair shops" half of Repair AI's roadmap, though aiventic appears to target the luxury-appliance servicer niche specifically rather than general multi-family/PM-channel volume.

## Adjacent, not a direct competitor: AIonX

AIonX (aionx.co) is not itself an appliance-repair AI product; it's a subscription-management/advisory service that helps repair professionals pick and pay for AI tools, claiming to manage subscriptions for 500+ professionals and save them money versus buying tools individually ([AIonX](https://aionx.co/trade-services/best-ai-appliance-repair/)). Useful as a signal that a market of AI-tool-shopping technicians already exists, but not a competitor to track for product features.

## Cross-cutting competitive read (assessment, not fact)

- **No seed or newly found competitor is building a property-manager-facing growth/routing engine.** MarconeAI and Burke America are distributor-anchored diagnostic tools that reward loyalty to a parts supply chain, not tools that help a repair business win or manage recurring PM volume.
- **The technician-facing "ops autopilot" layer is getting crowded fast**: FixBot Pro, MyPros+ Max, and aiventic all compete for the same diagnosis/documentation/parts-ID workflow inside a single technician's day, within roughly the last 12-18 months of launches.
- **Burke America's public API** is the one signal of a platform strategy that could extend toward B2B integrations (e.g., warranty administrators, potentially property managers) rather than staying a standalone app; worth periodic re-checking of their developer portal for new endpoints or partner announcements.
- **Pricing anchor points observed:** MyPros+ Max is priced at $29/month against a $70-150/month status quo of OEM portals ([mypros.plus](https://mypros.plus/)); iFixit's paid FixBot tier is expected in the low single-digit euros/dollars per month range once announced ([Notebookcheck](https://www.notebookcheck.com/iFixit-veroeffentlicht-Smartphone-App-mit-Akku-Analyse-und-AI-FixBot.1181458.0.html)); MarconeAI and Burke America's core AI features are bundled free with parts purchasing/platform subscription rather than sold standalone ([PR Newswire](https://www.prnewswire.com/news-releases/marcone-launches-first-open-ai-based-triage-solution-for-field-service-companies-301889894.html), [Preqin](https://www.preqin.com/data/profile/asset/burke-america-parts-group-llc/275502)).