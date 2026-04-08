import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ProductsService } from '../products.service';
import { Product } from '../entities/product.entity';

const mockProductRepository = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  delete: jest.fn(),
};

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(Product),
          useValue: mockProductRepository,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create and return a new product', async () => {
      // Arrange
      const dto = {
        name: 'Testovaci produkt',
        description: 'Popis',
        price: 99.99,
        stockQuantity: 10,
      };
      const product = { id: 'uuid-1', ...dto };
      mockProductRepository.create.mockReturnValue(product);
      mockProductRepository.save.mockResolvedValue(product);

      // Act
      const result = await service.create(dto);

      // Assert
      expect(mockProductRepository.create).toHaveBeenCalledWith(dto);
      expect(mockProductRepository.save).toHaveBeenCalled();
      expect(result).toEqual(product);
    });
  });

  describe('findAll', () => {
    it('should return array of products', async () => {
      // Arrange
      const products = [
        { id: 'uuid-1', name: 'Produkt A', price: 10.0, stockQuantity: 5 },
        { id: 'uuid-2', name: 'Produkt B', price: 20.0, stockQuantity: 3 },
      ];
      mockProductRepository.find.mockResolvedValue(products);

      // Act
      const result = await service.findAll();

      // Assert
      expect(result).toEqual(products);
      expect(result).toHaveLength(2);
    });
  });

  describe('findOne', () => {
    it('should return product when found', async () => {
      // Arrange
      const product = {
        id: 'uuid-1',
        name: 'Produkt A',
        price: 10.0,
        stockQuantity: 5,
      };
      mockProductRepository.findOne.mockResolvedValue(product);

      // Act
      const result = await service.findOne('uuid-1');

      // Assert
      expect(result).toEqual(product);
    });

    it('should throw NotFoundException when product does not exist', async () => {
      // Arrange
      mockProductRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne('neexistuje')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update and return product', async () => {
      // Arrange
      const existing = {
        id: 'uuid-1',
        name: 'Stary nazev',
        price: 10.0,
        stockQuantity: 5,
      };
      const dto = { name: 'Novy nazev', price: 15.0 };
      const updated = { ...existing, ...dto };
      mockProductRepository.findOne.mockResolvedValue(existing);
      mockProductRepository.save.mockResolvedValue(updated);

      // Act
      const result = await service.update('uuid-1', dto);

      // Assert
      expect(result.name).toBe('Novy nazev');
      expect(result.price).toBe(15.0);
    });

    it('should throw NotFoundException when updating non-existent product', async () => {
      // Arrange
      mockProductRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.update('neexistuje', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete product when found', async () => {
      // Arrange
      const product = { id: 'uuid-1', name: 'Produkt A' };
      mockProductRepository.findOne.mockResolvedValue(product);
      mockProductRepository.delete.mockResolvedValue({ affected: 1 });

      // Act
      await service.remove('uuid-1');

      // Assert
      expect(mockProductRepository.delete).toHaveBeenCalledWith('uuid-1');
    });

    it('should throw NotFoundException when deleting non-existent product', async () => {
      // Arrange
      mockProductRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove('neexistuje')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('decrementStock', () => {
    it('should reduce stockQuantity by given amount', async () => {
      // Arrange
      const product = {
        id: 'uuid-1',
        name: 'Produkt A',
        price: 10.0,
        stockQuantity: 10,
      };
      mockProductRepository.findOne.mockResolvedValue(product);
      mockProductRepository.save.mockResolvedValue({
        ...product,
        stockQuantity: 7,
      });

      // Act
      await service.decrementStock('uuid-1', 3);

      // Assert
      expect(mockProductRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ stockQuantity: 7 }),
      );
    });

    it('should throw NotFoundException when product does not exist', async () => {
      // Arrange
      mockProductRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.decrementStock('neexistuje', 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
