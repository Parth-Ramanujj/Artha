const http = require('http');

const API_KEY = 'owa_k1_4c2f0f60c48635718f6828aef51e565e38182714f039a1f8f1fb789cb96f470e';

const documents = [
  {
    title: 'PadosiAgent Overview & Operational Guidelines',
    type: 'faq',
    content: `
PadosiAgent is your dedicated digital insurance, financial planning, and advisory partner across Gujarat.
Primary service hubs: Ahmedabad, Surat, Vadodara, Rajkot, Patan, Mehsana, Bhavnagar, Gandhinagar.

Key Services:
1. Term Life Insurance (financial security up to ₹1 Crore - ₹5 Crore)
2. Health & Family Floater Mediclaim (10,000+ cashless network hospitals, 450+ in Gujarat)
3. Motor & Two-Wheeler Insurance (Bumper-to-bumper, zero dep, instant renewal)
4. Mutual Fund SIPs & Wealth Advisory (Equity, Debt, Hybrid & ELSS Tax-saver)
5. Fast Track Claim Settlement Support (dedicated advisor assistance within 30 minutes)

Language Support:
We communicate in Gujarati, Hindi, and English based on customer preference.

Operating Hours:
- General Advisory: Monday to Saturday, 9:00 AM to 8:00 PM.
- Emergency Hospital Cashless Desk: Available 24/7.
- Escalation: Type "Advisor" or "Human" anytime to connect with an IRDAI-certified human advisor.
`.trim(),
  },
  {
    title: 'Term Life Insurance Buying Guide & Rules',
    type: 'product',
    content: `
Term Insurance provides high life cover (Sum Assured) at the most economical premium rates.

Key Guidelines:
- Optimal Cover Amount: 15x to 20x of the policyholder's annual income.
- Recommended Riders: Critical Illness Rider (covers cancer, heart attack, stroke, etc.), Accidental Disability Rider, Waiver of Premium.
- Tax Deductions: Premiums eligible for tax deduction under Section 80C up to ₹1.5 Lakh/year. Death benefit is 100% tax-free under Section 10(10D).
- Top Insurance Partners: HDFC Life, Tata AIA, ICICI Prudential, Max Life (all with >98% claim settlement ratio).
- Required KYC Documents:
  1. Aadhaar Card (Identity & address proof)
  2. PAN Card (Mandatory for financial transactions)
  3. Last 3 months Salary Slips or 2 years Income Tax Returns (ITR)
  4. 6 months Bank Statement
  5. Medical health checkup report (scheduled for free by insurer if required).
`.trim(),
  },
  {
    title: 'Health Insurance & Cashless Hospitalization Protocol',
    type: 'guideline',
    content: `
Comprehensive Health & Family Floater Insurance covers hospital bills, surgeries, ICU charges, and medicines.

Coverage Highlights:
- No Room Rent Sub-limit: Freedom to choose private AC rooms without proportional deductions.
- Pre & Post-Hospitalization: Covers medical expenses 60 days before admission and 180 days after discharge.
- Daycare Procedures: Covers modern surgeries requiring less than 24 hours hospitalization (cataract, dialysis, chemotherapy, etc.).
- Restoration Benefit: 100% refill of sum insured if exhausted in the same policy year.

Waiting Period Rules:
- Initial Waiting Period: 30 days from policy inception (accidental emergencies covered from day 1).
- Specified Illnesses Waiting Period: 2 years (cataract, hernia, joint replacement, ENT surgeries).
- Pre-Existing Diseases (PED): 2 to 3 years waiting period for conditions like diabetes, hypertension, asthma.

How to Avail Cashless Treatment:
1. Planned Admission: Inform 48 hours prior at the hospital TPA / Insurance desk with your e-Card & photo ID.
2. Emergency Admission: Inform within 24 hours of hospitalization. Call our emergency claim support at +91 92271 02108.
`.trim(),
  },
  {
    title: 'Mutual Funds & Systematic Investment Plan (SIP) Guide',
    type: 'product',
    content: `
Systematic Investment Plan (SIP) enables disciplined wealth creation through rupee-cost averaging and compounding.

Investment Fundamentals:
- Minimum Investment: Start with as low as ₹500 per month.
- Frequency: Monthly, quarterly, or bi-weekly.
- Fund Categories:
  * Nifty 50 Index / Large Cap Funds: Safe, steady compounding for conservative to moderate investors (11-13% historic CAGR).
  * Flexi-Cap & Mid-Cap Funds: High alpha generation for long-term horizons of 5-10+ years (14-16% historic CAGR).
  * ELSS Tax Saver Funds: 3-year lock-in period (shortest among 80C instruments like PPF/FD) with tax deduction up to ₹1.5 Lakh.
  * Liquid / Ultra Short Duration Funds: Safe alternative to savings bank accounts for emergency funds (6-7% annual yield).

Compounding Example:
A monthly SIP of ₹5,000 for 15 years @ 12% CAGR yields approximately ₹25 Lakhs on a total deposit of ₹9 Lakhs!

How to Start SIP:
1. Complete 2-minute online KYC with PAN and Aadhaar OTP.
2. Link your bank account for auto-debit (NPCI e-Mandate).
3. Portfolio review every 6 months with your PadosiAgent advisor.
`.trim(),
  },
  {
    title: 'Motor & Commercial Vehicle Insurance Protocol',
    type: 'product',
    content: `
Motor Insurance is legally required under the Motor Vehicles Act and protects your car, bike, or commercial vehicle.

Plan Types:
1. Third-Party Only (TP): Covers bodily injury, death, and property damage to third parties (Mandatory by law).
2. Comprehensive Package: Covers third-party liability PLUS own damages from road accidents, fire, theft, vandalism, and floods.

Recommended Add-on Covers:
- Zero Depreciation (Bumper to Bumper): Insurer pays 100% claim without deducting depreciation on plastic, rubber, fiber, or metal parts.
- Engine & Gearbox Protector: Essential in monsoon flood-prone regions; covers hydrostatic engine seizure.
- 24x7 Roadside Assistance (RSA): Free towing, flat tyre change, fuel delivery, and jump-start assistance across Gujarat.
- Return to Invoice (RTI): In total loss or theft, pays the full invoice price of the vehicle including road tax and registration fees.

No Claim Bonus (NCB):
- Range: 20% after year 1 up to 50% discount on renewal premium after 5 claim-free years.
- NCB belongs to the owner, not the car, and can be easily transferred when buying a new car.
`.trim(),
  },
  {
    title: 'Claim Settlement Assistance & Documentation Checklist',
    type: 'guideline',
    content: `
Step-by-step checklist to ensure 100% smooth, expedited insurance claim approvals.

Health Insurance Claim Checklist:
- Duly filled and signed claim form
- Original discharge summary from hospital
- Itemized final hospital bill with breakup and receipt
- Diagnostic investigation reports (Blood test, X-ray, MRI, CT scan)
- Doctor's prescription slips for all outpatient medicines
- KYC documents of the insured member (Aadhaar & PAN)
- Cancelled cheque with printed name for NEFT reimbursement

Motor Insurance Claim Checklist:
- Policy copy and Vehicle Registration Certificate (RC Book)
- Driver's valid Driving License at the time of the incident
- FIR copy (mandatory in case of third-party injury, theft, or major collision)
- Photos of vehicle damage before moving from the accident spot
- Estimated repair bill from authorized workshop

PadosiAgent Claim Desk Commitment:
Our dedicated claim officer is assigned within 15 minutes of intimation to handle all surveyor interactions and insurer paperwork on your behalf.
`.trim(),
  },
];

async function seed() {
  console.log('Seeding Knowledge Base Documents...');
  for (const doc of documents) {
    const payload = JSON.stringify({
      title: doc.title,
      fileType: doc.type,
      type: doc.type,
      content: doc.content,
    });

    await new Promise((resolve, reject) => {
      const req = http.request(
        'http://localhost:2785/api/ai/knowledge',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'x-api-key': API_KEY,
          },
        },
        res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              console.log(`✓ Created: "${doc.title}" [${doc.type}] (Status: ${res.statusCode})`);
              resolve();
            } else {
              console.error(`✗ Failed: "${doc.title}" (Status: ${res.statusCode}): ${data}`);
              resolve(); // continue
            }
          });
        },
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
  console.log('All Knowledge Base Documents successfully processed.');
}

seed().catch(console.error);
