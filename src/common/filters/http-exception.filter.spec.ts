import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

const mockJson = jest.fn();
const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
const mockGetResponse = jest.fn().mockReturnValue({ status: mockStatus });
const mockSwitchToHttp = jest.fn().mockReturnValue({ getResponse: mockGetResponse });

const mockHost = {
  switchToHttp: mockSwitchToHttp,
} as never;

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    jest.clearAllMocks();
    mockStatus.mockReturnValue({ json: mockJson });
    mockGetResponse.mockReturnValue({ status: mockStatus });
    mockSwitchToHttp.mockReturnValue({ getResponse: mockGetResponse });
  });

  it('should return correct error shape for string response', () => {
    // Arrange
    const exception = new HttpException('Chyba nenalezeno', HttpStatus.NOT_FOUND);

    // Act
    filter.catch(exception, mockHost);

    // Assert
    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'Http',
      message: 'Chyba nenalezeno',
    });
  });

  it('should return correct error shape for object response', () => {
    // Arrange
    const exception = new HttpException(
      { message: 'Neplatny vstup' },
      HttpStatus.BAD_REQUEST,
    );

    // Act
    filter.catch(exception, mockHost);

    // Assert
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'Http',
      message: 'Neplatny vstup',
    });
  });
});
