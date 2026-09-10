import { sleep, group } from 'k6';
import { 
    createBooking, 
    getUserBookings, 
    fetchBookingById, 
    cancelBooking 
} from './api_helpers.js';

export const options = {
    scenarios: {
        booking_comprehensive_sim: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 booking lifecycles per second
            timeUnit: '1s',
            duration: '1m', 
            preAllocatedVUs: 200,
            maxVUs: 2000,
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<1000'],
        http_req_failed: ['rate<0.05'],
    },
};

export default function () {
    const userToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Placeholder
    const bookingId = '69bbc75f1902feb6f6e2c4d5'; // Placeholder

    group('Comprehensive Booking Lifecycle', function () {
        // 1. Create a new booking
        createBooking(userToken);
        sleep(0.5);

        // 2. Fetch list of my bookings
        getUserBookings(userToken);
        sleep(0.5);

        // 3. View specific booking details
        fetchBookingById(userToken, bookingId);
        sleep(0.5);

        // 4. Cancel a booking (Optional path simulation)
        cancelBooking(userToken, bookingId);
    });

    sleep(1);
}
