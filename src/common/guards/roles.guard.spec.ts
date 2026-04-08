import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../enums/role.enum';

const mockReflector = {
  getAllAndOverride: jest.fn(),
};

const createMockContext = (role?: string): ExecutionContext =>
  ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: role ? { 'x-user-role': role } : {},
      }),
    }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(mockReflector as unknown as Reflector);
    jest.clearAllMocks();
  });

  it('should allow access when no roles are required', () => {
    // Arrange
    mockReflector.getAllAndOverride.mockReturnValue(null);
    const context = createMockContext();

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('should allow access when user has required role', () => {
    // Arrange
    mockReflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const context = createMockContext(Role.ADMIN);

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException when user has wrong role', () => {
    // Arrange
    mockReflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const context = createMockContext(Role.CUSTOMER);

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when no role header is present', () => {
    // Arrange
    mockReflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const context = createMockContext();

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
