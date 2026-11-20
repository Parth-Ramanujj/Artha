import { BadRequestException } from '@nestjs/common';
import type { CreateMetaTemplateDto } from './dto/message-studio.dto';

/** Variable names in order of first appearance: "1", "2" … or "first_name" … */
export function templateVariableNames(text: string, format: 'POSITIONAL' | 'NAMED' = 'POSITIONAL'): string[] {
  const re = format === 'NAMED' ? /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g : /\{\{\s*(\d+)\s*\}\}/g;
  return [...new Set([...text.matchAll(re)].map(m => m[1]))];
}

const bad = (msg: string) => new BadRequestException(msg);

/**
 * Turns the template builder form into the payload Meta's message_templates endpoint expects.
 * `mediaHandle` is the resumable-upload handle of the header sample (image/video/document headers).
 */
export function buildMetaTemplatePayload(dto: CreateMetaTemplateDto, mediaHandle?: string): Record<string, unknown> {
  const format = dto.parameterFormat ?? 'POSITIONAL';
  const named = format === 'NAMED';
  const headerFormat = dto.headerFormat ?? (dto.headerMedia ? 'IMAGE' : dto.headerText?.trim() ? 'TEXT' : 'NONE');

  const vars = templateVariableNames(dto.body, format);
  const otherSyntax = templateVariableNames(dto.body, named ? 'POSITIONAL' : 'NAMED');
  if (otherSyntax.length) {
    throw bad(named ? 'Use names like {{first_name}}, not numbers.' : 'Use numbers like {{1}}, not names.');
  }
  if (!named && vars.some((v, i) => v !== String(i + 1))) {
    throw bad('Number the variables in order: {{1}}, {{2}}, {{3}} …');
  }
  const examples = dto.bodyExamples ?? [];
  if (examples.length !== vars.length) {
    throw bad(`The body has ${vars.length} variable(s) but ${examples.length} sample value(s); Meta needs one each.`);
  }

  const components: Array<Record<string, unknown>> = [];
  if (headerFormat === 'TEXT') {
    const text = dto.headerText?.trim() ?? '';
    if (!text) throw bad('Write the header text.');
    const headerVars = templateVariableNames(text, format);
    if (headerVars.length > 1) throw bad('The header can hold only one variable.');
    const header: Record<string, unknown> = { type: 'HEADER', format: 'TEXT', text };
    if (headerVars.length) {
      if (!dto.headerExample?.trim()) throw bad('Give a sample value for the header variable.');
      header.example = named
        ? { header_text_named_params: [{ param_name: headerVars[0], example: dto.headerExample.trim() }] }
        : { header_text: [dto.headerExample.trim()] };
    }
    components.push(header);
  } else if (headerFormat === 'LOCATION') {
    components.push({ type: 'HEADER', format: 'LOCATION' });
  } else if (headerFormat !== 'NONE') {
    if (!mediaHandle) throw bad(`Choose a sample ${headerFormat.toLowerCase()} for the header.`);
    components.push({ type: 'HEADER', format: headerFormat, example: { header_handle: [mediaHandle] } });
  }

  components.push({
    type: 'BODY',
    text: dto.body,
    ...(vars.length
      ? {
          example: named
            ? { body_text_named_params: vars.map((v, i) => ({ param_name: v, example: examples[i] })) }
            : { body_text: [examples] },
        }
      : {}),
  });
  if (dto.footer?.trim()) components.push({ type: 'FOOTER', text: dto.footer.trim() });

  const buttons = dto.buttons ?? [];
  const count = (t: string) => buttons.filter(b => b.type === t).length;
  if (count('URL') > 2) throw bad('At most 2 website buttons.');
  if (count('PHONE_NUMBER') > 1) throw bad('At most 1 call button.');
  if (count('COPY_CODE') > 1) throw bad('At most 1 copy-code button.');
  if (count('FLOW') > 1) throw bad('At most 1 form button.');
  if (buttons.length) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.map(b => {
        switch (b.type) {
          case 'URL':
            return { type: 'URL', text: b.text, url: b.url };
          case 'PHONE_NUMBER':
            return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone };
          case 'COPY_CODE':
            return { type: 'COPY_CODE', example: b.code };
          case 'FLOW':
            return {
              type: 'FLOW',
              text: b.text,
              flow_id: b.flowId,
              flow_action: 'navigate',
              ...(b.flowScreen ? { navigate_screen: b.flowScreen } : {}),
            };
          case 'VOICE_CALL':
            return { type: 'VOICE_CALL', text: b.text };
          default:
            return { type: 'QUICK_REPLY', text: b.text };
        }
      }),
    });
  }

  return {
    name: dto.name,
    language: dto.language,
    category: dto.category,
    ...(named ? { parameter_format: 'NAMED' } : {}),
    // Meta only honours a custom validity period on Utility (and authentication) templates.
    ...(dto.ttlSeconds && dto.category === 'UTILITY' ? { message_send_ttl_seconds: dto.ttlSeconds } : {}),
    components,
  };
}
