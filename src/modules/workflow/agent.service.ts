import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Agent } from './entities/agent.entity';

export interface AgentMatchCriteria {
  pincode: string;
  mainService: string; // 'insurance' | 'mutual_fund'
  selectedService?: string; // 'buy_new' | 'claim_support' | 'sip' etc.
  productCategory?: string; // 'health_insurance' | 'life_insurance' etc.
  subProduct?: string;
  limit?: number;
}

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @InjectRepository(Agent, 'data')
    private readonly agentRepo: Repository<Agent>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedDefaultAgentsIfEmpty();
    } catch (err) {
      this.logger.warn(`Agent seeding skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async seedDefaultAgentsIfEmpty(): Promise<void> {
    const count = await this.agentRepo.count();
    if (count > 0) return;

    const defaultAgents: Partial<Agent>[] = [
      {
        businessId: 'default',
        name: 'Rajesh Sharma (IRDAI & AMFI Certified)',
        phone: '919876501001',
        email: 'rajesh.sharma@artha-advisor.com',
        rating: 4.9,
        experienceYears: 12,
        serviceArea: 'Gujarat & Western Region',
        pincodes: ['380*', '382*', '390*', '395*', '360*'], // Ahmedabad, Gandhinagar, Vadodara, Surat, Rajkot
        supportedProducts: ['life_insurance', 'health_insurance', 'motor_insurance', 'sme_insurance', 'mutual_fund', 'sip', 'claim_support', 'audit'],
        supportedCompanies: ['HDFC Life', 'Star Health', 'ICICI Lombard', 'SBI Mutual Fund', 'Nippon India'],
        description: 'Specialist in Comprehensive Health, Term Life, and Long-Term SIP Wealth Creation.',
        isActive: true,
        leadCapacity: 100,
        currentLeadsCount: 14,
        callLink: 'tel:+919876501001',
        whatsappLink: 'https://wa.me/919876501001?text=Hi%20Rajesh,%20I%20got%20your%20profile%20from%20the%20Insurance%20Desk',
      },
      {
        businessId: 'default',
        name: 'Priya Patel (Claims & Portfolio Specialist)',
        phone: '919876501002',
        email: 'priya.patel@artha-advisor.com',
        rating: 4.95,
        experienceYears: 9,
        serviceArea: 'Ahmedabad & North Gujarat',
        pincodes: ['380001', '380009', '380015', '380054', '380*'],
        supportedProducts: ['claim_support', 'health_insurance', 'life_insurance', 'mutual_fund', 'elss', 'stp', 'audit'],
        supportedCompanies: ['Star Health', 'Care Health', 'HDFC ERGO', 'Tata AIA', 'ICICI Prudential'],
        description: 'Expert in Insurance Claim Rejections, Short-Settlement dispute resolution, and Tax-Saving ELSS.',
        isActive: true,
        leadCapacity: 80,
        currentLeadsCount: 19,
        callLink: 'tel:+919876501002',
        whatsappLink: 'https://wa.me/919876501002?text=Hi%20Priya,%20I%20need%20help%20with%20an%20Insurance%20Claim%20or%20Portfolio',
      },
      {
        businessId: 'default',
        name: 'Amitabh Joshi (Corporate & SME Specialist)',
        phone: '919876501003',
        email: 'amitabh.joshi@artha-advisor.com',
        rating: 4.85,
        experienceYears: 15,
        serviceArea: 'Mumbai & Western Maharashtra',
        pincodes: ['400*', '401*', '411*'], // Mumbai & Pune
        supportedProducts: ['motor_insurance', 'sme_insurance', 'health_insurance', 'bonds', 'nps', 'aif_pms'],
        supportedCompanies: ['Bajaj Allianz', 'New India Assurance', 'ICICI Lombard', 'HDFC AMC'],
        description: 'Corporate Risk Advisory, Commercial Fleet Coverage, High-Yield Corporate Bonds & PMS.',
        isActive: true,
        leadCapacity: 120,
        currentLeadsCount: 22,
        callLink: 'tel:+919876501003',
        whatsappLink: 'https://wa.me/919876501003?text=Hi%20Amitabh,%20connecting%20regarding%20Business%20Insurance%20and%20Investments',
      },
      {
        businessId: 'default',
        name: 'Artha Advisory Desk (Certified Pan-India Desk)',
        phone: '919227102108',
        email: 'support@artha-advisor.com',
        rating: 5.0,
        experienceYears: 18,
        serviceArea: 'Pan-India Priority Support',
        pincodes: ['*'], // All India fallback
        supportedProducts: ['life_insurance', 'health_insurance', 'motor_insurance', 'sme_insurance', 'mutual_fund', 'sip', 'stp', 'swp', 'lumpsum', 'elss', 'bonds', 'nps', 'aif_pms', 'claim_support', 'audit'],
        supportedCompanies: ['All Top 25 Life, Health & General Insurers', 'All Top 20 AMCs'],
        description: 'Verified Direct Desk for instant quotes, policy renewals, claim assistance, and mutual fund onboarding.',
        isActive: true,
        leadCapacity: 500,
        currentLeadsCount: 45,
        callLink: 'tel:+919227102108',
        whatsappLink: 'https://wa.me/919227102108?text=Hi%20Advisor,%20I%20need%20assistance%20with%20Insurance%20and%20Mutual%20Funds',
      },
    ];

    await this.agentRepo.save(this.agentRepo.create(defaultAgents));
    this.logger.log(`Seeded ${defaultAgents.length} default insurance & mutual fund advisory agents`);
  }

  async fetchLivePadosiAgents(pincode: string, limit = 3): Promise<Agent[]> {
    try {
      const cleanPin = (pincode || '').trim().replace(/[^0-9]/g, '');
      const url = cleanPin
        ? `https://padosiagent.com/api/v1/find-agents?pincode=${encodeURIComponent(cleanPin)}&page_size=${limit}`
        : `https://padosiagent.com/api/v1/find-agents?page_size=${limit}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'OpenWA-Artha-Workflow/1.0',
        },
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        this.logger.warn(`PadosiAgent API returned HTTP ${res.status}: ${res.statusText}`);
        return [];
      }

      const data = (await res.json()) as any;
      if (!data.success || !Array.isArray(data.agents) || data.agents.length === 0) {
        this.logger.warn(`PadosiAgent API returned 0 agents for pincode: ${cleanPin || 'general'}`);
        return [];
      }

      const agents: Agent[] = [];
      for (const raw of data.agents.slice(0, limit)) {
        const rawPhone = String(raw.whatsapp_digits || raw.mobile || '').replace(/[^0-9]/g, '');
        const phone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
        const name = raw.display_name || raw.fullname || 'Certified Advisor';
        const rating = Number(raw.average_rating || 5.0);
        const exp = Number(raw.experience_years || 5);
        const profession = raw.profession || 'Insurance & Investment Consultant';
        const city = raw.agent_city_display || 'Gujarat & Pan-India';

        const extraInfo: string[] = [];
        if (raw.review_count) extraInfo.push(`${raw.review_count} reviews`);
        if (raw.formatted_client_base) extraInfo.push(`${raw.formatted_client_base}+ Clients`);
        if (raw.formatted_claims_amount) extraInfo.push(`Claims: ${raw.formatted_claims_amount}`);
        const extraText = extraInfo.length > 0 ? ` (${extraInfo.join(' | ')})` : '';

        const profileUrl = raw.agent_slug ? `https://padosiagent.com/agent/${raw.agent_slug}` : '';

        const agent = new Agent();
        agent.id = randomUUID();
        agent.businessId = 'default';
        agent.name = `${name} (${profession})`;
        agent.phone = phone;
        agent.email = raw.email || null;
        agent.profileImage = raw.profile_photo_url ? `https://padosiagent.com${raw.profile_photo_url}` : null;
        agent.rating = rating;
        agent.experienceYears = exp;
        agent.serviceArea = `${city}${extraText}`;
        agent.pincodes = cleanPin ? [cleanPin, '*'] : ['*'];
        agent.supportedProducts = raw.insurance_segments || ['life_insurance', 'health_insurance'];
        agent.supportedCompanies = ['PadosiAgent Verified Network'];
        agent.description = `Verified ${profession} on PadosiAgent${profileUrl ? ` • Profile: ${profileUrl}` : ''}`;
        agent.isActive = true;
        agent.callLink = phone ? `tel:+${phone}` : null;
        agent.whatsappLink = phone
          ? `https://wa.me/${phone}?text=${encodeURIComponent(`Hi ${name}, I found your verified advisor profile on PadosiAgent.`)}`
          : null;

        agent.createdAt = new Date();
        agent.updatedAt = new Date();

        agents.push(agent);
      }

      // Upsert into local database for seamless lead referencing
      for (const a of agents) {
        try {
          const existing = await this.agentRepo.findOne({
            where: [{ phone: a.phone }, { name: a.name }],
          });
          if (existing) {
            a.id = existing.id;
            a.createdAt = existing.createdAt || new Date();
          }
          a.updatedAt = new Date();
          await this.agentRepo.save(a);
        } catch (dbErr) {
          this.logger.debug(`Could not cache agent to DB: ${dbErr}`);
        }
      }

      return agents;
    } catch (err: any) {
      this.logger.warn(`Failed to fetch from PadosiAgent API: ${err?.message || err}`);
      return [];
    }
  }

  async findMatchingAgents(businessId: string, criteria: AgentMatchCriteria): Promise<Agent[]> {
    const cleanPin = (criteria.pincode || '').trim().replace(/[^0-9]/g, '');

    // 1. First fetch live advisors directly from PadosiAgent API
    try {
      const liveAgents = await this.fetchLivePadosiAgents(cleanPin, criteria.limit || 3);
      if (liveAgents.length > 0) {
        this.logger.log(`Fetched ${liveAgents.length} live advisors from PadosiAgent API for pincode ${cleanPin || 'all'}`);
        return liveAgents;
      }
    } catch (apiErr) {
      this.logger.warn(`PadosiAgent live API fetch error: ${apiErr}`);
    }

    // 2. Fallback to Local DB agents if API returns no results or network is down
    const pinPrefix3 = cleanPin.slice(0, 3) + '*';
    const pinPrefix2 = cleanPin.slice(0, 2) + '*';

    const allAgents = await this.agentRepo.find({
      where: [{ businessId, isActive: true }, { businessId: 'default', isActive: true }],
      order: { rating: 'DESC', currentLeadsCount: 'ASC' },
    });

    if (allAgents.length === 0) {
      return [];
    }

    const targetProduct = criteria.productCategory || criteria.selectedService || criteria.mainService;

    // Filter agents matching pincode and product expertise
    const matched = allAgents.filter(agent => {
      // 1. Pincode match
      const coversPin =
        agent.pincodes.includes('*') ||
        agent.pincodes.includes(cleanPin) ||
        agent.pincodes.includes(pinPrefix3) ||
        agent.pincodes.includes(pinPrefix2);

      if (!coversPin) return false;

      // 2. Product match
      if (!targetProduct) return true;
      const normTarget = targetProduct.toLowerCase();
      const hasProduct =
        agent.supportedProducts.includes('*') ||
        agent.supportedProducts.some(p => normTarget.includes(p.toLowerCase()) || p.toLowerCase().includes(normTarget));

      return hasProduct;
    });

    // Fallback: If no local match, return Pan-India fallback agents
    if (matched.length === 0) {
      const fallback = allAgents.filter(a => a.pincodes.includes('*'));
      return fallback.slice(0, criteria.limit || 3);
    }

    return matched.slice(0, criteria.limit || 3);
  }

  formatSingleAgentCard(agent: Agent, index: number, total: number, customerPincode: string): string {
    const lines: string[] = [];
    const stars = '⭐'.repeat(Math.min(5, Math.max(1, Math.round(agent.rating))));

    lines.push(`╭───────────────────────────────╮`);
    lines.push(`│   🛡️ *VERIFIED ADVISOR #${index} OF ${total}*`);
    lines.push(`╰───────────────────────────────╯`);
    lines.push(`👤 *Name:* ${agent.name}`);
    lines.push(`⭐ *Rating:* ${agent.rating.toFixed(1)} / 5.0 ${stars}`);
    lines.push(`💼 *Experience:* ${agent.experienceYears}+ Years Verified`);
    lines.push(`🏢 *Service Area:* ${agent.serviceArea}`);
    if (agent.description) {
      lines.push(`📋 *Details:* ${agent.description}`);
    }
    lines.push(``);
    lines.push(`───── 📲 *DIRECT CONTACT OPTIONS* ─────`);
    if (agent.callLink) {
      lines.push(`📞 *Call Now:* ${agent.callLink}`);
    }
    if (agent.whatsappLink) {
      lines.push(`💬 *Chat on WhatsApp:*`);
      lines.push(`${agent.whatsappLink}`);
    }
    lines.push(`───────────────────────────────────────`);

    return lines.join('\n');
  }

  formatIndividualAgentCards(agents: Agent[], customerPincode: string): string[] {
    return agents.map((agent, idx) =>
      this.formatSingleAgentCard(agent, idx + 1, agents.length, customerPincode),
    );
  }

  formatAgentProfilesMessage(agents: Agent[], customerPincode: string): string {
    if (!agents || agents.length === 0) {
      return (
        `📍 We have recorded your pincode (*${customerPincode}*).\n\n` +
        `Our Senior Financial Advisory Desk has been assigned to your request and will connect with you shortly.\n\n` +
        `📞 Direct Helpline: +91 92271 02108\n` +
        `💬 WhatsApp Support: https://wa.me/919227102108`
      );
    }

    const lines: string[] = [];
    lines.push(`✅ *Found ${agents.length} Verified Advisor(s) serving Pincode ${customerPincode} (via PadosiAgent):*\n`);

    agents.forEach((agent, idx) => {
      lines.push(`*${idx + 1}. ${agent.name}* ⭐ ${agent.rating.toFixed(1)}/5`);
      lines.push(`🏢 *Service Area:* ${agent.serviceArea} (${agent.experienceYears}+ yrs exp)`);
      if (agent.description) {
        lines.push(`📋 *Details:* ${agent.description}`);
      }
      if (agent.callLink) {
        lines.push(`📞 *Call Now:* ${agent.callLink}`);
      }
      if (agent.whatsappLink) {
        lines.push(`💬 *Chat on WhatsApp:* ${agent.whatsappLink}`);
      }
      lines.push('');
    });

    lines.push(`👉 Tap on any advisor's Call or WhatsApp link above to connect directly.`);
    return lines.join('\n');
  }

  async listAgents(businessId?: string): Promise<Agent[]> {
    return this.agentRepo.find({
      where: businessId ? [{ businessId }, { businessId: 'default' }] : {},
      order: { rating: 'DESC' },
    });
  }
}
