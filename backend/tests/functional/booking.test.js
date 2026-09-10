import request from 'supertest';
import app from '../../app.js';
import * as db from '../setup_db.js';
import User from '../../models/User.js';
import { signAccess } from '../../libs/token.js';

beforeAll(async () => await db.connect());
afterEach(async () => await db.clearDatabase());
afterAll(async () => await db.closeDatabase());

describe('Booking API Functional Tests', () => {
  let token;
  let userId;

  beforeEach(async () => {
    const user = await User.create({
      fullName: 'Test User',
      phoneNumber: '+919876543210',
      password: 'Password@123',
      isVerified: true
    });
    userId = user._id;
    token = signAccess({ sub: userId.toString(), role: 'user' });
  });

  describe('POST /api/v1/booking', () => {
    it('should create a booking with valid data', async () => {
      const res = await request(app)
        .post('/api/v1/booking')
        .set('Authorization', `Bearer ${token}`)
        .send({
          service: "69aab0eab6c562545f51d540",
          serviceType: "Cooking",
          date: "2026-03-20",
          time: "15:00",
          address: "Test Address",
          city: "Patna",
          state: "Bihar",
          price: 500,
          latitude: 25.5941,
          longitude: 85.1376
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Booking submitted successfully');
    });

    it('should fail if unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/booking')
        .send({});

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/booking', () => {
    it('should fetch user bookings with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/booking')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('bookings');
      expect(res.body).toHaveProperty('pagination');
    });
  });
});
