import { Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import {
  createAlertRuleSchema,
  createGeofenceSchema,
  handleAlertSchema,
  listAlertsQuery,
  tripsQuery,
  updateAlertRuleSchema,
  updateGeofenceSchema,
  type CreateAlertRuleInput,
} from '@winou/shared';
import type { z } from 'zod';
import { ClientIp, CurrentOrg, CurrentUser, RequirePermission, UuidParam, ZBody, ZQuery, type AuthUser, type OrgContext } from '../common/decorators';
import { GeofencesService } from '../geofences/geofences.service';
import { TripsService } from '../trips/trips.service';
import { AlertsService } from './alerts.service';

@Controller('orgs/:orgId/alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @RequirePermission('alerts.read')
  @Get()
  list(@CurrentOrg() org: OrgContext, @ZQuery(listAlertsQuery) q: z.infer<typeof listAlertsQuery>) {
    return this.alerts.list(org.id, q);
  }

  @RequirePermission('alerts.read')
  @Get('count')
  count(@CurrentOrg() org: OrgContext) {
    return this.alerts.openCount(org.id);
  }

  @RequirePermission('alerts.handle')
  @HttpCode(200)
  @Post(':id/handle')
  handle(
    @CurrentOrg() org: OrgContext,
    @UuidParam('id') id: string,
    @ZBody(handleAlertSchema) body: z.infer<typeof handleAlertSchema>,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.alerts.handle(org.id, id, body.note, { userId: user.id, ip });
  }

  @RequirePermission('alerts.handle')
  @HttpCode(200)
  @Post(':id/reopen')
  reopen(@CurrentOrg() org: OrgContext, @UuidParam('id') id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.alerts.reopen(org.id, id, { userId: user.id, ip });
  }
}

@Controller('orgs/:orgId/alert-rules')
export class AlertRulesController {
  constructor(private readonly alerts: AlertsService) {}

  @RequirePermission('alerts.read')
  @Get()
  list(@CurrentOrg() org: OrgContext) {
    return this.alerts.listRules(org.id);
  }

  @RequirePermission('alerts.configure')
  @Post()
  create(@CurrentOrg() org: OrgContext, @ZBody(createAlertRuleSchema) body: CreateAlertRuleInput, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.alerts.createRule(org.id, body, { userId: user.id, ip });
  }

  @RequirePermission('alerts.configure')
  @Patch(':id')
  update(
    @CurrentOrg() org: OrgContext,
    @UuidParam('id') id: string,
    @ZBody(updateAlertRuleSchema) body: z.infer<typeof updateAlertRuleSchema>,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.alerts.updateRule(org.id, id, body, { userId: user.id, ip });
  }

  @RequirePermission('alerts.configure')
  @HttpCode(204)
  @Delete(':id')
  async remove(@CurrentOrg() org: OrgContext, @UuidParam('id') id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    await this.alerts.deleteRule(org.id, id, { userId: user.id, ip });
  }
}

@Controller('orgs/:orgId/zones')
export class ZonesController {
  constructor(private readonly zones: GeofencesService) {}

  @RequirePermission('alerts.read')
  @Get()
  list(@CurrentOrg() org: OrgContext) {
    return this.zones.list(org.id);
  }

  @RequirePermission('alerts.read')
  @Get(':id')
  get(@CurrentOrg() org: OrgContext, @UuidParam('id') id: string) {
    return this.zones.get(org.id, id);
  }

  @RequirePermission('alerts.configure')
  @Post()
  create(@CurrentOrg() org: OrgContext, @ZBody(createGeofenceSchema) body: z.infer<typeof createGeofenceSchema>, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.zones.create(org.id, body, { userId: user.id, ip });
  }

  @RequirePermission('alerts.configure')
  @Patch(':id')
  update(
    @CurrentOrg() org: OrgContext,
    @UuidParam('id') id: string,
    @ZBody(updateGeofenceSchema) body: z.infer<typeof updateGeofenceSchema>,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.zones.update(org.id, id, body, { userId: user.id, ip });
  }

  @RequirePermission('alerts.configure')
  @HttpCode(204)
  @Delete(':id')
  async remove(@CurrentOrg() org: OrgContext, @UuidParam('id') id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    await this.zones.remove(org.id, id, { userId: user.id, ip });
  }
}

@Controller('orgs/:orgId/vehicles/:vehicleId/trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @RequirePermission('vehicles.read')
  @Get()
  report(@CurrentOrg() org: OrgContext, @UuidParam('vehicleId') vehicleId: string, @ZQuery(tripsQuery) q: z.infer<typeof tripsQuery>) {
    return this.trips.report(org.id, vehicleId, new Date(q.from), new Date(q.to));
  }
}
