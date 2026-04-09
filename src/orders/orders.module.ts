import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { ProductsModule } from '../products/products.module';
import { ProductsService } from '../products/products.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem]), ProductsModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    { provide: 'ProductsService', useExisting: ProductsService },
    { provide: 'DataSource', useExisting: DataSource },
  ],
})
export class OrdersModule {}
