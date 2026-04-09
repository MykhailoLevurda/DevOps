import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { Role } from '../src/common/enums/role.enum';
import { OrderStatus } from '../src/common/enums/order-status.enum';

describe('Mini E-Shop (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector)),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE order_items, orders, products, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Users ─────────────────────────────────────────────────────
  describe('Users', () => {
    it('POST /users - vytvoreni noveho uzivatele', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({ email: 'test@example.com', password: 'heslo123' })
        .expect(201);

      expect(res.body.email).toBe('test@example.com');
      expect(res.body.password).toBeUndefined();
      expect(res.body.id).toBeDefined();
    });

    it('POST /users - duplicitni email vraci 409', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({ email: 'dup@example.com', password: 'heslo123' });

      await request(app.getHttpServer())
        .post('/users')
        .send({ email: 'dup@example.com', password: 'heslo123' })
        .expect(409);
    });

    it('GET /users/:id - neexistujici uzivatel vraci 404', async () => {
      await request(app.getHttpServer())
        .get('/users/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  // ── Products ──────────────────────────────────────────────────
  describe('Products', () => {
    it('POST /products - ADMIN muze vytvorit produkt', async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set('X-User-Role', Role.ADMIN)
        .send({ name: 'Testovaci produkt', price: 99.99, stockQuantity: 10 })
        .expect(201);

      expect(res.body.name).toBe('Testovaci produkt');
      expect(res.body.id).toBeDefined();
    });

    it('POST /products - CUSTOMER dostane 403', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .set('X-User-Role', Role.CUSTOMER)
        .send({ name: 'Produkt', price: 10, stockQuantity: 5 })
        .expect(403);
    });

    it('GET /products - vraci seznam produktu', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /products/:id - neexistujici produkt vraci 404', async () => {
      await request(app.getHttpServer())
        .get('/products/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  // ── Orders ────────────────────────────────────────────────────
  describe('Orders', () => {
    let userId: string;
    let productId: string;

    beforeEach(async () => {
      const userRes = await request(app.getHttpServer()).post('/users').send({
        email: 'zakaznik@example.com',
        password: 'heslo123',
        role: Role.CUSTOMER,
      });
      userId = userRes.body.id as string;

      const productRes = await request(app.getHttpServer())
        .post('/products')
        .set('X-User-Role', Role.ADMIN)
        .send({ name: 'Widget', price: 25.0, stockQuantity: 10 });
      productId = productRes.body.id as string;
    });

    it('POST /orders - vytvoreni objednavky se spravnym totalPrice', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .set('X-User-Id', userId)
        .set('X-User-Role', Role.CUSTOMER)
        .send({ items: [{ productId, quantity: 3 }] })
        .expect(201);

      expect(res.body.status).toBe(OrderStatus.PENDING);
      expect(parseFloat(res.body.totalPrice as string)).toBe(75.0);
    });

    it('POST /orders - prazdna objednavka vraci 400', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('X-User-Id', userId)
        .set('X-User-Role', Role.CUSTOMER)
        .send({ items: [] })
        .expect(400);
    });

    it('POST /orders - nedostatek skladu vraci 422', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('X-User-Id', userId)
        .set('X-User-Role', Role.CUSTOMER)
        .send({ items: [{ productId, quantity: 999 }] })
        .expect(422);
    });

    it('PATCH /orders/:id/status - PENDING -> PAID dekrementuje sklad', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('X-User-Id', userId)
        .set('X-User-Role', Role.CUSTOMER)
        .send({ items: [{ productId, quantity: 2 }] });
      const orderId = orderRes.body.id as string;

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('X-User-Id', userId)
        .set('X-User-Role', Role.ADMIN)
        .send({ status: OrderStatus.PAID })
        .expect(200);

      const productRes = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .expect(200);

      expect(parseInt(productRes.body.stockQuantity as string)).toBe(8);
    });

    it('PATCH /orders/:id/status - idempotence: druha platba vraci 409', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('X-User-Id', userId)
        .set('X-User-Role', Role.CUSTOMER)
        .send({ items: [{ productId, quantity: 1 }] });
      const orderId = orderRes.body.id as string;

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('X-User-Role', Role.ADMIN)
        .send({ status: OrderStatus.PAID });

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('X-User-Role', Role.ADMIN)
        .send({ status: OrderStatus.PAID })
        .expect(409);
    });

    it('PATCH /orders/:id/status - CUSTOMER nemuze menit stav (403)', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('X-User-Id', userId)
        .set('X-User-Role', Role.CUSTOMER)
        .send({ items: [{ productId, quantity: 1 }] });
      const orderId = orderRes.body.id as string;

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('X-User-Id', userId)
        .set('X-User-Role', Role.CUSTOMER)
        .send({ status: OrderStatus.PAID })
        .expect(403);
    });

    it('PATCH /orders/:id/status - nelze zrusit odeslana objednavka (422)', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('X-User-Id', userId)
        .set('X-User-Role', Role.CUSTOMER)
        .send({ items: [{ productId, quantity: 1 }] });
      const orderId = orderRes.body.id as string;

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('X-User-Role', Role.ADMIN)
        .send({ status: OrderStatus.PAID });

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('X-User-Role', Role.ADMIN)
        .send({ status: OrderStatus.SHIPPED });

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('X-User-Role', Role.ADMIN)
        .send({ status: OrderStatus.CANCELLED })
        .expect(422);
    });

    it('price snapshot - zmena ceny produktu neovlivni existujici objednavku', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('X-User-Id', userId)
        .set('X-User-Role', Role.CUSTOMER)
        .send({ items: [{ productId, quantity: 1 }] });
      const orderId = orderRes.body.id as string;

      await request(app.getHttpServer())
        .patch(`/products/${productId}`)
        .set('X-User-Role', Role.ADMIN)
        .send({ price: 999.99 });

      const orderDetail = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .expect(200);

      expect(parseFloat(orderDetail.body.items[0].unitPrice as string)).toBe(
        25.0,
      );
    });
  });
});
