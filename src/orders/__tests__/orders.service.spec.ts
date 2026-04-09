import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrdersService } from '../orders.service';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { Role } from '../../common/enums/role.enum';

const mockOrderRepository = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  delete: jest.fn(),
};

const mockOrderItemRepository = {
  create: jest.fn(),
  save: jest.fn(),
};

const mockProductsService = {
  findOne: jest.fn(),
  decrementStock: jest.fn(),
};

const mockDataSource = {
  transaction: jest.fn(),
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: mockOrderRepository },
        {
          provide: getRepositoryToken(OrderItem),
          useValue: mockOrderItemRepository,
        },
        { provide: 'ProductsService', useValue: mockProductsService },
        { provide: 'DataSource', useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    jest.clearAllMocks();
  });

  // ── Business pravidlo 1: Prazdna objednavka ───────────────────
  describe('create', () => {
    it('should throw BadRequestException when items array is empty', async () => {
      // Arrange
      const dto = { items: [] };
      const userId = 'user-uuid';

      // Act & Assert
      await expect(service.create(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    // ── Business pravidlo 2: Nedostatek skladu ──────────────────
    it('should throw UnprocessableEntityException when product has insufficient stock', async () => {
      // Arrange
      const dto = { items: [{ productId: 'prod-uuid', quantity: 10 }] };
      mockProductsService.findOne.mockResolvedValue({
        id: 'prod-uuid',
        price: 100,
        stockQuantity: 5,
      });

      // Act & Assert
      await expect(service.create('user-uuid', dto)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should throw NotFoundException when product does not exist', async () => {
      // Arrange
      const dto = { items: [{ productId: 'neexistuje', quantity: 1 }] };
      mockProductsService.findOne.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(service.create('user-uuid', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    // ── Business pravidlo 3: Price snapshot ────────────────────
    it('should lock unitPrice to product price at time of order creation', async () => {
      // Arrange
      const dto = { items: [{ productId: 'prod-uuid', quantity: 2 }] };
      const product = { id: 'prod-uuid', price: 49.99, stockQuantity: 10 };
      const savedOrder = {
        id: 'order-uuid',
        totalPrice: 99.98,
        items: [{ productId: 'prod-uuid', quantity: 2, unitPrice: 49.99 }],
      };
      mockProductsService.findOne.mockResolvedValue(product);
      mockOrderRepository.create.mockReturnValue({
        id: 'order-uuid',
        items: [],
      });
      mockDataSource.transaction.mockImplementation(
        async (cb: (manager: object) => Promise<Order>) => {
          const manager = {
            save: jest.fn().mockResolvedValue({ id: 'order-uuid' }),
            findOne: jest.fn().mockResolvedValue(savedOrder),
          };
          return cb(manager);
        },
      );

      // Act
      const result = await service.create('user-uuid', dto);

      // Assert
      expect(result.items[0].unitPrice).toBe(49.99);
    });

    it('should calculate totalPrice correctly', async () => {
      // Arrange
      const dto = {
        items: [
          { productId: 'prod-1', quantity: 2 },
          { productId: 'prod-2', quantity: 1 },
        ],
      };
      const savedOrder = { id: 'order-uuid', totalPrice: 50.0, items: [] };
      mockProductsService.findOne
        .mockResolvedValueOnce({ id: 'prod-1', price: 10.0, stockQuantity: 5 })
        .mockResolvedValueOnce({ id: 'prod-2', price: 30.0, stockQuantity: 5 });
      mockOrderRepository.create.mockReturnValue({
        id: 'order-uuid',
        items: [],
      });
      mockDataSource.transaction.mockImplementation(
        async (cb: (manager: object) => Promise<Order>) => {
          const manager = {
            save: jest.fn().mockResolvedValue({ id: 'order-uuid' }),
            findOne: jest.fn().mockResolvedValue(savedOrder),
          };
          return cb(manager);
        },
      );

      // Act
      const result = await service.create('user-uuid', dto);

      // Assert
      expect(result.totalPrice).toBe(50.0);
    });
  });

  // ── Business pravidlo 4: Stavovy automat ──────────────────────
  describe('updateStatus', () => {
    const adminUser = { id: 'admin-uuid', role: Role.ADMIN };

    it('should allow PENDING -> PAID transition', async () => {
      // Arrange
      const order = {
        id: 'order-uuid',
        status: OrderStatus.PENDING,
        items: [{ productId: 'prod-uuid', quantity: 1 }],
      };
      mockOrderRepository.findOne.mockResolvedValue(order);
      mockDataSource.transaction.mockImplementation(
        async (cb: (manager: object) => Promise<Order>) => cb({}),
      );
      mockOrderRepository.save.mockResolvedValue({
        ...order,
        status: OrderStatus.PAID,
      });

      // Act
      const result = await service.updateStatus(
        'order-uuid',
        OrderStatus.PAID,
        adminUser,
      );

      // Assert
      expect(result.status).toBe(OrderStatus.PAID);
    });

    it('should allow PENDING -> CANCELLED transition', async () => {
      // Arrange
      const order = {
        id: 'order-uuid',
        status: OrderStatus.PENDING,
        items: [],
      };
      mockOrderRepository.findOne.mockResolvedValue(order);
      mockOrderRepository.save.mockResolvedValue({
        ...order,
        status: OrderStatus.CANCELLED,
      });

      // Act
      const result = await service.updateStatus(
        'order-uuid',
        OrderStatus.CANCELLED,
        adminUser,
      );

      // Assert
      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it('should allow PAID -> SHIPPED transition', async () => {
      // Arrange
      const order = { id: 'order-uuid', status: OrderStatus.PAID, items: [] };
      mockOrderRepository.findOne.mockResolvedValue(order);
      mockOrderRepository.save.mockResolvedValue({
        ...order,
        status: OrderStatus.SHIPPED,
      });

      // Act
      const result = await service.updateStatus(
        'order-uuid',
        OrderStatus.SHIPPED,
        adminUser,
      );

      // Assert
      expect(result.status).toBe(OrderStatus.SHIPPED);
    });

    it('should allow SHIPPED -> DELIVERED transition', async () => {
      // Arrange
      const order = {
        id: 'order-uuid',
        status: OrderStatus.SHIPPED,
        items: [],
      };
      mockOrderRepository.findOne.mockResolvedValue(order);
      mockOrderRepository.save.mockResolvedValue({
        ...order,
        status: OrderStatus.DELIVERED,
      });

      // Act
      const result = await service.updateStatus(
        'order-uuid',
        OrderStatus.DELIVERED,
        adminUser,
      );

      // Assert
      expect(result.status).toBe(OrderStatus.DELIVERED);
    });

    it('should throw UnprocessableEntityException for SHIPPED -> CANCELLED', async () => {
      // Arrange
      const order = {
        id: 'order-uuid',
        status: OrderStatus.SHIPPED,
        items: [],
      };
      mockOrderRepository.findOne.mockResolvedValue(order);

      // Act & Assert
      await expect(
        service.updateStatus('order-uuid', OrderStatus.CANCELLED, adminUser),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw UnprocessableEntityException for DELIVERED -> any', async () => {
      // Arrange
      const order = {
        id: 'order-uuid',
        status: OrderStatus.DELIVERED,
        items: [],
      };
      mockOrderRepository.findOne.mockResolvedValue(order);

      // Act & Assert
      await expect(
        service.updateStatus('order-uuid', OrderStatus.CANCELLED, adminUser),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    // ── Business pravidlo 5: Idempotence ────────────────────────
    it('should throw ConflictException when paying already-paid order', async () => {
      // Arrange
      const order = { id: 'order-uuid', status: OrderStatus.PAID, items: [] };
      mockOrderRepository.findOne.mockResolvedValue(order);

      // Act & Assert
      await expect(
        service.updateStatus('order-uuid', OrderStatus.PAID, adminUser),
      ).rejects.toThrow(ConflictException);
    });

    it('should decrement stock for each item when transitioning to PAID', async () => {
      // Arrange
      const order = {
        id: 'order-uuid',
        status: OrderStatus.PENDING,
        items: [
          { productId: 'prod-1', quantity: 2 },
          { productId: 'prod-2', quantity: 1 },
        ],
      };
      mockOrderRepository.findOne.mockResolvedValue(order);
      mockDataSource.transaction.mockImplementation(
        async (cb: (manager: object) => Promise<Order>) => cb({}),
      );
      mockOrderRepository.save.mockResolvedValue({
        ...order,
        status: OrderStatus.PAID,
      });
      mockProductsService.decrementStock.mockResolvedValue(undefined);

      // Act
      await service.updateStatus('order-uuid', OrderStatus.PAID, adminUser);

      // Assert
      expect(mockProductsService.decrementStock).toHaveBeenCalledTimes(2);
      expect(mockProductsService.decrementStock).toHaveBeenCalledWith(
        'prod-1',
        2,
      );
      expect(mockProductsService.decrementStock).toHaveBeenCalledWith(
        'prod-2',
        1,
      );
    });

    it('should NOT decrement stock when transitioning to non-PAID status', async () => {
      // Arrange
      const order = {
        id: 'order-uuid',
        status: OrderStatus.PAID,
        items: [{ productId: 'prod-1', quantity: 2 }],
      };
      mockOrderRepository.findOne.mockResolvedValue(order);
      mockOrderRepository.save.mockResolvedValue({
        ...order,
        status: OrderStatus.SHIPPED,
      });

      // Act
      await service.updateStatus('order-uuid', OrderStatus.SHIPPED, adminUser);

      // Assert
      expect(mockProductsService.decrementStock).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when order does not exist', async () => {
      // Arrange
      mockOrderRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.updateStatus('neexistuje', OrderStatus.PAID, adminUser),
      ).rejects.toThrow(NotFoundException);
    });

    // ── Business pravidlo 6: Role restriction ───────────────────
    it('should throw ForbiddenException when non-ADMIN tries to update status', async () => {
      // Arrange
      const customerUser = { id: 'customer-uuid', role: Role.CUSTOMER };
      const order = {
        id: 'order-uuid',
        status: OrderStatus.PENDING,
        items: [],
      };
      mockOrderRepository.findOne.mockResolvedValue(order);

      // Act & Assert
      await expect(
        service.updateStatus('order-uuid', OrderStatus.PAID, customerUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Mazani objednavky ─────────────────────────────────────────
  describe('remove', () => {
    it('should allow owner to delete PENDING order', async () => {
      // Arrange
      const order = {
        id: 'order-uuid',
        userId: 'user-uuid',
        status: OrderStatus.PENDING,
      };
      mockOrderRepository.findOne.mockResolvedValue(order);
      mockOrderRepository.delete.mockResolvedValue({ affected: 1 });

      // Act
      await service.remove('order-uuid', {
        id: 'user-uuid',
        role: Role.CUSTOMER,
      });

      // Assert
      expect(mockOrderRepository.delete).toHaveBeenCalledWith('order-uuid');
    });

    it('should throw ForbiddenException when customer tries to delete another users order', async () => {
      // Arrange
      const order = {
        id: 'order-uuid',
        userId: 'jiny-user',
        status: OrderStatus.PENDING,
      };
      mockOrderRepository.findOne.mockResolvedValue(order);

      // Act & Assert
      await expect(
        service.remove('order-uuid', { id: 'user-uuid', role: Role.CUSTOMER }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw UnprocessableEntityException when deleting non-PENDING order', async () => {
      // Arrange
      const order = {
        id: 'order-uuid',
        userId: 'user-uuid',
        status: OrderStatus.PAID,
      };
      mockOrderRepository.findOne.mockResolvedValue(order);

      // Act & Assert
      await expect(
        service.remove('order-uuid', { id: 'user-uuid', role: Role.CUSTOMER }),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
