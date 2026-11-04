import { Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import {
  acceptInvitationSchema,
  createOrgSchema,
  inviteMemberSchema,
  updateMemberSchema,
  updateOrgSchema,
  type MembershipDto,
} from '@winou/shared';
import { z } from 'zod';
import {
  ClientIp,
  CurrentOrg,
  CurrentUser,
  RequirePermission,
  UuidParam,
  ZBody,
  ZQuery,
  type AuthUser,
  type OrgContext,
} from '../common/decorators';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { OrgsService } from './orgs.service';

const auditListQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    before: z.coerce.number().int().positive().optional(),
  })
  .strict();

@Controller('orgs')
export class OrgsController {
  constructor(
    private readonly orgs: OrgsService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  mine(@CurrentUser() user: AuthUser): Promise<MembershipDto[]> {
    return this.auth.membershipsOf(user.id);
  }

  @Post()
  create(@ZBody(createOrgSchema) body: z.infer<typeof createOrgSchema>, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.orgs.create(body.name, { userId: user.id, ip });
  }

  @RequirePermission('org.read')
  @Get(':orgId')
  get(@CurrentOrg() org: OrgContext) {
    return this.orgs.get(org.id);
  }

  @RequirePermission('org.update')
  @Patch(':orgId')
  update(
    @CurrentOrg() org: OrgContext,
    @ZBody(updateOrgSchema) body: z.infer<typeof updateOrgSchema>,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.orgs.update(org.id, body, { userId: user.id, ip });
  }

  @RequirePermission('members.read')
  @Get(':orgId/members')
  members(@CurrentOrg() org: OrgContext) {
    return this.orgs.listMembers(org.id);
  }

  @RequirePermission('members.manage')
  @HttpCode(204)
  @Patch(':orgId/members/:userId')
  async updateMember(
    @CurrentOrg() org: OrgContext,
    @UuidParam('userId') userId: string,
    @ZBody(updateMemberSchema) body: z.infer<typeof updateMemberSchema>,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    await this.orgs.updateMemberRole(org.id, userId, body.role, { userId: user.id, ip });
  }

  @RequirePermission('members.manage')
  @HttpCode(204)
  @Delete(':orgId/members/:userId')
  async removeMember(
    @CurrentOrg() org: OrgContext,
    @UuidParam('userId') userId: string,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    await this.orgs.removeMember(org.id, userId, { userId: user.id, ip });
  }

  @RequirePermission('members.read')
  @Get(':orgId/invitations')
  invitations(@CurrentOrg() org: OrgContext) {
    return this.orgs.listInvitations(org.id);
  }

  @RequirePermission('members.manage')
  @Post(':orgId/invitations')
  invite(
    @CurrentOrg() org: OrgContext,
    @ZBody(inviteMemberSchema) body: z.infer<typeof inviteMemberSchema>,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.orgs.invite(org.id, body.email, body.role, { userId: user.id, ip });
  }

  @RequirePermission('members.manage')
  @HttpCode(204)
  @Delete(':orgId/invitations/:invitationId')
  async revoke(
    @CurrentOrg() org: OrgContext,
    @UuidParam('invitationId') invitationId: string,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    await this.orgs.revokeInvitation(org.id, invitationId, { userId: user.id, ip });
  }

  @RequirePermission('audit.read')
  @Get(':orgId/audit-log')
  auditLog(@CurrentOrg() org: OrgContext, @ZQuery(auditListQuery) q: z.infer<typeof auditListQuery>) {
    return this.audit.list(org.id, { limit: q.limit, before: q.before });
  }
}

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly orgs: OrgsService) {}

  @HttpCode(200)
  @Post('accept')
  accept(
    @ZBody(acceptInvitationSchema) body: z.infer<typeof acceptInvitationSchema>,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.orgs.acceptInvitation(body.token, user, ip);
  }
}
