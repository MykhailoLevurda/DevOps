import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProductsController } from '../products.controller';
import { ProductsService } from '../products.service';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../common/guards/roles.guard';

const mockProductsService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('ProductsController', () => {
  let controller: ProductsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: ProductsService, useValue: mockProductsService },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        RolesGuard,
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call productsService.create and return result', async () => {
      // Arrange
      const dto = { name: 'Produkt A', description: 'Popis', price: 99.99, stockQuantity: 10 };
      const product = { id: 'uuid-1', ...dto };
      mockProductsService.create.mockResolvedValue(product);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(mockProductsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(product);
    });
  });

  describe('findAll', () => {
    it('should return array of products', async () => {
      // Arrange
      const products = [{ id: 'uuid-1', name: 'Produkt A', price: 10.0 }];
      mockProductsService.findAll.mockResolvedValue(products);

      // Act
      const result = await controller.findAll();

      // Assert
      expect(result).toEqual(products);
    });
  });

  describe('findOne', () => {
    it('should return product by id', async () => {
      // Arrange
      const product = { id: 'uuid-1', name: 'Produkt A', price: 10.0 };
      mockProductsService.findOne.mockResolvedValue(product);

      // Act
      const result = await controller.findOne('uuid-1');

      // Assert
      expect(mockProductsService.findOne).toHaveBeenCalledWith('uuid-1');
      expect(result).toEqual(product);
    });

    it('should propagate NotFoundException from service', async () => {
      // Arrange
      mockProductsService.findOne.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.findOne('neexistuje')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should call productsService.update with correct params', async () => {
      // Arrange
      const dto = { name: 'Novy nazev', price: 149.99 };
      const updated = { id: 'uuid-1', ...dto };
      mockProductsService.update.mockResolvedValue(updated);

      // Act
      const result = await controller.update('uuid-1', dto);

      // Assert
      expect(mockProductsService.update).toHaveBeenCalledWith('uuid-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('should call productsService.remove with correct id', async () => {
      // Arrange
      mockProductsService.remove.mockResolvedValue(undefined);

      // Act
      await controller.remove('uuid-1');

      // Assert
      expect(mockProductsService.remove).toHaveBeenCalledWith('uuid-1');
    });
  });
});
