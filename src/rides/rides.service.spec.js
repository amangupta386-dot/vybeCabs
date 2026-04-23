const { ConflictException, ForbiddenException } = require('@nestjs/common');
const { Test } = require('@nestjs/testing');
const { PG_POOL } = require('../database/database.module');
const { AVAILABLE_DRIVERS_KEY } = require('../drivers/drivers.service');
const { REDIS } = require('../redis/redis.module');
const { RidesService } = require('./rides.service');

describe('RidesService race handling', () => {
  const pool = {
    connect: jest.fn(),
    query: jest.fn(),
  };

  const redis = {
    eval: jest.fn(),
    del: jest.fn(),
    sadd: jest.fn(),
  };

  let service;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RidesService,
        { provide: PG_POOL, useValue: pool },
        { provide: REDIS, useValue: redis },
      ],
    }).compile();

    service = moduleRef.get(RidesService);
  });

  it('rejects a driver that was not one of the three offered drivers', async () => {
    redis.eval.mockResolvedValue('NOT_OFFERED');

    await expect(service.acceptRide('ride-1', 'driver-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects late accepts after Redis has atomically assigned the ride', async () => {
    redis.eval.mockResolvedValue('ALREADY_ASSIGNED');

    await expect(service.acceptRide('ride-1', 'driver-2')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('persists only the Redis winner with a guarded SQL update', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'ride-1', status: 'ASSIGNED', assigned_driver_id: 'driver-1' }],
        })
        .mockResolvedValueOnce({ rowCount: 3 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(client);
    redis.eval.mockResolvedValue('ACCEPTED');

    await expect(service.acceptRide('ride-1', 'driver-1')).resolves.toEqual({
      id: 'ride-1',
      status: 'ASSIGNED',
      assigned_driver_id: 'driver-1',
    });

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      3,
      'ride:offers:ride-1',
      'ride:assigned:ride-1',
      AVAILABLE_DRIVERS_KEY,
      'driver-1',
    );
    expect(client.query.mock.calls[1][0]).toContain(
      "WHERE id = $1 AND status = 'REQUESTED' AND assigned_driver_id IS NULL",
    );
  });
});
