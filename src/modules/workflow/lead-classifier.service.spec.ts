import { LeadClassifierService, classifyByRules, parseAiClassification } from './lead-classifier.service';
import { LeadClassifiedBy, LeadInterest, LeadTemperature } from './entities/lead.entity';

describe('classifyByRules', () => {
  it.each([
    ['Hi', LeadTemperature.COLD, LeadInterest.GENERAL],
    ['hello 👋', LeadTemperature.COLD, LeadInterest.GENERAL],
    ['કેમ છો', LeadTemperature.COLD, LeadInterest.GENERAL],
    ['', LeadTemperature.COLD, LeadInterest.GENERAL],
    ['I want to buy term insurance, what is the price?', LeadTemperature.HOT, LeadInterest.INSURANCE],
    ['mare health policy levi che jaldi', LeadTemperature.HOT, LeadInterest.INSURANCE],
    ['SIP ma ketla rupiya thi start thay?', LeadTemperature.HOT, LeadInterest.MUTUAL_FUND],
    ['मुझे बीमा चाहिए', LeadTemperature.HOT, LeadInterest.INSURANCE],
    ['Tell me about mutual fund options', LeadTemperature.WARM, LeadInterest.MUTUAL_FUND],
    ['my claim was rejected', LeadTemperature.WARM, LeadInterest.CLAIM_SUPPORT],
    ['વીમા વિશે માહિતી આપો', LeadTemperature.WARM, LeadInterest.INSURANCE],
    ['mare navi car leni che', LeadTemperature.HOT, LeadInterest.GENERAL],
    ['ok thanks', LeadTemperature.COLD, LeadInterest.GENERAL],
  ])('%j → %s / %s', (message, temperature, interest) => {
    expect(classifyByRules(message)).toMatchObject({ temperature, interest, classifiedBy: LeadClassifiedBy.RULES });
  });
});

describe('parseAiClassification', () => {
  it('reads JSON even with text around it', () => {
    expect(
      parseAiClassification('Sure: {"temperature":"hot","interest":"mutual_fund","reason":"Wants to start SIP"}'),
    ).toEqual({
      temperature: LeadTemperature.HOT,
      interest: LeadInterest.MUTUAL_FUND,
      classifiedBy: LeadClassifiedBy.AI,
      reason: 'Wants to start SIP',
    });
  });

  it.each([
    ['not json'],
    ['{"temperature":"boiling","interest":"insurance"}'],
    ['{"temperature":"hot","interest":"crypto"}'],
    ['{broken'],
  ])('rejects %j', content => {
    expect(parseAiClassification(content)).toBeNull();
  });
});

describe('LeadClassifierService', () => {
  const complete = jest.fn();
  const service = new LeadClassifierService({ complete } as never);

  beforeEach(() => complete.mockReset());

  it('uses the AI answer when it is valid', async () => {
    complete.mockResolvedValue({ content: '{"temperature":"warm","interest":"claim_support","reason":"Claim delay"}' });
    await expect(service.classify('mara claim nu shu thayu?')).resolves.toMatchObject({
      temperature: LeadTemperature.WARM,
      interest: LeadInterest.CLAIM_SUPPORT,
      classifiedBy: LeadClassifiedBy.AI,
    });
    expect(complete).toHaveBeenCalledWith(
      expect.arrayContaining([{ role: 'user', content: 'mara claim nu shu thayu?' }]),
      expect.objectContaining({ temperature: 0 }),
    );
  });

  it('falls back to keyword rules when the AI call fails', async () => {
    complete.mockRejectedValue(new Error('Groq HTTP 413'));
    await expect(service.classify('I want to buy health insurance')).resolves.toMatchObject({
      temperature: LeadTemperature.HOT,
      interest: LeadInterest.INSURANCE,
      classifiedBy: LeadClassifiedBy.RULES,
    });
  });

  it('falls back to keyword rules when the AI answer is unusable', async () => {
    complete.mockResolvedValue({ content: 'I think this is a hot lead' });
    await expect(service.classify('Tell me about SIP')).resolves.toMatchObject({
      classifiedBy: LeadClassifiedBy.RULES,
      interest: LeadInterest.MUTUAL_FUND,
    });
  });

  it('does not spend an AI call on a bare greeting', async () => {
    await expect(service.classify('Hi')).resolves.toMatchObject({ temperature: LeadTemperature.COLD });
    expect(complete).not.toHaveBeenCalled();
  });
});
