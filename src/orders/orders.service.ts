import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from '../common/enums/order-status.enum';
import { Role } from '../common/enums/role.enum';
import { ProductsService } from '../products/products.service';

type RequestUser = { id: string; role: Role };

const VALID_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @Inject('ProductsService')
    private readonly productsService: ProductsService,
    @Inject('DataSource')
    private readonly dataSource: DataSource,
  ) {}

  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException(
        'Objednávka musí obsahovat alespoň jednu položku',
      );
    }

    let totalPrice = 0;
    const itemsData: {
      productId: string;
      quantity: number;
      unitPrice: number;
    }[] = [];

    for (const item of dto.items) {
      const product = await this.productsService.findOne(item.productId);

      if (product.stockQuantity < item.quantity) {
        throw new UnprocessableEntityException(
          `Nedostatečný sklad pro produkt ${item.productId}`,
        );
      }

      const unitPrice = Number(product.price);
      totalPrice += unitPrice * item.quantity;
      itemsData.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const order = this.orderRepository.create({
        userId,
        totalPrice,
        status: OrderStatus.PENDING,
      });

      const savedOrder = await manager.save(Order, order);

      for (const item of itemsData) {
        const orderItem = this.orderItemRepository.create({
          orderId: savedOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        });
        await manager.save(OrderItem, orderItem);
      }

      return manager.findOne(Order, {
        where: { id: savedOrder.id },
        relations: ['items'],
      }) as Promise<Order>;
    });
  }

  async findAll(user: RequestUser): Promise<Order[]> {
    if (user.role === Role.ADMIN) {
      return this.orderRepository.find();
    }
    return this.orderRepository.find({ where: { userId: user.id } });
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException(`Objednávka s id ${id} nebyla nalezena`);
    }
    return order;
  }

  async updateStatus(
    id: string,
    newStatus: OrderStatus,
    user: RequestUser,
  ): Promise<Order> {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Pouze ADMIN může měnit stav objednávky');
    }

    const order = await this.findOne(id);
    const currentStatus = order.status;

    if (currentStatus === newStatus && newStatus === OrderStatus.PAID) {
      throw new ConflictException('Objednávka je již zaplacena');
    }

    if (currentStatus === newStatus) {
      throw new ConflictException(`Objednávka je již ve stavu ${newStatus}`);
    }

    const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new UnprocessableEntityException(
        `Nelze přejít ze stavu ${currentStatus} do stavu ${newStatus}`,
      );
    }

    if (newStatus === OrderStatus.PAID) {
      await this.dataSource.transaction(async () => {
        for (const item of order.items) {
          await this.productsService.decrementStock(
            item.productId,
            item.quantity,
          );
        }
        order.status = newStatus;
        await this.orderRepository.save(order);
      });
      return this.findOne(id);
    }

    order.status = newStatus;
    return this.orderRepository.save(order);
  }

  async remove(id: string, user: RequestUser): Promise<void> {
    const order = await this.findOne(id);

    if (user.role !== Role.ADMIN && order.userId !== user.id) {
      throw new ForbiddenException('Nemáte oprávnění smazat tuto objednávku');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new UnprocessableEntityException(
        'Lze smazat pouze objednávky ve stavu PENDING',
      );
    }

    await this.orderRepository.delete(id);
  }
}
