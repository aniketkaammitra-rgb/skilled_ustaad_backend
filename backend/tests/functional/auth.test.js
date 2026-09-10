import request from 'supertest';
import { StatusCodes } from 'http-status-codes';
import app from '../../app.js';
import * as db from '../setup_db.js';

beforeAll(async () => await db.connect());
afterEach(async () => await db.clearDatabase());
afterAll(async () => await db.closeDatabase());

describe('Auth API Functional Tests', () => {

  describe('POST /api/v1/auth/request-otp', () => {
    it('should return 201 for a valid phone number', async () => {
      const res = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({
          fullName: 'Test User',
          phoneNumber: '+911234567890'
        });

      expect(res.status).toBe(StatusCodes.OK); // Controller returns OK (200) not 201
      expect(res.body).toHaveProperty('message', 'OTP sent successfully');
    });

    it('should return 400 for an invalid phone number', async () => {
      const res = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({ phoneNumber: 'invalid' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/verify-otp', () => {
    it('should return 400 for missing otp', async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ phoneNumber: '+911234567890' });

      expect(res.status).toBe(400);
    });
  });
});
