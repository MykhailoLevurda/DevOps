import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrdersController } from '../orders.controller';
import { OrdersService } from '../orders.service';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { Role } from '../../common/enums/role.enum';

const mockOrdersService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  updateStatus: jest.fn(),
  remove: jest.fn(),
};

const mockRequest = (userId: string, role: Role) => ({
  headers: { 'x-user-id': userId, 'x-user-role': role },
});

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        RolesGuard,
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call ordersService.create with userId from header', async () => {
      // Arrange
      const dto = { items: [{ productId: 'prod-uuid', quantity: 2 }] };
      const order = { id: 'order-uuid', status: OrderStatus.PENDING, totalPrice: 99.98 };
      const req = mockRequest('user-uuid', Role.CUSTOMER);
      mockOrdersService.create.mockResolvedValue(order);

      // Act
      const result = await controller.create(req, dto);

      // Assert
      expect(mockOrdersService.create).toHaveBeenCalledWith('user-uuid', dto);
      expect(result).toEqual(order);
    });
  });

  describe('findAll', () => {
    it('should call ordersService.findAll with user from headers', async () => {
      // Arrange
      const orders = [{ id: 'order-uuid', status: OrderStatus.PENDING }];
      const req = mockRequest('admin-uuid', Role.ADMIN);
      mockOrdersService.findAll.mockResolvedValue(orders);

      // Act
      const result = await controller.findAll(req);

      // Assert
      expect(mockOrdersService.findAll).toHaveBeenCalledWith({
        id: 'admin-uuid',
        role: Role.ADMIN,
      });
      expect(result).toEqual(orders);
    });
  });

  describe('findOne', () => {
    it('should return order by id', async () => {
      // Arrange
      const order = { id: 'order-uuid', status: OrderStatus.PENDING };
      mockOrdersService.findOne.mockResolvedValue(order);

      // Act
      const result = await controller.findOne('order-uuid');

      // Assert
      expect(mockOrdersService.findOne).toHaveBeenCalledWith('order-uuid');
      expect(result).toEqual(order);
    });

    it('should propagate NotFoundException from service', async () => {
      // Arrange
      mockOrdersService.findOne.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.findOne('neexistuje')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('should call ordersService.updateStatus with correct params', async () => {
      // Arrange
      const dto = { status: OrderStatus.PAID };
      const req = mockRequest('admin-uuid', Role.ADMIN);
      const updated = { id: 'order-uuid', status: OrderStatus.PAID };
      mockOrdersService.updateStatus.mockResolvedValue(updated);

      // Act
      const result = await controller.updateStatus('order-uuid', dto, req);

      // Assert
      expect(mockOrdersService.updateStatus).toHaveBeenCalledWith(
        'order-uuid',
        OrderStatus.PAID,
        { id: 'admin-uuid', role: Role.ADMIN },
      );
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('should call ordersService.remove with correct params', async () => {
      // Arrange
      const req = mockRequest('user-uuid', Role.CUSTOMER);
      mockOrdersService.remove.mockResolvedValue(undefined);

      // Act
      await controller.remove('order-uuid', req);

      // Assert
      expect(mockOrdersService.remove).toHaveBeenCalledWith('order-uuid', {
        id: 'user-uuid',
        role: Role.CUSTOMER,
      });
    });
  });
});
