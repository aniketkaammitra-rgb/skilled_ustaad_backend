import { sleep, group } from 'k6';
import { 
    createBooking, 
    getAvailableBookings, 
    acceptBooking, 
    fetchBookingDetailsPage, 
    completeBooking,
    getUserBookings,
    cancelBooking
} from './api_helpers.js';

export const options = {
    scenarios: {
        booking_full_sim: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 full lifecycles per second
            timeUnit: '1s',
            duration: '1m', 
            preAllocatedVUs: 200,
            maxVUs: 2000,
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<1500'],
        http_req_failed: ['rate<0.05'],
    },
};

export default function () {
    const userToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Placeholder
    const providerToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Placeholder
    const bookingId = '69bbc75f1902feb6f6e2c4d5'; // Placeholder

    group('Full Booking Lifecycle (User & Provider)', function () {
        // --- USER PHASE ---
        // 1. User creates booking
        createBooking(userToken);
        sleep(0.5);

        // 2. User checks their booking list
        getUserBookings(userToken);
        sleep(0.5);

        // 3. Provider checks available jobs
        getAvailableBookings(providerToken);
        sleep(0.5);

        // 4. Provider views details of a job
        fetchBookingDetailsPage(providerToken, bookingId);
        sleep(0.5);

        // 5. Provider accepts the job
        acceptBooking(providerToken, bookingId);
        sleep(0.5);

        // 6. Provider completes the job
        completeBooking(providerToken, bookingId);
    });

    sleep(1);
}
