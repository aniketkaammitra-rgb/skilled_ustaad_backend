import request from 'supertest';
import app from '../../app.js';
import * as db from '../setup_db.js';
import Provider from '../../models/Provider.js';
import { signAccess } from '../../libs/token.js';

beforeAll(async () => await db.connect());
afterEach(async () => await db.clearDatabase());
afterAll(async () => await db.closeDatabase());

describe('Provider API Functional Tests', () => {
  let token;
  let providerId;

  beforeEach(async () => {
    const provider = await Provider.create({
      fullName: 'Test Provider',
      phoneNumber: '+919999999999',
      password: 'Password@123',
      status: 'Active',
      isAvailable: true,
      city: 'Patna',
      subService: 'Cooking',
      isRegistrationComplete: true
    });
    providerId = provider._id;
    token = signAccess({ sub: providerId.toString(), role: 'provider' });
  });

  describe('GET /api/v1/provider/jobs', () => {
    it('should fetch provider pending jobs', async () => {
      const res = await request(app)
        .get('/api/v1/provider/jobs')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('bookings');
      expect(res.body).toHaveProperty('success', true);
    });
  });

  describe('GET /api/v1/provider/earnings/dashboard', () => {
    it('should fetch earnings summary', async () => {
      const res = await request(app)
        .get('/api/v1/provider/earnings/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalEarning');
      expect(res.body).toHaveProperty('availableBalance');
    });
  });
});
