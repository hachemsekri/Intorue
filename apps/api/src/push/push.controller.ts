import { Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { LOCALES } from '@winou/shared';
import { z } from 'zod';
import { CurrentOrg, CurrentUser, RequirePermission, ZBody, type AuthUser, type OrgContext } from '../common/decorators';
import { isExpoPushToken, PushService } from './push.service';

const tokenSchema = z
  .object({
    token: z.string().max(200).refine(isExpoPushToken, 'push.token_invalid'),
    platform: z.enum(['ios', 'android']),
    locale: z.enum(LOCALES).default('fr'),
  })
  .strict();
const removeSchema = z.object({ token: z.string().max(200) }).strict();
const prefsSchema = z.object({ enabled: z.boolean(), urgentOnly: z.boolean() }).strict();

@Controller('me/push-tokens')
export class PushTokensController {
  constructor(private readonly push: PushService) {}

  /** The mobile app registers its Expo push token after sign-in. */
  @HttpCode(204)
  @Post()
  async register(@CurrentUser() user: AuthUser, @ZBody(tokenSchema) body: z.infer<typeof tokenSchema>) {
    await this.push.register(user.id, body.token, body.platform, body.locale);
  }

  /** Called on sign-out, so the phone stops receiving this account's alerts. */
  @HttpCode(204)
  @Post('remove')
  async remove(@CurrentUser() user: AuthUser, @ZBody(removeSchema) body: z.infer<typeof removeSchema>) {
    await this.push.unregister(user.id, body.token);
  }
}

@Controller('orgs/:orgId/push-preferences')
export class PushPreferencesController {
  constructor(private readonly push: PushService) {}

  @RequirePermission('alerts.read')
  @Get()
  get(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.push.preferences(user.id, org.id);
  }

  @RequirePermission('alerts.read')
  @Put()
  set(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @ZBody(prefsSchema) body: z.infer<typeof prefsSchema>) {
    return this.push.setPreferences(user.id, org.id, body);
  }
}
