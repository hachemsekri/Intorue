import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentOrg, CurrentUser, RequirePermission, type AuthUser, type OrgContext } from '../common/decorators';
import { LiveService } from './live.service';
import { LiveTickets } from './live.socket';

@Controller('orgs/:orgId/live')
export class LiveController {
  constructor(
    private readonly live: LiveService,
    private readonly tickets: LiveTickets,
  ) {}

  /** Snapshot for the live map. Updates then arrive over the WebSocket. */
  @RequirePermission('vehicles.read')
  @Get()
  snapshot(@CurrentOrg() org: OrgContext) {
    return this.live.snapshot(org.id);
  }

  /**
   * Short-lived, single-use ticket to open the live WebSocket. The browser sends it as the
   * first message (never in the URL), so cookies are not needed on the socket.
   */
  @RequirePermission('vehicles.read')
  @HttpCode(200)
  @Post('ticket')
  ticket(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.tickets.issue(user.id, org.id);
  }
}
