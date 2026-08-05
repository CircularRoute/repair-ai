# Teaching Otto real vertical depth: what exists, what does not, what to do
Task: founder question, 2026-08-04 | Author: Otto Engineer
Research: two verified web research passes plus direct measurement of Otto's current build.
Everything below has a real URL. Items that could not be verified are marked as such.

---

## 1. The short answer, before the detail

**You cannot fine-tune Claude, and you would not want to for this.**

Fine-tuning is not publicly available on Claude. The only routes are Claude 3 Haiku on
Amazon Bedrock (a small model two generations old, useless for diagnostic reasoning) and
enterprise custom training through Anthropic's professional services, which is a
contract-level engagement requiring significant data preparation.

More importantly, fine-tuning is the wrong instrument even where it is available. It
teaches a model *behaviour and format*, not *facts*. Facts absorbed into weights cannot be
cited, corrected, or dated, and they drift. For "Bosch fault code E24 means the drain pump
is blocked on these eleven model numbers", you need exactness and recency. That is a
retrieval and tooling problem, not a training problem.

**The good news: the architecture you already have is the correct one.** Otto's teach loop,
versioned knowledge notes with provenance, and the eval gate are exactly how you give a
model deep domain knowledge in 2026. What is missing is not training. It is (a) corpus,
and (b) a retrieval step, covered in section 5.

---

## 2. The hard truth about appliance repair data

**There is no open, machine-readable corpus mapping symptom to diagnosis to part.** That
mapping exists only inside paid technician subscriptions and inside two distributors'
proprietary datasets. This is the single most important finding.

Right-to-repair legislation does **not** create an open dataset. It creates a per-request
PDF entitlement for credentialed repairers. In the EU, repair information goes to
professional repairers only, who must prove insurance and registration in an official
registry, and schematics are not required at all.

### Free and self-serve today (start here)

**OEM fault-event APIs.** The best bootstrap finding: several manufacturers expose live
fault and alarm events, free, with open signup and simulators so you need no hardware.

| Source | Access | Emits |
|---|---|---|
| [Home Connect](https://developer.home-connect.com/) (Bosch, Siemens, Neff, Gaggenau) | Open self-signup, free, simulators | Door alarms, temperature alarms, salt and rinse-aid empty, program aborted, filter saturation |
| LG ThinQ Connect | Self-service tokens, no partner approval | `ErrorNotification` events, e.g. water leak, error during cleaning |
| [Electrolux Group](https://developer.electrolux.one/) | Self-serve API key, SSE live stream | Fault-code exposure unconfirmed |
| Samsung SmartThings | Public platform | Operating-state capabilities; on-device self-diagnosis reachability unverified |
| Whirlpool | Closed, no developer programme | - |

**[FaultCodeLab](https://faultcodelab.com/en/dataset/)** - 248 records, 35 brands, CC BY 4.0,
free JSON. Too small to be a corpus. Genuinely useful as a **schema template**: each record
carries a source URL, confidence, severity and aliases. Copy the shape, not the data.

**EU-mandated spare-parts lists.** Ecodesign regulations require dishwasher and washing
machine manufacturers to publish a spare-parts list and ordering procedure on a
free-access website. Legally public, per-manufacturer, and nobody is systematically using
them.

### Paid but obtainable

- **[MyPros+](https://mypros.plus/)** - $290/yr, 78,000+ service manuals, 55+ brands, parts
  by diagram section. **Also a competitor**: it already ships "Max", a diagnostic AI over
  those manuals with page-level citations. Subscribe for the manuals and for competitor
  intelligence.
- **[Appliantology](https://appliantology.org/)** - $297/yr professional membership,
  unthrottled datasheet downloads.
- **Appliance Tech Info** - 2,500+ error codes, $299.88/yr. ⚠️ The site describes its own
  content distribution as "fair use" while redistributing OEM manuals. **Real legal
  exposure if you build a commercial product on it.** Do not.

### Partner-gated, worth the conversation

- **[Burke America Repair Intelligence](https://www.burkeamerica.com/repair-intelligence)** -
  the closest thing to what you want that exists. A Symptoms API classifying service
  symptoms by difficulty, root cause and *relevant parts*, on 2.2 TB of proprietary data.
  They own RepairClinic and Sundberg America. Contact `api@burkeamerica.com`.
- **Encompass** - parts for 350+ brands. Partner-gated and requires a net-terms account;
  they explicitly refuse credit-card accounts API access.
- **Marcone** - part numbers, pricing, per-warehouse stock, cross-references. Account-gated.

### The single highest-leverage action

**Email `legal@ifixit.com`.** iFixit's data is CC BY-NC-SA 3.0 and their terms state
plainly that using it to train a model is a violation. **But the same licensing page says
they grant commercial licences, explicitly including for training large language models.**
Their API works without a key and covers washing machines across Samsung, LG, Whirlpool,
Bosch, GE, Maytag, Amana and BEKO. One email decides whether the best open repair corpus
in the world is available to you legally.

### Verified dead ends, so you do not spend time there

- PartSelect, RepairClinic, Reliable Parts, AppliancePartsPros: **no public API**.
- No EU household-appliance parts API exists at all.
- **Open Repair Alliance data does not cover large household appliances.** Community repair
  events fix things people can carry. Useless for washing machines and fridges.
- Academic and Kaggle fault-diagnosis datasets are almost entirely bearings and induction
  motors. The one refrigerator dataset is simulated.
- Scraping is actively defended against: RepairClinic's robots.txt explicitly blocks the
  Common Crawl bot.

---

## 3. Reverse logistics, recycling and resale

### Free, licensed, and genuinely useful as agent knowledge

| Source | What | Licence |
|---|---|---|
| **[ReMA (ISRI) Scrap Specifications Circular](https://www.isrispecs.org/)** | The trading language of the scrap industry: grades for nonferrous, ferrous, paper, plastics, glass cullet, electronics, tyres. **January 2026 edition** | Free PDF, no login |
| **[Open Repair Data Standard](https://openrepair.org/open-data/downloads/)** | **305,649 rows** of real EEE repair-attempt data, product-level failure data | CC BY-SA 4.0 |
| **[NRF / Happy Returns 2025 Retail Returns Landscape](https://nrf.com/research/2025-retail-returns-landscape)** | The citable returns benchmark: **$849.9bn US returns, 15.8% return rate, 19.3% of online sales, 9% fraudulent** | Free |
| **[Eurostat API](https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-introduction)** | Waste treatment and circular economy monitoring, JSON/SDMX/CSV | Free, no auth |
| **[UN Comtrade](https://comtradeplus.un.org/)** | Bilateral trade flows by HS code: 7204 ferrous scrap, 3915 plastic scrap, 4707 recovered paper | Free tier, no key for preview |
| **[WRAP Textiles Sorting and Recycling Database](https://www.wrap.ngo/resources/tool/textiles-sorting-and-recycling-database)** | 200+ UK/EU sorters, pre-processors, recyclers, yarn spinners | Open source; check terms for commercial reuse |
| **[WBCSD Circular Transition Indicators v4](https://www.wbcsd.org/resources/circular-transition-indicators-v4/)** | Company-level circularity metrics with GHG impact | Free PDF |
| **[APR Design Guide](https://plasticsrecycling.org/apr-design-hub/apr-design-guide-overview/)** / **[RecyClass](https://recyclass.eu/protocols-guidelines/design-for-recycling-guidelines/)** | Recyclability design criteria, NA and EU | Free |

### Must be bought

All real-time recovered-material pricing. **Fastmarkets**, **Argus** and **ICIS** are the
only credible sources, all enterprise-priced with no published rates. Fastmarkets and Argus
confirm API delivery; ICIS API availability could not be verified. ICIS covers 100+ grades
across the recycled plastics chain including rPET, rPE and rPP.

### Standards worth encoding

- **ISO 59000 series**, published May 2024: 59004 (vocabulary and principles), 59010
  (business model transition), 59020 (measuring circularity performance).
- **EU Digital Product Passport**: batteries first and hardest, **18 February 2027, no
  transitional grace period**, for EV, LMT and industrial batteries over 2 kWh.
  Sequencing thereafter (indicative, secondary sources): iron and steel 2026; textiles,
  tyres, aluminium 2027; furniture 2028.
- **EPR reporting**: seven US states have enacted packaging EPR. California, Colorado and
  Oregon require **SKU- and component-level annual supply reports** including material
  composition and recyclability classification. That reporting burden is a concrete,
  well-defined build opportunity.

### Corrections to things widely believed but now false

- **Circulytics is dead.** Ellen MacArthur Foundation closed it to submissions on 31 August
  2023 and stepped away from company assessment entirely. **Do not propose it to a client.**
- **Recurate was acquired by Trove** (August 2024). Do not pitch it as independent.
- **The Reverse Logistics Association was acquired by the NRF** (September 2023). NRF is
  now the authoritative source for returns benchmarks.
- **Cirplus, the German recycled-plastics marketplace, entered liquidation 31 March 2026**,
  and is still widely cited as live.

### Two gaps that are build opportunities, not buy opportunities

1. **There is no reverse-logistics-native routing API.** Everything on the market is
   general route optimisation applied to collection. Nothing handles capacity, grading
   stations and consolidation decisions as first-class constraints.
2. **There is no cross-industry used-goods grading standard.** R2v3 covers electronics
   testing and grading protocols but defines no universal A/B/C scale, and for apparel no
   formal standard exists at all: every resale platform uses its own taxonomy.

Both are defensible consulting and product angles precisely because they are missing.

---

## 4. Competition already shipping, for the diagnostic agent

This matters more than the data question. The appliance-diagnosis agent you describe is
**already being built by the people who own the parts supply**.

- **MarconeAI** - shipped. Technician assistant, diagnosis, part identification, next-day
  shipping. The distributor owns the entire loop.
- **Burke America** - sells "Repair Intelligence" as a SaaS and data-as-a-service platform
  to service organisations, retailers, warranty providers and OEMs.
- **[iFixit FixBot](https://www.ifixit.com/)** - relaunched December 2025, multimodal over
  ~125k guides, free. They own the corpus.
- **MyPros+ "Max"** - diagnostic AI over 78,000 service manuals with page-level citations,
  at $290/yr.
- **[Aiventic](https://www.aiventic.ai/industries/high-end-appliance-repair)** - appliance
  repair as a named vertical with customer logos (marketing-verified only).

Field service platforms (ServiceTitan, XOi, ServicePower, Housecall Pro) use AI for
scheduling, dispatch and document retrieval. **None owns diagnostic knowledge.** They are
distribution channels, not competitors.

**Three strategic risks:**

1. **The moat is licensing and fulfilment, not the model.** Anyone can wrap an LLM. What
   cannot be copied is a licensed proprietary corpus, the parts-fulfilment loop, or an
   OEM/warranty distribution deal.
2. **Samsung and LG are building self-diagnosis into the appliances themselves.** Over five
   to ten years that erodes the diagnosis problem. This argues for owning the **parts and
   fulfilment** side of the loop rather than the diagnosis side.
3. **Legal exposure** if you build on redistributed OEM manuals under someone else's
   "fair use" assertion.

---

## 5. What has to change in Otto before any of this lands

Measured on the current build, not estimated.

**Otto currently puts every knowledge note into every prompt.** There is no selection step:
`buildPublicSystem` concatenates all deployed notes. Today that is 12 notes and about
**6,982 tokens**, which is fine. It does not survive a real corpus:

| Knowledge base | Tokens per call | Knowledge cost per conversation |
|---|---|---|
| 12 notes (today) | 6,982 | $0.03 |
| 100 notes | 58,181 | $0.26 |
| 500 notes | 290,903 | **$1.31** |
| 2,000 notes | 1,163,611 | exceeds practical context |

For reference, a whole conversation costs about **$0.20** today. So ingesting a few hundred
documents naively makes every conversation roughly six times more expensive, and a real
corpus breaks it outright.

**Two things are needed before bulk ingestion:**

1. **A retrieval step.** Select the handful of relevant notes per conversation instead of
   sending all of them. Tag and keyword scoring gets a long way; embeddings when the corpus
   justifies it. Anthropic's [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
   are the native mechanism for exactly this: only a skill's name and description sit in
   context, and the full content loads only when the task calls for it.
2. **A bulk ingestion path.** Teach Mode produces one note per conversation, which is right
   for tacit operator knowledge and hopeless for 78,000 service manuals. Document upload
   producing many reviewed notes is a different pipeline.

**And a design point worth stating plainly:** fault codes and parts compatibility should
**not** be prose knowledge notes at all. They are structured lookups. Otto should call them
as a **tool**, the way it would call a parts API, so answers are exact and current rather
than paraphrased from memory. Prose notes are for judgement; tools are for facts.

---

## 6. Recommended sequence

**For Otto's vertical depth, now, cheap:**
1. Encode the free standards as knowledge: ISRI Scrap Specifications, NRF returns
   benchmarks, ISO 59000 vocabulary, EPR and DPP obligations, APR/RecyClass design guides.
   This is a weekend of work and nobody has assembled it into an agent.
2. Keep using Teach Mode for what only you have: the operator judgement that is in nobody's
   dataset.
3. Add retrieval before the corpus outgrows the prompt.

**For the diagnostic agent, in order:**
1. Build on **Home Connect and LG ThinQ today**. Free, self-serve, real fault events,
   simulators, no gatekeepers. This proves the concept without a single licensing call.
2. **Email `legal@ifixit.com`.** Highest leverage single action on this list.
3. Approach **Burke America** about the Symptoms API.
4. Subscribe to **MyPros+** at $290/yr for manuals and competitor intelligence.
5. Harvest the **EU-mandated free-access spare-parts lists**.
6. Use **FaultCodeLab's schema**, not its data.
7. Skip Open Repair Alliance for large appliances, and skip academic datasets entirely.

**Strategic framing:** given that distributors are already shipping diagnosis tied to
fulfilment, the defensible position is probably not "we diagnose better". It is owning a
niche corpus nobody has licensed, or being the layer that turns diagnosis into a parts
order for operators who are not tied to Marcone or Burke.

---

## Unverified, flagged honestly

Sears PartsDirect API (host does not resolve); ApplianceAPI pricing (waitlist only);
EURAS pricing; Encompass REST spec (403 to bots); Electrolux fault-code exposure; Samsung
HomeCare Wizard API reachability; Aiventic pricing; Oregon SB 1596 appliance coverage;
ICIS API availability; Trove and ThredUp API documentation; Reflaunt and Back Market
endpoint details; "Archive" as a resale platform (could not confirm it exists as
described); Urban Mine Platform current status; EU DPP Registry go-live date; WRAP dataset
commercial licensing terms; vendor-blog cost-per-return benchmarks.
