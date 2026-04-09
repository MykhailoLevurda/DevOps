import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';

@Controller('orders')
@UseGuards(RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(
    @Request() req: { headers: Record<string, string> },
    @Body() dto: CreateOrderDto,
  ) {
    const userId = req.headers['x-user-id'] ?? '';
    return this.ordersService.create(userId, dto);
  }

  @Get()
  findAll(@Request() req: { headers: Record<string, string> }) {
    const userId = req.headers['x-user-id'] ?? '';
    const role = (req.headers['x-user-role'] as Role) ?? Role.CUSTOMER;
    return this.ordersService.findAll({ id: userId, role });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Request() req: { headers: Record<string, string> },
  ) {
    const userId = req.headers['x-user-id'] ?? '';
    const role = (req.headers['x-user-role'] as Role) ?? Role.CUSTOMER;
    return this.ordersService.updateStatus(id, dto.status, {
      id: userId,
      role,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id') id: string,
    @Request() req: { headers: Record<string, string> },
  ) {
    const userId = req.headers['x-user-id'] ?? '';
    const role = (req.headers['x-user-role'] as Role) ?? Role.CUSTOMER;
    return this.ordersService.remove(id, { id: userId, role });
  }
}
