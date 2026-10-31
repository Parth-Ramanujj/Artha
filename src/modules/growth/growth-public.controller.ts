import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/auth.decorators';
import { GrowthService } from './growth.service';
import { widgetScript } from './growth-rules';

const REF_RE = /^[a-f0-9]{8}$/;

/** Unauthenticated click-to-chat endpoints: QR / link redirect and the website widget script. */
@ApiTags('growth')
@Controller('g')
export class GrowthPublicController {
  constructor(private readonly growth: GrowthService) {}

  @Public()
  @Get(':ref/widget.js')
  async widget(@Param('ref') ref: string, @Res() res: Response) {
    if (!REF_RE.test(ref) || !(await this.growth.findLinkByRef(ref))) throw new NotFoundException();
    const href = `${res.req.protocol}://${res.req.get('host')}/api/g/${ref}`;
    res
      .type('application/javascript')
      .set('Cache-Control', 'public, max-age=300')
      .send(widgetScript(href, 'Chat with us on WhatsApp'));
  }

  @Public()
  @Get(':ref')
  async redirect(@Param('ref') ref: string, @Res() res: Response) {
    // The target is built from the stored link only, never from the request: no open redirect.
    const target = REF_RE.test(ref) ? await this.growth.scan(ref) : null;
    if (!target) throw new NotFoundException();
    res.set('Cache-Control', 'no-store').redirect(302, target);
  }
}
