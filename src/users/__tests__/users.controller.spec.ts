import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';
import { Role } from '../../common/enums/role.enum';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../common/guards/roles.guard';

const mockUsersService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        RolesGuard,
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call usersService.create and return result', async () => {
      // Arrange
      const dto = { email: 'test@example.com', password: 'heslo123', role: Role.CUSTOMER };
      const user = { id: 'uuid-1', email: dto.email, role: Role.CUSTOMER };
      mockUsersService.create.mockResolvedValue(user);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(mockUsersService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(user);
    });
  });

  describe('findAll', () => {
    it('should return array of users', async () => {
      // Arrange
      const users = [{ id: 'uuid-1', email: 'a@example.com', role: Role.CUSTOMER }];
      mockUsersService.findAll.mockResolvedValue(users);

      // Act
      const result = await controller.findAll();

      // Assert
      expect(result).toEqual(users);
    });
  });

  describe('findOne', () => {
    it('should return user by id', async () => {
      // Arrange
      const user = { id: 'uuid-1', email: 'test@example.com', role: Role.CUSTOMER };
      mockUsersService.findOne.mockResolvedValue(user);

      // Act
      const result = await controller.findOne('uuid-1');

      // Assert
      expect(mockUsersService.findOne).toHaveBeenCalledWith('uuid-1');
      expect(result).toEqual(user);
    });

    it('should propagate NotFoundException from service', async () => {
      // Arrange
      mockUsersService.findOne.mockRejectedValue(new NotFoundException());

      // Act & Assert
      await expect(controller.findOne('neexistuje')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should call usersService.remove with correct id', async () => {
      // Arrange
      mockUsersService.remove.mockResolvedValue(undefined);

      // Act
      await controller.remove('uuid-1');

      // Assert
      expect(mockUsersService.remove).toHaveBeenCalledWith('uuid-1');
    });
  });
});
