import { Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import {
  createDeviceSchema,
  createVehicleSchema,
  linkDeviceSchema,
  listDevicesQuery,
  listVehiclesQuery,
  updateDeviceSchema,
  updateVehicleSchema,
  type CreateVehicleInput,
  type UpdateVehicleInput,
} from '@winou/shared';
import type { z } from 'zod';
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
import { DevicesService } from '../devices/devices.service';
import { VehiclesService } from './vehicles.service';

@Controller('orgs/:orgId/vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @RequirePermission('vehicles.read')
  @Get()
  list(@CurrentOrg() org: OrgContext, @ZQuery(listVehiclesQuery) q: z.infer<typeof listVehiclesQuery>) {
    return this.vehicles.list(org.id, { q: q.q, type: q.type, archived: q.archived === 'true' });
  }

  @RequirePermission('vehicles.write')
  @Post()
  create(
    @CurrentOrg() org: OrgContext,
    @ZBody(createVehicleSchema) body: CreateVehicleInput,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.vehicles.create(org.id, body, { userId: user.id, ip });
  }

  @RequirePermission('vehicles.read')
  @Get(':id')
  get(@CurrentOrg() org: OrgContext, @UuidParam('id') id: string) {
    return this.vehicles.get(org.id, id);
  }

  @RequirePermission('vehicles.write')
  @Patch(':id')
  update(
    @CurrentOrg() org: OrgContext,
    @UuidParam('id') id: string,
    @ZBody(updateVehicleSchema) body: UpdateVehicleInput,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.vehicles.update(org.id, id, body, { userId: user.id, ip });
  }

  @RequirePermission('vehicles.write')
  @HttpCode(200)
  @Post(':id/archive')
  archive(@CurrentOrg() org: OrgContext, @UuidParam('id') id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.vehicles.archive(org.id, id, { userId: user.id, ip });
  }

  @RequirePermission('vehicles.write')
  @HttpCode(200)
  @Post(':id/unarchive')
  unarchive(@CurrentOrg() org: OrgContext, @UuidParam('id') id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.vehicles.unarchive(org.id, id, { userId: user.id, ip });
  }
}

@Controller('orgs/:orgId/devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @RequirePermission('devices.read')
  @Get()
  list(@CurrentOrg() org: OrgContext, @ZQuery(listDevicesQuery) q: z.infer<typeof listDevicesQuery>) {
    return this.devices.list(org.id, { archived: q.archived === 'true' });
  }

  @RequirePermission('devices.write')
  @Post()
  create(
    @CurrentOrg() org: OrgContext,
    @ZBody(createDeviceSchema) body: z.infer<typeof createDeviceSchema>,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.devices.create(org.id, body, { userId: user.id, ip });
  }

  @RequirePermission('devices.read')
  @Get(':id')
  get(@CurrentOrg() org: OrgContext, @UuidParam('id') id: string) {
    return this.devices.get(org.id, id);
  }

  @RequirePermission('devices.write')
  @Patch(':id')
  update(
    @CurrentOrg() org: OrgContext,
    @UuidParam('id') id: string,
    @ZBody(updateDeviceSchema) body: z.infer<typeof updateDeviceSchema>,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.devices.update(org.id, id, body, { userId: user.id, ip });
  }

  @RequirePermission('devices.write')
  @HttpCode(200)
  @Post(':id/archive')
  archive(@CurrentOrg() org: OrgContext, @UuidParam('id') id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.devices.archive(org.id, id, { userId: user.id, ip });
  }

  @RequirePermission('devices.write')
  @HttpCode(200)
  @Post(':id/link')
  link(
    @CurrentOrg() org: OrgContext,
    @UuidParam('id') id: string,
    @ZBody(linkDeviceSchema) body: z.infer<typeof linkDeviceSchema>,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    return this.devices.link(org.id, id, body.vehicleId, { userId: user.id, ip });
  }

  @RequirePermission('devices.write')
  @HttpCode(200)
  @Post(':id/unlink')
  unlink(@CurrentOrg() org: OrgContext, @UuidParam('id') id: string, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    return this.devices.unlink(org.id, id, { userId: user.id, ip });
  }
}
