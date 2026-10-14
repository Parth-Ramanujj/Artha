const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');
const db = new Database('data/openwa.sqlite');

db.exec(`
  CREATE TABLE IF NOT EXISTS workflow_agents (
    id varchar(36) PRIMARY KEY NOT NULL,
    businessId varchar(36) NOT NULL,
    name varchar(150) NOT NULL,
    phone varchar(30) NOT NULL,
    email varchar(150),
    profileImage varchar(500),
    rating real NOT NULL DEFAULT 4.8,
    experienceYears integer NOT NULL DEFAULT 5,
    serviceArea varchar(200) NOT NULL DEFAULT 'Pan-India',
    pincodes text NOT NULL,
    supportedProducts text NOT NULL,
    supportedCompanies text,
    description text,
    isActive integer NOT NULL DEFAULT 1,
    leadCapacity integer NOT NULL DEFAULT 50,
    currentLeadsCount integer NOT NULL DEFAULT 0,
    callLink varchar(255),
    whatsappLink varchar(255),
    createdAt text NOT NULL DEFAULT (datetime('now')),
    updatedAt text NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS IDX_workflow_agents_business_active ON workflow_agents (businessId, isActive);
  CREATE INDEX IF NOT EXISTS IDX_workflow_agents_businessId ON workflow_agents (businessId);

  CREATE TABLE IF NOT EXISTS workflow_leads (
    id varchar(36) PRIMARY KEY NOT NULL,
    leadNumber varchar(50) NOT NULL UNIQUE,
    businessId varchar(36) NOT NULL,
    sessionId varchar(36),
    chatId varchar(100) NOT NULL,
    customerPhone varchar(30) NOT NULL,
    customerName varchar(200),
    mainService varchar(50) NOT NULL,
    selectedService varchar(100) NOT NULL,
    productCategory varchar(100),
    subProduct varchar(150),
    claimIssueType varchar(100),
    insuranceCompany varchar(200),
    issueDescription text,
    pincode varchar(10) NOT NULL,
    city varchar(100),
    state varchar(100),
    matchedAgentId varchar(36),
    matchedAgentName varchar(150),
    matchedAgentPhone varchar(30),
    status varchar(30) NOT NULL DEFAULT 'new',
    customData text,
    createdAt text NOT NULL DEFAULT (datetime('now')),
    updatedAt text NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS IDX_workflow_leads_business_chat ON workflow_leads (businessId, chatId);
  CREATE INDEX IF NOT EXISTS IDX_workflow_leads_business_status ON workflow_leads (businessId, status);
  CREATE INDEX IF NOT EXISTS IDX_workflow_leads_business_pincode ON workflow_leads (businessId, pincode);
  CREATE INDEX IF NOT EXISTS IDX_workflow_leads_businessId ON workflow_leads (businessId);
  CREATE INDEX IF NOT EXISTS IDX_workflow_leads_sessionId ON workflow_leads (sessionId);
`);

console.log('Tables created successfully.');

// Seed default agents if none exist
const count = db.prepare('SELECT count(*) as count FROM workflow_agents').get().count;
console.log('Current agents count:', count);

if (count === 0) {
  const defaultAgents = [
    {
      id: randomUUID(),
      businessId: '3649c6b9-45b4-4b22-8025-2a968921ca07',
      name: 'Rajesh Sharma (IRDAI & AMFI Certified)',
      phone: '919876501001',
      email: 'rajesh.sharma@artha-advisor.com',
      rating: 4.9,
      experienceYears: 12,
      serviceArea: 'Gujarat & Western Region',
      pincodes: JSON.stringify(['380*', '382*', '384*', '390*', '395*', '360*']),
      supportedProducts: JSON.stringify(['life_insurance', 'health_insurance', 'motor_insurance', 'sme_insurance', 'mutual_fund', 'sip', 'claim_support', 'audit']),
      supportedCompanies: JSON.stringify(['HDFC Life', 'Star Health', 'ICICI Lombard', 'SBI Mutual Fund', 'Nippon India']),
      description: 'Specialist in Comprehensive Health, Term Life, and Long-Term SIP Wealth Creation.',
      isActive: 1,
      leadCapacity: 100,
      currentLeadsCount: 14,
      callLink: 'tel:+919876501001',
      whatsappLink: 'https://wa.me/919876501001?text=Hi%20Rajesh,%20I%20got%20your%20profile%20from%20the%20Insurance%20Desk'
    },
    {
      id: randomUUID(),
      businessId: '3649c6b9-45b4-4b22-8025-2a968921ca07',
      name: 'Priya Patel (Claims & Portfolio Specialist)',
      phone: '919876501002',
      email: 'priya.patel@artha-advisor.com',
      rating: 4.95,
      experienceYears: 9,
      serviceArea: 'Ahmedabad & North Gujarat',
      pincodes: JSON.stringify(['380015', '380054', '380058', '380001', '384*', '382*']),
      supportedProducts: JSON.stringify(['claim_support', 'audit', 'health_insurance', 'life_insurance', 'mutual_fund']),
      supportedCompanies: JSON.stringify(['Care Health', 'Niva Bupa', 'Tata AIA', 'HDFC AMC']),
      description: 'Expert in Claim Ombudsman Appeals, Policy Health Checkup, and Medical Claims.',
      isActive: 1,
      leadCapacity: 80,
      currentLeadsCount: 22,
      callLink: 'tel:+919876501002',
      whatsappLink: 'https://wa.me/919876501002?text=Hi%20Priya,%20I%20need%20urgent%20Claim%20Support'
    },
    {
      id: randomUUID(),
      businessId: '3649c6b9-45b4-4b22-8025-2a968921ca07',
      name: 'Artha Desk (Senior Advisory Concierge)',
      phone: '919876501000',
      email: 'desk@artha-advisor.com',
      rating: 5.0,
      experienceYears: 15,
      serviceArea: 'Pan-India Certified Advisory',
      pincodes: JSON.stringify(['*']),
      supportedProducts: JSON.stringify(['life_insurance', 'health_insurance', 'motor_insurance', 'mutual_fund', 'claim_support', 'audit']),
      supportedCompanies: JSON.stringify(['All Regulated IRDAI & AMFI Entities']),
      description: 'Dedicated Central Desk for Multi-Insurer comparisons, audit, and senior consultant assignment.',
      isActive: 1,
      leadCapacity: 500,
      currentLeadsCount: 5,
      callLink: 'tel:+919876501000',
      whatsappLink: 'https://wa.me/919876501000?text=Hi%20Artha%20Desk,%20please%20connect%20me%20to%20an%20advisor'
    }
  ];

  const insert = db.prepare(`
    INSERT INTO workflow_agents (
      id, businessId, name, phone, email, rating, experienceYears, serviceArea,
      pincodes, supportedProducts, supportedCompanies, description, isActive,
      leadCapacity, currentLeadsCount, callLink, whatsappLink
    ) VALUES (
      @id, @businessId, @name, @phone, @email, @rating, @experienceYears, @serviceArea,
      @pincodes, @supportedProducts, @supportedCompanies, @description, @isActive,
      @leadCapacity, @currentLeadsCount, @callLink, @whatsappLink
    )
  `);

  for (const a of defaultAgents) {
    insert.run(a);
  }
  console.log('Seeded 3 default advisors successfully!');
}
