import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users.service';
import { User } from '../entities/user.entity';
import { Role } from '../../common/enums/role.enum';

const mockUserRepository = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  delete: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should hash password before saving', async () => {
      // Arrange
      const dto = { email: 'test@example.com', password: 'plaintext123', role: Role.CUSTOMER };
      const savedUser = { id: 'uuid-1', email: dto.email, role: Role.CUSTOMER };
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(savedUser);
      mockUserRepository.save.mockResolvedValue(savedUser);

      // Act
      const result = await service.create(dto);

      // Assert
      const createdWith = mockUserRepository.create.mock.calls[0][0];
      expect(createdWith.password).not.toBe('plaintext123');
      expect(createdWith.password).toBeDefined();
      expect(result).toEqual(savedUser);
    });

    it('should throw ConflictException when email already exists', async () => {
      // Arrange
      const dto = { email: 'existing@example.com', password: 'pass123', role: Role.CUSTOMER };
      mockUserRepository.findOne.mockResolvedValue({ id: 'uuid-1', email: dto.email });

      // Act & Assert
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should create user with CUSTOMER role by default', async () => {
      // Arrange
      const dto = { email: 'new@example.com', password: 'pass123' };
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockImplementation((data) => ({ ...data, id: 'uuid-1' }));
      mockUserRepository.save.mockImplementation((user) => Promise.resolve(user));

      // Act
      await service.create(dto);

      // Assert
      const createdWith = mockUserRepository.create.mock.calls[0][0];
      expect(createdWith.role).toBe(Role.CUSTOMER);
    });
  });

  describe('findOne', () => {
    it('should return user when found', async () => {
      // Arrange
      const user = { id: 'uuid-1', email: 'test@example.com', role: Role.CUSTOMER };
      mockUserRepository.findOne.mockResolvedValue(user);

      // Act
      const result = await service.findOne('uuid-1');

      // Assert
      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return array of users', async () => {
      // Arrange
      const users = [
        { id: 'uuid-1', email: 'a@example.com', role: Role.CUSTOMER },
        { id: 'uuid-2', email: 'b@example.com', role: Role.ADMIN },
      ];
      mockUserRepository.find.mockResolvedValue(users);

      // Act
      const result = await service.findAll();

      // Assert
      expect(result).toEqual(users);
      expect(result).toHaveLength(2);
    });
  });

  describe('remove', () => {
    it('should delete user when found', async () => {
      // Arrange
      const user = { id: 'uuid-1', email: 'test@example.com' };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockUserRepository.delete.mockResolvedValue({ affected: 1 });

      // Act
      await service.remove('uuid-1');

      // Assert
      expect(mockUserRepository.delete).toHaveBeenCalledWith('uuid-1');
    });

    it('should throw NotFoundException when deleting non-existent user', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });
});
