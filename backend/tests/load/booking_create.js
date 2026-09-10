import { sleep } from 'k6';
import { createBooking } from './api_helpers.js';

export const options = {
    vus: 20,
    duration: '30s',
    thresholds: {
        http_req_duration: ['p(95)<1000'], // Bookings involve DB writes, might be slower
        http_req_failed: ['rate<0.05'],
    },
};

export default function () {
    const dummyToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; 
    createBooking(dummyToken);
    sleep(1);
}
